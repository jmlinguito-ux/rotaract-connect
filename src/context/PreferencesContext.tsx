import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * User-facing app preferences that persist across launches (AsyncStorage).
 * Kept separate from theme/auth so any screen or component can read a setting
 * without pulling in unrelated concerns.
 */
interface PreferencesContextType {
  /** Show the in-app banner popup when a realtime notification arrives. */
  inAppBannerEnabled: boolean;
  setInAppBannerEnabled: (enabled: boolean) => void;
  /** False until persisted values have been read, so toggles don't flash. */
  loaded: boolean;
}

const STORAGE_KEY = 'prefs:inAppBannerEnabled';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [inAppBannerEnabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (!cancelled && v !== null) setEnabled(v === 'true'); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const setInAppBannerEnabled = useCallback((enabled: boolean) => {
    setEnabled(enabled);
    AsyncStorage.setItem(STORAGE_KEY, String(enabled)).catch(() => {});
  }, []);

  return (
    <PreferencesContext.Provider value={{ inAppBannerEnabled, setInAppBannerEnabled, loaded }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    // Safe defaults if used outside the provider.
    return { inAppBannerEnabled: true, setInAppBannerEnabled: () => {}, loaded: true };
  }
  return ctx;
}
