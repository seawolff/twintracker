'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Delay before the skeleton re-appears for subsequent loading transitions
 * (e.g. pull-to-refresh). Prevents skeleton from flashing on fast re-fetches.
 */
const LOADING_DELAY_MS = 300;

/**
 * On first mount, returns true immediately (before paint) if loading is true —
 * this prevents the empty-state flash before the initial data fetch completes.
 *
 * For subsequent loading transitions (e.g. navigating back to a page), applies
 * a 300ms delay so fast re-fetches don't flash the skeleton.
 *
 * Resets to false immediately when loading becomes false.
 */
export function useDelayedLoading(loading: boolean): boolean {
  // Start as true so the server renders the skeleton (not empty state), and the
  // client hydrates matching the same skeleton — prevents the flash of
  // onboarding / "No events yet" on hard refresh before auth resolves.
  const [show, setShow] = useState(true);
  const isFirstLoad = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fires synchronously before the browser paints on first mount.
  // If loading is already true, show skeleton immediately so the empty state
  // never renders. (useEffect fires after paint and would be too late.)
  useLayoutEffect(() => {
    if (isFirstLoad.current && loading) {
      setShow(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading) {
      if (!isFirstLoad.current) {
        // Subsequent loading — delay to avoid flashing skeleton on fast re-fetches
        timerRef.current = setTimeout(() => setShow(true), LOADING_DELAY_MS);
      }
    } else {
      isFirstLoad.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShow(false);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [loading]);

  return show;
}
