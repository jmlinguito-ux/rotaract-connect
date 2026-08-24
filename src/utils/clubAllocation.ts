import { AppUser, EventClubAllocation, EventParticipant, RotaractEvent } from '../types';

/**
 * Club participant allocation.
 *
 * This mirrors `club_allocation_remaining()` in migration 0041 — the database
 * is what actually enforces the rule, this is what lets the UI explain it and
 * disable the button first. If you change one, change both.
 */

/** A participant in one of these states is holding a seat. */
const HOLDS_SEAT: EventParticipant['status'][] = ['JOINED', 'PENDING'];

export interface ClubAllocationRow {
  club_id: string;
  /** Ceiling for this club (explicit row, else the event default). */
  allocated: number;
  /** Seats this club is already holding. */
  used: number;
  /** Slots still reserved and unused for this club. */
  remaining: number;
}

export interface AllocationState {
  mode: NonNullable<RotaractEvent['allocation_mode']>;
  /** True once unused slots have returned to the general pool. */
  released: boolean;
  /** Total seats the event can hold. 0 means unlimited. */
  capacity: number;
  /** Seats taken across every club. */
  taken: number;
  /** Unused slots still held back for clubs (0 when released or mode NONE). */
  reserved: number;
  /** Seats anyone may take right now. */
  generalAvailable: number;
  perClub: ClubAllocationRow[];
}

/** Seats held by everyone, regardless of club. */
function seatsTaken(participants: EventParticipant[], eventId: string): number {
  return participants.filter(p => p.event_id === eventId && HOLDS_SEAT.includes(p.status)).length;
}

/** Seats held by members of one club. */
function seatsTakenByClub(
  participants: EventParticipant[],
  users: AppUser[],
  eventId: string,
  clubId: string,
): number {
  return participants.filter(p => {
    if (p.event_id !== eventId || !HOLDS_SEAT.includes(p.status)) return false;
    return users.find(u => u.id === p.user_id)?.club_id === clubId;
  }).length;
}

/**
 * Whether unused slots have gone back to the general pool — either because the
 * organizer released early, or because the deadline has passed. Deriving it
 * from the timestamp means the rule is right the moment the deadline hits,
 * without depending on a scheduled job having run.
 */
export function allocationsReleased(event: RotaractEvent, now: Date = new Date()): boolean {
  if (event.allocation_released_at) return true;
  if (!event.allocation_release_at) return false;
  return now.getTime() >= new Date(event.allocation_release_at).getTime();
}

/** The ceiling for one club: its explicit row, else the event-wide default. */
export function allocatedSlotsFor(
  event: RotaractEvent,
  allocations: EventClubAllocation[],
  clubId: string,
): number {
  const row = allocations.find(a => a.event_id === event.id && a.club_id === clubId);
  if (row) return row.allocated_slots;
  return event.default_club_allocation ?? 0;
}

/**
 * Full picture of how an event's capacity is currently divided.
 * `clubIds` should cover every club that has an allocation or a participant.
 */
export function allocationState(
  event: RotaractEvent,
  allocations: EventClubAllocation[],
  participants: EventParticipant[],
  users: AppUser[],
  now: Date = new Date(),
): AllocationState {
  const mode = event.allocation_mode ?? 'NONE';
  const released = allocationsReleased(event, now);
  const capacity = event.max_participants ?? 0;
  const taken = seatsTaken(participants, event.id);

  const clubIds = new Set<string>();
  allocations.filter(a => a.event_id === event.id).forEach(a => clubIds.add(a.club_id));
  participants
    .filter(p => p.event_id === event.id && HOLDS_SEAT.includes(p.status))
    .forEach(p => {
      const club = users.find(u => u.id === p.user_id)?.club_id;
      if (club) clubIds.add(club);
    });

  const perClub: ClubAllocationRow[] = [...clubIds].map(club_id => {
    const allocated = allocatedSlotsFor(event, allocations, club_id);
    const used = seatsTakenByClub(participants, users, event.id, club_id);
    return { club_id, allocated, used, remaining: Math.max(allocated - used, 0) };
  });

  // Once released, nothing is held back any more.
  const reserved =
    mode === 'NONE' || released
      ? 0
      : perClub.reduce((sum, r) => sum + r.remaining, 0);

  const generalAvailable = capacity > 0 ? Math.max(capacity - taken - reserved, 0) : Number.MAX_SAFE_INTEGER;

  return { mode, released, capacity, taken, reserved, generalAvailable, perClub };
}

/**
 * The organizer and co-organizers are seated automatically when the event is
 * created, so they are never charged against their club's allocation — see the
 * matching exemption in `enforce_club_allocation()` (migration 0041).
 */
export function isOrganizingTeam(event: RotaractEvent, userId: string): boolean {
  return event.organizer_user_id === userId || (event.co_organizer_user_ids ?? []).includes(userId);
}

export interface AllocationVerdict {
  allowed: boolean;
  /** Why not — safe to show to the user. */
  reason?: string;
}

/**
 * Whether one more member of `clubId` may take a seat right now.
 *
 * SOFT lets a club spend its own reserved slot first and otherwise only draw on
 * genuinely unreserved capacity, so other clubs' untouched slots stay protected
 * until the release deadline. HARD never looks past the club's own ceiling.
 */
export function canClubRegister(
  event: RotaractEvent,
  allocations: EventClubAllocation[],
  participants: EventParticipant[],
  users: AppUser[],
  clubId: string,
  now: Date = new Date(),
  /** Exempt the organizing team — see `isOrganizingTeam` below. */
  userId?: string,
): AllocationVerdict {
  if (userId && isOrganizingTeam(event, userId)) return { allowed: true };

  const state = allocationState(event, allocations, participants, users, now);

  if (state.capacity > 0 && state.taken >= state.capacity) {
    return { allowed: false, reason: 'Event is at full capacity' };
  }
  if (state.mode === 'NONE') return { allowed: true };

  const allocated = allocatedSlotsFor(event, allocations, clubId);
  const used = seatsTakenByClub(participants, users, event.id, clubId);
  const clubRemaining = Math.max(allocated - used, 0);

  if (state.mode === 'HARD') {
    if (clubRemaining > 0) return { allowed: true };
    return {
      allowed: false,
      reason: `Your club has used all ${allocated} of its allocated slots`,
    };
  }

  // SOFT
  if (clubRemaining > 0) return { allowed: true };

  // This club contributes nothing to `reserved` here (its remaining is 0), so
  // generalAvailable is exactly the capacity no club has reserved.
  if (state.generalAvailable > 0) return { allowed: true };

  return {
    allowed: false,
    reason: state.released
      ? 'Event is at full capacity'
      : 'Your club has used its allocated slots. Unused slots from other clubs are released later.',
  };
}

/** Human summary for the organizer's allocation screen. */
export function describeAllocationMode(mode: RotaractEvent['allocation_mode']): string {
  switch (mode) {
    case 'SOFT':
      return 'Each club holds slots; unused ones are released to everyone at the deadline.';
    case 'HARD':
      return 'Each club is capped at its allocation and can never exceed it.';
    default:
      return 'No reservation — anyone can register until the event is full.';
  }
}
