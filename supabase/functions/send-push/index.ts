// ============================================================================
// send-push — Expo push fan-out, mirroring the in-app notification banner
// ============================================================================
// Wired as THREE Supabase Database Webhooks, all POSTing here:
//
//   1. INSERT on public.notifications   — everything the Inbox records: broadcasts,
//      invitations, approvals, reminders, and 1-on-1 chat messages.
//   2. INSERT on public.direct_messages — group-chat messages ONLY. These create no
//      notification row (see migration 0015), so without this webhook a user with
//      the app closed silently missed every group message.
//   3. INSERT on public.message_reactions — emoji reactions. Notifies the message author.
//
// Both paths produce the same RICH banner the in-app one shows: a large image
// (the photo that was sent, else the event cover, else the sender's avatar), a
// per-conversation tag so a chat replaces its own banner instead of stacking, and
// the REPLY / VIEW action buttons.
//
// Deploy:   supabase functions deploy send-push --no-verify-jwt
// Secret:   supabase secrets set PUSH_WEBHOOK_SECRET=<random>  (optional but recommended)
// Webhook:  Database → Webhooks → one webhook per table above → HTTP POST to this
//           function's URL, adding header  x-webhook-secret: <same value>
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationRecord {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  message: string;
  event_id: string | null;
  application_id: string | null;
  conversation_id: string | null;
  priority: string | null;
  created_at: string | null;
}

interface MessageRecord {
  id: string;
  conversation_id: string;
  event_id: string | null;
  sender_id: string;
  receiver_id: string | null;
  text: string | null;
  attachment_path: string | null;
  deleted_at: string | null;
  is_broadcast: boolean | null;
  created_at: string | null;
  mentioned_user_ids: string[] | null;
  reply_to_message_id?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_text?: string | null;
}

interface ReactionRecord {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: NotificationRecord | MessageRecord | ReactionRecord | null;
}

/** One fully-built Expo push message, minus the recipient token. */
interface PushContent {
  type: PushType;
  dedupeKey: string;
  title: string;
  subtitle?: string;
  body: string;
  data: Record<string, string | undefined>;
  image?: string;
  channelId: string;
  categoryId: string;
  sound: string;
  collapseKey?: string;
  highPriority: boolean;
}

