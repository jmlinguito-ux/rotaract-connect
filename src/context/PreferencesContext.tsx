import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * User-facing app preferences that persist across launches (AsyncStorage).
 * Kept separate from theme/auth so any screen or component can read a setting
 * without pulling in unrelated concerns.
 */
interface PreferencesContextType {
  /**
   * Master switch for OS push notification banners (foreground/background/closed).
   * Disabling it stops push delivery but never hides the notification history —
   * those stay readable in the Inbox. Device-level OS permission, and the user's
   * own per-channel Android settings, still apply on top of this preference.
   */
  pushEnabled: boolean;
  setPushEnabled: (enabled: boolean) => void;
  /** Use the device's most precise (and more power-hungry) GPS for check-in. */
  highAccuracyGps: boolean;
  setHighAccuracyGps: (enabled: boolean) => void;
  /** Check in automatically once the device is within range during the window. */
  autoCheckIn: boolean;
  setAutoCheckIn: (enabled: boolean) => void;
  /**
   * Whether to broadcast this user's online presence to others. Off means their
   * name never appears as active in a chat; they can still see who else is online,
   * since this governs what they publish, not what they receive.
   */
  showActiveStatus: boolean;
  setShowActiveStatus: (enabled: boolean) => void;
  /** False until persisted values have been read, so toggles don't flash. */
  loaded: boolean;
}

const PUSH_KEY = 'prefs:pushEnabled';
const ACTIVE_STATUS_KEY = 'prefs:showActiveStatus';
const HIGH_ACCURACY_KEY = 'prefs:highAccuracyGps';
const AUTO_CHECKIN_KEY = 'prefs:autoCheckIn';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [pushEnabled, setPush] = useState(true);
  const [showActiveStatus, setActiveStatus] = useState(true);
  const [highAccuracyGps, setHighAccuracy] = useState(true);
  const [autoCheckIn, setAuto] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(PUSH_KEY),
      AsyncStorage.getItem(ACTIVE_STATUS_KEY),
      AsyncStorage.getItem(HIGH_ACCURACY_KEY),
      AsyncStorage.getItem(AUTO_CHECKIN_KEY),
    ])
      .then(([push, active, highAcc, auto]) => {
        if (cancelled) return;
        if (push !== null) setPush(push === 'true');
        if (active !== null) setActiveStatus(active === 'true');
        if (highAcc !== null) setHighAccuracy(highAcc === 'true');
        if (auto !== null) setAuto(auto === 'true');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const setShowActiveStatus = useCallback((enabled: boolean) => {
    setActiveStatus(enabled);
    AsyncStorage.setItem(ACTIVE_STATUS_KEY, String(enabled)).catch(() => {});
  }, []);

  const setPushEnabled = useCallback((enabled: boolean) => {
    setPush(enabled);
    AsyncStorage.setItem(PUSH_KEY, String(enabled)).catch(() => {});
  }, []);

  const setHighAccuracyGps = useCallback((enabled: boolean) => {
    setHighAccuracy(enabled);
    AsyncStorage.setItem(HIGH_ACCURACY_KEY, String(enabled)).catch(() => {});
  }, []);

  const setAutoCheckIn = useCallback((enabled: boolean) => {
    setAuto(enabled);
    AsyncStorage.setItem(AUTO_CHECKIN_KEY, String(enabled)).catch(() => {});
  }, []);

  return (
    <PreferencesContext.Provider value={{ pushEnabled, setPushEnabled, showActiveStatus, setShowActiveStatus, highAccuracyGps, setHighAccuracyGps, autoCheckIn, setAutoCheckIn, loaded }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    // Safe defaults if used outside the provider.
    return {
      pushEnabled: true,
      setPushEnabled: () => {},
      showActiveStatus: true,
      setShowActiveStatus: () => {},
      highAccuracyGps: true,
      setHighAccuracyGps: () => {},
      autoCheckIn: false,
      setAutoCheckIn: () => {},
      loaded: true,
    };
  }
  return ctx;
}
