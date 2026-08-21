import { UserRole, SystemRole, ClubRole, AppUser } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  MEMBER: 'Member',
  CLUB_PRESIDENT: 'Club President',
  DISTRICT_AREA_ADMIN: 'District Area Admin',
  DISTRICT_ADMIN: 'District Admin',
  APP_ADMIN: 'App Admin',
};

export const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  APP_ADMIN: 'App Admin',
  DISTRICT_ADMIN: 'District Admin',
  DISTRICT_AREA_ADMIN: 'District Area Admin',
  NONE: 'Standard Member',
};

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  CLUB_PRESIDENT: 'Club President',
  OFFICER: 'Club Officer',
  MEMBER: 'Club Member',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  MEMBER: 'Joins events and records personal service hours.',
  CLUB_PRESIDENT: 'Validates club member applications and approves club events.',
  DISTRICT_AREA_ADMIN: 'Same authority as a District Admin, limited to clubs in their own Zone. Cannot sign certificates.',
  DISTRICT_ADMIN: 'Approves district events and President applications.',
  APP_ADMIN: 'Full access, including assigning roles to any user.',
};

/** Order shown in role pickers: least to most privileged. */
export const ASSIGNABLE_ROLES: UserRole[] = ['MEMBER', 'CLUB_PRESIDENT', 'DISTRICT_AREA_ADMIN', 'DISTRICT_ADMIN', 'APP_ADMIN'];
export const ASSIGNABLE_SYSTEM_ROLES: SystemRole[] = ['NONE', 'DISTRICT_AREA_ADMIN', 'DISTRICT_ADMIN', 'APP_ADMIN'];
export const ASSIGNABLE_CLUB_ROLES: ClubRole[] = ['MEMBER', 'OFFICER', 'CLUB_PRESIDENT'];

/**
 * Canonical list of standard Rotaract club positions.
 * Used across Registration, Application Review, and Profile editing.
 */
export const ROTARACT_POSITIONS = [
  'President',
  'Vice President',
  'Secretary',
  'Treasurer',
  'Auditor',
  'Club Service Director',
  'Community Service Director',
  'International Service Director',
  'Professional Development Director',
  'Public Image Director',
  'Youth Service Director',
  'Member',
] as const;

export type RotaractPosition = (typeof ROTARACT_POSITIONS)[number];

/**
 * Maps a position title to its corresponding ClubRole.
 * "President" → CLUB_PRESIDENT, any Director/Officer title → OFFICER, otherwise MEMBER.
 */
export function getPositionClubRole(position: string): ClubRole {
  const p = position.toLowerCase().trim();
  if (p === 'president' || p === 'club president') return 'CLUB_PRESIDENT';
  const officerTitles = [
    'vice president', 'secretary', 'treasurer', 'auditor',
    'club service director', 'community service director',
    'international service director', 'professional development director',
    'public image director', 'youth service director',
  ];
  if (officerTitles.includes(p)) return 'OFFICER';
  // Fallback heuristic for non-standard titles
  const officerKeywords = ['vp', 'director', 'officer', 'chair', 'pro', 'sergeant'];
  if (officerKeywords.some(kw => p.includes(kw))) return 'OFFICER';
  return 'MEMBER';
}

export type RoleBadge = {
  /** `rotary` draws the Rotary wheel asset; `ionicons` takes a glyph name. */
  family: 'ionicons' | 'rotary';
  icon?: string;
  color: string;
  label: string;
};

/**
 * The badge pinned over a user's avatar. Ranked by authority:
 * App Admin (Key) > District Admin (Rotary Wheel) > Club President (Star)
 */
export const ROLE_BADGES: Record<'APP_ADMIN' | 'DISTRICT_ADMIN' | 'DISTRICT_AREA_ADMIN' | 'CLUB_PRESIDENT', RoleBadge> = {
  APP_ADMIN: { family: 'ionicons', icon: 'key-sharp', color: '#F59E0B', label: 'App Admin' },
  DISTRICT_ADMIN: { family: 'rotary', color: '#3B82F6', label: 'District Admin' },
  // Same wheel as a District Admin, in a distinct colour: same authority, narrower reach.
  DISTRICT_AREA_ADMIN: { family: 'rotary', color: '#8B5CF6', label: 'District Area Admin' },
  CLUB_PRESIDENT: { family: 'ionicons', icon: 'star', color: '#D41367', label: 'Club President' },
};

