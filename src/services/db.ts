import { supabase } from './supabase';
import {
  AppUser, Club, RotaractEvent, EventParticipant, EventInvitation, EventImpact,
  VerificationApplication, AuditLog, AppNotification, Conversation, DirectMessage, ReadCursor,
  ConversationState, MessageReaction,
} from '../types';

/**
 * Supabase data-access layer. `loadAll` pulls every table the app renders and
 * maps rows to the app's domain types, re-deriving the denormalized display
 * fields the UI expects (club/organizer names, a participating-club list from
 * the junction table, etc.) that are not stored as columns.
 *
 * Writes are thin pass-throughs governed by the RLS policies in schema.sql.
 * Callers generate row ids client-side (uuid) so optimistic local state and the
 * persisted row share the same id.
 */

export interface LoadedData {
  users: AppUser[];
  clubs: Club[];
  events: RotaractEvent[];
  participants: EventParticipant[];
  invitations: EventInvitation[];
  impacts: EventImpact[];
  applications: VerificationApplication[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  conversations: Conversation[];
  messages: DirectMessage[];
  readCursors: ReadCursor[];
  /** Ids of messages the current user has hidden from their own view ("delete for me"). */
  deletedMessageIds: string[];
  /** The current user's per-conversation inbox state (pin/archive/delete). */
  conversationStates: ConversationState[];
  /** Emoji reactions left on messages. */
  reactions: MessageReaction[];
}

/**
 * `signal` lets a caller actually cancel the in-flight HTTP requests (not just
 * give up on them JS-side) — used by DataContext's refresh timeout so a hung
 * request on a flaky connection is genuinely torn down instead of left running
 * in the background to resolve at some arbitrary later time.
 */
export async function loadAll(signal?: AbortSignal): Promise<LoadedData> {
  const withSignal = <T extends { abortSignal(s: AbortSignal): T }>(q: T): T =>
    signal ? q.abortSignal(signal) : q;

  const [
    profilesRes, clubsRes, eventsRes, epcRes, partsRes, invRes, impRes,
    appsRes, auditRes, notifRes, convRes, msgRes, readsRes, delsRes, convStatesRes, reactionsRes,
  ] = await Promise.all([
    withSignal(supabase.from('profiles').select('*')),
    withSignal(supabase.from('clubs').select('*')),
    withSignal(supabase.from('events').select('*')),
    withSignal(supabase.from('event_participating_clubs').select('*')),
    withSignal(supabase.from('event_participants').select('*')),
    withSignal(supabase.from('event_invitations').select('*')),
    withSignal(supabase.from('event_impacts').select('*')),
    withSignal(supabase.from('verification_applications').select('*')),
    withSignal(supabase.from('audit_logs').select('*')),
    // Ordered and capped explicitly. PostgREST enforces a server-side row cap
    // (1000 by default), so an unordered select silently returned an ARBITRARY
    // slice once a user passed it — with no guarantee the newest were included.
    // Newest-first makes truncation deterministic: you lose the oldest, never the
    // most recent.
    withSignal(supabase.from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(500)),
    withSignal(supabase.from('conversations').select('*')),
    // Descending, not ascending: with the same server-side cap, ascending order
    // returned the OLDEST rows and dropped recent chat history entirely. The client
    // re-sorts ascending for display (see messagesForConversation), so the fetch
    // order is free to be whatever keeps the right rows.
    withSignal(supabase.from('direct_messages').select('*')
      .order('created_at', { ascending: false }).limit(1000)),
    // message_reads may not exist until migration 0007 is applied — tolerate that.
    withSignal(supabase.from('message_reads').select('*')),
    // message_deletions may not exist until migration 0009 — tolerate that. RLS
    // already scopes this to the current user's own rows.
    withSignal(supabase.from('message_deletions').select('message_id')),
    // conversation_states may not exist until migration 0011 — tolerate that. RLS
    // scopes it to the caller's own rows. Kept in the parallel batch so it can't
    // add a serial round-trip that stalls the whole load.
    withSignal(supabase.from('conversation_states').select('*')),
    // message_reactions may not exist until migration 0029 — tolerate that.
    withSignal(supabase.from('message_reactions').select('*')),
  ]);

  const profiles = profilesRes.data ?? [];
  const clubs = clubsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const epc = epcRes.data ?? [];

  // Lookups for deriving display fields.
  const nameById = new Map<string, string>(profiles.map((p: any) => [p.id, p.full_name]));
  const clubNameById = new Map<string, string>(clubs.map((c: any) => [c.id, c.club_name]));
  const partClubsByEvent = new Map<string, string[]>();
  for (const row of epc as any[]) {
    const arr = partClubsByEvent.get(row.event_id) ?? [];
    arr.push(row.club_id);
    partClubsByEvent.set(row.event_id, arr);
  }

  const users: AppUser[] = profiles.map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    username: p.username,
    club_id: p.club_id ?? '',
    club_name: (p.club_id && clubNameById.get(p.club_id)) || '',
    position: p.position,
    role: p.role,
    system_role: p.system_role ?? undefined,
    club_role: p.club_role ?? undefined,
    verification_status: p.verification_status,
    avatar_url: p.avatar_url ?? undefined,
    signature_url: p.signature_url ?? undefined,
    contact_number: p.contact_number ?? undefined,
    // Required by canMessageUser: without it every other member reads as
    // "undefined", which is not false, so the messaging gate never engaged.
    allow_direct_inquiries: p.allow_direct_inquiries ?? true,
    contact_privacy: p.contact_privacy ?? 'ALL_VERIFIED',
  }));

  const mappedClubs: Club[] = clubs.map((c: any) => ({
    id: c.id,
    club_name: c.club_name,
    club_code: c.club_code,
    zone_id: c.zone_id ?? '',
    city: c.city,
    province: c.province,
    latitude: c.latitude,
    longitude: c.longitude,
    description: c.description ?? '',
    member_count: c.member_count ?? 0,
    club_type: c.club_type ?? 'COMMUNITY_BASED',
    institution_name: c.institution_name ?? undefined,
    president_id: c.president_id ?? '',
    president_name: (c.president_id && nameById.get(c.president_id)) || 'Pending Election',
  }));

  const mappedEvents: RotaractEvent[] = events.map((e: any) => ({
    id: e.id,
    title: e.title,
    description: e.description ?? '',
    event_type: e.event_type,
    status: e.status,
    start_datetime: e.start_datetime,
    end_datetime: e.end_datetime,
    latitude: e.latitude,
    longitude: e.longitude,
    address: e.address,
    city: e.city,
    organizing_club_id: e.organizing_club_id,
    organizing_club_name: clubNameById.get(e.organizing_club_id) || '',
    organizer_user_id: e.organizer_user_id,
    co_organizer_user_ids: e.co_organizer_user_ids ?? [],
    participating_club_ids: partClubsByEvent.get(e.id) ?? [],
    max_participants: e.max_participants,
    requires_approval: e.requires_approval,
    allow_participant_invites: e.allow_participant_invites,
    visibility: e.visibility,
    cover_photo: e.cover_photo ?? undefined,
    contact_number: e.contact_number ?? undefined,
    contact_email: e.contact_email ?? undefined,
    areas_of_focus: e.areas_of_focus ?? [],
    lock_leave_cutoff_hours: e.lock_leave_cutoff_hours ?? 24,
    approved_by_club_ids: e.approved_by_club_ids ?? [],
    cancellation_reason: e.cancellation_reason ?? undefined,
  }));

  const participants: EventParticipant[] = (partsRes.data ?? []).map((p: any) => ({
    id: p.id,
    event_id: p.event_id,
    user_id: p.user_id,
    status: p.status,
    attendance_status: p.attendance_status,
    joined_at: p.joined_at,
    checked_in_at: p.checked_in_at ?? undefined,
    check_in_latitude: p.check_in_latitude ?? undefined,
    check_in_longitude: p.check_in_longitude ?? undefined,
    check_in_distance_m: p.check_in_distance_m ?? undefined,
    check_in_method: p.check_in_method ?? undefined,
    checked_out_at: p.checked_out_at ?? undefined,
    check_out_latitude: p.check_out_latitude ?? undefined,
    check_out_longitude: p.check_out_longitude ?? undefined,
    check_out_distance_m: p.check_out_distance_m ?? undefined,
    check_out_method: p.check_out_method ?? undefined,
  }));

  const invitations: EventInvitation[] = (invRes.data ?? []).map((i: any) => ({
    id: i.id,
    event_id: i.event_id,
    invited_user_id: i.invited_user_id,
    invited_by_user_id: i.invited_by_user_id,
    status: i.status,
    sent_at: i.sent_at,
    decline_reason: i.decline_reason ?? undefined,
  }));

  const impacts: EventImpact[] = (impRes.data ?? []).map((im: any) => ({
    event_id: im.event_id,
    volunteer_hours: im.volunteer_hours,
    beneficiaries: im.beneficiaries,
    funds_raised: Number(im.funds_raised) || 0,
    items_distributed: im.items_distributed,
    trees_planted: im.trees_planted,
    impact_summary: im.impact_summary ?? '',
  }));

  const applications: VerificationApplication[] = (appsRes.data ?? []).map((a: any) => ({
    id: a.id,
    user_id: a.user_id,
    full_name: a.full_name,
    email: a.email,
    club_id: a.club_id,
    club_name: clubNameById.get(a.club_id) || '',
    member_id: a.member_id,
    position: a.position,
    status: a.status,
    submitted_at: a.submitted_at,
    notes: a.notes ?? '',
    proof_url: a.proof_url ?? undefined,
  }));

  const auditLogs: AuditLog[] = (auditRes.data ?? []).map((l: any) => ({
    id: l.id,
    application_id: l.application_id,
    action: l.action,
    performed_by_name: l.performed_by_name,
    performed_by_role: l.performed_by_role,
    previous_status: l.previous_status,
    new_status: l.new_status,
    notes: l.notes ?? '',
    created_at: l.created_at,
  }));

  const notifications: AppNotification[] = (notifRes.data ?? []).map((n: any) => ({
    id: n.id,
    user_id: n.user_id,
    kind: n.kind,
    title: n.title,
    message: n.message,
    event_id: n.event_id ?? undefined,
    application_id: n.application_id ?? undefined,
    conversation_id: n.conversation_id ?? undefined,
    is_read: n.is_read,
    created_at: n.created_at,
    priority: n.priority ?? undefined,
  }));

  const conversations: Conversation[] = (convRes.data ?? []).map((c: any) => ({
    id: c.id,
    event_id: c.event_id ?? undefined,
    event_title: c.event_title ?? undefined,
    is_group: c.is_group ?? false,
    participant_user_id: c.participant_user_id ?? undefined,
    participant_name: c.is_group
      ? `${c.event_title ?? 'Event'} Group Chat`
      : (c.participant_user_id && nameById.get(c.participant_user_id)) || '',
    organizer_user_id: c.organizer_user_id,
    organizer_name: c.is_group
      ? (c.event_id && clubNameById.get(events.find((e: any) => e.id === c.event_id)?.organizing_club_id)) || 'Club'
      : nameById.get(c.organizer_user_id) || '',
    last_message: c.last_message ?? '',
    last_message_at: c.last_message_at,
  }));

  const messages: DirectMessage[] = (msgRes.data ?? []).map((d: any) => ({
    id: d.id,
    conversation_id: d.conversation_id,
    event_id: d.event_id ?? undefined,
    sender_id: d.sender_id,
    sender_name: nameById.get(d.sender_id) || '',
    receiver_id: d.receiver_id ?? undefined,
    receiver_name: (d.receiver_id && nameById.get(d.receiver_id)) || 'Group Chat',
    text: d.text ?? '',
    created_at: d.created_at,
    reply_to_message_id: d.reply_to_message_id ?? undefined,
    reply_to_sender_name: d.reply_to_sender_name ?? undefined,
    reply_to_text: d.reply_to_text ?? undefined,
    attachment_path: d.attachment_path ?? undefined,
    attachment_type: d.attachment_type ?? undefined,
    deleted_at: d.deleted_at ?? undefined,
  }));

  const readCursors: ReadCursor[] = (readsRes.data ?? []).map((r: any) => ({
    conversation_id: r.conversation_id,
    user_id: r.user_id,
    last_read_at: r.last_read_at,
    last_read_message_id: r.last_read_message_id ?? undefined,
  }));

  const deletedMessageIds: string[] = (delsRes.data ?? []).map((r: any) => r.message_id);

  const conversationStates: ConversationState[] = (convStatesRes.data ?? []).map((s: any) => ({
    conversation_id: s.conversation_id,
    user_id: s.user_id,
    pinned: !!s.pinned,
    archived: !!s.archived,
    muted: !!s.muted,
    deleted_at: s.deleted_at ?? undefined,
  }));

  const reactions: MessageReaction[] = (reactionsRes.data ?? []).map((r: any) => ({
    id: r.id,
    message_id: r.message_id,
    user_id: r.user_id,
    emoji: r.emoji,
    created_at: r.created_at,
  }));

  return {
    users, clubs: mappedClubs, events: mappedEvents, participants, invitations,
    impacts, applications, auditLogs, notifications, conversations, messages, readCursors,
    deletedMessageIds, conversationStates, reactions,
  };
}