Deno.serve(async (req) => {
  // Optional shared-secret gate so only the configured webhooks can invoke this.
  const expectedSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (expectedSecret && req.headers.get('x-webhook-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (payload.type !== 'INSERT' || !payload.record) return skipped();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // One message can produce several plans — a group message notifies the room AND
  // separately notifies anyone it @mentions, on a channel a mute cannot silence.
  let plans: Plan[] = [];
  if (payload.table === 'notifications') {
    const single = await planFromNotification(supabase, payload.record as NotificationRecord);
    if (single) plans = [single];
  } else if (payload.table === 'direct_messages') {
    plans = await plansFromGroupMessage(supabase, payload.record as MessageRecord);
  } else if (payload.table === 'message_reactions') {
    const single = await planFromReaction(supabase, payload.record as ReactionRecord);
    if (single) plans = [single];
  } else {
    return skipped();
  }

  // Deliver AFTER responding. A database webhook aborts at 5s, and this function
  // now does a dedupe insert, several lookups and a Google OAuth exchange before it
  // can send — a cold start can exceed that, and when pg_net cancels the request the
  // send dies with it. waitUntil keeps the work alive past the response, so delivery
  // no longer races the webhook timeout.
  for (const plan of plans) {
    if (plan.recipients.length === 0) continue;
    // Claimed before sending, so a webhook retry stops here instead of buzzing
    // everyone a second time.
    if (!(await claimDelivery(supabase, plan.content.dedupeKey))) continue;
    try {
      const result = await deliver(supabase, plan.recipients, plan.content);
      console.log(`[send-push] ${plan.content.type} → sent ${result.sent}, pruned ${result.pruned}`);
    } catch (e) {
      console.error('[send-push] delivery threw', e);
    }
  }

  return json({ accepted: plans.length, success: true }, 200);
});

interface Plan {
  recipients: string[];
  content: PushContent;
}

// ---------------------------------------------------------------------------
// Path 1 — a notification row (broadcasts, invites, reminders, 1-on-1 messages)
// ---------------------------------------------------------------------------
async function planFromNotification(
  supabase: SupabaseClient,
  n: NotificationRecord,
): Promise<Plan | null> {
  const isChat = !!n.conversation_id;
  const type = typeForNotification(n.kind, n.priority, isChat, n.message);
  const rule = RULES[type];

  let image: string | undefined;
  let isGroup = false;
  let senderId: string | undefined;
  let senderAvatar: string | undefined;

  if (n.conversation_id) {
    if (rule.respectsMute) {
      const { data: cState } = await supabase
        .from('conversation_states')
        .select('muted')
        .eq('conversation_id', n.conversation_id)
        .eq('user_id', n.user_id)
        .maybeSingle();
      if (cState?.muted) return null;
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('is_group, participant_user_id, organizer_user_id')
      .eq('id', n.conversation_id)
      .maybeSingle();
    isGroup = !!conv?.is_group;

    image = await signedChatMedia(supabase, await latestAttachment(supabase, n.conversation_id));

    if (!isGroup && conv) {
      // 1-on-1: the other participant IS the sender, relative to the RECIPIENT.
      // n.title is already their name (see DataContext.persistMessage).
      senderId = (conv.participant_user_id === n.user_id
        ? conv.organizer_user_id
        : conv.participant_user_id) ?? undefined;
      if (senderId) senderAvatar = await avatarOf(supabase, senderId);
    }
  }

  if (!image && n.event_id) image = await eventCover(supabase, n.event_id);

  return {
    recipients: [n.user_id],
    content: {
      type,
      dedupeKey: `notif:${n.id}`,
      title: n.title,
      subtitle: isChat ? 'Sent a message' : undefined,
      body: n.message,
      data: {
        notificationId: n.id,
        type,
        kind: n.kind,
        event_id: n.event_id ?? undefined,
        application_id: n.application_id ?? undefined,
        conversation_id: n.conversation_id ?? undefined,
        ...(isChat
          ? {
              sender_name: n.title,
              sender_id: senderId,
              sender_avatar: senderAvatar,
              conversation_name: isGroup ? n.title : undefined,
              is_group: String(isGroup),
              sent_at: n.created_at ?? undefined,
              message_preview: n.message,
            }
          : {}),
      },
      image,
      channelId: rule.channelId,
      categoryId: rule.categoryId,
      sound: rule.sound,
      collapseKey: n.conversation_id ?? undefined,
      highPriority: rule.highPriority,
    },
  };
}

// ---------------------------------------------------------------------------
// Path 2 — a group-chat message. No notification row exists for these.
// ---------------------------------------------------------------------------
async function plansFromGroupMessage(
  supabase: SupabaseClient,
  m: MessageRecord,
): Promise<Plan[]> {
  // 1-on-1 messages already push via their notification row; broadcasts already
  // push via the rows send_event_broadcast inserts. Neither belongs here.
  if (m.receiver_id !== null) return [];
  if (m.is_broadcast) return [];
  if (m.deleted_at) return [];

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, is_group, event_id, event_title')
    .eq('id', m.conversation_id)
    .maybeSingle();
  if (!conv?.is_group) return [];

  const eventId = m.event_id ?? conv.event_id;
  if (!eventId) return []; // group membership is derived from the event

  const { data: ev } = await supabase
    .from('events')
    .select('organizer_user_id, co_organizer_user_ids, title')
    .eq('id', eventId)
    .maybeSingle();

  const { data: parts, error } = await supabase
    .from('event_participants')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('status', 'JOINED')
    .neq('user_id', m.sender_id);
  if (error) {
    console.error('[send-push] participant lookup failed', error);
    return [];
  }

  const participantSet = new Set<string>((parts ?? []).map((p) => p.user_id as string));
  if (ev?.organizer_user_id && ev.organizer_user_id !== m.sender_id) {
    participantSet.add(ev.organizer_user_id);
  }
  if (Array.isArray(ev?.co_organizer_user_ids)) {
    ev.co_organizer_user_ids.forEach((id: string) => {
      if (id && id !== m.sender_id) participantSet.add(id);
    });
  }

  const participants = [...participantSet];
  if (participants.length === 0) return [];

  const { data: sender } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', m.sender_id)
    .maybeSingle();

  const senderName = sender?.full_name ?? 'Rotaractor';
  const firstName = senderName.split(' ')[0];
  const title = conv.event_title ?? ev?.title ?? (await eventTitle(supabase, eventId)) ?? 'Group Chat';
  const rawText = m.text?.trim() || (m.attachment_path ? '📷 Sent a photo' : 'New message');
  const image = (await signedChatMedia(supabase, m.attachment_path))
    ?? (await eventCover(supabase, eventId))
    ?? (sender?.avatar_url || undefined);

  // Mentions are de-duplicated and scoped to people actually in the group: the
  // column is client-supplied, so a stale or hostile id must not become a push.
  // The sender never notifies themselves for mentioning themselves.
  const mentioned = [...new Set(m.mentioned_user_ids ?? [])]
    .filter((id) => id !== m.sender_id && participants.includes(id));

  // If this message is a direct reply, find the author of the quoted message.
  let repliedAuthorId: string | null = null;
  if (m.reply_to_message_id) {
    const { data: origMsg } = await supabase
      .from('direct_messages')
      .select('sender_id')
      .eq('id', m.reply_to_message_id)
      .maybeSingle();
    if (
      origMsg?.sender_id &&
      origMsg.sender_id !== m.sender_id &&
      participants.includes(origMsg.sender_id) &&
      !mentioned.includes(origMsg.sender_id)
    ) {
      repliedAuthorId = origMsg.sender_id;
    }
  }

  // Anyone mentioned or replied to gets their dedicated push INSTEAD of the general group one.
  const groupRecipients = participants.filter((id) => !mentioned.includes(id) && id !== repliedAuthorId);

  const isUrgent = m.text?.startsWith('🚨') ?? false;
  const isAnnouncement = (m.text?.startsWith('📢') ?? false) || isUrgent;
  const notifType: PushType = isUrgent
    ? 'organizer_high'
    : isAnnouncement
    ? 'organizer_alert'
    : 'chat_message';
  const rule = RULES[notifType];
  const chatRule = RULES.chat_message;

  const sharedData = {
    kind: 'GROUP_MESSAGE',
    event_id: eventId,
    conversation_id: m.conversation_id,
    message_id: m.id,
    sender_name: senderName,
    sender_id: m.sender_id,
    sender_avatar: sender?.avatar_url || undefined,
    conversation_name: title,
    is_group: 'true',
    sent_at: m.created_at ?? undefined,
  };

  const plans: Plan[] = [];

  // Dedicated push for the author being replied to
  if (repliedAuthorId) {
    const replySnippet = m.reply_to_text ? ` "${m.reply_to_text.slice(0, 30)}${m.reply_to_text.length > 30 ? '...' : ''}"` : '';
    plans.push({
      recipients: [repliedAuthorId],
      content: {
        type: 'chat_message',
        dedupeKey: `msg:${m.id}:reply`,
        title,
        subtitle: `${senderName} replied to your message`,
        body: `${firstName} replied to you${replySnippet}: "${rawText}"`,
        data: { ...sharedData, type: 'chat_message', message_preview: rawText },
        image,
        channelId: chatRule.channelId,
        categoryId: chatRule.categoryId,
        sound: chatRule.sound,
        collapseKey: m.conversation_id,
        highPriority: true,
      },
    });
  }

  let activeRecipients = groupRecipients;
  if (!isAnnouncement && rule.respectsMute) {
    const { data: mutedStates } = await supabase
      .from('conversation_states')
      .select('user_id')
      .eq('conversation_id', m.conversation_id)
      .eq('muted', true)
      .in('user_id', groupRecipients);
    const mutedIds = new Set((mutedStates ?? []).map((s: any) => s.user_id));
    activeRecipients = groupRecipients.filter(id => !mutedIds.has(id));
  }

  if (activeRecipients.length) {
    plans.push({
      recipients: activeRecipients,
      content: {
        type: notifType,
        dedupeKey: `msg:${m.id}:group`,
        title: isUrgent ? `🚨 URGENT: ${title}` : isAnnouncement ? `📢 Announcement: ${title}` : title,
        subtitle: isUrgent ? `${senderName} posted an urgent alert` : isAnnouncement ? `${senderName} posted an announcement` : `${senderName} sent a message`,
        body: m.text?.trim() ? `${firstName}: ${m.text.trim()}` : `${firstName}: ${rawText}`,
        data: { ...sharedData, type: notifType, message_preview: rawText },
        image,
        channelId: rule.channelId,
        categoryId: rule.categoryId,
        sound: rule.sound,
        collapseKey: m.conversation_id,
        highPriority: rule.highPriority,
      },
    });
  }

  if (mentioned.length) {
    const mentionRule = RULES.mention;

    // Fetch names for all mentioned users to strip mentions cleanly from the preview
    const { data: mentionedProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', mentioned);
    const profilesMap = new Map(mentionedProfiles?.map((p) => [p.id, p.full_name]) || []);

    plans.push(...mentioned.map((userId) => {
      const recipientFullName = profilesMap.get(userId) || '';
      let cleanText = rawText;

      if (recipientFullName) {
        // 1. Try stripping full name mention: "@Patricia Gomez hello" -> "hello"
        // Flexible whitespace (\s+) to catch double spaces or hidden characters
        const parts = recipientFullName.split(/\s+/).filter(Boolean);
        const pattern = `@${parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}`;
        const fullNameRegex = new RegExp(`^${pattern}\\s*`, 'i');

        if (fullNameRegex.test(cleanText)) {
          cleanText = cleanText.replace(fullNameRegex, '');
        } else {
          // 2. Fallback to first name: "@Patricia hello" -> "hello"
          const firstName = parts[0];
          if (firstName) {
            const escapedFirstName = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const firstNameRegex = new RegExp(`^@${escapedFirstName}\\s*`, 'i');
            cleanText = cleanText.replace(firstNameRegex, '');
          }
        }
      }

      return {
        recipients: [userId],
        content: {
          type: 'mention',
          dedupeKey: `msg:${m.id}:mention:${userId}`,
          title,
          body: `${senderName} mentioned you: "${cleanText}"`,
          data: {
            ...sharedData,
            type: 'mention',
            // Setting sender_name to this phrase makes Android's MessagingStyle
            // show exactly "Sender mentioned you: message"
            sender_name: `${senderName} mentioned you`,
            message_preview: `"${cleanText}"`,
            respects_mute: 'false',
          },
          image,
          channelId: mentionRule.channelId,
          categoryId: mentionRule.categoryId,
          sound: mentionRule.sound,
          collapseKey: `${m.conversation_id}:mention`,
          highPriority: mentionRule.highPriority,
        },
      };
    }));
  }

  return plans;
}

// ---------------------------------------------------------------------------
// Path 3 — a message reaction.
// ---------------------------------------------------------------------------
async function planFromReaction(
  supabase: SupabaseClient,
  r: ReactionRecord,
): Promise<Plan | null> {
  const { data: msg } = await supabase
    .from('direct_messages')
    .select('sender_id, text, conversation_id, event_id')
    .eq('id', r.message_id)
    .maybeSingle();

  if (!msg || msg.sender_id === r.user_id) return null;

  const { data: sender } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', r.user_id)
    .maybeSingle();

  const senderName = sender?.full_name ?? 'Someone';
  const messageSnippet = msg.text ? ` "${msg.text.slice(0, 30)}${msg.text.length > 30 ? '...' : ''}"` : ' your photo';
  const rule = RULES.general;

  return {
    recipients: [msg.sender_id],
    content: {
      type: 'general',
      dedupeKey: `react:${r.id}`,
      title: 'New Reaction',
      body: `${senderName} reacted ${r.emoji} to your message:${messageSnippet}`,
      data: {
        type: 'general',
        kind: 'MESSAGE_REACTION',
        conversation_id: msg.conversation_id,
        event_id: msg.event_id ?? undefined,
      },
      channelId: rule.channelId,
      categoryId: rule.categoryId,
      sound: rule.sound,
      highPriority: rule.highPriority,
    },
  };
}


// ---------------------------------------------------------------------------
// Notification rules — one table, evaluated per type
// ---------------------------------------------------------------------------
// Every push is classified into exactly one type, and the type decides the channel
// (and therefore the sound), the action category, and whether a muted conversation
// may silence it. Keeping this declarative is what stops "which sound does an
// invitation use?" from being answered differently in three places.
//
// Channel ids carry a generation suffix on purpose: Android freezes a channel's
// settings at creation, so changing sound or importance requires a NEW id. These
// must stay in step with configurePushNotifications in services/push.ts.

type PushType =
  | 'general'
  | 'chat_message'
  | 'mention'
  | 'event_reminder'
  | 'invitation'
  | 'join_approved'
  | 'organizer_high'
  | 'organizer_alert'
  | 'announcement'
  | 'emergency_sos';

interface TypeRule {
  channelId: string;
  categoryId: string;
  sound: string;
  /** False only for mentions: being addressed directly pierces a muted group. */
  respectsMute: boolean;
  highPriority: boolean;
}

const RULES: Record<PushType, TypeRule> = {
  general:         { channelId: 'general_v6',         categoryId: 'general_actions', sound: 'chime.wav',     respectsMute: true,  highPriority: false },
  chat_message:    { channelId: 'chat_v5',            categoryId: 'message_actions', sound: 'chime.wav',     respectsMute: true,  highPriority: false },
  mention:         { channelId: 'mentions_v3',        categoryId: 'message_actions', sound: 'chime.wav',     respectsMute: false, highPriority: false },
  event_reminder:  { channelId: 'events_v3',          categoryId: 'general_actions', sound: 'chime.wav',     respectsMute: true,  highPriority: false },
  invitation:      { channelId: 'events_v3',          categoryId: 'general_actions', sound: 'chime.wav',     respectsMute: true,  highPriority: false },
  join_approved:   { channelId: 'events_v3',          categoryId: 'general_actions', sound: 'chime.wav',     respectsMute: true,  highPriority: false },
  organizer_high:  { channelId: 'organizer_high_v2',  categoryId: 'general_actions', sound: 'alert.wav',     respectsMute: true,  highPriority: true  },
  organizer_alert: { channelId: 'organizer_alert_v3', categoryId: 'general_actions', sound: 'alert.wav',     respectsMute: true,  highPriority: true  },
  announcement:    { channelId: 'organizer_alert_v3', categoryId: 'general_actions', sound: 'alert.wav',     respectsMute: true,  highPriority: true  },
  emergency_sos:   { channelId: 'emergency_sos_v3',   categoryId: 'general_actions', sound: 'emergency.wav', respectsMute: false, highPriority: true  },
};

/** Classifies a notification row. Organizer urgency outranks the kind. */
function typeForNotification(kind: string, priority: string | null, isChat: boolean, message?: string | null): PushType {
  if (kind === 'EMERGENCY_BROADCAST') return 'emergency_sos';
  if (priority === 'HIGH' || message?.startsWith('🚨')) return 'organizer_high';
  if (priority === 'ALERT' || message?.startsWith('📢') || kind === 'ANNOUNCEMENT') return 'organizer_alert';
  if (isChat) return 'chat_message';
  if (kind === 'EVENT_REMINDER') return 'event_reminder';
  if (kind === 'INVITATION_RECEIVED') return 'invitation';
  if (kind === 'JOIN_APPROVED') return 'join_approved';
  // Default: ordinary app notifications chime. This fallback previously returned
  // 'organizer_alert', which gave every unclassified kind the loud alert.wav on a
  // MAX-importance organizer channel.
  return 'general';
}

/**
 * Claims a delivery key so an at-least-once webhook cannot buzz everyone twice.
 *
 * Fails OPEN: if the ledger itself errors we still send. A rare duplicate is a far
 * smaller harm than silently dropping someone's notification.
 */
async function claimDelivery(supabase: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await supabase.from('push_deliveries').insert({ dedupe_key: key });
  if (!error) return true;
  if (error.code === '23505') return false;   // unique_violation — already sent
  console.warn('[send-push] dedupe ledger unavailable, sending anyway', error.message);
  return true;
}


// ---------------------------------------------------------------------------
// FCM v1 — data-only delivery for Android
// ---------------------------------------------------------------------------
// Android's conversation notification is built by native Kotlin, and that code only
// runs when FCM hands the message to the app. Firebase only does that for messages
// with NO `notification` block; the Expo push service always sends one, so on a
// backgrounded or terminated app the system tray drew a generic notification
// instead. Sending data-only, direct to FCM, is the only way around that.
//
// The data keys are dictated by expo-notifications' NotificationData: `title`,
// `message`, `body` (a JSON string), and `channelId`.
//
// Secret:  supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    console.error('[send-push] FCM_SERVICE_ACCOUNT is not valid JSON');
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')),
    (c) => c.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** OAuth access token for FCM, cached until shortly before it expires. */
async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const segment = (o: unknown) => base64Url(encoder.encode(JSON.stringify(o)));
  const unsigned =
    `${segment({ alg: 'RS256', typ: 'JWT' })}.` +
    segment({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });

  try {
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      await importKey(sa.private_key),
      encoder.encode(unsigned),
    );
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) {
      console.error('[send-push] FCM token exchange failed', body);
      return null;
    }
    cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cachedToken.value;
  } catch (e) {
    console.error('[send-push] could not sign FCM assertion', e);
    return null;
  }
}

/** Sends to Android device tokens. Returns the tokens FCM says are dead. */
async function sendViaFcm(tokens: string[], c: PushContent): Promise<string[]> {
  const sa = serviceAccount();
  if (!sa) {
    console.error('[send-push] FCM_SERVICE_ACCOUNT is not set — Android delivery skipped');
    return [];
  }
  const token = await accessToken(sa);
  if (!token) return [];

  const data: Record<string, string> = {
    title: c.title,
    message: c.body,
    body: JSON.stringify(c.data),
    channelId: c.channelId,
    sound: c.sound,
  };
  if (c.image) data.image = c.image;

  const stale: string[] = [];
  // FCM v1 has no batch endpoint, so this is one request per device. Chunked so a
  // large group chat does not open hundreds of sockets at once.
  for (let i = 0; i < tokens.length; i += 20) {
    await Promise.all(
      tokens.slice(i, i + 20).map(async (deviceToken) => {
        try {
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: {
                  token: deviceToken,
                  // DATA-ONLY: No top-level 'notification' block. This ensures the
                  // message is handed to RotaractNotificationsService in the
                  // background/killed state instead of the OS drawing a generic banner.
                  data,
                  android: {
                    priority: 'HIGH',
                  },
                },
              }),
            },
          );
          if (res.ok) return;
          const body = await res.json().catch(() => ({}));
          const status = body?.error?.details?.[0]?.errorCode ?? body?.error?.status;
          if (status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT' || res.status === 404) {
            stale.push(deviceToken);
          } else {
            console.error('[send-push] FCM send failed', res.status, JSON.stringify(body));
          }
        } catch (e) {
          console.error('[send-push] FCM request threw', e);
        }
      }),
    );
  }
  return stale;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * The photo attached to the conversation's NEWEST message, if it has one.
 *
 * Deliberately not "the newest photo in the thread": a notification row carries no
 * message id, so that would put a stale picture from earlier in the chat on top of
 * a plain text message. The row is written only after the message insert commits
 * (see DataContext.persistMessage), so the newest message IS the one being pushed.
 */
