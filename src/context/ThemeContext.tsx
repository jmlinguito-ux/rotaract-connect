import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from '../theme/colors';

const THEME_STORAGE_KEY = 'prefs:themeMode';
const LEGACY_STORAGE_KEY = 'prefs:isNightMode';

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isNightMode: boolean;
  setNightMode: (enabled: boolean) => void;
  toggleNightMode: () => void;
  colors: typeof lightColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('SYSTEM');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(stored => {
        if (stored === 'SYSTEM' || stored === 'LIGHT' || stored === 'DARK') {
          setThemeModeState(stored);
        } else {
          // Check legacy boolean key
          AsyncStorage.getItem(LEGACY_STORAGE_KEY).then(legacy => {
            if (legacy !== null) {
              setThemeModeState(legacy === 'true' ? 'DARK' : 'LIGHT');
            }
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const isNightMode = themeMode === 'SYSTEM' ? systemColorScheme === 'dark' : themeMode === 'DARK';

  const setNightMode = useCallback((enabled: boolean) => {
    setThemeMode(enabled ? 'DARK' : 'LIGHT');
  }, [setThemeMode]);

  const toggleNightMode = useCallback(() => {
    setThemeMode(isNightMode ? 'LIGHT' : 'DARK');
  }, [isNightMode, setThemeMode]);

  const themeColors = isNightMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, isNightMode, setNightMode, toggleNightMode, colors: themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      themeMode: 'SYSTEM' as ThemeMode,
      setThemeMode: () => {},
      isNightMode: false,
      setNightMode: () => {},
      toggleNightMode: () => {},
      colors: lightColors,
    };
  }
  return ctx;
}
