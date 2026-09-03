import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventParticipant } from '../types';
import { db } from './db';

const OFFLINE_CHECKINS_KEY = '@rotaract:offline_checkins';

export interface QueuedCheckIn {
  participantId: string;
  updates: Partial<EventParticipant>;
  enqueuedAt: string;
}

/**
 * Enqueue an offline check-in record when a database update fails.
 */
export async function enqueueOfflineCheckIn(
  participantId: string,
  updates: Partial<EventParticipant>,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_CHECKINS_KEY);
    const list: QueuedCheckIn[] = raw ? JSON.parse(raw) : [];

    // Avoid duplicate queued updates for the same participant
    const filtered = list.filter(item => item.participantId !== participantId);
    filtered.push({
      participantId,
      updates,
      enqueuedAt: new Date().toISOString(),
    });

    await AsyncStorage.setItem(OFFLINE_CHECKINS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('[offlineQueue] failed to enqueue offline check-in', err);
  }
}

/**
 * Drains and retries any pending offline check-in mutations.
 * Returns the number of successfully synced check-ins.
 */
export async function drainOfflineCheckIns(
  onSynced?: (count: number) => void,
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_CHECKINS_KEY);
    if (!raw) return 0;

    const list: QueuedCheckIn[] = JSON.parse(raw);
    if (list.length === 0) return 0;

    const remaining: QueuedCheckIn[] = [];
    let syncedCount = 0;

    for (const item of list) {
      try {
        const ok = await db.updateParticipant(item.participantId, item.updates);
        if (ok) {
          syncedCount++;
        } else {
          // Keep for next drain attempt
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      await AsyncStorage.setItem(OFFLINE_CHECKINS_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(OFFLINE_CHECKINS_KEY);
    }

    if (syncedCount > 0 && onSynced) {
      onSynced(syncedCount);
    }

    return syncedCount;
  } catch (err) {
    console.warn('[offlineQueue] failed to drain offline check-ins', err);
    return 0;
  }
}

/**
 * Returns the count of pending offline check-in records.
 */
export async function getQueuedCheckInsCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_CHECKINS_KEY);
    if (!raw) return 0;
    const list: QueuedCheckIn[] = JSON.parse(raw);
    return list.length;
  } catch {
    return 0;
  }
}
