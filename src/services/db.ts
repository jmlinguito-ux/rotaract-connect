import { supabase } from './supabase';
import {
  AppUser, Club, RotaractEvent, EventParticipant, EventInvitation, EventImpact,
  VerificationApplication, AuditLog, AppNotification, Conversation, DirectMessage,
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
}

export async function loadAll(): Promise<LoadedData> {
  const [
    profilesRes, clubsRes, eventsRes, epcRes, partsRes, invRes, impRes,
    appsRes, auditRes, notifRes, convRes, msgRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('clubs').select('*'),
    supabase.from('events').select('*'),
    supabase.from('event_participating_clubs').select('*'),
    supabase.from('event_participants').select('*'),
    supabase.from('event_invitations').select('*'),
    supabase.from('event_impacts').select('*'),
    supabase.from('verification_applications').select('*'),
    supabase.from('audit_logs').select('*'),
    supabase.from('notifications').select('*'),
    supabase.from('conversations').select('*'),
    supabase.from('direct_messages').select('*'),
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
    verification_status: p.verification_status,
    avatar_url: p.avatar_url ?? undefined,
    contact_number: p.contact_number ?? undefined,
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
    text: d.text,
    created_at: d.created_at,
  }));

  return {
    users, clubs: mappedClubs, events: mappedEvents, participants, invitations,
    impacts, applications, auditLogs, notifications, conversations, messages,
  };
}

// ---------------------------------------------------------------------------
// Write helpers — fire-and-forget persistence for the optimistic local state.
// Each logs (rather than throws) so a persistence hiccup never crashes the UI;
// the local state already reflects the change. RLS decides what actually lands.
// ---------------------------------------------------------------------------

function reportError(op: string, error: unknown) {
  if (error) console.warn(`[db] ${op} failed`, error);
}

export const db = {
  insertEvent: async (e: RotaractEvent) => {
    const { participating_club_ids, organizing_club_name, ...row } = e;
    reportError('insertEvent', (await supabase.from('events').insert(row)).error);
    if (participating_club_ids?.length) {
      reportError('insertEventClubs', (await supabase.from('event_participating_clubs')
        .insert(participating_club_ids.map(cid => ({ event_id: e.id, club_id: cid })))).error);
    }
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
  insertParticipant: async (p: EventParticipant) => {
    reportError('insertParticipant', (await supabase.from('event_participants').upsert(p, { onConflict: 'event_id,user_id' })).error);
  },
  updateParticipant: async (id: string, updates: Partial<EventParticipant>) => {
    reportError('updateParticipant', (await supabase.from('event_participants').update(updates).eq('id', id)).error);
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
  insertMessage: async (msg: DirectMessage) => {
    const { sender_name, receiver_name, ...row } = msg;
    reportError('insertMessage', (await supabase.from('direct_messages').insert(row)).error);
  },
  updateClubPresident: async (clubId: string, presidentId: string | null) => {
    reportError('updateClubPresident', (await supabase.from('clubs').update({ president_id: presidentId }).eq('id', clubId)).error);
  },
  insertClub: async (c: Club) => {
    const { president_name, ...row } = c;
    reportError('insertClub', (await supabase.from('clubs').insert({ ...row, president_id: row.president_id || null })).error);
  },
  updateProfileRole: async (userId: string, role: string, position?: string) => {
    const updates: any = { role };
    if (position) updates.position = position;
    reportError('updateProfileRole', (await supabase.from('profiles').update(updates).eq('id', userId)).error);
  },
  updateProfileVerification: async (userId: string, status: string) => {
    reportError('updateProfileVerification', (await supabase.from('profiles').update({ verification_status: status }).eq('id', userId)).error);
  },
};
