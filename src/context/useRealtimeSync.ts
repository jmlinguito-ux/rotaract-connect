import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  AppUser, AppNotification, DirectMessage, ReadCursor, ConversationState, MessageReaction, Conversation,
} from '../types';
import { supabase } from '../services/supabase';
import { playAlertSound, getActiveChatConversation } from '../services/sound';
import { notifyChatMessage, notifyAppNotification } from '../services/notifications';

export interface RealtimeSyncArgs {
  isAuthenticated: boolean;
  authUser: { id: string } | null | undefined;
  /** Live view of `users`, for mapping realtime rows to display names. */
  users: AppUser[];
  applySnapshot: (cancelledRef?: { current: boolean }, signal?: AbortSignal) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<DirectMessage[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setReadCursors: React.Dispatch<React.SetStateAction<ReadCursor[]>>;
  setDeletedMessageIds: React.Dispatch<React.SetStateAction<string[]>>;
  setConversationStates: React.Dispatch<React.SetStateAction<ConversationState[]>>;
  setReactions: React.Dispatch<React.SetStateAction<MessageReaction[]>>;
}

export function useRealtimeSync({
  isAuthenticated,
  authUser,
  users,
  applySnapshot,
  setMessages,
  setNotifications,
  setConversations,
  setReadCursors,
  setDeletedMessageIds,
  setConversationStates,
  setReactions,
}: RealtimeSyncArgs) {

  // Keep a live reference to `users` for realtime row-mapping without making the
  // subscription effect depend on (and tear down/rebuild on) every user change.
  const usersRef = useRef<AppUser[]>(users);
  useEffect(() => { usersRef.current = users; }, [users]);

  // Track processed event IDs to prevent double side-effects (sounds/banners)
  // from race conditions or functional state updates.
  const processedIdsRef = useRef<Set<string>>(new Set());

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
        reply_to_message_id: d.reply_to_message_id ?? undefined,
        reply_to_sender_name: d.reply_to_sender_name ?? undefined,
        reply_to_text: d.reply_to_text ?? undefined,
        attachment_path: d.attachment_path ?? undefined,
        attachment_type: d.attachment_type ?? undefined,
        attachment_width: d.attachment_width ?? undefined,
        attachment_height: d.attachment_height ?? undefined,
        deleted_at: d.deleted_at ?? undefined,
        is_broadcast: d.is_broadcast ?? undefined,
      };
    };

    // Debounced full reload for snapshot reconciliation. A new event cancels the
    // pending timer AND aborts any in-flight reload, so a sustained burst of
    // table changes (or a slow network) can never stack overlapping full fetches.
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    let reloadController: AbortController | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadController?.abort();
      reloadController = new AbortController();
      const signal = reloadController.signal;
      reloadTimer = setTimeout(() => {
        applySnapshot(undefined, signal).catch(() => {});
      }, 400);
    };

    // Re-sync whenever the app returns from background
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        scheduleReload();
      }
    });

    // Surface channel health in the Metro console. A CHANNEL_ERROR usually means a
    // bound table is not in the `supabase_realtime` publication.
    const logStatus = (name: string) => (status: string, err?: Error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[realtime] ${name}: ${status}`, err?.message ?? '');
      } else if (status === 'SUBSCRIBED') {
        scheduleReload();
      }
    };

    const messagesChannel = supabase
      .channel('rt-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, payload => {
        const msg = mapMessage(payload.new);

        // Side effects (sound/notifications) must happen OUTSIDE of setState.
        // Track ID to ensure we only play sound once even if functional setState re-runs.
        if (!processedIdsRef.current.has(msg.id)) {
          processedIdsRef.current.add(msg.id);

          if (authUser?.id && msg.sender_id !== authUser.id) {
            const isTargetRecipient = !msg.receiver_id || msg.receiver_id === authUser.id;
            if (isTargetRecipient) {
              const isCurrentlyInChat = getActiveChatConversation() === msg.conversation_id;
              if (msg.text?.startsWith('🚨')) {
                playAlertSound('HIGH');
              } else if (msg.is_broadcast || msg.text?.startsWith('📢')) {
                playAlertSound('ALERT');
              } else {
                playAlertSound('CHIME');
              }

              // SUPPRESSED: notifyChatMessage(msg) is removed here to avoid
              // duplication with the server-sent push notification. The server
              // handles all background/killed notifications more reliably (e.g.
              // respecting mute states).
            }
          }
        }

        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
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

        // Sound and banner side effects must be outside of setNotifications.
        // Skip sound for INQUIRY_RECEIVED because it's already handled by the
        // rt-messages subscription above to avoid double-chime.
        if (!processedIdsRef.current.has(notif.id)) {
          processedIdsRef.current.add(notif.id);

          if (notif.kind !== 'INQUIRY_RECEIVED') {
            if (notif.kind === 'EMERGENCY_BROADCAST') {
              playAlertSound('EMERGENCY');
            } else if (notif.priority === 'ALERT') {
              playAlertSound('ALERT');
            } else if (notif.priority === 'HIGH') {
              playAlertSound('HIGH');
            } else {
              playAlertSound('CHIME');
            }
          }

          // SUPPRESSED: notifyAppNotification(notif) removed to avoid duplication
          // with server-sent pushes when backgrounded.
        }

        setNotifications(prev => {
          if (prev.some(x => x.id === notif.id)) return prev;
          return [notif, ...prev];
        });
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
          pinned: !!r.pinned, archived: !!r.archived, muted: !!r.muted, deleted_at: r.deleted_at ?? undefined,
        };
        setConversationStates(prev => {
          const others = prev.filter(s => !(s.conversation_id === state.conversation_id && s.user_id === state.user_id));
          return [...others, state];
        });
      })
      .subscribe(logStatus('conv-states'));

    // Realtime emoji reactions on chat messages.
    const reactionsChannel = supabase
      .channel('rt-message-reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, payload => {
        if (payload.eventType === 'DELETE') {
          const r = payload.old as any;
          if (r?.id || (r?.message_id && r?.user_id)) {
            setReactions(prev => prev.filter(rx => !(r.id ? rx.id === r.id : (rx.message_id === r.message_id && rx.user_id === r.user_id))));
          }
          return;
        }
        const r = payload.new as any;
        if (!r?.message_id || !r?.user_id) return;
        const reaction: MessageReaction = {
          id: r.id,
          message_id: r.message_id,
          user_id: r.user_id,
          emoji: r.emoji,
          created_at: r.created_at || new Date().toISOString(),
        };
        setReactions(prev => {
          const others = prev.filter(rx => !(rx.message_id === reaction.message_id && rx.user_id === reaction.user_id));
          return [...others, reaction];
        });
      })
      .subscribe(logStatus('reactions'));

    // Conversations move fast (last_message updates on every chat message) and
    // are cheap to merge, so they are NOT in the reload list below. Merging
    // directly keeps the Inbox reordering live without forcing every connected
    // client to re-pull all 18 tables on every message sent anywhere in the
    // district (that was the reload storm). New conversations still reload once
    // so the derived display names (participant/organizer/club) resolve.
    const conversationsChannel = supabase
      .channel('rt-conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        scheduleReload();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, payload => {
        const c = payload.new as any;
        if (!c?.id) return;
        setConversations(prev => prev.map(x => {
          if (x.id !== c.id) return x;
          return {
            ...x,
            last_message: c.last_message ?? x.last_message,
            last_message_at: c.last_message_at ?? x.last_message_at,
            event_title: c.event_title ?? x.event_title,
          };
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversations' }, payload => {
        const id = (payload.old as any)?.id;
        if (id) setConversations(prev => prev.filter(c => c.id !== id));
      })
      .subscribe(logStatus('conversations'));

    // Conversations move fast enough (last_message updates) to merge directly, so
    // the Inbox reorders live; heavier tables just schedule a reload. Each table
    // gets its OWN channel so one table missing from the realtime publication
    // cannot error out the others (a shared channel fails as a unit).
    const tableReloadChannels = ([
      'events', 'event_participants', 'event_invitations', 'event_impacts',
      'verification_applications',
      // Added with migration 0019. `clubs` and `event_participating_clubs` decide
      // who must approve an event, so without them an approver set could change
      // with no client noticing; `profiles` keeps OTHER members' roles and
      // verification badges current (a user's OWN profile is handled by its own
      // subscription in AuthContext).
      'clubs', 'zones', 'event_participating_clubs', 'audit_logs', 'profiles',
    ] as const).map(table =>
      supabase
        .channel(`rt-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload)
        .subscribe(logStatus(table)),
    );

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadController?.abort();
      appStateSub.remove();
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(readsChannel);
      supabase.removeChannel(deletionsChannel);
      supabase.removeChannel(convStateChannel);
      supabase.removeChannel(reactionsChannel);
      supabase.removeChannel(conversationsChannel);
      tableReloadChannels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [isAuthenticated, authUser, applySnapshot]);
}
