import { supabase } from './supabase';
import {
  AppUser, Club, RotaractEvent, EventParticipant, EventInvitation, EventImpact,
  VerificationApplication, AuditLog, AppNotification, Conversation, DirectMessage, ReadCursor,
  ConversationState, MessageReaction, EventClubAllocation, EventCohost,
} from '../types';

/**
 * Supabase data-access layer. `loadAll` pulls every table the app renders and
 * maps rows to the app's domain types, re-deriving the denormalized display
 * fields the UI expects (club/organizer names, a participating-club list from
 * the junction table, etc.) that are not stored as columns.
 *
 * `loadTables` can re-pull a SUBSET of those tables (plus their join
 * dependencies) so a realtime change to one table no longer forces the client
 * to re-fetch all of them — on a far-away/slow server that full reload was the
 * dominant cost behind sluggish chats, events, and lists.
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
  /** Per-club reserved participant slots (migration 0041). */
  clubAllocations: EventClubAllocation[];
  /** Cohosting requests + their payment state (migration 0043). */
  cohosts: EventCohost[];
}

/** Any table `loadAll`/`loadTables` can hydrate. */
export type TableName =
  | 'profiles' | 'clubs' | 'events' | 'event_participating_clubs' | 'event_participants'
  | 'event_invitations' | 'event_impacts' | 'verification_applications' | 'audit_logs'
  | 'notifications' | 'conversations' | 'direct_messages' | 'message_reads'
  | 'message_deletions' | 'conversation_states' | 'message_reactions'
  | 'event_club_allocations' | 'event_cohosts';

/**
 * Extra tables fetched alongside a table so its derived display fields resolve.
 * Example: an `events` row has no `organizing_club_name` column — the client
 * joins `clubs`, and `participating_club_ids` comes from the junction table.
 */
const TABLE_DEPS: Record<TableName, readonly TableName[]> = {
  profiles: ['clubs'],                              // users → club_name
  clubs: ['profiles'],                              // clubs → president_name
  events: ['event_participating_clubs', 'clubs'],   // events → participating_club_ids + organizing_club_name
  event_participating_clubs: ['events', 'clubs'],   // events re-derived after junction change
  event_participants: [],
  event_invitations: [],
  event_impacts: [],
  verification_applications: ['clubs'],             // applications → club_name
  audit_logs: [],
  notifications: [],
  conversations: ['profiles', 'clubs', 'events'],   // participant/organizer names + group organizer club
  direct_messages: ['profiles'],                    // messages → sender_name
  message_reads: [],
  message_deletions: [],
  conversation_states: [],
  message_reactions: [],
  event_club_allocations: [],
  event_cohosts: [],
};

const ALL_TABLES = Object.keys(TABLE_DEPS) as TableName[];

/** Raw rows for every table the app hydrates (the pre-mapping shape). */
interface RawRows {
  profiles: any[];
  clubs: any[];
  events: any[];
  event_participating_clubs: any[];
  event_participants: any[];
  event_invitations: any[];
  event_impacts: any[];
  verification_applications: any[];
  audit_logs: any[];
  notifications: any[];
  conversations: any[];
  direct_messages: any[];
  message_reads: any[];
  message_deletions: any[];
  conversation_states: any[];
  message_reactions: any[];
  event_club_allocations: any[];
  event_cohosts: any[];
}

