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

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [pushEnabled, setPush] = useState(true);
  const [showActiveStatus, setActiveStatus] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(PUSH_KEY), AsyncStorage.getItem(ACTIVE_STATUS_KEY)])
      .then(([push, active]) => {
        if (cancelled) return;
        if (push !== null) setPush(push === 'true');
        if (active !== null) setActiveStatus(active === 'true');
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

  return (
    <PreferencesContext.Provider value={{ pushEnabled, setPushEnabled, showActiveStatus, setShowActiveStatus, loaded }}>
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
      loaded: true,
    };
  }
  return ctx;
}
