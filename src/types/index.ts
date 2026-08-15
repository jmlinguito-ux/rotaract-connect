export type VerificationStatus =
  | 'PENDING'
  | 'AWAITING_CLUB_VALIDATION'
  | 'CLUB_VALIDATED'
  | 'AWAITING_DISTRICT_VALIDATION'
  | 'AWAITING_ADMIN_VERIFICATION'
  | 'NEEDS_INFORMATION'
  | 'REJECTED'
  | 'VERIFIED'
  | 'SUSPENDED';

export type UserRole = 'MEMBER' | 'CLUB_PRESIDENT' | 'DISTRICT_ADMIN' | 'APP_ADMIN';

export type EventType = 'SERVICE_PROJECT' | 'FELLOWSHIP' | 'DISTRICT_EVENT';

export type EventStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'PUBLISHED'
  | 'RECRUITING'
  | 'SCHEDULED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED';

export type EventVisibility = 'VERIFIED_ROTARACTORS' | 'CLUB_ONLY' | 'INVITATION_ONLY';

/** Rotary's areas of focus. Applies to service projects. */
export type AreaOfFocus =
  | 'PEACEBUILDING'
  | 'DISEASE_PREVENTION'
  | 'WATER_SANITATION'
  | 'MATERNAL_CHILD_HEALTH'
  | 'EDUCATION_LITERACY'
  | 'COMMUNITY_DEVELOPMENT'
  | 'ENVIRONMENT';

export type ParticipationStatus = 'PENDING' | 'JOINED' | 'CANCELLED';
export type AttendanceStatus = 'NOT_MARKED' | 'ATTENDED' | 'ABSENT';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface Zone {
  id: string;
  zone_number: number;
  zone_name: string;
}

export interface Club {
  id: string;
  club_name: string;
  club_code: string;
  zone_id: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
  description: string;
  member_count: number;
  president_id: string;
  president_name: string;
}

export interface RotaractEvent {
  id: string;
  title: string;
  description: string;
  event_type: EventType;
  status: EventStatus;
  start_datetime: string;
  end_datetime: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  organizing_club_id: string;
  organizing_club_name: string;
  organizer_user_id: string;
  co_organizer_user_ids?: string[];
  participating_club_ids: string[];
  max_participants: number;
  requires_approval: boolean;
  allow_participant_invites: boolean;
  visibility: EventVisibility;
  cover_photo?: string;
  contact_number?: string;
  contact_email?: string;
  /** Service projects only; fellowships leave this empty. */
  areas_of_focus?: AreaOfFocus[];
  /** Cutoff window in hours before start_datetime when participants can no longer leave the event. Default: 24. */
  lock_leave_cutoff_hours?: number;
  /**
   * Clubs whose President has already approved this event while it is PENDING_APPROVAL.
   * The event only publishes once every involved club has signed off — see
   * `approverClubIdsFor` in utils/eventApproval.
   */
  approved_by_club_ids?: string[];
  /** Optional reason provided when the event is cancelled. */
  cancellation_reason?: string;
}

export interface AppUser {
  id: string;
  full_name: string;
  email: string;
  username: string;
  club_id: string;
  club_name: string;
  position: string;
  role: UserRole;
  verification_status: VerificationStatus;
  avatar_url?: string;
  contact_number?: string;
  proof_url?: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  status: ParticipationStatus;
  attendance_status: AttendanceStatus;
  joined_at: string;
  /** Set once the participant checks in on-site; absent until then. */
  checked_in_at?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  /** Distance from the venue at check-in, kept as an audit trail. */
  check_in_distance_m?: number;
  /** Who produced the check-in record: the attendee's own GPS check-in, or the organizer manually (no GPS proof). */
  check_in_method?: 'SELF_GPS' | 'ORGANIZER';
}

export interface EventInvitation {
  id: string;
  event_id: string;
  invited_user_id: string;
  invited_by_user_id: string;
  status: InvitationStatus;
  sent_at: string;
  /** Optional note the invitee leaves when declining. */
  decline_reason?: string;
}

export interface EventImpact {
  event_id: string;
  volunteer_hours: number;
  beneficiaries: number;
  funds_raised: number;
  items_distributed: number;
  trees_planted: number;
  impact_summary: string;
}

export interface VerificationApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  club_id: string;
  club_name: string;
  member_id: string;
  position: string;
  status: VerificationStatus;
  submitted_at: string;
  notes: string;
  proof_url?: string;
}

export interface AuditLog {
  id: string;
  application_id: string;
  action: string;
  performed_by_name: string;
  performed_by_role: UserRole;
  previous_status: VerificationStatus;
  new_status: VerificationStatus;
  notes: string;
  created_at: string;
}

export type NotificationKind =
  | 'VERIFICATION_UPDATE'
  | 'ROLE_ASSIGNED'
  | 'INVITATION_RECEIVED'
  | 'INVITATION_RESPONSE'
  | 'JOIN_REQUEST'
  | 'JOIN_APPROVED'
  | 'EVENT_REMINDER'
  | 'EVENT_UPDATE'
  | 'EVENT_APPROVAL_REQUEST'
  | 'EVENT_APPROVED'
  | 'MEMBERSHIP_REQUEST'
  | 'INQUIRY_RECEIVED';

export interface AppNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  event_id?: string;
  application_id?: string;
  conversation_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  event_id?: string;
  sender_id: string;
  sender_name: string;
  /** Absent (NULL in the DB) for event group-chat messages, which reach every JOINED participant. */
  receiver_id?: string;
  receiver_name: string;
  text: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  event_id?: string;
  event_title?: string;
  is_group?: boolean;
  /** NULL for event group chats — membership comes from the event's JOINED participants. */
  participant_user_id?: string;
  participant_name: string;
  organizer_user_id: string;
  organizer_name: string;
  last_message: string;
  last_message_at: string;
}
