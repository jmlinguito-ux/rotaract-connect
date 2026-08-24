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

export type UserRole = 'MEMBER' | 'CLUB_PRESIDENT' | 'DISTRICT_AREA_ADMIN' | 'DISTRICT_ADMIN' | 'APP_ADMIN';

export type SystemRole = 'APP_ADMIN' | 'DISTRICT_ADMIN' | 'DISTRICT_AREA_ADMIN' | 'NONE';
export type ClubRole = 'CLUB_PRESIDENT' | 'OFFICER' | 'MEMBER';

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

/**
 * How participant capacity is divided between clubs.
 * - NONE: first-come, first-served across the whole event.
 * - SOFT: each club holds slots; whatever is unused at the release deadline
 *   returns to the general pool for any club to take.
 * - HARD: a club may never exceed its allocation.
 */
export type AllocationMode = 'NONE' | 'SOFT' | 'HARD';

/** A club's reserved share of an event's participant capacity. */
export interface EventClubAllocation {
  id: string;
  event_id: string;
  club_id: string;
  /** Current ceiling — organizers can raise this at any time. */
  allocated_slots: number;
  /** What was granted originally, so a later bump reads as a change. */
  initial_slots: number;
  created_at?: string;
  updated_at?: string;
}

/** Lifecycle of a cohosting request. */
export type CohostStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
/** Lifecycle of a cohost fee payment. */
export type CohostPaymentStatus = 'NONE' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

/**
 * A cohosting arrangement between one club and an event. Amounts are stored in
 * centavos to sidestep floating-point rounding — divide by 100 for display.
 */
export interface EventCohost {
  id: string;
  event_id: string;
  club_id: string;
  requested_by_user_id?: string;
  status: CohostStatus;
  expected_participants: number;
  /** Fee snapshot at time of request — protects the club if the organizer later changes the event's fee. */
  agreed_fee_centavos: number;
  message?: string;
  requested_at: string;
  reviewed_at?: string;
  reviewed_by_user_id?: string;
  review_notes?: string;
  payment_status: CohostPaymentStatus;
  payment_method?: string;
  payment_reference?: string;
  /** Object path in the private `cohost-receipts` bucket. Use `getSignedImageUrl` to view. */
  payment_receipt_path?: string;
  payment_submitted_at?: string;
  payment_verified_at?: string;
  payment_verified_by_user_id?: string;
  payment_review_notes?: string;
}

export type ParticipationStatus = 'PENDING' | 'JOINED' | 'CANCELLED';
export type AttendanceStatus = 'NOT_MARKED' | 'ATTENDED' | 'ABSENT';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface Zone {
  id: string;
  zone_number: number;
  zone_name: string;
}

export type ClubType = 'COMMUNITY_BASED' | 'INSTITUTION_BASED';

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
  club_type?: ClubType;
  institution_name?: string;
  email?: string;
  meeting_address?: string;
}

