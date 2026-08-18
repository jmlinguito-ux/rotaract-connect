/**
 * Concise, human-readable relative timestamps for notification/message rows and
 * banners:
 *   Now            — under a minute old
 *   5m ago         — within the last hour
 *   2h ago         — earlier the same calendar day
 *   Yesterday      — the previous calendar day
 *   Mon 14         — earlier this year
 *   Jan 3, 2024    — older than this year
 * A single implementation keeps the Inbox and the push/in-app banners consistent.
 */
export function relativeTime(input: string | number | Date, now: Date = new Date()): string {
  const then = input instanceof Date ? input : new Date(input);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return '';

  const diff = now.getTime() - ms;
  if (diff < 0) return 'Now'; // clock skew / optimistic future timestamps

  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Now';
  if (min < 60) return `${min}m ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfThen) / 86400000);

  if (dayDiff <= 0) {
    // Same calendar day.
    const hrs = Math.floor(diff / 3600000);
    return `${Math.max(1, hrs)}h ago`;
  }
  if (dayDiff === 1) return 'Yesterday';

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}
