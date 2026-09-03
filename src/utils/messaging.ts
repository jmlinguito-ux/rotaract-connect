import type { AppUser } from '../types';

/**
 * Whether `me` is allowed to message `target`.
 *
 * Mirrors the database rule in migrations 0022 and 0023 — the server is still the
 * authority, this exists so the app can refuse clearly instead of letting the write
 * be rejected and surfacing a generic "changes didn't save" banner (which is
 * bottom-anchored and hides behind the keyboard, so the user sees nothing at all).
 *
 * Keep the two in step: any change to the policy belongs here as well.
 */
export function canMessageUser(
  target: Pick<AppUser, 'id' | 'club_id' | 'allow_direct_inquiries'> | null | undefined,
  me: Pick<AppUser, 'id' | 'club_id' | 'role'> | null | undefined,
): boolean {
  if (!target || !me) return false;
  if (target.id === me.id) return true;
  if (target.allow_direct_inquiries !== false) return true;
  if (target.club_id === me.club_id) return true;
  return me.role === 'DISTRICT_ADMIN' || me.role === 'APP_ADMIN';
}

/** The notice shown when messaging is refused. */
export function inquiryBlockedMessage(targetName: string): string {
  return `${targetName} only accepts messages from members of their own club.`;
}
