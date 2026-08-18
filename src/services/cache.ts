import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser } from '../types';
import { LoadedData } from './db';

const CACHE_KEYS = {
  USER_PROFILE: '@rotaract_cached_user_v1',
  DATA_SNAPSHOT: '@rotaract_cached_snapshot_v1',
};

/**
 * Cache user profile locally for instant auth restoration on app launch.
 */
export async function getCachedUser(): Promise<AppUser | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_KEYS.USER_PROFILE);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.warn('[cache] Failed to load cached user', e);
    return null;
  }
}

export async function setCachedUser(user: AppUser | null): Promise<void> {
  try {
    if (user) {
      await AsyncStorage.setItem(CACHE_KEYS.USER_PROFILE, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(CACHE_KEYS.USER_PROFILE);
    }
  } catch (e) {
    console.warn('[cache] Failed to save user cache', e);
  }
}

export async function clearCachedUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.USER_PROFILE);
  } catch (e) {
    console.warn('[cache] Failed to clear user cache', e);
  }
}

/**
 * Cache full data snapshot (events, clubs, notifications, messages) for 0ms instant startup.
 */
export async function getCachedData(): Promise<LoadedData | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_KEYS.DATA_SNAPSHOT);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.warn('[cache] Failed to load data snapshot cache', e);
    return null;
  }
}

export async function setCachedData(data: LoadedData): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.DATA_SNAPSHOT, JSON.stringify(data));
  } catch (e) {
    console.warn('[cache] Failed to save data snapshot cache', e);
  }
}

export async function clearCachedData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.DATA_SNAPSHOT);
  } catch (e) {
    console.warn('[cache] Failed to clear data snapshot cache', e);
  }
}
