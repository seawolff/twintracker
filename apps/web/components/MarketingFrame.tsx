'use client';

import { useEffect, useState } from 'react';
import { MarketingFooter } from './MarketingFooter';
import { MarketingNav } from './MarketingNav';

export function MarketingFrame({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'day' | 'night'>('day');

  useEffect(() => {
    const domTheme = document.documentElement.dataset.theme as 'day' | 'night' | undefined;
    if (domTheme) {
      setTheme(domTheme);
    }
  }, []);

  const handleToggle = () => {
    const next = theme === 'day' ? 'night' : 'day';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <>
      <MarketingNav theme={theme} onToggle={handleToggle} />
      {children}
      <MarketingFooter />
    </>
  );
}
