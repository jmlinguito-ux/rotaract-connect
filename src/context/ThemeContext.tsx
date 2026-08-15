import React, { createContext, useContext, useState, ReactNode } from 'react';
import { lightColors, darkColors } from '../theme/colors';

interface ThemeContextType {
  isNightMode: boolean;
  setNightMode: (enabled: boolean) => void;
  toggleNightMode: () => void;
  colors: typeof lightColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isNightMode, setIsNightMode] = useState(false);

  const setNightMode = (enabled: boolean) => setIsNightMode(enabled);
  const toggleNightMode = () => setIsNightMode(prev => !prev);

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
