'use client';

import { useEffect } from 'react';

type UmamiWindow = Window & {
  umami?: {
    track?: (event: string, data?: Record<string, unknown>) => void;
  };
};

interface UmamiEventProps {
  event: string;
  data?: Record<string, unknown>;
}

export function UmamiEvent({ event, data }: UmamiEventProps) {
  useEffect(() => {
    (window as UmamiWindow).umami?.track?.(event, data);
  }, [event, data]);

  return null;
}
