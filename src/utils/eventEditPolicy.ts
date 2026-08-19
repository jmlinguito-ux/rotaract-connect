import type { AppUser, EventParticipant, RotaractEvent } from '../types';
import { approverClubIdsFor, isOnOrganizingTeam } from './eventApproval';
import { isDistrictAdmin, isClubPresident } from './roles';

/** Fields that can be frozen while the rest of the event stays editable. */
export interface LockedFields {
  schedule?: string;
  location?: string;
  requiresApproval?: string;
  maxParticipants?: string;
}

export interface EventEditPolicy {
  /** False when the event cannot be edited at all; `blockedReason` says why. */
  canEdit: boolean;
  blockedReason?: string;
  /** Reason strings for individual fields that stay locked on an otherwise editable event. */
  lockedFields: LockedFields;
  /** max_participants can never drop below the number already joined. */
  minParticipants: number;
  /** Recorded club approvals a material edit would clear. 0 when nothing is at stake. */
  approvalsAtRisk: number;
}

/**
 * Plain-language version of the edit rules, shown before an organizer commits an
 * event and before a President approves one. Lives beside `eventEditPolicy` so the
 * warnings and the enforcement stay in step.
 */
export function editLockRulesForSubmit(cutoffHours: number, needsApproval: boolean): string[] {
  const rules = [
    `Schedule and venue freeze ${cutoffHours} hours before the start time, once members can no longer leave.`,
    'Schedule and venue also freeze as soon as any attendance or check-in is recorded.',
    'Capacity can never be lowered below the number of members who have already joined.',
    'The "requires approval to join" setting locks once the first member joins.',
    'Nothing can be edited at all once the event is ongoing, completed, or cancelled.',
  ];

  if (needsApproval) {
    rules.unshift(
      'After a club President approves, changing the venue, team, capacity, visibility or event type clears every approval and sends it back to all Presidents.',
    );
  }

  return rules;
}

export function editLockRulesForApproval(isDistrictEvent: boolean, willPublish: boolean): string[] {
  return [
    willPublish
      ? 'Approving publishes this event immediately — members can see and join it.'
      : 'Your approval is recorded now; the event publishes once the remaining club Presidents approve.',
    'Only the organizing team, their own Club President, and District Administrators can change the details afterwards.',
    'If they change the venue, team, capacity, visibility or event type, your approval is cleared and you will be asked to review it again.',
    'Schedule and venue freeze before the start time and once attendance is recorded.',
    'Once the event is ongoing, completed, or cancelled, nobody can edit it.',
    ...(isDistrictEvent
      ? ['As a District Event, only a District Administrator can change it after this approval.']
      : []),
  ];
}

/**
 * Changes significant enough to invalidate approvals already given by club Presidents.
 * Cosmetic edits (title, description, cover photo, contacts) are deliberately excluded.
 */
export function isMaterialChange(before: RotaractEvent, after: Partial<RotaractEvent>): boolean {
  const changed = (key: keyof RotaractEvent) =>
    after[key] !== undefined && JSON.stringify(after[key]) !== JSON.stringify(before[key]);

  return (
    changed('start_datetime') ||
    changed('end_datetime') ||
    changed('latitude') ||
    changed('longitude') ||
    changed('address') ||
    changed('city') ||
    changed('event_type') ||
    changed('visibility') ||
    changed('max_participants') ||
    changed('co_organizer_user_ids')
  );
}

/**
 * Single source of truth for when event details may be changed, and why not.
 *
 * Hard locks: cancelled, completed, in-progress, and callers without the right role.
 * Field locks: schedule and venue freeze once participants can no longer withdraw or
 * once attendance exists; join rules freeze once anyone has joined.
 */
export function eventEditPolicy(
  event: RotaractEvent,
  user: AppUser | null | undefined,
  users: AppUser[],
  participants: EventParticipant[],
): EventEditPolicy {
  const joined = participants.filter(p => p.status === 'JOINED');
  const attendanceRecorded = participants.some(p => !!p.checked_in_at || p.attendance_status === 'ATTENDED');

  const base: EventEditPolicy = {
    canEdit: true,
    lockedFields: {},
    minParticipants: joined.length,
    approvalsAtRisk: 0,
  };

  const blocked = (blockedReason: string): EventEditPolicy => ({ ...base, canEdit: false, blockedReason });

  // --- Who may edit at all -------------------------------------------------
  if (!user) return blocked('You need to be signed in to edit this event.');

  const onTeam = isOnOrganizingTeam(event, user);
  const admin = isDistrictAdmin(user);
  const organizingClubPresident = isClubPresident(user, event.organizing_club_id);

  // Presidents of partner or co-organizing clubs approve events; they do not edit them.
  if (!onTeam && !admin && !organizingClubPresident) {
    const isApproverPresident =
      isClubPresident(user) && approverClubIdsFor(event, users).includes(user.club_id);
    return blocked(
      isApproverPresident
        ? 'Your club is an approver on this event, not its organizer. Only the organizing team, their Club President, and District Administrators can change the details.'
        : 'Only the organizing team, their Club President, and District Administrators can edit this event.',
    );
  }

  // A District Event that already cleared District Admin review must not be reworked
  // by a Club President afterwards — that would sidestep the approval it was granted.
  const districtEventApproved =
    event.event_type === 'DISTRICT_EVENT' && event.status !== 'DRAFT' && event.status !== 'PENDING_APPROVAL';
  if (districtEventApproved && !admin && !onTeam) {
    return blocked(
      'This District Event has already been approved by the District Administrator. Only a District Administrator can change it now.',
    );
  }

  // --- Lifecycle hard locks ------------------------------------------------
  if (event.status === 'COMPLETED') {
    return blocked(
      'Completed events cannot be edited because scoreboard points have already been calculated and released.',
    );
  }

  if (event.status === 'CANCELLED') {
    return blocked('This event was cancelled. Cancelled events are kept as a record and can no longer be edited.');
  }

  if (event.status === 'ONGOING') {
    return blocked(
      'This event is happening right now. Details are locked while attendees check in on-site, so their GPS verification stays valid.',
    );
  }

  // --- Field-level locks ---------------------------------------------------
  const lockedFields: LockedFields = {};

  if (attendanceRecorded) {
    const note = 'Schedule and venue are locked because attendance has already been recorded for this event.';
    lockedFields.schedule = note;
    lockedFields.location = note;
  } else {
    const cutoffHours = event.lock_leave_cutoff_hours ?? 24;
    const hoursUntilStart = (new Date(event.start_datetime).getTime() - Date.now()) / 3_600_000;
    if (hoursUntilStart <= cutoffHours) {
      const note = `Schedule and venue are locked because participants can no longer leave this event (leaving closes ${cutoffHours}h before it starts).`;
      lockedFields.schedule = note;
      lockedFields.location = note;
    }
  }

  if (joined.length > 0) {
    lockedFields.requiresApproval = `${joined.length} ${joined.length === 1 ? 'member has' : 'members have'} already joined under the current setting, so the join rule can no longer be changed.`;
    lockedFields.maxParticipants = `Cannot go below ${joined.length} — that many ${joined.length === 1 ? 'member has' : 'members have'} already joined.`;
  }

  // --- Approvals a material edit would invalidate ---------------------------
  const approvalsAtRisk =
    event.status === 'PENDING_APPROVAL'
      ? approverClubIdsFor(event, users).filter(id => (event.approved_by_club_ids ?? []).includes(id)).length
      : 0;

  return { ...base, lockedFields, approvalsAtRisk };
}
