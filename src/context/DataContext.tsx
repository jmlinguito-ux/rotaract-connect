import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  RotaractEvent, EventParticipant, EventInvitation, EventImpact,
  VerificationApplication, AuditLog, AppNotification,
  VerificationStatus, AttendanceStatus, AppUser, UserRole, Club,
  Conversation, DirectMessage, ReadCursor, NotificationPriority, ConversationState, MessageReaction,
  SystemRole, ClubRole,
} from '../types';
import { AppState } from 'react-native';
import { loadAll, db } from '../services/db';
import { canMessageUser } from '../utils/messaging';
import RotaractNotifications from '../../modules/rotaract-notifications';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { getCachedData, setCachedData, clearCachedData } from '../services/cache';
import { getEffectiveEventStatus } from '../utils/eventUtils';
import { approverClubIdsFor, pendingApproverClubIdsFor } from '../utils/eventApproval';
import { ROLE_LABELS, getSystemRole, getClubRole, isAppAdmin, isDistrictAdmin, isClubPresident } from '../utils/roles';
import { useRealtimeSync } from './useRealtimeSync';
import { enqueueOfflineCheckIn, drainOfflineCheckIns } from '../services/offlineQueue';
import { calculateParticipantHours } from '../utils/hoursCalculation';
import {
  setupNotificationChannels,
  scheduleEventReminder,
  cancelEventReminder,
  notifyAttendance,
  updateBadgeCount,
} from '../services/notifications';
import { stopAlertSound } from '../services/sound';

export type CheckInRecord = {
  checkedInAt: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  /** Who produced this record — the attendee's own verified GPS check-in, organizer manual override, or QR pass scan. */
  recordedBy?: 'SELF_GPS' | 'ORGANIZER' | 'ORGANIZER_QR';
};

export type CheckOutRecord = {
  checkedOutAt: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  recordedBy?: 'SELF_GPS' | 'AUTO_PERIMETER_LEAVE' | 'EVENT_CONCLUDED' | 'ORGANIZER' | 'ORGANIZER_QR';
};

/**
 * RFC-4122 v4 UUID, dependency-free (Hermes lacks crypto.randomUUID). Ids are
 * generated client-side so the optimistic local row and the persisted Supabase
 * row share the same primary key.
 */
function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const nextId = (_prefix?: string) => genId();
const now = () => new Date().toISOString();

export type EventApprovalResult = {
  /** True when this approval was the last one needed and the event went live. */
  published: boolean;
  /** Club Presidents still owing an approval after this one. */
  remainingApprovals: number;
};

