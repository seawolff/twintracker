import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTheme, type ThemeTokens } from '../hooks/useTheme';

const ThemeContext = createContext<ThemeTokens | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();

  // Keep the CSS data-attribute in sync with the computed theme so that any
  // manual override set by the landing page demo is reset when the app mounts.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme.mode;
    }
  }, [theme.mode]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeTokens {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used inside ThemeProvider');
  }
  return ctx;
}
