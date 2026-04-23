/**
 * Landing page demo data builders.
 * Exported separately so LandingDemo.test.tsx can import and validate them
 * without pulling in the full page module (which is a Next.js route and
 * cannot have extra named exports).
 *
 * All builders take a fixed `nowMs` reference (DEMO_NOW.getTime()) so both SSR
 * and client produce identical output — no hydration mismatch.
 */
import type { Baby, LatestEventMap, TrackerEvent } from '@tt/core';
export declare const DEMO_EMMA: Baby;
export declare const DEMO_LUCAS: Baby;
export declare const DEMO_MIA: Baby;
/** True when the most-recent nap or sleep event for this baby has no endedAt. */
export declare function isBabySleeping(babyId: string, latestMap: LatestEventMap): boolean;
export declare function buildSingletonLatest(nowMs: number): LatestEventMap;
export declare function buildSingletonEvents(nowMs: number): TrackerEvent[];
export declare function buildTwinLatest(nowMs: number): LatestEventMap;
export declare function buildTwinEvents(nowMs: number): TrackerEvent[];
/**
 * Build deterministic, trend-rich analytics mock data for the landing page.
 * Uses stable formulas instead of Math.random so the charts never jitter between renders.
 */
export declare function buildDemoAnalyticsEvents(babies: Baby[], nowMs: number): TrackerEvent[];
//# sourceMappingURL=_demoData.d.ts.map