interface DataContextValue {
  users: AppUser[];
  events: RotaractEvent[];
  participants: EventParticipant[];
  invitations: EventInvitation[];
  impacts: EventImpact[];
  applications: VerificationApplication[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  clubs: Club[];
  conversations: Conversation[];
  messages: DirectMessage[];
  readCursors: ReadCursor[];
  conversationStates: ConversationState[];

  /**
   * Re-pulls the full dataset from Supabase (pull-to-refresh). Concurrent callers
   * share a single in-flight fetch; the per-screen spinner state lives in
   * `useAppRefreshControl`, not here, so one screen's pull never lights up
   * another screen's RefreshControl (an iOS UIRefreshControl gets visually stuck
   * when its `refreshing` prop transitions from a value it inherited on mount).
   */
  refresh: () => Promise<void>;

  createEvent: (e: Omit<RotaractEvent, 'id'>) => RotaractEvent;
  updateEvent: (eventId: string, updates: Partial<Omit<RotaractEvent, 'id'>>) => void;
  updateEventStatus: (eventId: string, status: RotaractEvent['status']) => void;
  resetEventApprovals: (eventId: string, actor: AppUser) => void;
  cancelEvent: (eventId: string, reason?: string, actor?: AppUser) => void;
  approveEvent: (eventId: string, actor: AppUser) => EventApprovalResult;
  rejectEvent: (eventId: string, actor: AppUser, reason?: string) => void;

  joinEvent: (eventId: string, userId: string, opts?: { skipApproval?: boolean }) => void;
  leaveEvent: (eventId: string, userId: string, reason?: string) => void;
  requestDistrictEventReview: (eventId: string, requester: AppUser) => void;
  approveParticipant: (participantId: string, actor: AppUser) => void;
  declineParticipant: (participantId: string, actor: AppUser, reason?: string) => void;
  markAttendance: (participantId: string, status: AttendanceStatus) => void;
  checkIn: (participantId: string, at: CheckInRecord) => void;
  checkOut: (participantId: string, at: CheckOutRecord) => void;

  invite: (eventId: string, invitedUserId: string, byUser: AppUser) => void;
  respondInvitation: (invitationId: string, accept: boolean, user: AppUser, reason?: string) => void;
  sendMessageToOrganizer: (eventId: string, senderUser: AppUser, text: string) => void;
  getOrCreateConversation: (eventId: string | undefined, senderUser: AppUser, receiverId: string, receiverName: string, eventTitle?: string) => Conversation;
  getOrCreateEventGroupConversation: (eventId: string) => Conversation;
  canAccessEventGroupChat: (eventId: string, userId: string) => boolean;
  /** Returns false when the recipient does not accept inquiries from this sender. */
  sendDirectMessage: (conversationId: string, eventId: string | undefined, senderUser: AppUser, receiverId: string | undefined, receiverName: string, text: string, eventTitle?: string, attachmentPath?: string, mentionedUserIds?: string[], attachmentWidth?: number, attachmentHeight?: number, replyTo?: { id: string; senderName: string; text: string }) => boolean;
  /** Re-sends a message whose persistence failed, without duplicating it. */
  retryMessage: (messageId: string) => void;
  /** Hides a message from the current user's own view only (others still see it). */
  deleteMessageForMe: (messageId: string, userId: string) => void;
  /** Unsends the current user's own message for everyone (leaves a tombstone). */
  unsendMessage: (messageId: string) => void;
  /** Marks a conversation read up to its latest message (call when it is visible). */
  markConversationRead: (conversationId: string, userId: string, lastMessageId?: string) => void;
  /** Read cursors for a conversation — who has read up to when. */
  readCursorsFor: (conversationId: string) => ReadCursor[];
  /** The current user's own state for a conversation (pin/archive/delete), if any. */
  conversationStateFor: (conversationId: string, userId?: string) => ConversationState | undefined;
  /** Pins/unpins a conversation for the current user only. */
  setConversationPinned: (conversationId: string, userId: string, pinned: boolean) => void;
  /** Mutes/unmutes push notifications for a conversation for the current user only. */
  setConversationMuted: (conversationId: string, userId: string, muted: boolean) => void;
  /** Archives/unarchives a conversation for the current user only. */
  setConversationArchived: (conversationId: string, userId: string, archived: boolean) => void;
  /** Removes a conversation from the current user's inbox only (a newer message un-hides it). */
  deleteConversationForMe: (conversationId: string, userId: string) => void;
  /** Emoji reactions on chat messages. */
  reactions: MessageReaction[];
  /** Retrieves all reactions for a specific message. */
  reactionsFor: (messageId: string) => MessageReaction[];
  /** Toggles the user's reaction on a message (replaces different emoji, removes same emoji). */
  toggleMessageReaction: (messageId: string, userId: string, emoji: string) => void;
  /** Organizer-only: fan a banner notification out to every JOINED participant. */
  broadcastToEvent: (eventId: string, title: string, message: string, priority: NotificationPriority) => Promise<{ ok: boolean; error?: string }>;

  saveImpact: (impact: EventImpact) => void;

  reviewApplication: (
    appId: string,
    action: 'CLUB_VALIDATE' | 'REQUEST_INFO' | 'REJECT' | 'ADMIN_APPROVE' | 'DISTRICT_APPROVE',
    actor: AppUser,
    notes?: string,
  ) => void;

  resubmitApplication: (
    appId: string,
    updated: {
      member_id: string;
      club_id: string;
      club_name: string;
      position: string;
    }
  ) => void;

  pushNotification: (n: Omit<AppNotification, 'id' | 'created_at' | 'is_read'>) => void;
  markNotificationsRead: (userId: string) => void;
  markNotificationRead: (notificationId: string) => void;
  deleteNotification: (notificationId: string) => void;
  deleteAllNotifications: (userId: string) => void;
  /**
   * Promotes or updates user system and club leadership roles. `actor` is recorded
   * in the audit log and notification sent to the target.
   */
  updateUserRole: (
    targetUserId: string,
    newRoleOrUpdates: UserRole | { system_role?: SystemRole; club_role?: ClubRole; position?: string; legacyRole?: UserRole },
    actor?: AppUser,
  ) => void;
  /** App Admin only: permanently removes a user and their data. */
  removeUser: (targetUserId: string) => void;

  addApplication: (a: {
    user_id: string;
    full_name: string;
    email: string;
    club_id: string;
    club_name: string;
    member_id: string;
    position: string;
    proof_url?: string;
  }) => VerificationApplication;

  addClub: (c: {
    club_name: string;
    club_code?: string;
    zone_id: string;
    city: string;
    province: string;
    description?: string;
    president_name?: string;
    latitude?: number;
    longitude?: number;
    email?: string;
    meeting_address?: string;
  }) => Club;

  participantsFor: (eventId: string) => EventParticipant[];
  invitationFor: (eventId: string, userId: string) => EventInvitation | undefined;
  participationFor: (eventId: string, userId: string) => EventParticipant | undefined;
  impactFor: (eventId: string) => EventImpact | undefined;
  notificationsFor: (userId: string) => AppNotification[];
  messagesForConversation: (conversationId: string, forUserId?: string) => DirectMessage[];
  unreadCountForUser: (userId: string) => number;
  unreadInboxCountForUser: (userId: string) => number;
  auditFor: (appId: string) => AuditLog[];
  applicationsForRole: (role: UserRole, clubId?: string) => VerificationApplication[];
  userStats: (userId: string) => { joined: number; organized: number; hours: number; clubsCollab: number; service: number; fellowships: number };
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user: authUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<RotaractEvent[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [impacts, setImpacts] = useState<EventImpact[]>([]);
  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [readCursors, setReadCursors] = useState<ReadCursor[]>([]);
  const [deletedMessageIds, setDeletedMessageIds] = useState<string[]>([]);
  const [conversationStates, setConversationStates] = useState<ConversationState[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);

  // 1. Immediately hydrate local state from persistent cache on boot (0ms instant startup)
  useEffect(() => {
    getCachedData().then(cached => {
      if (cached) {
        setUsers(cached.users ?? []);
        setClubs(cached.clubs ?? []);
        setEvents(cached.events ?? []);
        setParticipants(cached.participants ?? []);
        setInvitations(cached.invitations ?? []);
        setImpacts(cached.impacts ?? []);
        setApplications(cached.applications ?? []);
        setAuditLogs(cached.auditLogs ?? []);
        setNotifications(cached.notifications ?? []);
        setConversations(cached.conversations ?? []);
        setMessages(cached.messages ?? []);
        setReadCursors(cached.readCursors ?? []);
        setDeletedMessageIds(cached.deletedMessageIds ?? []);
        setConversationStates(cached.conversationStates ?? []);
        setReactions(cached.reactions ?? []);
      }
    });
  }, []);

  // Keep current authUser in sync with users list
  useEffect(() => {
    if (!authUser) return;
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === authUser.id);
      if (idx >= 0 && prev[idx] !== authUser) {
        const next = [...prev];
        next[idx] = authUser;
        return next;
      }
      return prev;
    });
  }, [authUser]);

  // Clear data cache on sign out
  useEffect(() => {
    if (!isAuthenticated) {
      clearCachedData();
    }
  }, [isAuthenticated]);

  // Pulls the full dataset from Supabase and replaces local state with it.
  // Supabase is the source of truth, so this both hydrates on load and reconciles
  // any optimistic writes with what actually persisted. `cancelledRef` guards
  // against a resolve arriving after the provider unmounted; `signal` lets the
  // caller actually cancel the underlying HTTP requests (see `refresh` below).
  const applySnapshot = useCallback(async (cancelledRef?: { current: boolean }, signal?: AbortSignal) => {
    const d = await loadAll(signal);
    if (cancelledRef?.current) return;
    setUsers(d.users); setClubs(d.clubs); setEvents(d.events);
    setParticipants(d.participants); setInvitations(d.invitations);
    setImpacts(d.impacts); setApplications(d.applications);
    setAuditLogs(d.auditLogs); setNotifications(d.notifications);
    setConversations(d.conversations); setMessages(d.messages);
    setReadCursors(d.readCursors);
    setDeletedMessageIds(d.deletedMessageIds);
    setConversationStates(d.conversationStates);
    setReactions(d.reactions);

    // Save snapshot to local persistent cache for instant future launches
    setCachedData(d);
  }, []);

  // Concurrent pulls (e.g. two screens fire refresh at once, or a user pulls
  // again while one is already in flight) share a single underlying fetch so we
  // don't hammer Supabase or leave stale requests dangling. Both callers await
  // the same promise and clear their local spinner when it resolves.
  //
  // Two safeguards on that single fetch, since a JS-side "give up" alone leaves
  // the real request running in the background to resolve at some later time:
  //   1. An AbortController genuinely cancels the underlying HTTP requests after
  //      10s, not merely ignoring their eventual result.
  //   2. The in-flight promise is cleared in `finally`, so a subsequent pull
  //      always starts a fresh fetch.
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const p = (async () => {
      try {
        await applySnapshot(undefined, controller.signal);
      } catch (e) {
        console.warn('[refresh] failed or timed out — aborting in-flight requests', e);
      } finally {
        clearTimeout(timeoutId);
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = p;
    return p;
  }, [applySnapshot]);

  // Supabase is the source of truth. Reload whenever auth changes: clubs and
  // zones are world-readable so the registration club picker is populated even
  // before sign-in, while the RLS-protected tables come back empty until the
  // user is authenticated (and empty again after sign-out, clearing the cache).
  useEffect(() => {
    const cancelledRef = { current: false };
    applySnapshot(cancelledRef).catch(e => console.warn('Failed to load data from Supabase', e));
    return () => { cancelledRef.current = true; };
  }, [isAuthenticated, applySnapshot]);

  // Initialize Android notification channels on app startup
  useEffect(() => {
    setupNotificationChannels();
  }, []);

  // Update app icon badge with unread notification count
  useEffect(() => {
    if (!isAuthenticated || !authUser) return;
    const unread = notifications.filter(n => n.user_id === authUser.id && !n.is_read).length;
    updateBadgeCount(unread);
  }, [notifications, isAuthenticated, authUser]);

  // Sync OS-level native geofences for upcoming joined events (powers closed-app check-in).
  //
  // `participants`/`events` get new array references on EVERY realtime reload —
  // Drain offline check-in queue on mount, auth ready, and app resume
  useEffect(() => {
    if (!isAuthenticated) return;
    const tryDrain = () => {
      drainOfflineCheckIns();
    };
    tryDrain();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') tryDrain();
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // Realtime sync (messages, notifications, read cursors, deletions, conversation
  // state, plus debounced reloads for lower-frequency tables) lives in its own
  // module to keep this provider focused on state + actions.
  useRealtimeSync({
    isAuthenticated,
    authUser,
    users,
    applySnapshot,
    setMessages,
    setNotifications,
    setReadCursors,
    setDeletedMessageIds,
    setConversationStates,
    setReactions,
  });

  const addClub = useCallback((c: {
    club_name: string;
    club_code?: string;
    zone_id: string;
    city: string;
    province: string;
    description?: string;
    president_name?: string;
    latitude?: number;
    longitude?: number;
    email?: string;
    meeting_address?: string;
  }) => {
    const newClub: Club = {
      id: nextId('c'),
      club_code: c.club_code || `C-${Math.floor(100 + Math.random() * 900)}`,
      club_name: c.club_name,
      zone_id: c.zone_id,
      city: c.city,
      province: c.province,
      latitude: c.latitude ?? 14.6500,
      longitude: c.longitude ?? 120.9700,
      description: c.description || 'Rotaract club dedicated to community service and leadership development.',
      member_count: 1,
      // No president account exists for a brand-new club yet; the district links one
      // once a real user is verified, so this must not point at a fake user id.
      president_id: '',
      president_name: c.president_name || 'Pending Election',
      email: c.email?.trim() || undefined,
      meeting_address: c.meeting_address?.trim() || undefined,
    };
    setClubs(prev => [...prev, newClub]);
    db.insertClub(newClub);
    return newClub;
  }, []);

  const pushNotif = useCallback((n: Omit<AppNotification, 'id' | 'created_at' | 'is_read'>) => {
    if (!n.user_id) return; // never persist a notification with no recipient
    const notif: AppNotification = { ...n, id: nextId('n'), created_at: now(), is_read: false };
    setNotifications(prev => [notif, ...prev]);
    db.insertNotification(notif);
  }, []);

  const updateUserRole = useCallback((
    targetUserId: string,
    newRoleOrUpdates: UserRole | { system_role?: SystemRole; club_role?: ClubRole; position?: string; legacyRole?: UserRole },
    actor?: AppUser,
  ) => {
    const target = users.find(u => u.id === targetUserId);
    if (!target) return;

    let nextSysRole: SystemRole = target.system_role || getSystemRole(target);
    let nextClubRole: ClubRole = target.club_role || getClubRole(target);
    let nextPosition: string = target.position || 'Member';
    let nextLegacyRole: UserRole = target.role;

    if (typeof newRoleOrUpdates === 'string') {
      const newRole = newRoleOrUpdates;
      nextLegacyRole = newRole;
      if (newRole === 'APP_ADMIN') {
        nextSysRole = 'APP_ADMIN';
      } else if (newRole === 'DISTRICT_ADMIN') {
        nextSysRole = 'DISTRICT_ADMIN';
      } else if (newRole === 'CLUB_PRESIDENT') {
        nextClubRole = 'CLUB_PRESIDENT';
        nextPosition = 'President';
      } else if (newRole === 'MEMBER') {
        nextClubRole = 'MEMBER';
        if (nextPosition.toLowerCase() === 'president') {
          nextPosition = 'Member';
        }
      }
    } else {
      if (newRoleOrUpdates.system_role !== undefined) nextSysRole = newRoleOrUpdates.system_role;
      if (newRoleOrUpdates.club_role !== undefined) nextClubRole = newRoleOrUpdates.club_role;
      if (newRoleOrUpdates.position !== undefined) nextPosition = newRoleOrUpdates.position;

      // Determine the primary legacy role for backward compatibility
      if (nextSysRole === 'APP_ADMIN') {
        nextLegacyRole = 'APP_ADMIN';
      } else if (nextSysRole === 'DISTRICT_ADMIN') {
        nextLegacyRole = 'DISTRICT_ADMIN';
      } else if (nextClubRole === 'CLUB_PRESIDENT') {
        nextLegacyRole = 'CLUB_PRESIDENT';
      } else {
        nextLegacyRole = 'MEMBER';
      }
    }

    const wasPres = isClubPresident(target);
    const isNowPres = nextClubRole === 'CLUB_PRESIDENT' || nextPosition.toLowerCase() === 'president';
    const becomesPresident = !wasPres && isNowPres;
    const losesPresidency = wasPres && !isNowPres;

    const updatedUser: AppUser = {
      ...target,
      role: nextLegacyRole,
      system_role: nextSysRole,
      club_role: nextClubRole,
      position: nextPosition,
    };

    setUsers(prev => prev.map(u => (u.id === targetUserId ? updatedUser : u)));
    db.updateProfileRole(targetUserId, nextLegacyRole, nextSysRole, nextClubRole, nextPosition);

    if (target.club_id && (becomesPresident || losesPresidency)) {
      const presidentId = becomesPresident ? targetUserId : '';
      setClubs(prev => prev.map(c => (c.id === target.club_id
        ? {
            ...c,
            president_id: presidentId,
            president_name: becomesPresident ? target.full_name : 'Pending Election',
          }
        : c)));
    }

    const roleSummary = `${nextPosition} (${nextSysRole !== 'NONE' ? nextSysRole : nextClubRole})`;
    if (actor) {
      const log: AuditLog = {
        id: nextId('audit'),
        target_user_id: targetUserId,
        target_name: target.full_name,
        action: 'ROLE_CHANGED',
        category: 'ROLE',
        performed_by_name: actor.full_name,
        performed_by_role: actor.role,
        previous_status: target.position || target.role,
        new_status: roleSummary,
        notes: `Updated role to ${roleSummary}`,
        created_at: now(),
      };
      setAuditLogs(prev => [log, ...prev]);
      db.insertAuditLog(log);
    }

    pushNotif({
      user_id: targetUserId,
      kind: 'ROLE_ASSIGNED',
      title: 'Profile Role Updated',
      message: actor
        ? `${actor.full_name} updated your role to ${roleSummary}.`
        : `Your role was updated to ${roleSummary}.`,
    });
  }, [users, pushNotif]);

  const removeUser = useCallback((targetUserId: string) => {
    // Optimistically drop the user and anything of theirs the UI lists; the
    // server cascade (admin_delete_user → auth.users) removes the rest, and a
    // reload reconciles. Their organized events are removed by the cascade too.
    setUsers(prev => prev.filter(u => u.id !== targetUserId));
    setApplications(prev => prev.filter(a => a.user_id !== targetUserId));
    setParticipants(prev => prev.filter(p => p.user_id !== targetUserId));
    db.deleteUser(targetUserId);
  }, []);

  const addApplication = useCallback((a: {
    user_id: string;
    full_name: string;
    email: string;
    club_id: string;
    club_name: string;
    member_id: string;
    position: string;
    proof_url?: string;
  }) => {
    const isPresident = a.position.toLowerCase().includes('president');
    const application: VerificationApplication = {
      ...a,
      id: nextId('app'),
      status: isPresident ? 'AWAITING_DISTRICT_VALIDATION' : 'AWAITING_CLUB_VALIDATION',
      submitted_at: now(),
      notes: '',
    };
    setApplications(prev => [application, ...prev]);
    db.insertApplication(application);

    // Route the new application to whoever reviews it, so the uploaded proof is
    // waiting in their queue instead of sitting unseen on the applicant's record.
    if (isPresident) {
      const districtAdmins = users.filter(u => u.role === 'DISTRICT_ADMIN');
      for (const admin of districtAdmins) {
        pushNotif({
          user_id: admin.id,
          kind: 'MEMBERSHIP_REQUEST',
          title: 'New President Application',
          message: `${a.full_name} (${a.club_name}) applied as ${a.position}.`,
          application_id: application.id,
        });
      }
    } else {
      const presidentId = clubs.find(c => c.id === a.club_id)?.president_id;
      if (presidentId) {
        pushNotif({
          user_id: presidentId,
          kind: 'MEMBERSHIP_REQUEST',
          title: 'New Member Application',
          message: `${a.full_name} applied to join as ${a.position}.`,
          application_id: application.id,
        });
      }
    }

    return application;
  }, [clubs, users, pushNotif]);

  const createEvent = useCallback((e: Omit<RotaractEvent, 'id'>) => {
    const ev: RotaractEvent = { ...e, id: nextId('e') };
    setEvents(prev => [ev, ...prev]);

    // Child rows (participants, notifications, invitations) all FK to events.id, so
    // their DATABASE writes must not fire until the event row has committed —
    // otherwise they race ahead and violate the foreign key. Local optimistic state
    // is applied immediately below; the persistence is queued and flushed only once
    // db.insertEvent resolves successfully.
    const deferredWrites: Array<() => void> = [];
    const queueNotif = (n: Omit<AppNotification, 'id' | 'created_at' | 'is_read'>) => {
      if (!n.user_id) return;
      const notif: AppNotification = { ...n, id: nextId('n'), created_at: now(), is_read: false };
      setNotifications(prev => [notif, ...prev]);
      deferredWrites.push(() => db.insertNotification(notif));
    };

    // Automatically register organizer and co-organizers as JOINED participants
    const teamUserIds = [
      ...(ev.organizer_user_id ? [ev.organizer_user_id] : []),
      ...(ev.co_organizer_user_ids ?? []),
    ];
    if (teamUserIds.length > 0) {
      const teamParts: EventParticipant[] = teamUserIds.map(uid => ({
        id: nextId('p'),
        event_id: ev.id,
        user_id: uid,
        status: 'JOINED' as const,
        attendance_status: 'NOT_MARKED' as const,
        joined_at: now(),
      }));
      setParticipants(prev => [...teamParts, ...prev]);
      teamParts.forEach(p => deferredWrites.push(() => db.insertParticipant(p)));
    }
    if (ev.status === 'PENDING_APPROVAL') {
      const creatorName = users.find(u => u.id === ev.organizer_user_id)?.full_name ?? 'A member';
      if (ev.event_type === 'DISTRICT_EVENT') {
        const districtAdmin = users.find(u => u.role === 'DISTRICT_ADMIN');
        if (districtAdmin) {
          queueNotif({
            user_id: districtAdmin.id,
            kind: 'EVENT_APPROVAL_REQUEST',
            title: 'District Event Approval Needed',
            message: `${creatorName} submitted District Event "${ev.title}" for District Administrator approval.`,
            event_id: ev.id,
          });
        }
      } else {
        // Every involved club's President must sign off, not just the organizing club's.
        const approverClubIds = approverClubIdsFor(ev, users);
        const others = approverClubIds.length - 1;
        for (const clubId of approverClubIds) {
          const club = clubs.find(c => c.id === clubId);
          const presidentId = club?.president_id;
          if (!presidentId) continue;
          queueNotif({
            user_id: presidentId,
            kind: 'EVENT_APPROVAL_REQUEST',
            title: 'Event Approval Needed',
            message: others > 0
              ? `${creatorName} submitted "${ev.title}" for your approval as Club President. It also needs approval from ${others} other club ${others === 1 ? 'President' : 'Presidents'}.`
              : `${creatorName} submitted "${ev.title}" for your approval as Club President.`,
            event_id: ev.id,
          });
        }
      }
    }

    // A District Event that publishes immediately (created by a District Admin, so
    // it skips approval) still invites the whole district — mirroring the invite-all
    // that runs when a submitted district event is later approved.
    if (ev.status === 'RECRUITING' && ev.event_type === 'DISTRICT_EVENT') {
      const teamIds = new Set([ev.organizer_user_id, ...(ev.co_organizer_user_ids ?? [])]);
      const usersToInvite = users.filter(u => !teamIds.has(u.id));
      const newInvitations: EventInvitation[] = usersToInvite.map(u => ({
        id: nextId('i'),
        event_id: ev.id,
        invited_user_id: u.id,
        invited_by_user_id: ev.organizer_user_id,
        status: 'PENDING' as const,
        sent_at: now(),
      }));
      setInvitations(prev => [...prev, ...newInvitations]);
      newInvitations.forEach(i => deferredWrites.push(() => db.insertInvitation(i)));
      for (const u of usersToInvite) {
        queueNotif({
          user_id: u.id,
          kind: 'INVITATION_RECEIVED',
          title: 'District Event Invitation',
          message: `You've been invited to the district event "${ev.title}".`,
          event_id: ev.id,
        });
      }
    }

    // Persist the event first; flush the children only once it has committed.
    db.insertEvent(ev).then(ok => {
      if (ok) deferredWrites.forEach(w => w());
    });

    return ev;
  }, [clubs, users]);

  const updateEvent = useCallback((eventId: string, updates: Partial<Omit<RotaractEvent, 'id'>>) => {
    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, ...updates } : e)));
    db.updateEvent(eventId, updates);

    // When co-organizers change, ensure any newly added ones are in the participant list
    if (updates.co_organizer_user_ids) {
      const newCoOrgs = updates.co_organizer_user_ids;
      setParticipants(prev => {
        const existingUserIds = new Set(prev.filter(p => p.event_id === eventId).map(p => p.user_id));
        const toAdd = newCoOrgs.filter(uid => !existingUserIds.has(uid));
        if (toAdd.length === 0) return prev;
        const added: EventParticipant[] = toAdd.map(uid => ({
          id: nextId('p'),
          event_id: eventId,
          user_id: uid,
          status: 'JOINED' as const,
          attendance_status: 'NOT_MARKED' as const,
          joined_at: now(),
        }));
        added.forEach(p => db.insertParticipant(p));
        return [...added, ...prev];
      });
    }
  }, []);

  /**
   * Wipes the club approvals recorded so far and asks every involved President to
   * review again. Called when a pending event is edited in a material way, so a
   * President's sign-off never carries over to a materially different event.
   */
  const resetEventApprovals = useCallback((eventId: string, actor: AppUser) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, approved_by_club_ids: [] } : e)));
    db.updateEvent(eventId, { approved_by_club_ids: [] });

    for (const clubId of approverClubIdsFor(ev, users)) {
      const president = clubs.find(c => c.id === clubId)?.president_id;
      if (!president) continue;
      pushNotif({
        user_id: president,
        kind: 'EVENT_APPROVAL_REQUEST',
        title: 'Event Changed — Re-approval Needed',
        message: `${actor.full_name} changed the details of "${ev.title}". Previous approvals were cleared and it needs your approval again.`,
        event_id: ev.id,
      });
    }
  }, [events, clubs, users, pushNotif]);

  const updateEventStatus = useCallback((eventId: string, status: RotaractEvent['status']) => {
    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, status } : e)));
    db.updateEvent(eventId, { status });
  }, []);

  const cancelEvent = useCallback((eventId: string, reason?: string, actor?: AppUser) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    const actorName = actor ? actor.full_name : 'The organizer';
    const reasonText = reason && reason.trim() ? reason.trim() : `Cancelled by ${actorName}`;

    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, status: 'CANCELLED', cancellation_reason: reasonText } : e)));
    db.updateEvent(eventId, { status: 'CANCELLED', cancellation_reason: reasonText });

    if (actor) {
      const log: AuditLog = {
        id: nextId('audit'),
        event_id: eventId,
        target_name: ev.title,
        action: 'EVENT_CANCELLED',
        category: 'EVENT',
        performed_by_name: actor.full_name,
        performed_by_role: actor.role,
        previous_status: ev.status,
        new_status: 'CANCELLED',
        notes: reasonText,
        created_at: now(),
      };
      setAuditLogs(prev => [log, ...prev]);
      db.insertAuditLog(log);
    }

    const joinedParts = participants.filter(p => p.event_id === eventId && p.status === 'JOINED');
    const userIdsToNotify = new Set<string>([
      ...joinedParts.map(p => p.user_id),
      ev.organizer_user_id,
      ...(ev.co_organizer_user_ids ?? []),
    ]);
    if (actor) userIdsToNotify.delete(actor.id);

    const msg = reason && reason.trim() ? `Reason: ${reason.trim()}` : `${actorName} has cancelled "${ev.title}".`;

    userIdsToNotify.forEach(userId => {
      pushNotif({
        user_id: userId,
        kind: 'EVENT_UPDATE',
        title: `Event Cancelled: ${ev.title}`,
        message: msg,
        event_id: ev.id,
      });
    });
  }, [events, participants, pushNotif]);

  const approveEvent = useCallback((eventId: string, actor: AppUser): EventApprovalResult => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return { published: false, remainingApprovals: 0 };

    const isDistrictEvent = ev.event_type === 'DISTRICT_EVENT';

    // District events are a single District Administrator decision. Club events need
    // every involved club's President, so record this one and publish only when the
    // last outstanding approval lands.
    const approvedByClubIds = isDistrictEvent
      ? (ev.approved_by_club_ids ?? [])
      : [...new Set([...(ev.approved_by_club_ids ?? []), actor.club_id])];

    const remaining = isDistrictEvent
      ? 0
      : pendingApproverClubIdsFor({ ...ev, approved_by_club_ids: approvedByClubIds }, users).length;
    const published = remaining === 0;

    const newStatus = published ? 'RECRUITING' : ev.status;
    setEvents(prev => prev.map(e => (
      e.id === eventId
        ? { ...e, approved_by_club_ids: approvedByClubIds, status: newStatus }
        : e
    )));
    // Persisted through the approve_event RPC, not a direct update: RLS only lets
    // the organising club's President write to events, so this silently no-opped for
    // every other approver and reverted on the next refetch.
    db.approveEvent(eventId);

    const log: AuditLog = {
      id: nextId('audit'),
      event_id: eventId,
      target_name: ev.title,
      action: published ? 'EVENT_PUBLISHED' : 'EVENT_APPROVED',
      category: 'EVENT',
      performed_by_name: actor.full_name,
      performed_by_role: actor.role,
      previous_status: ev.status,
      new_status: newStatus,
      notes: published ? 'All required club approvals collected' : `Approved by ${actor.club_name ?? 'Club President'}`,
      created_at: now(),
    };
    setAuditLogs(prev => [log, ...prev]);
    db.insertAuditLog(log);

    pushNotif({
      user_id: ev.organizer_user_id,
      kind: published ? 'EVENT_APPROVED' : 'EVENT_UPDATE',
      title: published ? 'Event Published!' : 'Approval Recorded',
      message: published
        ? `"${ev.title}" was approved and is now active.`
        : `${actor.full_name} approved "${ev.title}". It needs ${remaining} more approval${remaining === 1 ? '' : 's'} to publish.`,
      event_id: ev.id,
    });

    // When a district event is approved, automatically invite all users.
    if (published && isDistrictEvent) {
      const teamIds = new Set([
        ev.organizer_user_id,
        ...(ev.co_organizer_user_ids ?? []),
      ]);
      const usersToInvite = users.filter(u => !teamIds.has(u.id));
      const existingPairs = new Set(
        invitations.filter(i => i.event_id === eventId && i.status === 'PENDING')
          .map(i => i.invited_user_id),
      );
      const newInvitations: EventInvitation[] = usersToInvite
        .filter(u => !existingPairs.has(u.id))
        .map(u => ({
          id: nextId('i'),
          event_id: eventId,
          invited_user_id: u.id,
          invited_by_user_id: actor.id,
          status: 'PENDING' as const,
          sent_at: now(),
        }));
      setInvitations(prev => [...prev, ...newInvitations]);
      newInvitations.forEach(i => db.insertInvitation(i));
      for (const u of usersToInvite) {
        pushNotif({
          user_id: u.id,
          kind: 'INVITATION_RECEIVED',
          title: 'District Event Invitation',
          message: `You've been invited to the district event "${ev.title}".`,
          event_id: eventId,
        });
      }
    }

    // Keep the remaining Presidents in the loop as approvals come in.
    if (!published) {
      const stillPending = pendingApproverClubIdsFor({ ...ev, approved_by_club_ids: approvedByClubIds }, users);
      for (const clubId of stillPending) {
        const president = clubs.find(c => c.id === clubId)?.president_id;
        if (!president) continue;
        pushNotif({
          user_id: president,
          kind: 'EVENT_APPROVAL_REQUEST',
          title: 'Event Approval Needed',
          message: `${actor.full_name} approved "${ev.title}". Your approval is still required before it can publish.`,
          event_id: ev.id,
        });
      }
    }

    return { published, remainingApprovals: remaining };
  }, [events, invitations, clubs, users, pushNotif]);

  const rejectEvent = useCallback((eventId: string, actor: AppUser, reason?: string) => {
    const reasonText = reason && reason.trim() ? reason.trim() : `Declined by ${actor.full_name}`;
    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, status: 'CANCELLED', cancellation_reason: reasonText } : e)));
    db.updateEvent(eventId, { status: 'CANCELLED', cancellation_reason: reasonText });
    const ev = events.find(e => e.id === eventId);
    if (ev) {
      pushNotif({
        user_id: ev.organizer_user_id,
        kind: 'EVENT_UPDATE',
        title: 'Event Declined',
        message: `Your event "${ev.title}" was declined by ${actor.full_name}.${reason ? ` Reason: ${reason}` : ''}`,
        event_id: ev.id,
      });

      // One decline settles it for everyone — stop the other Presidents from reviewing.
      for (const clubId of pendingApproverClubIdsFor(ev, users)) {
        if (clubId === actor.club_id) continue;
        const president = clubs.find(c => c.id === clubId)?.president_id;
        if (!president) continue;
        pushNotif({
          user_id: president,
          kind: 'EVENT_UPDATE',
          title: 'Event Declined',
          message: `"${ev.title}" was declined by ${actor.full_name}.${reason ? ` Reason: ${reason}` : ''}`,
          event_id: ev.id,
        });
      }
    }
  }, [events, clubs, users, pushNotif]);

  const joinEvent = useCallback((eventId: string, userId: string, opts?: { skipApproval?: boolean }) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const joiningUser = users.find(u => u.id === userId);
    const isSameClub = joiningUser && joiningUser.club_id === ev.organizing_club_id;
    // Accepting an invitation counts as the organizer's pre-approval, so it bypasses
    // the requires_approval join review.
    const needsApproval = !opts?.skipApproval && ev.requires_approval && !isSameClub;
    const status: EventParticipant['status'] = needsApproval ? 'PENDING' : 'JOINED';

    const existing = participants.find(p => p.event_id === eventId && p.user_id === userId);
    const row: EventParticipant = existing
      ? { ...existing, status }
      : {
          id: nextId('p'),
          event_id: eventId,
          user_id: userId,
          status,
          attendance_status: 'NOT_MARKED',
          joined_at: now(),
        };

    setParticipants(prev => {
      if (existing) return prev.map(p => (p.id === existing.id ? row : p));
      return [...prev, row];
    });
    db.insertParticipant(row);

    if (needsApproval) {
      pushNotif({
        user_id: ev.organizer_user_id,
        kind: 'JOIN_REQUEST',
        title: 'Join request',
        message: `${joiningUser?.full_name ?? 'A member'} requested to join ${ev.title}.`,
        event_id: ev.id,
      });
    } else {
      scheduleEventReminder(ev);
      pushNotif({
        user_id: userId,
        kind: 'JOIN_APPROVED',
        title: 'Joined Project Group Chat',
        message: `You joined "${ev.title}". Tap to view project group chat & team discussion!`,
        event_id: ev.id,
      });
    }
  }, [events, users, participants, pushNotif]);

  const leaveEvent = useCallback((eventId: string, userId: string, reason?: string) => {
    cancelEventReminder(eventId);
    setParticipants(prev => prev.filter(p => !(p.event_id === eventId && p.user_id === userId)));
    db.deleteParticipant(eventId, userId);

    if (reason?.trim()) {
      const ev = events.find(e => e.id === eventId);
      const userLeaving = users.find(u => u.id === userId);
      if (ev) {
        pushNotif({
          user_id: ev.organizer_user_id,
          kind: 'EVENT_UPDATE',
          title: 'Participant Left (Late Notice)',
          message: `${userLeaving?.full_name ?? 'A participant'} cancelled their attendance for "${ev.title}". Reason: ${reason.trim()}`,
          event_id: ev.id,
        });
      }
    }
  }, [events, users, pushNotif]);

  const requestDistrictEventReview = useCallback((eventId: string, requester: AppUser) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const pendingClubIds = pendingApproverClubIdsFor(ev, users);
    const pendingClubNames = clubs
      .filter(c => pendingClubIds.includes(c.id))
      .map(c => c.club_name)
      .join(', ');

    // Record the escalation on the event itself: this is what unlocks approval for
    // a District Admin (see canApproveEvent) and what keeps the requested state
    // visible after a remount, on every device.
    const stamp = { district_review_requested_at: now(), district_review_requested_by: requester.id };
    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, ...stamp } : e)));
    db.updateEvent(eventId, stamp);

    const districtAdmins = users.filter(u => u.role === 'DISTRICT_ADMIN' || u.role === 'APP_ADMIN');
    for (const admin of districtAdmins) {
      pushNotif({
        user_id: admin.id,
        kind: 'EVENT_APPROVAL_REQUEST',
        title: 'Approval Stalled (Review Requested)',
        message: `${requester.full_name} requested District Admin review for "${ev.title}". Pending approval from: ${pendingClubNames || 'the approving clubs'}.`,
        event_id: ev.id,
        priority: 'HIGH',
      });
    }
  }, [events, users, clubs, pushNotif]);

  const approveParticipant = useCallback((participantId: string, actor: AppUser) => {
    setParticipants(prev => prev.map(p => (p.id === participantId ? { ...p, status: 'JOINED' } : p)));
    db.updateParticipant(participantId, { status: 'JOINED' });
    const p = participants.find(x => x.id === participantId);
    if (p) {
      const ev = events.find(e => e.id === p.event_id);
      if (ev) scheduleEventReminder(ev);
      pushNotif({
        user_id: p.user_id,
        kind: 'JOIN_APPROVED',
        title: 'Join request approved',
        message: `You are now a participant of ${ev?.title ?? 'the event'}.`,
        event_id: p.event_id,
      });
    }
  }, [participants, events, pushNotif]);

  const declineParticipant = useCallback((participantId: string, actor: AppUser, reason?: string) => {
    const p = participants.find(x => x.id === participantId);
    setParticipants(prev => prev.filter(x => x.id !== participantId));
    db.deleteParticipantById(participantId);
    if (p) {
      const ev = events.find(e => e.id === p.event_id);
      pushNotif({
        user_id: p.user_id,
        kind: 'EVENT_UPDATE',
        title: 'Join Request Declined',
        message: `Your request to join "${ev?.title ?? 'the event'}" was declined by ${actor.full_name}.${reason ? ` Reason: ${reason}` : ''}`,
        event_id: p.event_id,
      });
    }
  }, [participants, events, pushNotif]);

  const markAttendance = useCallback((participantId: string, status: AttendanceStatus) => {
    const clears = status !== 'ATTENDED';
    const updates: Partial<EventParticipant> = {
      attendance_status: status,
      ...(clears
        ? {
            checked_in_at: undefined,
            check_in_latitude: undefined,
            check_in_longitude: undefined,
            check_in_distance_m: undefined,
          }
        : {}),
    };
    setParticipants(prev => prev.map(p => (p.id === participantId ? { ...p, ...updates } : p)));
    db.updateParticipant(participantId, clears
      ? { attendance_status: status, checked_in_at: null as any, check_in_latitude: null as any, check_in_longitude: null as any, check_in_distance_m: null as any }
      : { attendance_status: status });
  }, []);

  /**
   * On-site check-in. The caller is responsible for enforcing the time window
   * and the distance rule; this records the verified result, including where
   * the participant was, so an organizer can audit it later.
   */
  const checkIn = useCallback((participantId: string, at: CheckInRecord) => {
    // Idempotency guard: callers (esp. auto check-in, which re-evaluates on every
    // realtime data refresh) must be able to call this speculatively without a
    // second call re-writing the row or firing a second "Checked In" notification.
    const already = participants.find(p => p.id === participantId);
    if (already?.checked_in_at || already?.attendance_status === 'ATTENDED') return;

    const updates: Partial<EventParticipant> = {
      attendance_status: 'ATTENDED',
      checked_in_at: at.checkedInAt,
      check_in_latitude: at.latitude,
      check_in_longitude: at.longitude,
      check_in_distance_m: at.distanceMeters,
      check_in_method: at.recordedBy ?? 'SELF_GPS',
    };
    setParticipants(prev => prev.map(p => (p.id === participantId ? { ...p, ...updates } : p)));
    db.updateParticipant(participantId, updates).then(ok => {
      if (!ok) {
        enqueueOfflineCheckIn(participantId, updates);
      }
    });

    const part = participants.find(x => x.id === participantId);
    const ev = events.find(e => e.id === part?.event_id);
    const isSelf = !!(part && authUser && part.user_id === authUser.id);

    if (ev && isSelf) {
      notifyAttendance('CHECK_IN', ev.title, at.distanceMeters);
    } else if (ev && part && !isSelf) {
      pushNotif({
        user_id: part.user_id,
        kind: 'EVENT_REMINDER',
        title: '✅ Checked In Successfully',
        message: `You are now checked in to "${ev.title}". Have a great service!`,
        event_id: ev.id,
        priority: 'HIGH',
      });
    }

    if (at.recordedBy === 'ORGANIZER' || at.recordedBy === 'ORGANIZER_QR') {
      const targetUser = users.find(u => u.id === part?.user_id);
      const log: AuditLog = {
        id: nextId('audit'),
        event_id: part?.event_id,
        target_user_id: part?.user_id,
        target_name: targetUser?.full_name ?? 'Participant',
        action: 'ATTENDANCE_OVERRIDE',
        category: 'ATTENDANCE',
        performed_by_name: authUser?.full_name ?? 'Organizer',
        performed_by_role: (authUser?.role as any) ?? 'CLUB_PRESIDENT',
        previous_status: 'JOINED',
        new_status: 'ATTENDED',
        notes: `On-site attendance verification for "${ev?.title ?? 'Event'}"`,
        created_at: now(),
      };
      setAuditLogs(prev => [log, ...prev]);
      db.insertAuditLog(log);
    }
  }, [participants, events, users, authUser, pushNotif]);

  const checkOut = useCallback((participantId: string, at: CheckOutRecord) => {
    // Same idempotency guard as checkIn — see its comment.
    const already = participants.find(p => p.id === participantId);
    if (already?.checked_out_at) return;

    const updates: Partial<EventParticipant> = {
      checked_out_at: at.checkedOutAt,
      check_out_latitude: at.latitude,
      check_out_longitude: at.longitude,
      check_out_distance_m: at.distanceMeters,
      check_out_method: at.recordedBy ?? 'SELF_GPS',
    };
    setParticipants(prev => prev.map(p => (p.id === participantId ? { ...p, ...updates } : p)));
    db.updateParticipant(participantId, updates).then(ok => {
      if (!ok) {
        enqueueOfflineCheckIn(participantId, updates);
      }
    });

    const part = participants.find(x => x.id === participantId);
    const ev = events.find(e => e.id === part?.event_id);
    const isSelf = !!(part && authUser && part.user_id === authUser.id);

    if (ev && isSelf) {
      notifyAttendance('CHECK_OUT', ev.title, at.distanceMeters);
    } else if (ev && part && !isSelf) {
      pushNotif({
        user_id: part.user_id,
        kind: 'EVENT_REMINDER',
        title: '👋 Checked Out',
        message: `Departure recorded for "${ev.title}". Your service hours have been logged!`,
        event_id: ev.id,
        priority: 'NORMAL',
      });
    }
  }, [participants, events, authUser, pushNotif]);

  const invite = useCallback((eventId: string, invitedUserId: string, byUser: AppUser) => {
    const dup = invitations.find(i => i.event_id === eventId && i.invited_user_id === invitedUserId && i.status === 'PENDING');
    if (!dup) {
      const inv: EventInvitation = {
        id: nextId('i'),
        event_id: eventId,
        invited_user_id: invitedUserId,
        invited_by_user_id: byUser.id,
        status: 'PENDING',
        sent_at: now(),
      };
      setInvitations(prev => [...prev, inv]);
      db.insertInvitation(inv);
    }
    const ev = events.find(e => e.id === eventId);
    pushNotif({
      user_id: invitedUserId,
      kind: 'INVITATION_RECEIVED',
      title: 'You were invited',
      message: `${byUser.full_name} invited you to ${ev?.title ?? 'an event'}.`,
      event_id: eventId,
    });
  }, [events, invitations, pushNotif]);

  const respondInvitation = useCallback((invitationId: string, accept: boolean, user: AppUser, reason?: string) => {
    const trimmedReason = reason?.trim() || undefined;
    setInvitations(prev => prev.map(i => (
      i.id === invitationId
        ? { ...i, status: accept ? 'ACCEPTED' : 'DECLINED', decline_reason: accept ? undefined : trimmedReason }
        : i
    )));
    db.updateInvitation(invitationId, { status: accept ? 'ACCEPTED' : 'DECLINED', decline_reason: accept ? undefined : trimmedReason });
    const inv = invitations.find(i => i.id === invitationId);
    if (!inv) return;
    if (accept) joinEvent(inv.event_id, user.id, { skipApproval: true });
    pushNotif({
      user_id: inv.invited_by_user_id,
      kind: 'INVITATION_RESPONSE',
      title: accept ? 'Invitation accepted' : 'Invitation declined',
      message: `${user.full_name} ${accept ? 'accepted' : 'declined'} your invitation.${!accept && trimmedReason ? ` Reason: ${trimmedReason}` : ''}`,
      event_id: inv.event_id,
    });
  }, [invitations, joinEvent, pushNotif]);

  const getOrCreateConversation = useCallback((eventId: string | undefined, senderUser: AppUser, receiverId: string, receiverName: string, eventTitle?: string) => {
    let existing = conversations.find(c =>
      (c.participant_user_id === senderUser.id && c.organizer_user_id === receiverId) ||
      (c.participant_user_id === receiverId && c.organizer_user_id === senderUser.id)
    );
    if (!existing) {
      const conv: Conversation = {
        id: nextId('conv'),
        event_id: eventId,
        event_title: eventTitle,
        participant_user_id: senderUser.id,
        participant_name: senderUser.full_name,
        organizer_user_id: receiverId,
        organizer_name: receiverName,
        last_message: '',
        last_message_at: now(),
      };
      setConversations(prev => [conv, ...prev]);
      db.insertConversation(conv);
      return conv;
    }
    return existing;
  }, [conversations]);

  const canAccessEventGroupChat = useCallback((eventId: string, userId: string): boolean => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return false;
    if (ev.organizer_user_id === userId) return true;
    const u = users.find(x => x.id === userId);
    if (u && u.club_id === ev.organizing_club_id && u.role === 'CLUB_PRESIDENT') return true;

    // Participant MUST have status JOINED (excluding unapproved/pending)
    const p = participants.find(part => part.event_id === eventId && part.user_id === userId);
    return p ? p.status === 'JOINED' : false;
  }, [events, users, participants]);

  const getOrCreateEventGroupConversation = useCallback((eventId: string): Conversation => {
    let existing = conversations.find(c => c.event_id === eventId && c.is_group);
    if (existing) return existing;

    const ev = events.find(e => e.id === eventId);
    const conv: Conversation = {
      id: nextId('conv'),
      event_id: eventId,
      event_title: ev?.title ?? 'Event Group Chat',
      is_group: true,
      // Group chats have no single participant — membership is derived from the
      // event's JOINED participants (NULL in the database).
      participant_user_id: undefined,
      participant_name: `${ev?.title ?? 'Event'} Group Chat`,
      organizer_user_id: ev?.organizer_user_id ?? '',
      organizer_name: ev?.organizing_club_name ?? 'Club',
      last_message: 'Welcome to the event group chat!',
      last_message_at: now(),
    };
    setConversations(prev => [conv, ...prev]);
    if (conv.organizer_user_id) db.insertConversation(conv);
    return conv;
  }, [conversations, events]);

  // Persists an optimistic message, tracking its send lifecycle so the composer
  // can show Sending → Sent, or Failed with a retry. Group messages fan out inside
  // the conversation (no single receiver to notify).
  const persistMessage = useCallback((msg: DirectMessage, notify: boolean) => {
    setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, { ...msg, send_status: 'sending' }]));
    const preview = msg.text?.trim() ? msg.text : (msg.attachment_path ? '📷 Photo' : '');
    setConversations(prev => prev.map(c => c.id === msg.conversation_id ? { ...c, last_message: preview, last_message_at: msg.created_at } : c));
    db.insertMessage(msg).then(ok => {
      // Refused because the recipient does not accept inquiries from us, and our
      // copy of their profile was stale (they changed the setting after our last
      // sync). Drop the optimistic message rather than leaving a "failed" row the
      // user can retry forever, and refetch so the composer disables itself and
      // explains why. Self-healing: the race closes on its own.
      if (ok === 'blocked') {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        refresh().catch(() => {});
        return;
      }
      setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, send_status: ok ? 'sent' : 'failed' } : m)));
      if (ok) {
        db.updateConversation(msg.conversation_id, { last_message: preview, last_message_at: msg.created_at });
        if (notify && msg.receiver_id) {
          pushNotif({
            user_id: msg.receiver_id,
            kind: 'INQUIRY_RECEIVED',
            // Title is just the sender's name; the Inbox/Notifications rows still
            // derive the sender via `.replace('Inquiry from ', '')`, a no-op here.
            title: msg.sender_name,
            message: preview,
            event_id: msg.event_id,
            conversation_id: msg.conversation_id,
          });
        }
      }
    });
  }, [pushNotif, refresh]);

  /**
   * Persists a 1-on-1 or group message.
   *
   * The recipient's "allow direct inquiries" setting is enforced HERE rather than
   * only in the screens. Every previous attempt gated a call site, and each new way
   * of sending — an existing thread reopened from the Inbox, the event screen's
   * message-the-organiser box — was another chance to forget, surfacing as a
   * row-level rejection the user could not interpret. This is the single choke
   * point every send passes through, so no screen can bypass it.
   *
   * Returns false when refused, so a caller can react; the database remains the
   * real authority either way.
   */
  const sendDirectMessage = useCallback((conversationId: string, eventId: string | undefined, senderUser: AppUser, receiverId: string | undefined, receiverName: string, text: string, eventTitle?: string, attachmentPath?: string, mentionedUserIds?: string[], attachmentWidth?: number, attachmentHeight?: number, replyTo?: { id: string; senderName: string; text: string }): boolean => {
    // Group messages carry no single recipient; event membership governs those.
    if (receiverId) {
      const recipient = users.find(u => u.id === receiverId);
      if (!canMessageUser(recipient, senderUser)) {
        console.warn('[data] refused message: recipient does not accept inquiries from this club');
        return false;
      }
    }
    const msg: DirectMessage = {
      id: nextId('msg'),
      conversation_id: conversationId,
      event_id: eventId,
      sender_id: senderUser.id,
      sender_name: senderUser.full_name,
      receiver_id: receiverId,
      receiver_name: receiverName,
      text,
      created_at: now(),
      reply_to_message_id: replyTo?.id,
      reply_to_sender_name: replyTo?.senderName,
      reply_to_text: replyTo?.text,
      attachment_path: attachmentPath,
      attachment_type: attachmentPath ? 'image' : undefined,
      attachment_width: attachmentWidth,
      attachment_height: attachmentHeight,
      mentioned_user_ids: mentionedUserIds?.length ? mentionedUserIds : undefined,
    };
    persistMessage(msg, true);
    return true;
  }, [persistMessage, users]);

  // Re-sends a message that failed to persist, without creating a duplicate row.
  const retryMessage = useCallback((messageId: string) => {
    setMessages(prev => {
      const m = prev.find(x => x.id === messageId);
      if (!m) return prev;
      // Retry goes straight to persistMessage, so it needs the same check. A message
      // that failed BEFORE the recipient closed their inbox would otherwise be
      // retried forever against a rule that now refuses it.
      if (m.receiver_id) {
        const sender = users.find(u => u.id === m.sender_id);
        const recipient = users.find(u => u.id === m.receiver_id);
        if (!canMessageUser(recipient, sender)) {
          console.warn('[data] refused retry: recipient does not accept inquiries from this club');
          return prev;
        }
      }
      persistMessage({ ...m, send_status: 'sending' }, true);
      return prev;
    });
  }, [persistMessage, users]);

  // Marks the conversation read up to its latest message. Called when the chat is
  // actually visible — one upsert, not a write per message or per render.
  const markConversationRead = useCallback((conversationId: string, userId: string, lastMessageId?: string) => {
    let targetMsgId = lastMessageId;
    if (!targetMsgId) {
      const convMsgs = messages
        .filter(m => m.conversation_id === conversationId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      targetMsgId = convMsgs.length ? convMsgs[convMsgs.length - 1]?.id : undefined;
    }
    const iso = now();
    setReadCursors(prev => {
      const others = prev.filter(c => !(c.conversation_id === conversationId && c.user_id === userId));
      return [...others, { conversation_id: conversationId, user_id: userId, last_read_at: iso, last_read_message_id: targetMsgId }];
    });
    db.upsertReadCursor(conversationId, userId, targetMsgId);
    // Reading the thread retires its Android conversation notification and the
    // message history the native builder accumulates for it, so reopening the app
    // never leaves a stale banner behind.
    RotaractNotifications?.clearConversation(conversationId);
    stopAlertSound();
  }, [messages]);

  const broadcastToEvent = useCallback(async (eventId: string, title: string, message: string, priority: NotificationPriority) => {
    return db.broadcastToEvent(eventId, title, message, priority);
  }, []);

  const messagesForConversation = useCallback((conversationId: string, forUserId?: string) => {
    const hidden = new Set(deletedMessageIds);
    const targetUserId = forUserId ?? authUser?.id;
    let cutoffTime: number | null = null;
    if (targetUserId) {
      const state = conversationStates.find(s => s.conversation_id === conversationId && s.user_id === targetUserId);
      if (state?.deleted_at) {
        cutoffTime = new Date(state.deleted_at).getTime();
      }
    }

    return messages
      .filter(m => {
        if (m.conversation_id !== conversationId) return false;
        if (hidden.has(m.id)) return false;
        if (cutoffTime !== null) {
          const msgTime = new Date(m.created_at).getTime();
          if (msgTime <= cutoffTime) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, deletedMessageIds, conversationStates, authUser?.id]);

  // "Delete for me": hides a message from this user's own view only; other
  // participants still see it (messages are a single shared row, never removed).
  const deleteMessageForMe = useCallback((messageId: string, userId: string) => {
    setDeletedMessageIds(prev => (prev.includes(messageId) ? prev : [...prev, messageId]));
    db.deleteMessageForMe(messageId, userId);
  }, []);

  // "Delete for everyone" (unsend): clears the shared message and stamps it deleted,
  // so every participant sees a "message was deleted" tombstone. Sender only
  // (enforced by the unsend_message RPC).
  const unsendMessage = useCallback((messageId: string) => {
    const iso = now();
    setMessages(prev => prev.map(m => (m.id === messageId
      ? { ...m, deleted_at: iso, text: '', attachment_path: undefined, attachment_type: undefined }
      : m)));
    db.unsendMessage(messageId);
  }, []);

  const readCursorsFor = useCallback((conversationId: string) => {
    return readCursors.filter(c => c.conversation_id === conversationId);
  }, [readCursors]);

  // ------------------------------------------------------------------
  // Per-user conversation inbox state (pin / archive / delete-for-me).
  // Optimistic local merge + upsert of the caller's OWN row only. RLS makes it
  // impossible to touch the other party's view, so these are always one-sided.
  // ------------------------------------------------------------------
  const conversationStateFor = useCallback((conversationId: string, userId?: string) => {
    return conversationStates.find(s => s.conversation_id === conversationId && (!userId || s.user_id === userId));
  }, [conversationStates]);

  const mergeConversationState = useCallback((conversationId: string, userId: string, updates: Partial<ConversationState>) => {
    setConversationStates(prev => {
      const existing = prev.find(s => s.conversation_id === conversationId && s.user_id === userId);
      const merged: ConversationState = {
        conversation_id: conversationId,
        user_id: userId,
        pinned: existing?.pinned ?? false,
        archived: existing?.archived ?? false,
        muted: existing?.muted ?? false,
        deleted_at: existing?.deleted_at,
        ...updates,
      };
      const others = prev.filter(s => !(s.conversation_id === conversationId && s.user_id === userId));
      return [...others, merged];
    });
  }, []);

  const setConversationPinned = useCallback((conversationId: string, userId: string, pinned: boolean) => {
    mergeConversationState(conversationId, userId, { pinned });
    db.upsertConversationState(conversationId, userId, { pinned });
  }, [mergeConversationState]);

  const setConversationMuted = useCallback((conversationId: string, userId: string, muted: boolean) => {
    mergeConversationState(conversationId, userId, { muted });
    db.upsertConversationState(conversationId, userId, { muted });
    RotaractNotifications?.setConversationMuted?.(conversationId, muted);
  }, [mergeConversationState]);

  const setConversationArchived = useCallback((conversationId: string, userId: string, archived: boolean) => {
    // Archiving a pinned thread also clears its pin — a hidden thread shouldn't
    // also claim a pinned slot at the top when later unarchived.
    const updates = archived ? { archived: true, pinned: false } : { archived: false };
    mergeConversationState(conversationId, userId, updates);
    db.upsertConversationState(conversationId, userId, updates);
  }, [mergeConversationState]);

  const deleteConversationForMe = useCallback((conversationId: string, userId: string) => {
    const iso = now();
    // Deleting also drops pin/archive so a re-surfaced thread starts clean.
    const updates = { deleted_at: iso, pinned: false, archived: false };
    mergeConversationState(conversationId, userId, updates);
    db.upsertConversationState(conversationId, userId, updates);
  }, [mergeConversationState]);

  const reactionsFor = useCallback((messageId: string) => {
    return reactions.filter(r => r.message_id === messageId);
  }, [reactions]);

  const toggleMessageReaction = useCallback((messageId: string, userId: string, emoji: string) => {
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === userId);
    const isRemoving = existing && existing.emoji === emoji;
    const reactionId = existing?.id || nextId('react');

    setReactions(prev => {
      if (isRemoving) {
        return prev.filter(r => !(r.message_id === messageId && r.user_id === userId));
      }
      const updated: MessageReaction = {
        id: reactionId,
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: now(),
      };
      const others = prev.filter(r => !(r.message_id === messageId && r.user_id === userId));
      return [...others, updated];
    });

    db.toggleReaction(reactionId, messageId, userId, emoji, isRemoving);
  }, [reactions]);

  const sendMessageToOrganizer = useCallback((eventId: string, senderUser: AppUser, text: string) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const conv = getOrCreateConversation(eventId, senderUser, ev.organizer_user_id, ev.organizing_club_name, ev.title);
    sendDirectMessage(conv.id, eventId, senderUser, ev.organizer_user_id, ev.organizing_club_name, text, ev.title);
  }, [events, getOrCreateConversation, sendDirectMessage]);

  const saveImpact = useCallback((impact: EventImpact) => {
    setImpacts(prev => {
      const others = prev.filter(i => i.event_id !== impact.event_id);
      return [...others, impact];
    });
    db.upsertImpact(impact);
    setEvents(prev => prev.map(e => (e.id === impact.event_id ? { ...e, status: 'COMPLETED' } : e)));
    db.updateEvent(impact.event_id, { status: 'COMPLETED' });
  }, []);

  const reviewApplication = useCallback((appId, action, actor, notes = '') => {
    const a = applications.find(x => x.id === appId);
    if (!a) return;

    let newStatus: VerificationStatus = a.status;
    if (action === 'CLUB_VALIDATE') {
      // A Club President's approval is final for their own club's members — they
      // are verified immediately, no separate App Admin step.
      newStatus = 'VERIFIED';
    } else if (action === 'DISTRICT_APPROVE' || action === 'ADMIN_APPROVE') {
      newStatus = 'VERIFIED';
    } else if (action === 'REQUEST_INFO') {
      newStatus = 'NEEDS_INFORMATION';
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
    }

    setApplications(prev => prev.map(x => (x.id === appId ? { ...x, status: newStatus, notes: notes || x.notes } : x)));

    // Keep the applicant's user record in step, or an approved member stays
    // "unverified" everywhere the app checks verification_status.
    setUsers(usersPrev => usersPrev.map(u => (u.id === a.user_id ? { ...u, verification_status: newStatus } : u)));

    const log: AuditLog = {
      id: nextId('log'),
      application_id: a.id,
      action,
      performed_by_name: actor.full_name,
      performed_by_role: actor.role,
      previous_status: a.status,
      new_status: newStatus,
      notes,
      created_at: now(),
    };
    setAuditLogs(logs => [log, ...logs]);

    // One authorized, atomic server-side transition: updates the application,
    // the applicant's profile verification, and the audit log. Replaces the
    // three separate client writes (the profile update is blocked by RLS).
    db.reviewApplication(appId, action, notes);

    pushNotif({
      user_id: a.user_id,
      kind: 'VERIFICATION_UPDATE',
      title: 'Verification update',
      message: `Your application is now ${newStatus.replace(/_/g, ' ').toLowerCase()}.`,
      application_id: a.id,
    });
  }, [applications, pushNotif]) as DataContextValue['reviewApplication'];

  const resubmitApplication = useCallback((appId: string, updated: { member_id: string; club_id: string; club_name: string; position: string }) => {
    const a = applications.find(x => x.id === appId);
    if (!a) return;
    const isPresident = updated.position.toLowerCase().includes('president');
    const newStatus: VerificationStatus = isPresident ? 'AWAITING_DISTRICT_VALIDATION' : 'AWAITING_CLUB_VALIDATION';
    const submitted_at = new Date().toISOString();

    setApplications(prev => prev.map(x => (x.id === appId
      ? { ...x, member_id: updated.member_id, club_id: updated.club_id, club_name: updated.club_name, position: updated.position, status: newStatus, notes: '', submitted_at }
      : x)));
    db.updateApplication(appId, { member_id: updated.member_id, club_id: updated.club_id, position: updated.position, status: newStatus, notes: '', submitted_at });

    pushNotif({
      user_id: a.user_id,
      kind: 'VERIFICATION_UPDATE',
      title: 'Application Resubmitted',
      message: `Your application has been resubmitted and is now ${newStatus.replace(/_/g, ' ').toLowerCase()}.`,
      application_id: a.id,
    });
  }, [applications, pushNotif]);

  const markNotificationsRead = useCallback((userId: string) => {
    setNotifications(prev => prev.map(n => (n.user_id === userId ? { ...n, is_read: true } : n)));
    db.markNotificationsRead(userId);
    stopAlertSound();
  }, []);

  const markNotificationRead = useCallback((notificationId: string) => {
    setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n)));
    db.markNotificationRead(notificationId);
    stopAlertSound();
  }, []);

  const deleteNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    db.deleteNotification(notificationId);
  }, []);

  const deleteAllNotifications = useCallback((userId: string) => {
    setNotifications(prev => prev.filter(n => n.user_id !== userId));
    db.deleteAllNotifications(userId);
    stopAlertSound();
  }, []);

  const participantsFor = useCallback((eventId: string) => participants.filter(p => p.event_id === eventId), [participants]);
  const invitationFor = useCallback((eventId: string, userId: string) => invitations.find(i => i.event_id === eventId && i.invited_user_id === userId && i.status === 'PENDING'), [invitations]);
  const participationFor = useCallback((eventId: string, userId: string) => participants.find(p => p.event_id === eventId && p.user_id === userId), [participants]);
  const impactFor = useCallback((eventId: string) => impacts.find(i => i.event_id === eventId), [impacts]);
  const notificationsFor = useCallback((userId: string) => notifications.filter(n => n.user_id === userId), [notifications]);
  const unreadCountForUser = useCallback((userId: string) => notifications.filter(n => n.user_id === userId && !n.is_read).length, [notifications]);

  const unreadInboxCountForUser = useCallback((userId: string) => {
    // 1. Unread notifications
    const unreadNotifs = notifications.filter(n => n.user_id === userId && !n.is_read && n.kind !== 'INQUIRY_RECEIVED').length;

    // 2. Unread DMs
    const unreadDMs = conversations
      .filter(c => !c.is_group && (c.participant_user_id === userId || c.organizer_user_id === userId))
      .filter(c => {
        const msgs = messages.filter(m => m.conversation_id === c.id);
        const last = msgs[msgs.length - 1];
        if (!last || last.sender_id === userId) return false;
        const cursor = readCursors.find(cur => cur.conversation_id === c.id && cur.user_id === userId);
        return !cursor || new Date(last.created_at).getTime() > new Date(cursor.last_read_at).getTime();
      }).length;

    // 3. Unread Group Chats
    const myEvents = events.filter(e => {
      if (e.organizer_user_id === userId) return true;
      const p = participants.find(part => part.event_id === e.id && part.user_id === userId);
      return p?.status === 'JOINED';
    });

    const unreadGroups = myEvents.filter(e => {
      const groupConv = conversations.find(c => c.event_id === e.id && c.is_group);
      if (!groupConv) return false;
      const msgs = messages.filter(m => m.conversation_id === groupConv.id);
      if (msgs.length === 0) return false;
      const last = msgs[msgs.length - 1];
      if (!last || last.sender_id === userId) return false;
      const cursor = readCursors.find(cur => cur.conversation_id === groupConv.id && cur.user_id === userId);
      const cursorTime = cursor ? new Date(cursor.last_read_at).getTime() : 0;
      return msgs.some(m => m.sender_id !== userId && new Date(m.created_at).getTime() > cursorTime);
    }).length;

    return unreadNotifs + unreadDMs + unreadGroups;
  }, [notifications, conversations, messages, readCursors, events, participants]);

  const auditFor = useCallback((appId: string) => auditLogs.filter(l => l.application_id === appId), [auditLogs]);

  const applicationsForRole = useCallback((role: UserRole, clubId?: string) => {
    if (role === 'CLUB_PRESIDENT') {
      return applications.filter(
        a => a.club_id === clubId &&
        a.status === 'AWAITING_CLUB_VALIDATION' &&
        !a.position.toLowerCase().includes('president')
      );
    }
    if (role === 'DISTRICT_ADMIN') {
      return applications.filter(
        a => a.position.toLowerCase().includes('president') &&
        ['AWAITING_DISTRICT_VALIDATION', 'AWAITING_CLUB_VALIDATION'].includes(a.status)
      );
    }
    if (role === 'APP_ADMIN') return applications;
    return [];
  }, [applications]);

  const userStats = useCallback((userId: string) => {
    const mine = participants.filter(p => p.user_id === userId && p.status === 'JOINED');
    const evs = mine.map(p => events.find(e => e.id === p.event_id)).filter(Boolean) as RotaractEvent[];
    const organized = events.filter(e => e.organizer_user_id === userId);
    const service = evs.filter(e => e.event_type === 'SERVICE_PROJECT').length;
    const fellowships = evs.filter(e => e.event_type === 'FELLOWSHIP').length;
    // Same hours formula as the scoreboard: scheduled event duration (min 1h),
    // credited for attended events only. One formula keeps Profile and the
    // Scoreboard from telling two different stories.
    const hours = evs.reduce((sum, e) => {
      const p = mine.find(part => part.event_id === e.id);
      return sum + calculateParticipantHours(p, e);
    }, 0);
    const clubIds = new Set<string>();
    evs.forEach(e => { clubIds.add(e.organizing_club_id); e.participating_club_ids.forEach(c => clubIds.add(c)); });
    const me = users.find(u => u.id === userId);
    if (me) clubIds.delete(me.club_id);
    return { joined: mine.length, organized: organized.length, hours, clubsCollab: clubIds.size, service, fellowships };
  }, [participants, events, users]);

  // Memoised: a fresh array on every render gives every consumer a new `events`
  // identity, which re-triggers downstream effects (notably the map's
  // animateToRegion, which crashes MKMapView when fired mid-layout).
  const resolvedEvents = useMemo(
    () => events.map(e => ({ ...e, status: getEffectiveEventStatus(e) })),
    [events],
  );

  // Memoized so the provider handing out a NEW object literal on every render
  // doesn't force every consumer in the app to re-render. It still invalidates
  // whenever any state or action identity actually changes, so consumers stay
  // correct — this only removes the gratuitous re-renders.
  const value = useMemo<DataContextValue>(() => ({
      users, events: resolvedEvents, participants, invitations, impacts, applications, auditLogs, notifications, clubs, conversations, messages, readCursors, conversationStates, reactions,
      refresh,
      createEvent, updateEvent, updateEventStatus, resetEventApprovals, cancelEvent, approveEvent, rejectEvent, requestDistrictEventReview,
      joinEvent, leaveEvent, approveParticipant, declineParticipant, markAttendance, checkIn, checkOut, addClub,
      invite, respondInvitation, sendMessageToOrganizer, getOrCreateConversation, getOrCreateEventGroupConversation, canAccessEventGroupChat, sendDirectMessage, retryMessage, deleteMessageForMe, unsendMessage, markConversationRead, readCursorsFor, conversationStateFor, setConversationPinned, setConversationMuted, setConversationArchived, deleteConversationForMe, reactionsFor, toggleMessageReaction, broadcastToEvent, saveImpact, reviewApplication, resubmitApplication, pushNotification: pushNotif, markNotificationsRead, markNotificationRead, deleteNotification, deleteAllNotifications, updateUserRole, removeUser, addApplication,
      participantsFor, invitationFor, participationFor, impactFor, notificationsFor, unreadCountForUser, unreadInboxCountForUser, messagesForConversation, auditFor,
      applicationsForRole, userStats,
  }), [
    users, resolvedEvents, participants, invitations, impacts, applications, auditLogs, notifications, clubs, conversations, messages, readCursors, conversationStates, reactions,
    refresh,
    createEvent, updateEvent, updateEventStatus, resetEventApprovals, cancelEvent, approveEvent, rejectEvent, requestDistrictEventReview,
    joinEvent, leaveEvent, approveParticipant, declineParticipant, markAttendance, checkIn, checkOut, addClub,
    invite, respondInvitation, sendMessageToOrganizer, getOrCreateConversation, getOrCreateEventGroupConversation, canAccessEventGroupChat, sendDirectMessage, retryMessage, deleteMessageForMe, unsendMessage, markConversationRead, readCursorsFor, conversationStateFor, setConversationPinned, setConversationMuted, setConversationArchived, deleteConversationForMe, reactionsFor, toggleMessageReaction, broadcastToEvent, saveImpact, reviewApplication, resubmitApplication, pushNotif, markNotificationsRead, markNotificationRead, deleteNotification, deleteAllNotifications, updateUserRole, removeUser, addApplication,
    participantsFor, invitationFor, participationFor, impactFor, notificationsFor, unreadCountForUser, unreadInboxCountForUser, messagesForConversation, auditFor,
    applicationsForRole, userStats,
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
