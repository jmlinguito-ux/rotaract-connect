import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

export interface TypingUser { id: string; name: string; }

/**
 * Ephemeral per-conversation realtime channel for presence (who's online) and
 * typing indicators. Uses Supabase Realtime Presence + Broadcast — nothing is
 * written to the database, so there is no per-keystroke write and no stale
 * "online forever" rows: presence is dropped automatically when the socket
 * closes (background, network loss, or leaving the screen).
 */
export function useChatPresence(conversationId: string | undefined, me: { id: string; name: string } | null) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Per-user timers that auto-clear a typing indicator if no refresh arrives.
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!conversationId || !me) return;

    const channel = supabase.channel(`chat:${conversationId}`, {
      config: { presence: { key: me.id } },
    });
    channelRef.current = channel;

    const clearTypingTimer = (id: string) => {
      if (typingTimers.current[id]) {
        clearTimeout(typingTimers.current[id]);
        delete typingTimers.current[id];
      }
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { user_id, name, typing } = (payload || {}) as { user_id: string; name: string; typing: boolean };
        if (!user_id || user_id === me.id) return; // never show my own indicator
        if (typing) {
          setTypingUsers(prev => (prev.some(u => u.id === user_id) ? prev : [...prev, { id: user_id, name }]));
          clearTypingTimer(user_id);
          // Fail-safe: clear if the "stopped typing" event is lost.
          typingTimers.current[user_id] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.id !== user_id));
            clearTypingTimer(user_id);
          }, 5000);
        } else {
          clearTypingTimer(user_id);
          setTypingUsers(prev => prev.filter(u => u.id !== user_id));
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user_id: me.id, name: me.name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
      setTypingUsers([]);
      setOnlineIds(new Set());
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, me?.id, me?.name]);

  const sendTyping = useCallback((typing: boolean) => {
    const channel = channelRef.current;
    if (!channel || !me) return;
    channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: me.id, name: me.name, typing } });
  }, [me?.id, me?.name]);

  return { onlineIds, typingUsers, sendTyping };
}