// ---------------------------------------------------------------------------
// Write helpers — fire-and-forget persistence for the optimistic local state.
// Each logs (rather than throws) so a persistence hiccup never crashes the UI;
// the local state already reflects the change. RLS decides what actually lands.
//
// Because writes never throw, a failure would otherwise be invisible and the local
// state would silently diverge from the server. A registered listener lets the UI
// surface "some changes didn't save" so the user can retry (pull-to-refresh), which
// reconciles local state with what actually persisted.
// ---------------------------------------------------------------------------

type WriteErrorListener = (op: string, error: unknown) => void;
let writeErrorListener: WriteErrorListener | null = null;

/** Registers a UI handler notified whenever a persistence write fails. */
export function setWriteErrorListener(fn: WriteErrorListener | null) {
  writeErrorListener = fn;
}

function reportError(op: string, error: unknown) {
  if (error) {
    console.warn(`[db] ${op} failed`, error);
    try { writeErrorListener?.(op, error); } catch { /* never let the notifier break a write */ }
  }
}

export const db = {
  insertEvent: async (e: RotaractEvent): Promise<boolean> => {
    const { participating_club_ids, organizing_club_name, ...row } = e;
    
    // 1. Attempt atomic creation via create_event_with_clubs RPC
    const rpcRes = await supabase.rpc('create_event_with_clubs', {
      p_event: row,
      p_participating_club_ids: participating_club_ids || [],
    });

    if (!rpcRes.error) {
      return true;
    }

    // 2. If the RPC function is missing (e.g. migration pending), fall back to sequential inserts
    const isRpcMissing =
      rpcRes.error.code === 'PGRST202' ||
      rpcRes.error.code === '42883' ||
      /function.*does not exist/i.test(rpcRes.error.message || '');

    if (isRpcMissing) {
      const { error } = await supabase.from('events').insert(row);
      reportError('insertEvent', error);
      if (error) return false;
      if (participating_club_ids?.length) {
        reportError(
          'insertEventClubs',
          (
            await supabase
              .from('event_participating_clubs')
              .insert(participating_club_ids.map(cid => ({ event_id: e.id, club_id: cid })))
          ).error,
        );
      }
      return true;
    }

    reportError('insertEventRpc', rpcRes.error);
    return false;
  },
  updateEvent: async (eventId: string, updates: Partial<RotaractEvent>) => {
    const { participating_club_ids, organizing_club_name, ...row } = updates;
    if (Object.keys(row).length) {
      reportError('updateEvent', (await supabase.from('events').update(row).eq('id', eventId)).error);
    }
    if (participating_club_ids) {
      await supabase.from('event_participating_clubs').delete().eq('event_id', eventId);
      if (participating_club_ids.length) {
        reportError('updateEventClubs', (await supabase.from('event_participating_clubs')
          .insert(participating_club_ids.map(cid => ({ event_id: eventId, club_id: cid })))).error);
      }
    }
  },
  /**
   * Records the caller's approval of a pending event.
   *
   * An RPC rather than a plain update: the events UPDATE policy only admits the
   * ORGANISING club's President, so a partner or co-organising club's President had
   * their approval silently discarded (an RLS USING violation updates zero rows and
   * reports no error). The function re-derives the approver set server-side, so
   * authorisation does not depend on what the client claims.
   */
  approveEvent: async (eventId: string) => {
    const { error } = await supabase.rpc('approve_event', { p_event_id: eventId });
    reportError('approveEvent', error);
    return !error;
  },
  insertParticipant: async (p: EventParticipant) => {
    reportError('insertParticipant', (await supabase.from('event_participants').upsert(p, { onConflict: 'event_id,user_id' })).error);
  },
  updateParticipant: async (id: string, updates: Partial<EventParticipant>): Promise<boolean> => {
    const { error } = await supabase.from('event_participants').update(updates).eq('id', id);
    reportError('updateParticipant', error);
    return !error;
  },
  deleteParticipant: async (eventId: string, userId: string) => {
    reportError('deleteParticipant', (await supabase.from('event_participants').delete().eq('event_id', eventId).eq('user_id', userId)).error);
  },
  deleteParticipantById: async (id: string) => {
    reportError('deleteParticipantById', (await supabase.from('event_participants').delete().eq('id', id)).error);
  },
  insertInvitation: async (i: EventInvitation) => {
    reportError('insertInvitation', (await supabase.from('event_invitations').insert(i)).error);
  },
  updateInvitation: async (id: string, updates: Partial<EventInvitation>) => {
    reportError('updateInvitation', (await supabase.from('event_invitations').update(updates).eq('id', id)).error);
  },
  upsertImpact: async (im: EventImpact) => {
    reportError('upsertImpact', (await supabase.from('event_impacts').upsert(im, { onConflict: 'event_id' })).error);
  },
  insertApplication: async (a: VerificationApplication) => {
    const { club_name, ...row } = a;
    reportError('insertApplication', (await supabase.from('verification_applications').insert(row)).error);
  },
  updateApplication: async (id: string, updates: Partial<VerificationApplication>) => {
    const { club_name, ...row } = updates;
    reportError('updateApplication', (await supabase.from('verification_applications').update(row).eq('id', id)).error);
  },
  /**
   * Runs the full review transition server-side (application + applicant profile
   * + audit log) via the review_application RPC, which enforces authorization by
   * role and can update another user's profile — something RLS forbids directly.
   */
  reviewApplication: async (appId: string, action: string, notes: string) => {
    reportError('reviewApplication', (await supabase.rpc('review_application', {
      p_app_id: appId,
      p_action: action,
      p_notes: notes,
    })).error);
  },
  insertAuditLog: async (l: AuditLog) => {
    reportError('insertAuditLog', (await supabase.from('audit_logs').insert(l)).error);
  },
  insertNotification: async (n: AppNotification) => {
    reportError('insertNotification', (await supabase.from('notifications').insert(n)).error);
  },
  markNotificationsRead: async (userId: string) => {
    reportError('markNotificationsRead', (await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId)).error);
  },
  markNotificationRead: async (id: string) => {
    reportError('markNotificationRead', (await supabase.from('notifications').update({ is_read: true }).eq('id', id)).error);
  },
  deleteNotification: async (id: string) => {
    reportError('deleteNotification', (await supabase.from('notifications').delete().eq('id', id)).error);
  },
  insertConversation: async (c: Conversation) => {
    const { participant_name, organizer_name, ...row } = c;
    reportError('insertConversation', (await supabase.from('conversations').insert(row)).error);
  },
  updateConversation: async (id: string, updates: Partial<Conversation>) => {
    const { participant_name, organizer_name, ...row } = updates;
    reportError('updateConversation', (await supabase.from('conversations').update(row).eq('id', id)).error);
  },
  insertMessage: async (msg: DirectMessage): Promise<boolean | 'blocked'> => {
    // Strip derived / transient fields; keep attachment_path + attachment_type.
    const { sender_name, receiver_name, send_status, ...row } = msg;
    const { error } = await supabase.from('direct_messages').insert(row);

    // A row-level rejection here is not a sync failure — it means the recipient
    // does not accept inquiries from this sender and our copy of their profile was
    // stale. Reporting it through the generic "changes didn't save" banner would be
    // both wrong and unhelpful, so it is signalled separately for the caller to
    // handle and reconcile.
    // Matched on message as well as code: the code is the documented signal, but a
    // single missed match here puts the raw policy error back in front of the user.
    const refused =
      error?.code === '42501'
      || /row-level security/i.test(error?.message ?? '');
    if (refused) return 'blocked';

    reportError('insertMessage', error);
    return !error;
  },
  /** Unsends the caller's own message ("delete for everyone") — leaves a tombstone. */
  unsendMessage: async (messageId: string) => {
    reportError('unsendMessage', (await supabase.rpc('unsend_message', { p_message_id: messageId })).error);
  },
  /** Hides a message from the caller's own view ("delete for me"); others keep it. */
  deleteMessageForMe: async (messageId: string, userId: string) => {
    reportError('deleteMessageForMe', (await supabase.from('message_deletions')
      .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' })).error);
  },
  /**
   * Upserts the caller's own inbox state for a conversation (pin/archive/delete).
   * RLS scopes this to the caller's own row, so it can never change the other
   * party's view of the conversation.
   */
  upsertConversationState: async (
    conversationId: string,
    userId: string,
    updates: { pinned?: boolean; archived?: boolean; muted?: boolean; deleted_at?: string | null },
  ) => {
    reportError('upsertConversationState', (await supabase.from('conversation_states').upsert({
      conversation_id: conversationId,
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,user_id' })).error);
  },
  /** Upserts the caller's read cursor for a conversation (one row per user). */
  upsertReadCursor: async (conversationId: string, userId: string, lastMessageId?: string) => {
    reportError('upsertReadCursor', (await supabase.from('message_reads').upsert({
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
      last_read_message_id: lastMessageId ?? null,
    }, { onConflict: 'conversation_id,user_id' })).error);
  },
  /** Toggles the caller's emoji reaction on a message. */
  toggleReaction: async (id: string, messageId: string, userId: string, emoji: string, removeOnly: boolean = false) => {
    if (removeOnly) {
      reportError('deleteReaction', (await supabase.from('message_reactions').delete().match({ message_id: messageId, user_id: userId })).error);
    } else {
      reportError('upsertReaction', (await supabase.from('message_reactions').upsert({
        id,
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString(),
      }, { onConflict: 'message_id,user_id' })).error);
    }
  },
  /** Authorized organizer banner fan-out to every JOINED participant of an event. */
  broadcastToEvent: async (eventId: string, title: string, message: string, priority: string): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.rpc('send_event_broadcast', {
      p_event_id: eventId, p_title: title, p_message: message, p_priority: priority,
    });
    reportError('broadcastToEvent', error);
    return { ok: !error, error: error?.message };
  },
  insertClub: async (c: Club) => {
    const { president_name, ...row } = c;
    reportError('insertClub', (await supabase.from('clubs').insert({ ...row, president_id: row.president_id || null })).error);
  },
  /**
   * Role change via the admin_set_role RPC. A direct profiles update is blocked
   * by RLS for any row other than the caller's own, so an App Admin changing
   * someone else's role never persisted. The RPC enforces the APP_ADMIN check
   * server-side and also syncs the profile position and the club's president.
   */
  updateProfileRole: async (
    userId: string,
    role: string,
    systemRole?: string,
    clubRole?: string,
    position?: string,
  ) => {
    try {
      const res = await supabase.rpc('admin_set_role', {
        p_user_id: userId,
        p_role: role,
        p_system_role: systemRole ?? null,
        p_club_role: clubRole ?? null,
        p_position: position ?? null,
      });
      if (res.error) {
        // Fallback to legacy single-argument RPC if new migration is not yet applied
        const fallbackRes = await supabase.rpc('admin_set_role', {
          p_user_id: userId,
          p_role: role,
        });
        if (fallbackRes.error && !fallbackRes.error.message?.includes('App Admins')) {
          reportError('updateProfileRole', fallbackRes.error);
        }
      }
    } catch {
      // Ignored for offline/mock sessions
    }
  },
  updateProfileVerification: async (userId: string, status: string) => {
    reportError('updateProfileVerification', (await supabase.from('profiles').update({ verification_status: status }).eq('id', userId)).error);
  },
  /**
   * App Admin removal of a user. Deletes the auth account (cascading to their
   * profile and data) via the admin_delete_user RPC, which enforces the
   * APP_ADMIN check server-side.
   */
  deleteUser: async (userId: string) => {
    reportError('deleteUser', (await supabase.rpc('admin_delete_user', { p_user_id: userId })).error);
  },
};
