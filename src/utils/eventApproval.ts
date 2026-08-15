import type { AppUser, RotaractEvent, EventParticipant } from '../types';

/**
 * Clubs whose Presidents must sign off before a pending event can be published.
 *
 * Every club with skin in the game is included: the organizing club, the club of
 * each co-organizer, and any partner club listed on the event. District events are
 * approved by the District Administrator instead, so they have no club approvers.
 */
export function approverClubIdsFor(event: RotaractEvent, users: AppUser[]): string[] {
  if (event.event_type === 'DISTRICT_EVENT') return [];

  const ids = new Set<string>([event.organizing_club_id, ...event.participating_club_ids]);
  for (const uid of event.co_organizer_user_ids ?? []) {
    const clubId = users.find(u => u.id === uid)?.club_id;
    if (clubId) ids.add(clubId);
  }
  return [...ids];
}

/** Approver clubs that have not signed off yet. */
export function pendingApproverClubIdsFor(event: RotaractEvent, users: AppUser[]): string[] {
  const approved = event.approved_by_club_ids ?? [];
  return approverClubIdsFor(event, users).filter(id => !approved.includes(id));
}

export function isDistrictAdmin(user: AppUser | null | undefined): boolean {
  return user?.role === 'DISTRICT_ADMIN' || user?.role === 'APP_ADMIN';
}

/** True once every involved club's President has approved. */
export function isFullyApproved(event: RotaractEvent, users: AppUser[]): boolean {
  return pendingApproverClubIdsFor(event, users).length === 0;
}

/**
 * Whether this user still owes an approval decision on this event.
 * A President who already approved cannot approve twice.
 */
export function canApproveEvent(event: RotaractEvent, user: AppUser | null | undefined, users: AppUser[]): boolean {
  if (!user || event.status !== 'PENDING_APPROVAL') return false;
  if (event.event_type === 'DISTRICT_EVENT') return isDistrictAdmin(user);
  if (user.role !== 'CLUB_PRESIDENT') return false;
  return pendingApproverClubIdsFor(event, users).includes(user.club_id);
}

/** The organizer plus any co-organizers — the people running the event. */
export function isOnOrganizingTeam(event: RotaractEvent, user: AppUser | null | undefined): boolean {
  if (!user) return false;
  return event.organizer_user_id === user.id || (event.co_organizer_user_ids ?? []).includes(user.id);
}

/**
 * Visibility gate for events.
 *
 * - Drafts are visible ONLY to the organizing team.
 * - Pending approval events are visible ONLY to the organizing team, approver Presidents, and Admins.
 * - Cancelled events stay visible to everyone. A cancellation is public information:
 *   invitees, applicants whose request was still pending, and anyone who had the event
 *   saved must be able to open it and read the reason instead of hitting a dead end.
 * - Published / active / completed events are visible to all users.
 */
export function canViewEvent(
  event: RotaractEvent,
  user: AppUser | null | undefined,
  users: AppUser[],
  participants: EventParticipant[] = [],
): boolean {
  if (!user) {
    return event.status !== 'PENDING_APPROVAL' && event.status !== 'DRAFT';
  }

  if (isOnOrganizingTeam(event, user)) return true;
  if (isDistrictAdmin(user)) return true;
  if (event.status === 'DRAFT') return false;

  if (event.status === 'PENDING_APPROVAL') {
    if (event.event_type === 'DISTRICT_EVENT') return false;
    return user.role === 'CLUB_PRESIDENT' && approverClubIdsFor(event, users).includes(user.club_id);
  }

  return true;
}

/** Convenience filter for list screens. */
export function visibleEvents(
  events: RotaractEvent[],
  user: AppUser | null | undefined,
  users: AppUser[],
  participants: EventParticipant[] = [],
): RotaractEvent[] {
  return events.filter(e => canViewEvent(e, user, users, participants));
}
