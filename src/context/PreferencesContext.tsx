import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * User-facing app preferences that persist across launches (AsyncStorage).
 * Kept separate from theme/auth so any screen or component can read a setting
 * without pulling in unrelated concerns.
 */
interface PreferencesContextType {
  /** Show the in-app banner popup when a realtime notification arrives (foreground). */
  inAppBannerEnabled: boolean;
  setInAppBannerEnabled: (enabled: boolean) => void;
  /**
   * Master switch for OS push notification banners (foreground/background/closed).
   * Disabling it stops push delivery but never hides the in-app notification
   * history — those stay readable in the Inbox. Device-level OS permission still
   * applies on top of this preference.
   */
  pushEnabled: boolean;
  setPushEnabled: (enabled: boolean) => void;
  /** False until persisted values have been read, so toggles don't flash. */
  loaded: boolean;
}

const BANNER_KEY = 'prefs:inAppBannerEnabled';
const PUSH_KEY = 'prefs:pushEnabled';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [inAppBannerEnabled, setBanner] = useState(true);
  const [pushEnabled, setPush] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(BANNER_KEY), AsyncStorage.getItem(PUSH_KEY)])
      .then(([banner, push]) => {
        if (cancelled) return;
        if (banner !== null) setBanner(banner === 'true');
        if (push !== null) setPush(push === 'true');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const setInAppBannerEnabled = useCallback((enabled: boolean) => {
    setBanner(enabled);
    AsyncStorage.setItem(BANNER_KEY, String(enabled)).catch(() => {});
  }, []);

  const setPushEnabled = useCallback((enabled: boolean) => {
    setPush(enabled);
    AsyncStorage.setItem(PUSH_KEY, String(enabled)).catch(() => {});
  }, []);

  return (
    <PreferencesContext.Provider value={{ inAppBannerEnabled, setInAppBannerEnabled, pushEnabled, setPushEnabled, loaded }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    // Safe defaults if used outside the provider.
    return {
      inAppBannerEnabled: true,
      setInAppBannerEnabled: () => {},
      pushEnabled: true,
      setPushEnabled: () => {},
      loaded: true,
    };
  }
  return ctx;
}
