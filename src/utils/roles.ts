import { UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  MEMBER: 'Member',
  CLUB_PRESIDENT: 'Club President',
  DISTRICT_ADMIN: 'District Admin',
  APP_ADMIN: 'App Admin',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  MEMBER: 'Joins events and records personal service hours.',
  CLUB_PRESIDENT: 'Validates club member applications and approves club events.',
  DISTRICT_ADMIN: 'Approves district events and President applications.',
  APP_ADMIN: 'Full access, including assigning roles to any user.',
};

/** Order shown in role pickers: least to most privileged. */
export const ASSIGNABLE_ROLES: UserRole[] = ['MEMBER', 'CLUB_PRESIDENT', 'DISTRICT_ADMIN', 'APP_ADMIN'];

export type RoleBadge = {
  /** `rotary` draws the Rotary wheel asset; `ionicons` takes a glyph name. */
  family: 'ionicons' | 'rotary';
  icon?: string;
  color: string;
  label: string;
};

/**
 * The badge pinned over a user's avatar. Only these three roles carry one;
 * ordinary members get no avatar badge (their verified state shows as a check
 * beside their name instead).
 */
export const ROLE_BADGES: Partial<Record<UserRole, RoleBadge>> = {
  APP_ADMIN: { family: 'ionicons', icon: 'key-sharp', color: '#F59E0B', label: 'App Admin' },
  DISTRICT_ADMIN: { family: 'rotary', color: '#3B82F6', label: 'District Admin' },
  CLUB_PRESIDENT: { family: 'ionicons', icon: 'star', color: '#D41367', label: 'Club President' },
};

export const isAdminRole = (role: UserRole) => role === 'APP_ADMIN' || role === 'DISTRICT_ADMIN';

/**
 * A one-line "title • role" subtitle that never repeats itself. A Club President
 * whose club title is literally "President" should read "Club President", not
 * "President • Club President"; a plain member's role adds nothing to their club
 * title, so it is dropped. The role is only spelled out separately when it says
 * something the club position doesn't (e.g. a Secretary who is a District Admin).
 */
export function positionRoleLabel(position: string, role: UserRole): string {
  const title = position.trim();
  const roleLabel = ROLE_LABELS[role];

  if (role === 'MEMBER') return title || roleLabel;
  if (!title) return roleLabel;

  const t = title.toLowerCase();
  const r = roleLabel.toLowerCase();
  if (t === r || r.includes(t)) return roleLabel;
  if (t.includes(r)) return title;
  return `${title} • ${roleLabel}`;
}
