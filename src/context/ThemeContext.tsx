import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from '../theme/colors';

const THEME_STORAGE_KEY = 'prefs:isNightMode';

interface ThemeContextType {
  isNightMode: boolean;
  setNightMode: (enabled: boolean) => void;
  toggleNightMode: () => void;
  colors: typeof lightColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isNightMode, setIsNightMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(stored => {
        if (stored !== null) {
          setIsNightMode(stored === 'true');
        }
      })
      .catch(() => {});
  }, []);

  const setNightMode = useCallback((enabled: boolean) => {
    setIsNightMode(enabled);
    AsyncStorage.setItem(THEME_STORAGE_KEY, String(enabled)).catch(() => {});
  }, []);

  const toggleNightMode = useCallback(() => {
    setIsNightMode(prev => {
      const next = !prev;
      AsyncStorage.setItem(THEME_STORAGE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const themeColors = isNightMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ isNightMode, setNightMode, toggleNightMode, colors: themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      isNightMode: false,
      setNightMode: () => {},
      toggleNightMode: () => {},
      colors: lightColors,
    };
  }
  return ctx;
}
