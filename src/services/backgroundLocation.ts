import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_SAFETY_NETWORK_ENABLED = '@rotaract_safety_network_enabled';

export interface LastKnownLocation {
  latitude: number;
  longitude: number;
  updatedAt: string;
}

/**
 * Checks if the user has opted in to the Emergency Safety Network alerts.
 */
export async function isSafetyNetworkEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY_SAFETY_NETWORK_ENABLED);
    return val === null ? true : val === 'true'; // Default enabled
  } catch {
    return true;
  }
}

/**
 * Sets whether the user has opted in to the Emergency Safety Network alerts.
 */
export async function setSafetyNetworkEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SAFETY_NETWORK_ENABLED, String(enabled));
  } catch (e) {
    console.warn('[BackgroundLocation] Failed to set safety network enabled:', e);
  }
}

/**
 * Retrieves the device's instantaneous location on-demand when an SOS event occurs.
 * Does not require any periodic background polling tasks (0% idle battery drain).
 */
export async function getDeviceLocationOnDemand(): Promise<LastKnownLocation | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    let loc = await Location.getLastKnownPositionAsync();
    if (!loc) {
      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    }

    if (!loc?.coords) return null;

    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[BackgroundLocation] Failed to get on-demand location:', err);
    return null;
  }
}

/** Legacy alias for backwards compatibility. */
export const getLastCachedLocation = getDeviceLocationOnDemand;