async function latestAttachment(supabase: SupabaseClient, conversationId: string) {
  const { data } = await supabase
    .from('direct_messages')
    .select('attachment_path')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.attachment_path as string | null) ?? undefined;
}

/**
 * A URL Android can actually fetch for a chat photo.
 *
 * `chat-media` is a PRIVATE bucket and the message row stores the bare object path
 * (see services/storage.ts), so the raw value is unusable in a push: the OS
 * downloads notification images unauthenticated and would get a 403 — or, with a
 * bare path, never form a URL at all. The service role can mint a signed URL.
 *
 * 24h of validity, not the app's usual 1h: the image is fetched when the device
 * receives the push, which may be well after we send it if the phone was offline.
 */
async function signedChatMedia(supabase: SupabaseClient, path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path; // already a full URL
  const { data, error } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) {
    console.warn('[send-push] could not sign chat media', path, error.message);
    return undefined;
  }
  return data.signedUrl;
}

async function avatarOf(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
  return (data?.avatar_url as string | null) ?? undefined;
}

async function eventCover(supabase: SupabaseClient, eventId: string) {
  const { data } = await supabase.from('events').select('cover_photo').eq('id', eventId).maybeSingle();
  return (data?.cover_photo as string | null) ?? undefined;
}

async function eventTitle(supabase: SupabaseClient, eventId: string) {
  const { data } = await supabase.from('events').select('title').eq('id', eventId).maybeSingle();
  return (data?.title as string | null) ?? undefined;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
async function deliver(
  supabase: SupabaseClient,
  recipients: string[],
  c: PushContent,
): Promise<{ sent: number; pruned: number }> {
  // Token presence IS the push preference: the client removes its token when the
  // user turns push off, so an opted-out user simply has no row here.
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token, device_token, platform, user_id')
    .in('user_id', recipients);

  if (error) {
    console.error('[send-push] token lookup failed', error);
    return { sent: 0, pruned: 0 };
  }
  if (!tokens?.length) return { sent: 0, pruned: 0 };

  // Deduplicate per user to prevent duplicate push deliveries:
  // - If an Android user has a registered native FCM device_token, send to FCM only.
  // - Otherwise (iOS or Android without raw device_token), send via Expo push service.
  const fcmTokenSet = new Set<string>();
  const expoTargets: { token: string; platform: string | null }[] = [];
  const seenExpoTokens = new Set<string>();

  // Group tokens by user_id
  const userTokensMap = new Map<string, typeof tokens>();
  for (const t of tokens) {
    const list = userTokensMap.get(t.user_id) ?? [];
    list.push(t);
    userTokensMap.set(t.user_id, list);
  }

  for (const [, userTokens] of userTokensMap) {
    // If a user has an FCM device_token, use it exclusively for Android.
    const fcmToken = userTokens.find((t) => t.platform === 'android' && t.device_token);
    if (fcmToken?.device_token) {
      fcmTokenSet.add(fcmToken.device_token);
    } else {
      // Fallback: use Expo tokens for iOS and Android devices without a native token.
      for (const t of userTokens) {
        if (t.token && !seenExpoTokens.has(t.token)) {
          seenExpoTokens.add(t.token);
          expoTargets.push({ token: t.token, platform: t.platform });
        }
      }
    }
  }

  const [staleExpo, staleFcm] = await Promise.all([
    expoTargets.length ? sendViaExpo(expoTargets, c) : Promise.resolve([]),
    fcmTokenSet.size ? sendViaFcm([...fcmTokenSet], c) : Promise.resolve([]),
  ]);

  // Prune dead tokens so we stop sending to them.
  if (staleExpo.length) {
    await supabase.from('push_tokens').delete().in('token', staleExpo);
  }
  if (staleFcm.length) {
    await supabase.from('push_tokens').delete().in('device_token', staleFcm);
  }

  const pruned = staleExpo.length + staleFcm.length;
  return { sent: expoTargets.length + fcmTokenSet.size - pruned, pruned };
}

/** Expo push service delivery. Returns the Expo tokens Expo says are dead. */
async function sendViaExpo(
  targets: { token: string; platform: string | null }[],
  c: PushContent,
): Promise<string[]> {
  const messages = targets.map(({ token, platform }) => ({
    to: token,
    title: c.title,
    body: c.body,
    data: c.data,
    // Android builds its own inline-reply action natively; sending a categoryId
    // there too would add a second, duplicate set of buttons. iOS still needs it.
    ...(platform === 'ios' ? { categoryId: c.categoryId } : {}),
    priority: 'high',
    // _contentAvailable wakes a killed/backgrounded app on both FCM and APNs so the
    // OS delivers the notification even when the app is fully closed.
    _contentAvailable: true,
    // Show the banner even if the app is in the foreground when the push arrives.
    _displayInForeground: true,

    // --- Android (only reached by devices without a registered device token) ---
    channelId: c.channelId,
    color: '#D41367',
    ...(c.collapseKey ? { tag: c.collapseKey } : {}),
    ...(c.image ? { richContent: { image: c.image } } : {}),

    // --- iOS ---
    sound: c.sound,
    subtitle: c.subtitle,
    ...(c.collapseKey ? { collapseId: c.collapseKey, threadId: c.collapseKey } : {}),
    ...(c.highPriority ? { interruptionLevel: 'time-sensitive' } : {}),
  }));

  const stale: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const body = await res.json();
      const tickets: any[] = body?.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          stale.push(chunk[index].to);
        }
      });
    } catch (e) {
      console.error('[send-push] Expo push failed', e);
    }
  }
  return stale;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const skipped = () => json({ skipped: true });
