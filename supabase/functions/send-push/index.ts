// ============================================================================
// send-push — Expo push fan-out for new notification rows
// ============================================================================
// Wired as a Supabase Database Webhook on INSERT into public.notifications. It
// reuses the EXISTING notification row (no data is duplicated): it reads the
// recipient's registered Expo push tokens and delivers the same title/message as
// an OS push that works foreground, background, or with the app fully closed.
//
// Deploy:   supabase functions deploy send-push --no-verify-jwt
// Secret:   supabase secrets set PUSH_WEBHOOK_SECRET=<random>  (optional but recommended)
// Webhook:  Database → Webhooks → new webhook on `notifications` (INSERT) → HTTP POST
//           to this function's URL, adding header  x-webhook-secret: <same value>
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: NotificationRecord | null;
}

Deno.serve(async (req) => {
  // Optional shared-secret gate so only the configured webhook can invoke this.
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

  // Only act on new notification rows.
  if (payload.type !== 'INSERT' || payload.table !== 'notifications' || !payload.record) {
    return new Response(JSON.stringify({ skipped: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const n = payload.record;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // The recipient's registered devices. Token presence IS the push preference:
  // the client removes tokens when the user turns push off, so an opted-out user
  // simply has no tokens here.
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', n.user_id);

  if (error) {
    console.error('[send-push] token lookup failed', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ delivered: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  const highPriority = n.priority === 'HIGH' || n.priority === 'ALERT';

  // The tap target travels in `data`; the client maps it to a screen (see
  // services/push.ts → routeFromData). Mirrors the in-app banner's deep links.
  const data = {
    notificationId: n.id,
    kind: n.kind,
    event_id: n.event_id ?? undefined,
    application_id: n.application_id ?? undefined,
    conversation_id: n.conversation_id ?? undefined,
  };

  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    title: n.title,
    body: n.message,
    data,
    priority: highPriority ? 'high' : 'default',
    channelId: highPriority ? 'high' : 'default',
    // A stable key so multiple pushes for one conversation collapse on Android.
    ...(n.conversation_id ? { collapseId: n.conversation_id } : {}),
  }));

  // Expo accepts up to 100 messages per request.
  const chunks: typeof messages[] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  const staleTokens: string[] = [];
  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json();
      const tickets: any[] = json?.data ?? [];
      tickets.forEach((ticket, i) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          staleTokens.push(chunk[i].to);
        }
      });
    } catch (e) {
      console.error('[send-push] Expo push failed', e);
    }
  }

  // Prune tokens Expo says are dead so we stop paying to send to them.
  if (staleTokens.length) {
    await supabase.from('push_tokens').delete().in('token', staleTokens);
  }

  return new Response(
    JSON.stringify({ delivered: messages.length - staleTokens.length, pruned: staleTokens.length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
