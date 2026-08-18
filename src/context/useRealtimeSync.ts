import { useEffect, useRef } from 'react';
import {
  AppUser, AppNotification, DirectMessage, ReadCursor, ConversationState,
} from '../types';
import { supabase } from '../services/supabase';

/**
 * The app's realtime subscription layer, extracted from DataContext so the
 * provider stays readable and this concern can be reasoned about (and changed) on
 * its own.
 *
 * A single subscription layer keeps every device in sync without reopening the
 * app. High-frequency, latency-sensitive tables (messages, notifications) are
 * merged row-by-row so the UI updates instantly and cheaply. Lower-frequency
 * tables trigger a debounced snapshot reload — far simpler than re-deriving the
 * display fields (club/organizer names, participating-club lists) row by row, and
 * infrequent enough that the extra fetch is negligible. Rows are keyed by id, so
 * an incoming INSERT that matches an optimistic local row is de-duped.
 *
 * Behavior is unchanged from the original inline effect; the state setters and
 * the snapshot reloader are passed in so this hook owns no state of its own.
 */
export interface RealtimeSyncArgs {
  isAuthenticated: boolean;
  authUser: { id: string } | null | undefined;
  /** Live view of `users`, for mapping realtime rows to display names. */
  users: AppUser[];
  applySnapshot: (cancelledRef?: { current: boolean }, signal?: AbortSignal) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<DirectMessage[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setReadCursors: React.Dispatch<React.SetStateAction<ReadCursor[]>>;
  setDeletedMessageIds: React.Dispatch<React.SetStateAction<string[]>>;
  setConversationStates: React.Dispatch<React.SetStateAction<ConversationState[]>>;
}

export function useRealtimeSync({
  isAuthenticated,
  authUser,
  users,
  applySnapshot,
  setMessages,
  setNotifications,
  setReadCursors,
  setDeletedMessageIds,
  setConversationStates,
}: RealtimeSyncArgs) {

  // Keep a live reference to `users` for realtime row-mapping without making the
  // subscription effect depend on (and tear down/rebuild on) every user change.
  const usersRef = useRef<AppUser[]>(users);
  useEffect(() => { usersRef.current = users; }, [users]);

  // ------------------------------------------------------------------
  // REALTIME LAYER
  // ------------------------------------------------------------------
  // A single subscription layer keeps every device in sync without reopening the
  // app. High-frequency, latency-sensitive tables (messages, notifications) are
  // merged row-by-row so the UI updates instantly and cheaply. Lower-frequency
  // tables trigger a debounced snapshot reload — far simpler than re-deriving the
  // display fields (club/organizer names, participating-club lists) row by row,
  // and infrequent enough that the extra fetch is negligible. Rows are keyed by
  // id, so an incoming INSERT that matches an optimistic local row is de-duped.
  useEffect(() => {
    if (!isAuthenticated || !authUser) return;
    const uid = authUser.id;

    const mapMessage = (d: any): DirectMessage => {
      const nameById = usersRef.current;
      const senderName = nameById.find(u => u.id === d.sender_id)?.full_name || '';
      const receiverName = d.receiver_id
        ? (nameById.find(u => u.id === d.receiver_id)?.full_name || '')
        : 'Group Chat';
      return {
        id: d.id,
        conversation_id: d.conversation_id,
        event_id: d.event_id ?? undefined,
        sender_id: d.sender_id,
        sender_name: senderName,
        receiver_id: d.receiver_id ?? undefined,
        receiver_name: receiverName,
        text: d.text ?? '',
        created_at: d.created_at,
        attachment_path: d.attachment_path ?? undefined,
        attachment_type: d.attachment_type ?? undefined,
        deleted_at: d.deleted_at ?? undefined,
      };
    };

    // Debounced full reload for the lower-frequency tables.
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { applySnapshot().catch(() => {}); }, 400);
    };

    // Surface channel health in the Metro console. A CHANNEL_ERROR usually means a
    // bound table is not in the `supabase_realtime` publication.
    const logStatus = (name: string) => (status: string, err?: Error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[realtime] ${name}: ${status}`, err?.message ?? '');
      }
    };

    const messagesChannel = supabase
      .channel('rt-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, payload => {
        const msg = mapMessage(payload.new);
        setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, payload => {
        const msg = mapMessage(payload.new);
        setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, ...msg } : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, payload => {
        const id = (payload.old as any)?.id;
        if (id) setMessages(prev => prev.filter(m => m.id !== id));
      })
      .subscribe(logStatus('messages'));

    // Notifications are scoped to the signed-in user so no one receives another
    // user's private notifications over the wire.
    const notifChannel = supabase
      .channel(`rt-notifications-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, payload => {
        const n = payload.new as any;
        const notif: AppNotification = {
          id: n.id, user_id: n.user_id, kind: n.kind, title: n.title, message: n.message,
          event_id: n.event_id ?? undefined, application_id: n.application_id ?? undefined,
          conversation_id: n.conversation_id ?? undefined, is_read: n.is_read,
          created_at: n.created_at, priority: n.priority ?? undefined,
        };
        setNotifications(prev => (prev.some(x => x.id === notif.id) ? prev : [notif, ...prev]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, payload => {
        const n = payload.new as any;
        setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: n.is_read, priority: n.priority ?? x.priority } : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, payload => {
        const id = (payload.old as any)?.id;
        if (id) setNotifications(prev => prev.filter(x => x.id !== id));
      })
      .subscribe(logStatus('notifications'));

    // Read receipts get their OWN channel so an unpublished table on another
    // channel can never break "Seen" delivery. Merged directly so ticks flip the
    // moment the other party opens the conversation — no reload needed.
    const readsChannel = supabase
      .channel('rt-reads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads' }, payload => {
        const r = (payload.new ?? payload.old) as any;
        if (!r?.conversation_id || !r?.user_id) return;
        if (payload.eventType === 'DELETE') {
          setReadCursors(prev => prev.filter(c => !(c.conversation_id === r.conversation_id && c.user_id === r.user_id)));
          return;
        }
        const cursor: ReadCursor = {
          conversation_id: r.conversation_id, user_id: r.user_id,
          last_read_at: r.last_read_at, last_read_message_id: r.last_read_message_id ?? undefined,
        };
        setReadCursors(prev => {
          const others = prev.filter(c => !(c.conversation_id === cursor.conversation_id && c.user_id === cursor.user_id));
          return [...others, cursor];
        });
      })
      .subscribe(logStatus('reads'));

    // "Delete for me" hides sync across the user's own devices.
    const deletionsChannel = supabase
      .channel(`rt-deletions-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_deletions', filter: `user_id=eq.${uid}` }, payload => {
        const id = (payload.new as any)?.message_id;
        if (id) setDeletedMessageIds(prev => (prev.includes(id) ? prev : [...prev, id]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_deletions' }, payload => {
        const id = (payload.old as any)?.message_id;
        if (id) setDeletedMessageIds(prev => prev.filter(x => x !== id));
      })
      .subscribe(logStatus('deletions'));

    // Pin/archive/delete-for-me state syncs across the user's own devices. Scoped
    // to the signed-in user; merged directly so the inbox reorders/hides live.
    const convStateChannel = supabase
      .channel(`rt-conv-states-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_states', filter: `user_id=eq.${uid}` }, payload => {
        if (payload.eventType === 'DELETE') {
          const r = payload.old as any;
          if (r?.conversation_id) {
            setConversationStates(prev => prev.filter(s => !(s.conversation_id === r.conversation_id && s.user_id === r.user_id)));
          }
          return;
        }
        const r = payload.new as any;
        if (!r?.conversation_id) return;
        const state: ConversationState = {
          conversation_id: r.conversation_id, user_id: r.user_id,
          pinned: !!r.pinned, archived: !!r.archived, deleted_at: r.deleted_at ?? undefined,
        };
        setConversationStates(prev => {
          const others = prev.filter(s => !(s.conversation_id === state.conversation_id && s.user_id === state.user_id));
          return [...others, state];
        });
      })
      .subscribe(logStatus('conv-states'));

    // Conversations move fast enough (last_message updates) to merge directly, so
    // the Inbox reorders live; heavier tables just schedule a reload. Each table
    // gets its OWN channel so one table missing from the realtime publication
    // cannot error out the others (a shared channel fails as a unit).
    const tableReloadChannels = ([
      'events', 'event_participants', 'event_invitations', 'event_impacts',
      'verification_applications', 'conversations',
    ] as const).map(table =>
      supabase
        .channel(`rt-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload)
        .subscribe(logStatus(table)),
    );

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(readsChannel);
      supabase.removeChannel(deletionsChannel);
      supabase.removeChannel(convStateChannel);
      tableReloadChannels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [isAuthenticated, authUser, applySnapshot]);
}