/** Bounded, newest-first query for one table (see per-table rationale below). */
function tableQuery(table: TableName) {
  switch (table) {
    case 'profiles': return supabase.from('profiles').select('*');
    case 'clubs': return supabase.from('clubs').select('*');
    // Bounded selects: the district dataset must not grow without limit. Sorted
    // newest-first so a cap ever hit drops the OLDEST rows, never the recent ones
    // the UI actually shows. (Same rationale as the notifications/direct_messages
    // caps below.)
    case 'events': return supabase.from('events').select('*')
      .order('start_datetime', { ascending: false }).limit(2000);
    case 'event_participating_clubs': return supabase.from('event_participating_clubs').select('*');
    case 'event_participants': return supabase.from('event_participants').select('*')
      .order('joined_at', { ascending: false }).limit(5000);
    case 'event_invitations': return supabase.from('event_invitations').select('*')
      .order('sent_at', { ascending: false }).limit(2000);
    case 'event_impacts': return supabase.from('event_impacts').select('*');
    case 'verification_applications': return supabase.from('verification_applications').select('*')
      .order('submitted_at', { ascending: false }).limit(500);
    // audit_logs grows forever (every governance action appends); cap it the same
    // way as notifications so a reload never re-ships the entire history.
    case 'audit_logs': return supabase.from('audit_logs').select('*')
      .order('created_at', { ascending: false }).limit(500);
    // Ordered and capped explicitly. PostgREST enforces a server-side row cap
    // (1000 by default), so an unordered select silently returned an ARBITRARY
    // slice once a user passed it — with no guarantee the newest were included.
    // Newest-first makes truncation deterministic: you lose the oldest, never the
    // most recent.
    case 'notifications': return supabase.from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(500);
    case 'conversations': return supabase.from('conversations').select('*');
    // Descending, not ascending: with the same server-side cap, ascending order
    // returned the OLDEST rows and dropped recent chat history entirely. The client
    // re-sorts ascending for display (see messagesForConversation), so the fetch
    // order is free to be whatever keeps the right rows.
    case 'direct_messages': return supabase.from('direct_messages').select('*')
      .order('created_at', { ascending: false }).limit(1000);
    // message_reads may not exist until migration 0007 is applied — tolerate that.
    case 'message_reads': return supabase.from('message_reads').select('*')
      .order('last_read_at', { ascending: false }).limit(2000);
    // message_deletions may not exist until migration 0009 — tolerate that. RLS
    // already scopes this to the current user's own rows.
    case 'message_deletions': return supabase.from('message_deletions').select('message_id');
    // conversation_states may not exist until migration 0011 — tolerate that. RLS
    // scopes it to the caller's own rows.
    case 'conversation_states': return supabase.from('conversation_states').select('*');
    // message_reactions may not exist until migration 0029 — tolerate that.
    case 'message_reactions': return supabase.from('message_reactions').select('*')
      .order('created_at', { ascending: false }).limit(2000);
    // event_club_allocations may not exist until migration 0041 — tolerate that.
    case 'event_club_allocations': return supabase.from('event_club_allocations').select('*');
    // event_cohosts may not exist until migration 0043 — tolerate that.
    case 'event_cohosts': return supabase.from('event_cohosts').select('*');
  }
}


/**
 * `signal` lets a caller actually cancel the in-flight HTTP requests (not just
 * give up on them JS-side) — used by DataContext's refresh timeout so a hung
 * request on a flaky connection is genuinely torn down instead of left running
 * in the background to resolve at some arbitrary later time.
 */
export async function loadAll(signal?: AbortSignal): Promise<LoadedData> {
  return mapRawToLoaded(await fetchRaw(signal, ALL_TABLES));
}

/** Fetch raw rows for the given tables in parallel. */
async function fetchRaw(signal: AbortSignal | undefined, tables: readonly TableName[]): Promise<Partial<RawRows>> {
  const withSignal = <T extends { abortSignal(s: AbortSignal): T }>(q: T): T =>
    signal ? q.abortSignal(signal) : q;

  const results = await Promise.all(
    tables.map(async table => {
      const res = await withSignal(tableQuery(table));
      return { table, rows: (res.data ?? []) as any[] };
    }),
  );
  const raw: Partial<RawRows> = {};
  for (const r of results) (raw as any)[r.table] = r.rows;
  return raw;
}

// --- Lookup helpers ----------------------------------------------------------

function userNameLookup(profiles: any[]): Map<string, string> {
  return new Map(profiles.map(p => [p.id, p.full_name]));
}
function clubNameLookup(clubs: any[]): Map<string, string> {
  return new Map(clubs.map(c => [c.id, c.club_name]));
}
function participatingClubIdsByEvent(epc: any[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const row of epc) {
    const arr = m.get(row.event_id) ?? [];
    arr.push(row.club_id);
    m.set(row.event_id, arr);
  }
  return m;
}

// --- Per-table mappers (shared by loadAll and loadTables) --------------------