export interface EmergencyAlert {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  club_id: string;
  club_name: string;
  contact_number?: string;
  latitude: number;
  longitude: number;
  map_url: string;
  address_hint?: string;
  message?: string;
  created_at: string;
  status: 'ACTIVE' | 'RESOLVED' | 'CANCELLED';
  playSound?: boolean;
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
  /** Set when the organizer escalates a stalled approval; unlocks District Admin approval. */
  district_review_requested_at?: string;
  district_review_requested_by?: string;
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
  /** Custom geofence perimeter radius in meters for automatic check-in. Default: 300. */
  geofence_radius_meters?: number;
  /** How capacity is split between clubs. Defaults to 'NONE' (first-come). */
  allocation_mode?: AllocationMode;
  /** Slots each club gets when no explicit per-club row exists. */
  default_club_allocation?: number;
  /** When unused SOFT slots return to the general pool. Absent = never. */
  allocation_release_at?: string;
  /** Set only when the organizer released early, ahead of the deadline. */
  allocation_released_at?: string;
  /** Organizer has opened this event to cohosting clubs. */
  cohosting_enabled?: boolean;
  /** Cohost fee in centavos (PHP). 0 = free cohosting. */
  cohosting_fee_centavos?: number;
  /** Cap on approved+pending cohosts. Absent = unlimited. */
  cohosting_max_clubs?: number;
  cohosting_application_deadline?: string;
  /** When false, requests auto-approve on submission. */
  cohosting_requires_approval?: boolean;
  /** Free-text description of what the cohost gets for their fee. */
  cohosting_benefits?: string;
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
  system_role?: SystemRole;
  club_role?: ClubRole;
  verification_status: VerificationStatus;
  avatar_url?: string;
  signature_url?: string;
  contact_number?: string;
  proof_url?: string;
  /** Optional gender for certificates and formal document generation ('MALE', 'FEMALE', etc.) */
  gender?: 'MALE' | 'FEMALE' | string;
  /**
   * When false, only same-club members may START a new conversation with this
   * user. Lives on the profile rather than in local preferences because it governs
   * what OTHER people may do — a device-local flag could not enforce anything.
   */
  allow_direct_inquiries?: boolean;
  /**
   * Controls visibility of email and contact number across the directory.
   */
  contact_privacy?: 'ALL_VERIFIED' | 'MY_CLUB_ONLY' | 'ONLY_ME';
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
  /** Who produced the check-in record: the attendee's own GPS check-in, organizer manual override, or QR pass scan. */
  check_in_method?: 'SELF_GPS' | 'ORGANIZER' | 'ORGANIZER_QR';
  /** Set once the participant checks out (manual, QR scan, or auto-leave) */
  checked_out_at?: string;
  check_out_latitude?: number;
  check_out_longitude?: number;
  check_out_distance_m?: number;
  check_out_method?: 'SELF_GPS' | 'AUTO_PERIMETER_LEAVE' | 'EVENT_CONCLUDED' | 'ORGANIZER' | 'ORGANIZER_QR';
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
  application_id?: string;
  event_id?: string;
  target_user_id?: string;
  target_name?: string;
  action: string;
  category?: 'ROLE' | 'EVENT' | 'VERIFICATION' | 'ATTENDANCE' | 'SYSTEM';
  performed_by_name: string;
  performed_by_role: UserRole;
  previous_status?: string;
  new_status?: string;
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
  | 'INQUIRY_RECEIVED'
  | 'EMERGENCY_BROADCAST';

/** Organizer banner priority. HIGH triggers sound + vibration where the OS allows. */
export type NotificationPriority = 'NORMAL' | 'ALERT' | 'HIGH';

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
  /** Banner priority for organizer broadcasts; absent/`NORMAL` for routine notifications. */
  priority?: NotificationPriority;
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
  /** Object path in the private `chat-media` bucket when the message carries a photo. */
  attachment_path?: string;
  /** Attachment kind — currently only 'image'. */
  attachment_type?: string;
  /** Pre-calculated width and height of the image attachment to eliminate layout shifts. */
  attachment_width?: number;
  attachment_height?: number;
  /** Set when the message was unsent ("deleted for everyone") — render a tombstone. */
  deleted_at?: string;
  is_broadcast?: boolean;
  /**
   * Users @mentioned in this message, by ID. Stored as ids rather than parsed from
   * the text because display names are neither unique nor stable — the composer
   * resolves the id when the mention is inserted, and the server trusts only this.
   */
  mentioned_user_ids?: string[];
  /** Quoted/replied-to message metadata. */
  reply_to_message_id?: string;
  reply_to_sender_name?: string;
  reply_to_text?: string;
  /** Optimistic-send lifecycle for the composer; not persisted. */
  send_status?: 'sending' | 'sent' | 'failed';
}

/** Emoji reaction left on a message. */
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

/** Per-user read cursor for a conversation — powers read receipts. */
export interface ReadCursor {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  last_read_message_id?: string;
}

/**
 * Per-user inbox state for a conversation (pin / archive / delete-for-me). These
 * are the current user's own view only and never affect the other party — see
 * migration 0011. `deleted_at` soft-hides the thread; a newer message un-hides it.
 */
export interface ConversationState {
  conversation_id: string;
  user_id: string;
  pinned: boolean;
  archived: boolean;
  muted?: boolean;
  deleted_at?: string;
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