/**
 * Normalizes system administrative authority from explicit system_role or legacy fields.
 */
export function getSystemRole(user: Partial<AppUser> | null | undefined): SystemRole {
  if (!user) return 'NONE';
  if (user.system_role) return user.system_role;
  if (user.role === 'APP_ADMIN' || user.position?.toLowerCase().includes('app admin')) {
    return 'APP_ADMIN';
  }
  // Checked before DISTRICT_ADMIN: "district area admin" contains "district admin"
  // as a substring, so the looser test below would otherwise swallow it and silently
  // promote an area admin to full district authority.
  if (
    user.role === 'DISTRICT_AREA_ADMIN' ||
    user.position?.toLowerCase().includes('district area admin') ||
    user.position?.toLowerCase().includes('area admin')
  ) {
    return 'DISTRICT_AREA_ADMIN';
  }
  if (
    user.role === 'DISTRICT_ADMIN' ||
    user.position?.toLowerCase().includes('district admin') ||
    user.position?.toLowerCase().includes('district officer') ||
    user.position?.toLowerCase().includes('drr')
  ) {
    return 'DISTRICT_ADMIN';
  }
  return 'NONE';
}

/**
 * Normalizes club-level leadership role from explicit club_role or legacy fields.
 */
export function getClubRole(user: Partial<AppUser> | null | undefined): ClubRole {
  if (!user) return 'MEMBER';
  if (user.club_role) return user.club_role;
  if (user.role === 'CLUB_PRESIDENT' || user.position?.toLowerCase() === 'president' || user.position?.toLowerCase().includes('club president')) {
    return 'CLUB_PRESIDENT';
  }
  const pos = user.position?.toLowerCase() || '';
  const officerKeywords = [
    'vice president', 'vp', 'secretary', 'treasurer', 'director',
    'officer', 'chair', 'auditor', 'pro', 'sergeant',
    'club service', 'community service', 'international service',
    'professional development', 'public image', 'youth service',
  ];
  if (officerKeywords.some(kw => pos.includes(kw))) {
    return 'OFFICER';
  }
  return 'MEMBER';
}

/** App Admins have global system administrative authority */
export function isAppAdmin(user: Partial<AppUser> | null | undefined): boolean {
  return getSystemRole(user) === 'APP_ADMIN';
}

/**
 * District governance authority. District Area Admins are included: they are granted
 * every District Admin function, only narrowed to their own Zone.
 *
 * Anywhere the answer must be Zone-aware, pair this with `canGovernClub`. Anywhere
 * that represents the District as a whole (certificate signing), use
 * `isFullDistrictAdmin` instead.
 */
export function isDistrictAdmin(user: Partial<AppUser> | null | undefined): boolean {
  const sys = getSystemRole(user);
  return sys === 'DISTRICT_ADMIN' || sys === 'DISTRICT_AREA_ADMIN' || sys === 'APP_ADMIN';
}

/** District-wide authority, excluding Zone-scoped Area Admins. */
export function isFullDistrictAdmin(user: Partial<AppUser> | null | undefined): boolean {
  const sys = getSystemRole(user);
  return sys === 'DISTRICT_ADMIN' || sys === 'APP_ADMIN';
}

/** True only for the Zone-scoped variant. */
export function isDistrictAreaAdmin(user: Partial<AppUser> | null | undefined): boolean {
  return getSystemRole(user) === 'DISTRICT_AREA_ADMIN';
}

/**
 * The Zone an Area Admin governs, derived from their own club's zone_id.
 * Returns undefined for everyone else (their authority is not Zone-bound).
 */
export function adminZoneId(
  user: Partial<AppUser> | null | undefined,
  clubs: { id: string; zone_id?: string }[],
): string | undefined {
  if (!isDistrictAreaAdmin(user) || !user?.club_id) return undefined;
  return clubs.find(c => c.id === user.club_id)?.zone_id;
}