function mapUsers(profiles: any[], clubNames: Map<string, string>): AppUser[] {
  return profiles.map(p => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    username: p.username,
    club_id: p.club_id ?? '',
    club_name: (p.club_id && clubNames.get(p.club_id)) || '',
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
}

function mapClubs(clubs: any[], names: Map<string, string>): Club[] {
  return clubs.map(c => ({
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
    president_name: (c.president_id && names.get(c.president_id)) || 'Pending Election',
  }));
}


function mapEvents(events: any[], clubNames: Map<string, string>, partClubsByEvent: Map<string, string[]>): RotaractEvent[] {
  return events.map(e => ({
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
    organizing_club_name: clubNames.get(e.organizing_club_id) || '',
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
    allocation_mode: e.allocation_mode ?? 'NONE',
    default_club_allocation: e.default_club_allocation ?? undefined,
    allocation_release_at: e.allocation_release_at ?? undefined,
    allocation_released_at: e.allocation_released_at ?? undefined,
    cohosting_enabled: e.cohosting_enabled ?? false,
    cohosting_fee_centavos: e.cohosting_fee_centavos ?? 0,
    cohosting_max_clubs: e.cohosting_max_clubs ?? undefined,
    cohosting_application_deadline: e.cohosting_application_deadline ?? undefined,
    cohosting_requires_approval: e.cohosting_requires_approval ?? true,
    cohosting_benefits: e.cohosting_benefits ?? undefined,
  }));
}

function mapClubAllocations(rows: any[]): EventClubAllocation[] {
  return rows.map(a => ({
    id: a.id,
    event_id: a.event_id,
    club_id: a.club_id,
    allocated_slots: a.allocated_slots ?? 0,
    initial_slots: a.initial_slots ?? 0,
    created_at: a.created_at ?? undefined,
    updated_at: a.updated_at ?? undefined,
  }));
}

function mapCohosts(rows: any[]): EventCohost[] {
  return rows.map(c => ({
    id: c.id,
    event_id: c.event_id,
    club_id: c.club_id,
    requested_by_user_id: c.requested_by_user_id ?? undefined,
    status: c.status,
    expected_participants: c.expected_participants ?? 0,
    agreed_fee_centavos: c.agreed_fee_centavos ?? 0,
    message: c.message ?? undefined,
    requested_at: c.requested_at,
    reviewed_at: c.reviewed_at ?? undefined,
    reviewed_by_user_id: c.reviewed_by_user_id ?? undefined,
    review_notes: c.review_notes ?? undefined,
    payment_status: c.payment_status ?? 'NONE',
    payment_method: c.payment_method ?? undefined,
    payment_reference: c.payment_reference ?? undefined,
    payment_receipt_path: c.payment_receipt_path ?? undefined,
    payment_submitted_at: c.payment_submitted_at ?? undefined,
    payment_verified_at: c.payment_verified_at ?? undefined,
    payment_verified_by_user_id: c.payment_verified_by_user_id ?? undefined,
    payment_review_notes: c.payment_review_notes ?? undefined,
  }));
}

function mapParticipants(rows: any[]): EventParticipant[] {
  return rows.map(p => ({
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
}

function mapInvitations(rows: any[]): EventInvitation[] {
  return rows.map(i => ({
    id: i.id,
    event_id: i.event_id,
    invited_user_id: i.invited_user_id,
    invited_by_user_id: i.invited_by_user_id,
    status: i.status,
    sent_at: i.sent_at,
    decline_reason: i.decline_reason ?? undefined,
  }));
}

function mapImpacts(rows: any[]): EventImpact[] {
  return rows.map(im => ({
    event_id: im.event_id,
    volunteer_hours: im.volunteer_hours,
    beneficiaries: im.beneficiaries,
    funds_raised: Number(im.funds_raised) || 0,
    items_distributed: im.items_distributed,
    trees_planted: im.trees_planted,
    impact_summary: im.impact_summary ?? '',
  }));
}


function mapApplications(rows: any[], clubNames: Map<string, string>): VerificationApplication[] {
  return rows.map(a => ({
    id: a.id,
    user_id: a.user_id,
    full_name: a.full_name,
    email: a.email,
    club_id: a.club_id,
    club_name: clubNames.get(a.club_id) || '',
    member_id: a.member_id,
    position: a.position,
    status: a.status,
    submitted_at: a.submitted_at,
    notes: a.notes ?? '',
    proof_url: a.proof_url ?? undefined,
  }));
}

function mapAuditLogs(rows: any[]): AuditLog[] {
  return rows.map(l => ({
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
}

function mapNotifications(rows: any[]): AppNotification[] {
  return rows.map(n => ({
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
}

function mapConversations(rows: any[], names: Map<string, string>, clubNames: Map<string, string>, events: any[]): Conversation[] {
  return rows.map(c => ({
    id: c.id,
    event_id: c.event_id ?? undefined,
    event_title: c.event_title ?? undefined,
    is_group: c.is_group ?? false,
    participant_user_id: c.participant_user_id ?? undefined,
    participant_name: c.is_group
      ? `${c.event_title ?? 'Event'} Group Chat`
      : (c.participant_user_id && names.get(c.participant_user_id)) || '',
    organizer_user_id: c.organizer_user_id,
    organizer_name: c.is_group
      ? (c.event_id && clubNames.get(events.find((e: any) => e.id === c.event_id)?.organizing_club_id)) || 'Club'
      : names.get(c.organizer_user_id) || '',
    last_message: c.last_message ?? '',
    last_message_at: c.last_message_at,
  }));
}

function mapMessages(rows: any[], names: Map<string, string>): DirectMessage[] {
  return rows.map(d => ({
    id: d.id,
    conversation_id: d.conversation_id,
    event_id: d.event_id ?? undefined,
    sender_id: d.sender_id,
    sender_name: names.get(d.sender_id) || '',
    receiver_id: d.receiver_id ?? undefined,
    receiver_name: (d.receiver_id && names.get(d.receiver_id)) || 'Group Chat',
    text: d.text ?? '',
    created_at: d.created_at,
    reply_to_message_id: d.reply_to_message_id ?? undefined,
    reply_to_sender_name: d.reply_to_sender_name ?? undefined,
    reply_to_text: d.reply_to_text ?? undefined,
    attachment_path: d.attachment_path ?? undefined,
    attachment_type: d.attachment_type ?? undefined,
    // Pre-calculated width/height + broadcast flag are mapped here too so
    // snapshot-loaded messages render identically to realtime-arriving ones
    // (the old loadAll dropped them, hiding announcements and resizing photos).
    attachment_width: d.attachment_width ?? undefined,
    attachment_height: d.attachment_height ?? undefined,
    deleted_at: d.deleted_at ?? undefined,
    is_broadcast: d.is_broadcast ?? undefined,
    mentioned_user_ids: d.mentioned_user_ids ?? undefined,
  }));
}

function mapReadCursors(rows: any[]): ReadCursor[] {
  return rows.map(r => ({
    conversation_id: r.conversation_id,
    user_id: r.user_id,
    last_read_at: r.last_read_at,
    last_read_message_id: r.last_read_message_id ?? undefined,
  }));
}

function mapDeletedMessageIds(rows: any[]): string[] {
  return rows.map(r => r.message_id);
}

function mapConversationStates(rows: any[]): ConversationState[] {
  return rows.map(s => ({
    conversation_id: s.conversation_id,
    user_id: s.user_id,
    pinned: !!s.pinned,
    archived: !!s.archived,
    muted: !!s.muted,
    deleted_at: s.deleted_at ?? undefined,
  }));
}

function mapReactions(rows: any[]): MessageReaction[] {
  return rows.map(r => ({
    id: r.id,
    message_id: r.message_id,
    user_id: r.user_id,
    emoji: r.emoji,
    created_at: r.created_at,
  }));
}


function mapRawToLoaded(raw: Partial<RawRows>): LoadedData {
  const profiles = raw.profiles ?? [];
  const clubs = raw.clubs ?? [];
  const events = raw.events ?? [];
  const names = userNameLookup(profiles);
  const clubNames = clubNameLookup(clubs);
  const partClubsByEvent = participatingClubIdsByEvent(raw.event_participating_clubs ?? []);

  return {
    users: mapUsers(profiles, clubNames),
    clubs: mapClubs(clubs, names),
    events: mapEvents(events, clubNames, partClubsByEvent),
    participants: mapParticipants(raw.event_participants ?? []),
    invitations: mapInvitations(raw.event_invitations ?? []),
    impacts: mapImpacts(raw.event_impacts ?? []),
    applications: mapApplications(raw.verification_applications ?? [], clubNames),
    auditLogs: mapAuditLogs(raw.audit_logs ?? []),
    notifications: mapNotifications(raw.notifications ?? []),
    conversations: mapConversations(raw.conversations ?? [], names, clubNames, events),
    messages: mapMessages(raw.direct_messages ?? [], names),
    readCursors: mapReadCursors(raw.message_reads ?? []),
    deletedMessageIds: mapDeletedMessageIds(raw.message_deletions ?? []),
    conversationStates: mapConversationStates(raw.conversation_states ?? []),
    reactions: mapReactions(raw.message_reactions ?? []),
    clubAllocations: mapClubAllocations(raw.event_club_allocations ?? []),
    cohosts: mapCohosts(raw.event_cohosts ?? []),
  };
}

/**
 * Re-pulls only the requested tables (plus their join dependencies) and returns
 * the mapped slices. Used by realtime sync so a change to one table no longer
 * re-fetches all of them; the caller merges the returned keys into its state.
 */
export async function loadTables(
  signal: AbortSignal | undefined,
  tables: readonly TableName[],
): Promise<Partial<LoadedData>> {
  const need = new Set<TableName>();
  for (const t of tables) {
    need.add(t);
    for (const dep of TABLE_DEPS[t]) need.add(dep);
  }
  const raw = await fetchRaw(signal, [...need]);
  const names = userNameLookup(raw.profiles ?? []);
  const clubNames = clubNameLookup(raw.clubs ?? []);
  const partClubsByEvent = participatingClubIdsByEvent(raw.event_participating_clubs ?? []);

  const result: Partial<LoadedData> = {};
  if (tables.includes('profiles')) result.users = mapUsers(raw.profiles ?? [], clubNames);
  if (tables.includes('clubs')) result.clubs = mapClubs(raw.clubs ?? [], names);
  if (tables.includes('events') || tables.includes('event_participating_clubs'))
    result.events = mapEvents(raw.events ?? [], clubNames, partClubsByEvent);
  if (tables.includes('event_participants')) result.participants = mapParticipants(raw.event_participants ?? []);
  if (tables.includes('event_invitations')) result.invitations = mapInvitations(raw.event_invitations ?? []);
  if (tables.includes('event_impacts')) result.impacts = mapImpacts(raw.event_impacts ?? []);
  if (tables.includes('verification_applications'))
    result.applications = mapApplications(raw.verification_applications ?? [], clubNames);
  if (tables.includes('audit_logs')) result.auditLogs = mapAuditLogs(raw.audit_logs ?? []);
  if (tables.includes('notifications')) result.notifications = mapNotifications(raw.notifications ?? []);
  if (tables.includes('conversations'))
    result.conversations = mapConversations(raw.conversations ?? [], names, clubNames, raw.events ?? []);
  if (tables.includes('direct_messages')) result.messages = mapMessages(raw.direct_messages ?? [], names);
  if (tables.includes('message_reads')) result.readCursors = mapReadCursors(raw.message_reads ?? []);
  if (tables.includes('message_deletions')) result.deletedMessageIds = mapDeletedMessageIds(raw.message_deletions ?? []);
  if (tables.includes('conversation_states')) result.conversationStates = mapConversationStates(raw.conversation_states ?? []);
  if (tables.includes('message_reactions')) result.reactions = mapReactions(raw.message_reactions ?? []);
  if (tables.includes('event_club_allocations')) result.clubAllocations = mapClubAllocations(raw.event_club_allocations ?? []);
  if (tables.includes('event_cohosts')) result.cohosts = mapCohosts(raw.event_cohosts ?? []);
  return result;
}

/**
 * Loads one page of a conversation's history, newest-anchored, for chat
 * infinite-scroll. Newer messages stay in the snapshot/realtime stream; this
 * only fills in older pages that fell off the bounded `direct_messages` pull.
 */
export async function fetchMessagesForConversation(
  conversationId: string,
  opts: { beforeCreatedAt?: string; limit?: number } = {},
): Promise<DirectMessage[]> {
  const { beforeCreatedAt, limit = 50 } = opts;
  let q = supabase
    .from('direct_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeCreatedAt) q = q.lt('created_at', beforeCreatedAt);

  const { data } = await q;
  const profilesRes = await supabase.from('profiles').select('id, full_name');
  return mapMessages(data ?? [], userNameLookup(profilesRes.data ?? []));
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
  /**
   * Returns the allocation rejection instead of reporting it as a write error:
   * migration 0041's trigger raises `club_allocation_exceeded` when a club is
   * out of slots, which is an expected outcome to show the user, not a fault to
   * surface in the write-failure banner.
   */
  insertParticipant: async (p: EventParticipant): Promise<{ ok: boolean; allocationError?: string }> => {
    const { error } = await supabase
      .from('event_participants')
      .upsert(p, { onConflict: 'event_id,user_id' });
    if (error?.message?.includes('club_allocation_exceeded')) {
      return { ok: false, allocationError: error.message.split('club_allocation_exceeded:').pop()?.trim() };
    }
    reportError('insertParticipant', error);
    return { ok: !error };
  },
  setClubAllocation: async (eventId: string, clubId: string, slots: number) => {
    const { data, error } = await supabase.rpc('set_club_allocation', {
      p_event_id: eventId, p_club_id: clubId, p_slots: slots,
    });
    reportError('setClubAllocation', error);
    return error ? null : (data as EventClubAllocation | null);
  },
  releaseClubAllocations: async (eventId: string) => {
    const { error } = await supabase.rpc('release_club_allocations', { p_event_id: eventId });
    reportError('releaseClubAllocations', error);
    return !error;
  },

  // ---- Cohosting (migration 0043) --------------------------------------
  // The RPCs raise on domain problems (deadline passed, cohost cap hit,
  // wrong club role, etc.). We surface those errors back to the caller as
  // {ok:false, error} rather than reporting them to the write-failure banner,
  // because they are expected outcomes the UI needs to explain.
  requestCohost: async (
    eventId: string, expectedParticipants: number, message?: string,
  ): Promise<{ ok: boolean; row?: EventCohost; error?: string }> => {
    const { data, error } = await supabase.rpc('request_cohost', {
      p_event_id: eventId,
      p_expected_participants: expectedParticipants,
      p_message: message ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as EventCohost };
  },
  reviewCohost: async (
    cohostId: string, action: 'APPROVE' | 'REJECT', notes?: string,
  ): Promise<{ ok: boolean; row?: EventCohost; error?: string }> => {
    const { data, error } = await supabase.rpc('review_cohost', {
      p_cohost_id: cohostId, p_action: action, p_notes: notes ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as EventCohost };
  },
  submitCohostPayment: async (
    cohostId: string, method: string, reference?: string, receiptPath?: string,
  ): Promise<{ ok: boolean; row?: EventCohost; error?: string }> => {
    const { data, error } = await supabase.rpc('submit_cohost_payment', {
      p_cohost_id: cohostId, p_method: method,
      p_reference: reference ?? null, p_receipt_path: receiptPath ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as EventCohost };
  },
  verifyCohostPayment: async (
    cohostId: string, action: 'VERIFY' | 'REJECT', notes?: string,
  ): Promise<{ ok: boolean; row?: EventCohost; error?: string }> => {
    const { data, error } = await supabase.rpc('verify_cohost_payment', {
      p_cohost_id: cohostId, p_action: action, p_notes: notes ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as EventCohost };
  },
  cancelCohost: async (
    cohostId: string, reason?: string,
  ): Promise<{ ok: boolean; row?: EventCohost; error?: string }> => {
    const { data, error } = await supabase.rpc('cancel_cohost', {
      p_cohost_id: cohostId, p_reason: reason ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as EventCohost };
  },
  updateParticipant: async (id: string, updates: Partial<EventParticipant>): Promise<boolean> => {
    // Try direct table update first
    const { error, data } = await supabase.from('event_participants').update(updates).eq('id', id).select('id');
    if (!error && data && data.length > 0) {
      return true;
    }

    // If direct update had RLS restrictions, try secure RPC function
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_event_attendance', {
        p_participant_id: id,
        p_attendance_status: updates.attendance_status ?? null,
        p_checked_in_at: updates.checked_in_at ?? null,
        p_check_in_lat: updates.check_in_latitude ?? null,
        p_check_in_lng: updates.check_in_longitude ?? null,
        p_check_in_dist: updates.check_in_distance_m ?? null,
        p_check_in_method: updates.check_in_method ?? null,
        p_checked_out_at: updates.checked_out_at ?? null,
        p_check_out_lat: updates.check_out_latitude ?? null,
        p_check_out_lng: updates.check_out_longitude ?? null,
        p_check_out_dist: updates.check_out_distance_m ?? null,
        p_check_out_method: updates.check_out_method ?? null,
      });
      if (!rpcErr && (rpcRes as any)?.success) {
        return true;
      }
    } catch {}

    // Fallback: If enum 'ORGANIZER_QR' failed on legacy DB schema, retry with 'ORGANIZER'
    if (updates.check_in_method === 'ORGANIZER_QR') {
      const fallbackUpdates = { ...updates, check_in_method: 'ORGANIZER' as const };
      const { error: fbErr, data: fbData } = await supabase.from('event_participants').update(fallbackUpdates).eq('id', id).select('id');
      if (!fbErr && fbData && fbData.length > 0) {
        return true;
      }
    }

    reportError('updateParticipant', error);
    return false;
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
  deleteAllNotifications: async (userId: string) => {
    reportError('deleteAllNotifications', (await supabase.from('notifications').delete().eq('user_id', userId)).error);
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
