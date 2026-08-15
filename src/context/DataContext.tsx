import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import {
  RotaractEvent, EventParticipant, EventInvitation, EventImpact,
  VerificationApplication, AuditLog, AppNotification,
  VerificationStatus, AttendanceStatus, AppUser, UserRole, Club,
  Conversation, DirectMessage,
} from '../types';
import { loadAll, db } from '../services/db';
import { useAuth } from './AuthContext';
import { getEffectiveEventStatus } from '../utils/eventUtils';
import { approverClubIdsFor, pendingApproverClubIdsFor } from '../utils/eventApproval';
import { ROLE_LABELS } from '../utils/roles';

export type CheckInRecord = {
  checkedInAt: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  /** Who produced this record — the attendee's own verified GPS check-in, or the organizer manually. */
  recordedBy?: 'SELF_GPS' | 'ORGANIZER';
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

  createEvent: (e: Omit<RotaractEvent, 'id'>) => RotaractEvent;
  updateEvent: (eventId: string, updates: Partial<Omit<RotaractEvent, 'id'>>) => void;
  updateEventStatus: (eventId: string, status: RotaractEvent['status']) => void;
  resetEventApprovals: (eventId: string, actor: AppUser) => void;
  cancelEvent: (eventId: string, reason?: string, actor?: AppUser) => void;
  approveEvent: (eventId: string, actor: AppUser) => EventApprovalResult;
  rejectEvent: (eventId: string, actor: AppUser, reason?: string) => void;

  joinEvent: (eventId: string, userId: string, opts?: { skipApproval?: boolean }) => void;
  leaveEvent: (eventId: string, userId: string) => void;
  approveParticipant: (participantId: string, actor: AppUser) => void;
  declineParticipant: (participantId: string, actor: AppUser, reason?: string) => void;
  markAttendance: (participantId: string, status: AttendanceStatus) => void;
  checkIn: (participantId: string, at: CheckInRecord) => void;

  invite: (eventId: string, invitedUserId: string, byUser: AppUser) => void;
  respondInvitation: (invitationId: string, accept: boolean, user: AppUser, reason?: string) => void;
  sendMessageToOrganizer: (eventId: string, senderUser: AppUser, text: string) => void;
  getOrCreateConversation: (eventId: string | undefined, senderUser: AppUser, receiverId: string, receiverName: string, eventTitle?: string) => Conversation;
  getOrCreateEventGroupConversation: (eventId: string) => Conversation;
  canAccessEventGroupChat: (eventId: string, userId: string) => boolean;
  sendDirectMessage: (conversationId: string, eventId: string | undefined, senderUser: AppUser, receiverId: string | undefined, receiverName: string, text: string, eventTitle?: string) => void;

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

  markNotificationsRead: (userId: string) => void;
  deleteNotification: (notificationId: string) => void;
  /**
   * App Admin only: promotes or demotes any user in the app. `actor` is recorded
   * in the notification sent to the target so the change is never anonymous.
   */
  updateUserRole: (targetUserId: string, newRole: UserRole, actor?: AppUser) => void;

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
  }) => Club;

  participantsFor: (eventId: string) => EventParticipant[];
  invitationFor: (eventId: string, userId: string) => EventInvitation | undefined;
  participationFor: (eventId: string, userId: string) => EventParticipant | undefined;
  impactFor: (eventId: string) => EventImpact | undefined;
  notificationsFor: (userId: string) => AppNotification[];
  messagesForConversation: (conversationId: string) => DirectMessage[];
  auditFor: (appId: string) => AuditLog[];
  applicationsForRole: (role: UserRole, clubId?: string) => VerificationApplication[];
  userStats: (userId: string) => { joined: number; organized: number; hours: number; clubsCollab: number; service: number; fellowships: number };
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
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

  // Supabase is the source of truth. Reload whenever auth changes: clubs and
  // zones are world-readable so the registration club picker is populated even
  // before sign-in, while the RLS-protected tables come back empty until the
  // user is authenticated (and empty again after sign-out, clearing the cache).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await loadAll();
        if (cancelled) return;
        setUsers(d.users); setClubs(d.clubs); setEvents(d.events);
        setParticipants(d.participants); setInvitations(d.invitations);
        setImpacts(d.impacts); setApplications(d.applications);
        setAuditLogs(d.auditLogs); setNotifications(d.notifications);
        setConversations(d.conversations); setMessages(d.messages);
      } catch (e) {
        console.warn('Failed to load data from Supabase', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

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

  const updateUserRole = useCallback((targetUserId: string, newRole: UserRole, actor?: AppUser) => {
    const target = users.find(u => u.id === targetUserId);
    // Role and position must tell the same story, and the club's recorded
    // president must follow the role — otherwise application routing keeps
    // notifying the previous president.
    const becomesPresident = newRole === 'CLUB_PRESIDENT';
    const losesPresidency = target?.role === 'CLUB_PRESIDENT' && newRole !== 'CLUB_PRESIDENT';
    const newPosition = becomesPresident ? 'President' : losesPresidency ? 'Member' : undefined;

    setUsers(prev => prev.map(u => (u.id === targetUserId ? { ...u, role: newRole, ...(newPosition ? { position: newPosition } : {}) } : u)));
    db.updateProfileRole(targetUserId, newRole, newPosition);

    if (target?.club_id && (becomesPresident || losesPresidency)) {
      const presidentId = becomesPresident ? targetUserId : '';
      setClubs(prev => prev.map(c => (c.id === target.club_id
        ? {
            ...c,
            president_id: presidentId,
            president_name: becomesPresident ? target.full_name : 'Pending Election',
          }
        : c)));
      db.updateClubPresident(target.club_id, presidentId || null);
    }

    const label = ROLE_LABELS[newRole];
    pushNotif({
      user_id: targetUserId,
      kind: 'ROLE_ASSIGNED',
      title: `You are now ${label}`,
      message: actor
        ? `${actor.full_name} assigned you the ${label} role.`
        : `Your role was changed to ${label}.`,
    });
  }, [users, pushNotif]);

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
    db.insertEvent(ev);

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
      teamParts.forEach(p => db.insertParticipant(p));
    }
    if (ev.status === 'PENDING_APPROVAL') {
      const creatorName = users.find(u => u.id === ev.organizer_user_id)?.full_name ?? 'A member';
      if (ev.event_type === 'DISTRICT_EVENT') {
        const districtAdmin = users.find(u => u.role === 'DISTRICT_ADMIN');
        if (districtAdmin) {
          pushNotif({
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
          pushNotif({
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
    return ev;
  }, [clubs, users, pushNotif]);

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
    db.updateEvent(eventId, { approved_by_club_ids: approvedByClubIds, status: newStatus });

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
      pushNotif({
        user_id: userId,
        kind: 'JOIN_APPROVED',
        title: 'Joined Project Group Chat',
        message: `You joined "${ev.title}". Tap to view project group chat & team discussion!`,
        event_id: ev.id,
      });
    }
  }, [events, users, participants, pushNotif]);

  const leaveEvent = useCallback((eventId: string, userId: string) => {
    setParticipants(prev => prev.filter(p => !(p.event_id === eventId && p.user_id === userId)));
    db.deleteParticipant(eventId, userId);
  }, []);

  const approveParticipant = useCallback((participantId: string, actor: AppUser) => {
    setParticipants(prev => prev.map(p => (p.id === participantId ? { ...p, status: 'JOINED' } : p)));
    db.updateParticipant(participantId, { status: 'JOINED' });
    const p = participants.find(x => x.id === participantId);
    if (p) {
      const ev = events.find(e => e.id === p.event_id);
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
    const updates: Partial<EventParticipant> = {
      attendance_status: 'ATTENDED',
      checked_in_at: at.checkedInAt,
      check_in_latitude: at.latitude,
      check_in_longitude: at.longitude,
      check_in_distance_m: at.distanceMeters,
      check_in_method: at.recordedBy ?? 'SELF_GPS',
    };
    setParticipants(prev => prev.map(p => (p.id === participantId ? { ...p, ...updates } : p)));
    db.updateParticipant(participantId, updates);
  }, []);

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

  const sendDirectMessage = useCallback((conversationId: string, eventId: string | undefined, senderUser: AppUser, receiverId: string | undefined, receiverName: string, text: string, eventTitle?: string) => {
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
    };
    setMessages(prev => [...prev, msg]);
    db.insertMessage(msg);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, last_message: text, last_message_at: now() } : c));
    db.updateConversation(conversationId, { last_message: text, last_message_at: now() });
    // Group messages fan out inside the conversation itself — there is no single
    // recipient to notify (and 'ALL_PARTICIPANTS' is not a real user to notify).
    if (receiverId) {
      pushNotif({
        user_id: receiverId,
        kind: 'INQUIRY_RECEIVED',
        title: `Inquiry from ${senderUser.full_name}`,
        message: text,
        event_id: eventId,
        conversation_id: conversationId,
      });
    }
  }, [pushNotif]);

  const messagesForConversation = useCallback((conversationId: string) => {
    return messages.filter(m => m.conversation_id === conversationId);
  }, [messages]);

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
      // Club validation is not final: the App Administrator makes the last call,
      // matching the pipeline shown to applicants (club → admin → verified).
      newStatus = 'AWAITING_ADMIN_VERIFICATION';
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
  }, []);

  const deleteNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    db.deleteNotification(notificationId);
  }, []);

  const participantsFor = useCallback((eventId: string) => participants.filter(p => p.event_id === eventId), [participants]);
  const invitationFor = useCallback((eventId: string, userId: string) => invitations.find(i => i.event_id === eventId && i.invited_user_id === userId && i.status === 'PENDING'), [invitations]);
  const participationFor = useCallback((eventId: string, userId: string) => participants.find(p => p.event_id === eventId && p.user_id === userId), [participants]);
  const impactFor = useCallback((eventId: string) => impacts.find(i => i.event_id === eventId), [impacts]);
  const notificationsFor = useCallback((userId: string) => notifications.filter(n => n.user_id === userId), [notifications]);
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
      const isAttended = p?.attendance_status === 'ATTENDED' || !!p?.checked_in_at;
      if (!isAttended) return sum;
      const start = new Date(e.start_datetime).getTime();
      const end = new Date(e.end_datetime).getTime();
      return sum + Math.max(1, Math.round((end - start) / 3600000));
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

  return (
    <DataContext.Provider value={{
      users, events: resolvedEvents, participants, invitations, impacts, applications, auditLogs, notifications, clubs, conversations, messages,
      createEvent, updateEvent, updateEventStatus, resetEventApprovals, cancelEvent, approveEvent, rejectEvent,
      joinEvent, leaveEvent, approveParticipant, declineParticipant, markAttendance, checkIn, addClub,
      invite, respondInvitation, sendMessageToOrganizer, getOrCreateConversation, getOrCreateEventGroupConversation, canAccessEventGroupChat, sendDirectMessage, saveImpact, reviewApplication, resubmitApplication, markNotificationsRead, deleteNotification, updateUserRole, addApplication,
      participantsFor, invitationFor, participationFor, impactFor, notificationsFor, messagesForConversation, auditFor,
      applicationsForRole, userStats,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
