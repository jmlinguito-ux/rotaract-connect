import { UserRole, SystemRole, ClubRole, AppUser } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  MEMBER: 'Member',
  CLUB_PRESIDENT: 'Club President',
  DISTRICT_ADMIN: 'District Admin',
  APP_ADMIN: 'App Admin',
};

export const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  APP_ADMIN: 'App Admin',
  DISTRICT_ADMIN: 'District Admin',
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
  DISTRICT_ADMIN: 'Approves district events and President applications.',
  APP_ADMIN: 'Full access, including assigning roles to any user.',
};

/** Order shown in role pickers: least to most privileged. */
export const ASSIGNABLE_ROLES: UserRole[] = ['MEMBER', 'CLUB_PRESIDENT', 'DISTRICT_ADMIN', 'APP_ADMIN'];
export const ASSIGNABLE_SYSTEM_ROLES: SystemRole[] = ['NONE', 'DISTRICT_ADMIN', 'APP_ADMIN'];
export const ASSIGNABLE_CLUB_ROLES: ClubRole[] = ['MEMBER', 'OFFICER', 'CLUB_PRESIDENT'];

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
export const ROLE_BADGES: Record<'APP_ADMIN' | 'DISTRICT_ADMIN' | 'CLUB_PRESIDENT', RoleBadge> = {
  APP_ADMIN: { family: 'ionicons', icon: 'key-sharp', color: '#F59E0B', label: 'App Admin' },
  DISTRICT_ADMIN: { family: 'rotary', color: '#3B82F6', label: 'District Admin' },
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
  const officerKeywords = ['vice president', 'vp', 'secretary', 'treasurer', 'director', 'officer', 'chair', 'auditor', 'pro', 'sergeant'];
  if (officerKeywords.some(kw => pos.includes(kw))) {
    return 'OFFICER';
  }
  return 'MEMBER';
}

/** App Admins have global system administrative authority */
export function isAppAdmin(user: Partial<AppUser> | null | undefined): boolean {
  return getSystemRole(user) === 'APP_ADMIN';
}

/** District Admins have district governance authority (App Admins inherit this) */
export function isDistrictAdmin(user: Partial<AppUser> | null | undefined): boolean {
  const sys = getSystemRole(user);
  return sys === 'DISTRICT_ADMIN' || sys === 'APP_ADMIN';
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
  if (isDistrictAdmin(user)) return ROLE_BADGES.DISTRICT_ADMIN;
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

  // Club-only roles
  if (clubRole === 'CLUB_PRESIDENT') {
    if (!posTitle || posTitle.toLowerCase() === 'president') {
      return 'Club President';
    }
    return posTitle;
  }

  return posTitle || 'Member';
}
