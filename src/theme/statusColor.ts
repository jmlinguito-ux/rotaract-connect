import { EventStatus } from '../types';
import { colors } from './colors';

const STATUS_COLOR: Record<EventStatus, string> = {
  DRAFT: colors.textMuted,
  PENDING_APPROVAL: colors.warning,
  PUBLISHED: colors.info,
  SCHEDULED: colors.statusScheduled,
  RECRUITING: colors.statusRecruiting,
  ONGOING: colors.statusOngoing,
  COMPLETED: colors.statusCompleted,
  CANCELLED: colors.statusCancelled,
};

export function statusColor(status: EventStatus): string {
  return STATUS_COLOR[status];
}