/**
 * Whether `user`'s district authority reaches `clubId`.
 *
 * True for full District/App Admins over every club. For an Area Admin, true only
 * when the club sits in the same Zone as their own. Fails CLOSED: an Area Admin
 * whose Zone cannot be resolved governs nothing, rather than everything.
 */
export function canGovernClub(
  user: Partial<AppUser> | null | undefined,
  clubId: string | null | undefined,
  clubs: { id: string; zone_id?: string }[],
): boolean {
  if (!isDistrictAdmin(user)) return false;
  if (!isDistrictAreaAdmin(user)) return true;
  const myZone = adminZoneId(user, clubs);
  if (!myZone || !clubId) return false;
  return clubs.find(c => c.id === clubId)?.zone_id === myZone;
}

/** Checks if a user is a Club President (optionally matching a specific club) */
export function isClubPresident(user: Partial<AppUser> | null | undefined, clubId?: string): boolean {
  if (!user) return false;
  const isPres = getClubRole(user) === 'CLUB_PRESIDENT';
  if (!isPres) return false;
  if (clubId && user.club_id && user.club_id !== clubId) return false;
  return true;
}

/** Checks if a user is a Club Officer or President (optionally matching a specific club) */
export function isClubOfficer(user: Partial<AppUser> | null | undefined, clubId?: string): boolean {
  if (!user) return false;
  const role = getClubRole(user);
  const isOff = role === 'OFFICER' || role === 'CLUB_PRESIDENT';
  if (!isOff) return false;
  if (clubId && user.club_id && user.club_id !== clubId) return false;
  return true;
}

export const isAdminRole = (role: UserRole | SystemRole) => role === 'APP_ADMIN' || role === 'DISTRICT_ADMIN';

/**
 * Returns the highest badge to display pinned on a user's avatar.
 */
export function getHighestRoleBadge(user: Partial<AppUser> | null | undefined): RoleBadge | undefined {
  if (!user) return undefined;
  if (isAppAdmin(user)) return ROLE_BADGES.APP_ADMIN;
  if (isFullDistrictAdmin(user)) return ROLE_BADGES.DISTRICT_ADMIN;
  if (isDistrictAreaAdmin(user)) return ROLE_BADGES.DISTRICT_AREA_ADMIN;
  if (isClubPresident(user)) return ROLE_BADGES.CLUB_PRESIDENT;
  return undefined;
}

/**
 * Generates a clean composite label such as:
 * - "President • Rotaract Club of Valenzuela (App Admin)"
 * - "Secretary • Rotaract Club of Caloocan (District Admin)"
 * - "Club President"
 * - "Member"
 */
export function positionRoleLabel(
  position: string,
  roleOrUser?: UserRole | Partial<AppUser>,
  optionalUser?: Partial<AppUser>,
): string {
  const targetUser: Partial<AppUser> =
    typeof roleOrUser === 'object'
      ? (roleOrUser as Partial<AppUser>)
      : optionalUser || { position, role: typeof roleOrUser === 'string' ? roleOrUser : 'MEMBER' };

  const posTitle = (targetUser.position || position || '').trim();
  const sysRole = getSystemRole(targetUser);
  const clubRole = getClubRole(targetUser);

  // If user has a System Role (App Admin or District Admin)
  if (sysRole === 'APP_ADMIN') {
    if (!posTitle || posTitle.toLowerCase() === 'app admin' || posTitle.toLowerCase() === 'member') {
      return 'App Admin';
    }
    return `${posTitle} (App Admin)`;
  }

  if (sysRole === 'DISTRICT_ADMIN') {
    if (!posTitle || posTitle.toLowerCase() === 'district admin' || posTitle.toLowerCase() === 'member') {
      return 'District Admin';
    }
    return `${posTitle} (District Admin)`;
  }

  if (sysRole === 'DISTRICT_AREA_ADMIN') {
    const generic = ['district area admin', 'area admin', 'member'];
    if (!posTitle || generic.includes(posTitle.toLowerCase())) {
      return 'District Area Admin';
    }
    return `${posTitle} (District Area Admin)`;
  }

  // Club-only roles
  if (clubRole === 'CLUB_PRESIDENT') {
    if (!posTitle || posTitle.toLowerCase() === 'president') {
      return 'Club President';
    }
    return posTitle;
  }

  return posTitle || 'Member';
}
