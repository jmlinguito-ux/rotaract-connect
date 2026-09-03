/**
 * Date and time formatting utilities.
 * Ensures consistent 12-hour AM/PM formatting across iOS, Android, and Web.
 */

/**
 * Formats a Date or date string into standard 12-hour time (e.g. "10:00 PM", "9:30 AM").
 */
export function formatTime(date: Date | string | number | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour should be 12
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
}

/**
 * Formats start and end times into a range (e.g. "10:00 AM — 2:00 PM").
 */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} — ${formatTime(end)}`;
}

/**
 * Formats a date into a clean readable format (e.g. "Saturday, September 19, 2026").
 */
export function formatDate(date: Date | string | number | null | undefined, options?: { short?: boolean }): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  if (options?.short) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
