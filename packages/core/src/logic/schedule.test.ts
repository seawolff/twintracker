import {
  getNextAction,
  getAgeWeeks,
  getAdjustedAgeWeeks,
  getDiaperIntervalMs,
  getScheduleForAge,
  getScheduleStage,
  getSelfSoothingMinutes,
  getBabyInsight,
} from './schedule';

// Local mirrors of schedule.ts internal constants (removed from public exports in P3 cleanup).
const NAP_DURATION_MS = 90 * 60_000; // default nap target
const AWAKE_DURATION_MS = 120 * 60_000; // default awake window
const SOON_THRESHOLD_MS = 5 * 60_000; // urgency "soon" threshold
import type { Baby, LatestEventMap, TrackerEvent, EventType } from '../types/index';
import type { LearnedStats } from './learnedSchedule';

function makeEvent(
  babyId: string,
  type: EventType,
  startedAt: string,
  endedAt?: string,
): TrackerEvent {
  return { id: '1', babyId, type, startedAt, endedAt, createdAt: startedAt };
}

function msAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const BABY_ID = 'baby-1';
/** Fixed birth date that is always Stage 2 (≥ 16 weeks old relative to 2026). */
const STAGE2_BIRTH_DATE = '2025-06-01';
const NOW = new Date();

describe('getNextAction', () => {
  describe('1. Empty latest map → Bottle, urgency ok', () => {
    it('returns Bottle action with urgency ok when no events recorded', () => {
      const latest: LatestEventMap = {};
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Bottle');
      expect(result.urgency).toBe('ok');
    });
  });

  describe('2. Active nap (no endedAt) → Wake action', () => {
    it('returns Wake action when nap has no endedAt', () => {
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', msAgo(10 * 60 * 1000)),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Wake');
    });
  });

  describe('3. Active nap just started → targetMs ≈ NAP_DURATION_MS, urgency ok', () => {
    it('has targetMs close to NAP_DURATION_MS and urgency ok', () => {
      const napStartedAt = msAgo(1 * 60 * 1000); // 1 minute ago
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Wake');
      // targetMs should be close to NAP_DURATION_MS - 1min
      const expected = NAP_DURATION_MS - 1 * 60 * 1000;
      expect(result.targetMs).toBeGreaterThan(expected - 2000);
      expect(result.targetMs).toBeLessThan(expected + 2000);
      expect(result.urgency).toBe('ok');
    });
  });

  describe('4. Active nap overdue → urgency overdue, targetMs negative', () => {
    it('has negative targetMs and urgency overdue when nap exceeded NAP_DURATION_MS', () => {
      const napStartedAt = msAgo(NAP_DURATION_MS + 10 * 60 * 1000); // 10 minutes past due
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Wake');
      expect(result.targetMs).toBeLessThan(0);
      expect(result.urgency).toBe('overdue');
    });
  });

  describe('5. Active nap soon → urgency soon', () => {
    it('has urgency soon when nap will end within SOON_THRESHOLD_MS', () => {
      // Started NAP_DURATION_MS - SOON_THRESHOLD_MS/2 ago → remaining = SOON_THRESHOLD_MS/2 (≤ threshold, > 0)
      const napStartedAt = msAgo(NAP_DURATION_MS - Math.floor(SOON_THRESHOLD_MS / 2));
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Wake');
      expect(result.targetMs).toBeGreaterThan(0);
      expect(result.targetMs).toBeLessThanOrEqual(SOON_THRESHOLD_MS);
      expect(result.urgency).toBe('soon');
    });
  });

  describe('6. Nap ended recently → Bottle (still within awake window)', () => {
    it('returns Bottle when nap ended 5 minutes ago (well within awake window)', () => {
      const napEndedAt = msAgo(5 * 60 * 1000); // 5 min ago — far from AWAKE_DURATION_MS
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(
          BABY_ID,
          'nap',
          msAgo(NAP_DURATION_MS + 5 * 60 * 1000),
          napEndedAt,
        ),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Bottle');
    });
  });

  describe('7. Awake for AWAKE_DURATION - SOON_THRESHOLD/2 → Nap time, urgency soon', () => {
    it('returns Nap time with urgency soon when awake window is nearly exhausted', () => {
      const napEndedAt = msAgo(AWAKE_DURATION_MS - Math.floor(SOON_THRESHOLD_MS / 2));
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(
          BABY_ID,
          'nap',
          msAgo(AWAKE_DURATION_MS + NAP_DURATION_MS),
          napEndedAt,
        ),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Nap time');
      expect(result.urgency).toBe('soon');
    });
  });

  describe('8. Awake for AWAKE_DURATION + 10min → Nap time, urgency overdue', () => {
    it('returns Nap time with urgency overdue when awake window exceeded', () => {
      const napEndedAt = msAgo(AWAKE_DURATION_MS + 10 * 60 * 1000);
      const latest: LatestEventMap = {
        [`${BABY_ID}:nap`]: makeEvent(
          BABY_ID,
          'nap',
          msAgo(AWAKE_DURATION_MS + NAP_DURATION_MS + 10 * 60 * 1000),
          napEndedAt,
        ),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Nap time');
      expect(result.targetMs).toBeLessThan(0);
      expect(result.urgency).toBe('overdue');
    });
  });

  describe('9. Last bottle 1h ago → Bottle, urgency ok', () => {
    it('returns Bottle with urgency ok when last bottle was 1 hour ago', () => {
      const latest: LatestEventMap = {
        [`${BABY_ID}:bottle`]: makeEvent(BABY_ID, 'bottle', msAgo(60 * 60 * 1000)),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Bottle');
      expect(result.urgency).toBe('ok');
    });
  });

  describe('10. Last bottle 3h 5m ago → Bottle, urgency overdue', () => {
    it('returns Bottle with urgency overdue when last bottle was over 3 hours ago', () => {
      // FEED_INTERVAL_MS = 3h; 3h 5m > 3h → remainingMs < 0 → overdue
      const latest: LatestEventMap = {
        [`${BABY_ID}:bottle`]: makeEvent(BABY_ID, 'bottle', msAgo((3 * 60 + 5) * 60 * 1000)),
      };
      const result = getNextAction(latest, BABY_ID, NOW);
      expect(result.action).toBe('Bottle');
      expect(result.targetMs).toBeLessThan(0);
      expect(result.urgency).toBe('overdue');
    });
  });
});

// ---------------------------------------------------------------------------
// New tests
// ---------------------------------------------------------------------------

describe('getAgeWeeks', () => {
  it('returns 14 for undefined birthDate', () => {
    expect(getAgeWeeks(undefined)).toBe(14);
  });

  it('returns 0 for today', () => {
    expect(getAgeWeeks(new Date().toISOString())).toBe(0);
  });

  it('returns correct weeks for a known birthdate', () => {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    expect(getAgeWeeks(fourWeeksAgo)).toBe(4);
  });
});

describe('getAdjustedAgeWeeks', () => {
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const tenWeeksAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();

  it('uses adjustedBirthDate when set', () => {
    expect(getAdjustedAgeWeeks({ birthDate: fourWeeksAgo, adjustedBirthDate: tenWeeksAgo })).toBe(
      10,
    );
  });

  it('falls back to birthDate when adjustedBirthDate is null', () => {
    expect(getAdjustedAgeWeeks({ birthDate: fourWeeksAgo, adjustedBirthDate: null })).toBe(4);
  });

  it('falls back to birthDate when adjustedBirthDate is undefined', () => {
    expect(getAdjustedAgeWeeks({ birthDate: fourWeeksAgo })).toBe(4);
  });

  it('returns the default 14 weeks when both dates are missing', () => {
    expect(getAdjustedAgeWeeks({})).toBe(14);
  });

  it('getBabyInsight uses adjustedBirthDate for stage calculation', () => {
    // Baby born 20 weeks ago (Stage 2 chronologically) but due date was only 4 weeks ago
    // → corrected age is Stage 1, so schedule should use Stage 1 parameters
    const twentyWeeksAgo = new Date(Date.now() - 140 * 24 * 60 * 60 * 1000).toISOString();
    const baby = {
      id: 'b1',
      name: 'Test',
      color: 'amber' as const,
      birthDate: twentyWeeksAgo,
      adjustedBirthDate: fourWeeksAgo,
      createdAt: twentyWeeksAgo,
    };
    const insight = getBabyInsight(baby, {}, [], new Date());
    // Stage 1 uses 3h feed interval; Stage 2 uses 4h — corrected age should give Stage 1
    expect(insight.scheduleStage).toBe(1);
  });
});

describe('getScheduleForAge', () => {
  // Stage 1 (0–15w): 3-hour Feed→Play→Sleep cycle throughout
  it('0–4w: 60m awake cap, 3h feed (Stage 1)', () => {
    const s = getScheduleForAge(2);
    expect(s.awakeMs).toBe(60 * 60_000);
    expect(s.feedMs).toBe(3 * 3600_000);
    expect(s.napMs).toBe(NAP_DURATION_MS);
  });

  it('4–8w: 90m awake cap, 3h feed (Stage 1)', () => {
    const s = getScheduleForAge(6);
    expect(s.awakeMs).toBe(90 * 60_000);
    expect(s.feedMs).toBe(3 * 3600_000);
  });

  it('8–15w: 120m awake, 90m nap, 3h feed (Stage 1 late; matches AWAKE/NAP_DURATION_MS)', () => {
    const s = getScheduleForAge(14);
    expect(s.napMs).toBe(NAP_DURATION_MS); // 90m
    expect(s.awakeMs).toBe(AWAKE_DURATION_MS); // 120m
    expect(s.feedMs).toBe(3 * 3600_000);
  });

  // Stage 2 (16w–18m / ~78w): 4-hour schedule; two 2-hour crib naps
  it('16w (Stage 2 start): 120m nap, 120m awake window, 4h feed', () => {
    const s = getScheduleForAge(16);
    expect(s.napMs).toBe(120 * 60_000);
    expect(s.awakeMs).toBe(120 * 60_000);
    expect(s.feedMs).toBe(4 * 3600_000);
  });

  it('28w (Stage 2): 120m nap, 120m awake window, 4h feed', () => {
    const s = getScheduleForAge(28);
    expect(s.napMs).toBe(120 * 60_000);
    expect(s.awakeMs).toBe(120 * 60_000);
    expect(s.feedMs).toBe(4 * 3600_000);
  });

  it('60w (Stage 2, ~14m): 120m nap, 120m awake window, 4h feed', () => {
    const s = getScheduleForAge(60);
    expect(s.napMs).toBe(120 * 60_000);
    expect(s.awakeMs).toBe(120 * 60_000);
    expect(s.feedMs).toBe(4 * 3600_000);
  });

  // Stage 3 (78w+ / 18m+): one afternoon nap
  it('80w (Stage 3): 150m nap, 300m awake window, 5h feed', () => {
    const s = getScheduleForAge(80);
    expect(s.napMs).toBe(150 * 60_000);
    expect(s.awakeMs).toBe(300 * 60_000);
    expect(s.feedMs).toBe(5 * 3600_000);
  });
});

describe('getScheduleStage', () => {
  it('0–15w → Stage 1', () => {
    expect(getScheduleStage(0)).toBe(1);
    expect(getScheduleStage(14)).toBe(1);
    expect(getScheduleStage(15)).toBe(1);
  });

  it('16w boundary → Stage 2', () => {
    expect(getScheduleStage(16)).toBe(2);
  });

  it('16w–77w → Stage 2', () => {
    expect(getScheduleStage(40)).toBe(2);
    expect(getScheduleStage(77)).toBe(2);
  });

  it('78w (18m) boundary → Stage 3', () => {
    expect(getScheduleStage(78)).toBe(3);
    expect(getScheduleStage(100)).toBe(3);
  });
});

describe('getSelfSoothingMinutes', () => {
  it('0–4w → 5 min', () => {
    expect(getSelfSoothingMinutes(0)).toBe(5);
    expect(getSelfSoothingMinutes(3)).toBe(5);
  });

  it('4–12w → 10 min', () => {
    expect(getSelfSoothingMinutes(4)).toBe(10);
    expect(getSelfSoothingMinutes(11)).toBe(10);
  });

  it('3–6m (12–24w) → 20 min', () => {
    expect(getSelfSoothingMinutes(12)).toBe(20);
    expect(getSelfSoothingMinutes(23)).toBe(20);
  });

  it('6–9m (24–36w) → 30 min', () => {
    expect(getSelfSoothingMinutes(24)).toBe(30);
    expect(getSelfSoothingMinutes(35)).toBe(30);
  });

  it('9m+ (36w+) → 45 min', () => {
    expect(getSelfSoothingMinutes(36)).toBe(45);
    expect(getSelfSoothingMinutes(60)).toBe(45);
  });
});

describe('getDiaperIntervalMs', () => {
  it('Stage 1 (0–15w) uses a 2.5h reminder interval', () => {
    expect(getDiaperIntervalMs(2)).toBe(150 * 60_000);
    expect(getDiaperIntervalMs(15)).toBe(150 * 60_000);
  });

  it('Stage 2 (16w–77w) uses a 3.5h reminder interval', () => {
    expect(getDiaperIntervalMs(16)).toBe(210 * 60_000);
    expect(getDiaperIntervalMs(38)).toBe(210 * 60_000);
    expect(getDiaperIntervalMs(77)).toBe(210 * 60_000);
  });

  it('Stage 3 (78w+) uses a 4h reminder interval', () => {
    expect(getDiaperIntervalMs(78)).toBe(240 * 60_000);
    expect(getDiaperIntervalMs(104)).toBe(240 * 60_000);
  });
});

describe('getNextAction with birthDate', () => {
  it('uses shorter awake window for newborn (ageWeeks=2): overdue at 65m', () => {
    // 65m > 60m awake cap for 0–4w → Nap time, overdue
    const napEndedAt = msAgo(65 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        msAgo(NAP_DURATION_MS + 65 * 60_000),
        napEndedAt,
      ),
    };
    const newbornBirthDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 2w old
    const result = getNextAction(latest, BABY_ID, NOW, newbornBirthDate);
    expect(result.action).toBe('Nap time');
    expect(result.urgency).toBe('overdue');
  });

  it('same 65m awake time is ok for 4-month-old (120m awake window)', () => {
    const napEndedAt = msAgo(65 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        msAgo(NAP_DURATION_MS + 65 * 60_000),
        napEndedAt,
      ),
    };
    const fourMonthBirthDate = new Date(Date.now() - 16 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = getNextAction(latest, BABY_ID, NOW, fourMonthBirthDate);
    expect(result.action).toBe('Bottle'); // still within 120m awake window, falls through to feed
    expect(result.urgency).toBe('ok');
  });
});

describe('getBabyInsight', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('sleeping baby: headline contains "Sleeping", narrative mentions name', () => {
    const napStartedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.headline).toContain('Sleeping');
    expect(insight.narrative).toContain('awake around');
    expect(insight.urgency).toBe('ok');
  });

  it('overdue nap: urgency overdue', () => {
    // 150 min elapsed — overdue for Stage 2 (120 min target) and Stage 1 (90 min target)
    const napStartedAt = msAgo(150 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.urgency).toBe('overdue');
    expect(insight.narrative).toContain('longer than usual');
  });

  it('awake within window: headline contains "Awake", narrative mentions nap timing', () => {
    const testNow = new Date(2026, 2, 14, 10, 0, 0); // fixed daytime hour to avoid night-mode urgency
    const napEndedAt = new Date(testNow.getTime() - 30 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        new Date(testNow.getTime() - (NAP_DURATION_MS + 30 * 60_000)).toISOString(),
        napEndedAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], testNow);
    expect(insight.headline).toContain('Awake');
    expect(insight.urgency).toBe('ok');
  });

  it('awake, nap overdue: urgency overdue', () => {
    // Use local noon — timezone-safe midday so isNight is never true (bedtime=23, wake=6).
    const noon = new Date(2024, 0, 15, 12, 0, 0);
    const noonMs = noon.getTime();
    const napEndedAt = new Date(noonMs - (AWAKE_DURATION_MS + 10 * 60_000)).toISOString();
    const napStartedAt = new Date(
      noonMs - (NAP_DURATION_MS + AWAKE_DURATION_MS + 10 * 60_000),
    ).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt, napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], noon, 0, undefined, 23, 6);
    expect(insight.urgency).toBe('overdue');
    expect(insight.narrative).toContain('time for a nap');
  });

  it("totalOzToday sums only today's bottle events for this baby", () => {
    const todayBottle1: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', new Date().toISOString()),
      id: '1',
      value: 4,
    };
    const todayBottle2: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', new Date().toISOString()),
      id: '2',
      value: 5,
    };
    const yesterdayBottle: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', new Date(Date.now() - 26 * 60 * 60_000).toISOString()),
      id: '3',
      value: 10,
    };
    const otherBabyBottle: TrackerEvent = {
      ...makeEvent('other-baby', 'bottle', new Date().toISOString()),
      id: '4',
      value: 8,
    };
    const insight = getBabyInsight(
      baby,
      {},
      [todayBottle1, todayBottle2, yesterdayBottle, otherBabyBottle],
      NOW,
    );
    expect(insight.totalOzToday).toBe(9); // 4 + 5 only
  });

  it('totalOzToday converts ml-unit bottle events to oz before summing', () => {
    const ML_PER_OZ = 29.5735;
    const mlBottle: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', new Date().toISOString()),
      id: '1',
      value: 120, // 120 ml ≈ 4.058 oz
      unit: 'ml',
    };
    const ozBottle: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', new Date().toISOString()),
      id: '2',
      value: 5,
      unit: 'oz',
    };
    const insight = getBabyInsight(baby, {}, [mlBottle, ozBottle], NOW);
    expect(insight.totalOzToday).toBeCloseTo(120 / ML_PER_OZ + 5, 3);
  });

  it('targetOzToday: Stage 1 newborn (0–4w, 3oz/feed, 3h interval) = 24 oz', () => {
    // 24h / 3h × 3oz = 24 oz — under the 32 oz AAP cap
    const newbornBirthDate = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const newborn: Baby = { ...baby, birthDate: newbornBirthDate };
    const insight = getBabyInsight(newborn, {}, [], NOW);
    expect(insight.targetOzToday).toBe(24);
  });

  it('targetOzToday: Stage 2 (5m, 6oz/feed, 4h interval) caps at AAP max 32 oz', () => {
    // 24h / 4h × 6oz = 36 oz — exceeds cap, should clamp to 32
    const fiveMonthBirthDate = new Date(Date.now() - 20 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const babyWith5m: Baby = { ...baby, birthDate: fiveMonthBirthDate };
    const insight = getBabyInsight(babyWith5m, {}, [], NOW);
    expect(insight.targetOzToday).toBe(32);
  });

  it('feedCountToday counts bottle + nursing events since calendar midnight', () => {
    const bottle = makeEvent(BABY_ID, 'bottle', new Date().toISOString());
    const nursing = makeEvent(BABY_ID, 'nursing', new Date().toISOString());
    const yesterday = {
      ...makeEvent(BABY_ID, 'bottle', new Date(Date.now() - 26 * 60 * 60_000).toISOString()),
      id: 'old',
    };
    const insight = getBabyInsight(baby, {}, [bottle, nursing, yesterday], NOW);
    expect(insight.feedCountToday).toBe(2); // only today's bottle + nursing
  });

  it('targetFeedsPerDay: Stage 1 (3h interval) = 8 feeds', () => {
    const newbornBirthDate = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const newborn: Baby = { ...baby, birthDate: newbornBirthDate };
    const insight = getBabyInsight(newborn, {}, [], NOW);
    expect(insight.targetFeedsPerDay).toBe(8); // 24h / 3h = 8
  });

  it('targetFeedsPerDay: Stage 2 (4h interval) = 6 feeds', () => {
    const fiveMonthBirthDate = new Date(Date.now() - 20 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const babyWith5m: Baby = { ...baby, birthDate: fiveMonthBirthDate };
    const insight = getBabyInsight(babyWith5m, {}, [], NOW);
    expect(insight.targetFeedsPerDay).toBe(6); // 24h / 4h = 6
  });

  it('no events: urgency ok, no alarm, narrative mentions name', () => {
    // Use a fixed 10am time so headline is deterministically "Good morning"
    const testNow = new Date(2026, 2, 14, 10, 0, 0);
    const insight = getBabyInsight(baby, {}, [], testNow);
    expect(insight.urgency).toBe('ok');
    expect(insight.narrative).toContain('John');
    expect(insight.headline).toBe('Good morning');
  });

  it('scheduleStage is 1 when no birthDate (default ~14w = Stage 1)', () => {
    const noBirthDateBaby: Baby = { ...baby, birthDate: undefined };
    const insight = getBabyInsight(noBirthDateBaby, {}, [], NOW);
    expect(insight.scheduleStage).toBe(1);
  });

  it('scheduleStage is 2 for a 5-month-old', () => {
    const fiveMonthBirthDate = new Date(Date.now() - 20 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const babyWith5m: Baby = { ...baby, birthDate: fiveMonthBirthDate };
    const insight = getBabyInsight(babyWith5m, {}, [], NOW);
    expect(insight.scheduleStage).toBe(2);
  });

  it('scheduleStage is 3 for a 2-year-old', () => {
    const twoYearBirthDate = new Date(Date.now() - 104 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const babyWith2y: Baby = { ...baby, birthDate: twoYearBirthDate };
    const insight = getBabyInsight(babyWith2y, {}, [], NOW);
    expect(insight.scheduleStage).toBe(3);
  });

  it('selfSoothingMinutes is 5 for a newborn', () => {
    const newbornBirthDate = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const newborn: Baby = { ...baby, birthDate: newbornBirthDate };
    const insight = getBabyInsight(newborn, {}, [], NOW);
    expect(insight.selfSoothingMinutes).toBe(5);
  });

  it('selfSoothingMinutes is 20 for a 4-month-old', () => {
    const fourMonthBirthDate = new Date(Date.now() - 16 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const babyWith4m: Baby = { ...baby, birthDate: fourMonthBirthDate };
    const insight = getBabyInsight(babyWith4m, {}, [], NOW);
    expect(insight.selfSoothingMinutes).toBe(20);
  });

  it('selfSoothingMinutes is 45 for a 10-month-old', () => {
    const tenMonthBirthDate = new Date(Date.now() - 43 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const babyWith10m: Baby = { ...baby, birthDate: tenMonthBirthDate };
    const insight = getBabyInsight(babyWith10m, {}, [], NOW);
    expect(insight.selfSoothingMinutes).toBe(45);
  });

  it('fedAgo is set when a bottle event exists', () => {
    const bottleEvent: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', msAgo(60 * 60_000)),
      id: '5',
      value: 4,
      unit: 'oz',
    };
    const latest: LatestEventMap = { [`${BABY_ID}:bottle`]: bottleEvent };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.fedAgo).toContain('ago');
  });

  it('changedAgo is set when a diaper event exists', () => {
    const diaperEvent: TrackerEvent = {
      ...makeEvent(BABY_ID, 'diaper', msAgo(30 * 60_000)),
      id: '6',
    };
    const latest: LatestEventMap = { [`${BABY_ID}:diaper`]: diaperEvent };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.changedAgo).toContain('ago');
  });

  it('Stage 2 diaper predictions use the longer 3.5h interval', () => {
    const testNow = new Date(2026, 3, 20, 12, 0, 0);
    const diaperEvent: TrackerEvent = {
      ...makeEvent(BABY_ID, 'diaper', new Date(testNow.getTime() - 3 * 60 * 60_000).toISOString()),
      id: 'stage2-diaper',
    };
    const latest: LatestEventMap = { [`${BABY_ID}:diaper`]: diaperEvent };

    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 23, 6);
    const diaperPrediction = insight.predictions.find(p => p.type === 'diaper');

    expect(diaperPrediction).toBeDefined();
    expect(diaperPrediction?.label).toContain('30m');
    expect(diaperPrediction?.remainingMs).toBeGreaterThan(25 * 60_000);
    expect(diaperPrediction?.remainingMs).toBeLessThan(35 * 60_000);
  });

  it('sleepStatus is Active when nap is ongoing', () => {
    const napStartedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = { [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt) };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.sleepStatus).toContain('Active');
  });

  it('sleepStatus shows ago when nap has ended', () => {
    const napEndedAt = msAgo(45 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        msAgo(NAP_DURATION_MS + 45 * 60_000),
        napEndedAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.sleepStatus).toContain('ago');
  });

  it('feed logged but not yet overdue, no sleep data: shows next bottle time, not empty state', () => {
    // Regression: baby card showed "No events yet" + prediction chips simultaneously
    // when a feed was logged in a prior session but was not yet overdue.
    const testNow = new Date(2026, 2, 14, 10, 0, 0); // 10 AM
    const feedMs = 3 * 60 * 60_000; // Stage 1: 3h interval
    const lastFeedAt = new Date(testNow.getTime() - feedMs + 30 * 60_000).toISOString(); // due in 30m
    const bottleEvent: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', lastFeedAt),
      id: 'b1',
      value: 4,
    };
    const latest: LatestEventMap = { [`${BABY_ID}:bottle`]: bottleEvent };
    const insight = getBabyInsight(baby, latest, [], testNow);
    expect(insight.narrative).not.toContain('No events yet');
    expect(insight.narrative).toContain('Next bottle');
    expect(insight.urgency).toBe('ok');
  });

  it('totalOzToday always resets at calendar midnight regardless of wakeHour', () => {
    // wakeHour = 6 is passed but should have no effect on the reset boundary.
    // Both bottles are after midnight on the same day — both should count.
    const testNow = new Date(2026, 2, 14, 10, 0, 0); // 10 AM March 14
    const earlyMorning: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', '2026-03-14T05:00:00'),
      id: 'br1',
      value: 10,
    };
    const laterMorning: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', '2026-03-14T07:00:00'),
      id: 'br2',
      value: 4,
    };
    // Pass wakeHour=6 — should NOT exclude the 5 AM bottle
    const insight = getBabyInsight(baby, {}, [earlyMorning, laterMorning], testNow, 6);
    expect(insight.totalOzToday).toBe(14); // both count — midnight is the boundary
  });
});

describe('getBabyInsight — night sleep (sleep event type)', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('active sleep event shows "Sleeping for the night" narrative', () => {
    const latest: LatestEventMap = {
      [`${BABY_ID}:sleep`]: makeEvent(BABY_ID, 'sleep', msAgo(2 * 60 * 60_000)),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.headline).toContain('Sleeping');
    expect(insight.narrative).toContain('night');
    expect(insight.urgency).toBe('ok');
  });

  it('most recent active sleep wins over older active nap', () => {
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', msAgo(3 * 60 * 60_000)), // older
      [`${BABY_ID}:sleep`]: makeEvent(BABY_ID, 'sleep', msAgo(1 * 60 * 60_000)), // newer
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.narrative).toContain('night');
  });

  it('ended sleep event contributes to lastWokeMs for awake calculation', () => {
    const napEndedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:sleep`]: makeEvent(BABY_ID, 'sleep', msAgo(10 * 60 * 60_000), napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.headline).toContain('Awake');
    expect(insight.sleepStatus).toContain('ago');
  });
});

describe('getBabyInsight — bedtime awareness', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('shows bedtime countdown when baby woke within 4.5h of bedtime', () => {
    // testNow = 3 PM; bedtime = 6 PM (3h away); baby woke at 2:30 PM (30min ago)
    // diff = 6PM - 2:30PM = 3.5h < 4.5h → bedtime stretch
    const testNow = new Date(2026, 2, 14, 15, 0, 0); // 3 PM
    const napEndedAt = new Date(testNow.getTime() - 30 * 60_000).toISOString(); // 2:30 PM
    const napStart = new Date(testNow.getTime() - (NAP_DURATION_MS + 30 * 60_000)).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 18, 6);
    expect(insight.narrative).toContain('Bedtime');
  });

  it('shows regular nap countdown when bedtime is far off', () => {
    // testNow = 10 AM; bedtime = 11 PM (13h away); baby woke at 9:30 AM (30min ago)
    // diff = 11PM - 9:30AM = 13.5h > 4.5h → regular nap prediction
    const testNow = new Date(2026, 2, 14, 10, 0, 0); // 10 AM
    const napEndedAt = new Date(testNow.getTime() - 30 * 60_000).toISOString(); // 9:30 AM
    const napStart = new Date(testNow.getTime() - (NAP_DURATION_MS + 30 * 60_000)).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 23, 6);
    expect(insight.narrative).not.toContain('Bedtime');
    expect(insight.headline).toContain('Awake');
  });
});

describe('getBabyInsight — catnap suggestion (Stage 2, 16–26 weeks)', () => {
  // Baby woke from last nap 2+ hours ago and it's 5–6 PM (catnap window).
  // The card should suggest a short contact nap rather than bedtime countdown or regular nap.

  /** Birth date that is always 20 weeks old (Stage 2 early — within catnap age). */
  const CATNAP_BIRTH_DATE = new Date(Date.now() - 20 * 7 * 24 * 60 * 60_000).toISOString();
  /** Birth date that is always 30 weeks old (Stage 2 but past 26w — catnap age dropped). */
  const POST_CATNAP_BIRTH_DATE = new Date(Date.now() - 30 * 7 * 24 * 60 * 60_000).toISOString();

  const catnapBaby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: CATNAP_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('suggests catnap at 5 PM when baby is overdue for a nap (Stage 2 early)', () => {
    // testNow = 5:15 PM; baby last woke at 2:45 PM (2h 30m ago, past 2h awake window)
    const testNow = new Date(2026, 2, 14, 17, 15, 0); // 5:15 PM
    const napEndedAt = new Date(2026, 2, 14, 14, 45, 0).toISOString(); // 2:45 PM
    const napStart = new Date(2026, 2, 14, 13, 15, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(catnapBaby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).toContain('catnap');
    expect(insight.urgency).toBe('soon'); // overdue → soon
  });

  it('does not suggest catnap before 5 PM', () => {
    // testNow = 4:45 PM; awake window elapsed but not yet catnap hour
    const testNow = new Date(2026, 2, 14, 16, 45, 0); // 4:45 PM
    const napEndedAt = new Date(2026, 2, 14, 14, 30, 0).toISOString(); // 2:30 PM
    const napStart = new Date(2026, 2, 14, 13, 0, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(catnapBaby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).not.toMatch(/catnap/i);
  });

  it('does not suggest catnap after 6 PM (window closes)', () => {
    // testNow = 6:10 PM; past the catnap window — too late for a nap before bed
    const testNow = new Date(2026, 2, 14, 18, 10, 0); // 6:10 PM
    const napEndedAt = new Date(2026, 2, 14, 14, 0, 0).toISOString(); // 2 PM
    const napStart = new Date(2026, 2, 14, 12, 30, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(catnapBaby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).not.toMatch(/catnap/i);
  });

  it('does not suggest catnap for Stage 2 baby older than 26 weeks', () => {
    const postCatnapBaby: Baby = {
      id: BABY_ID,
      name: 'John',
      color: 'sky',
      birthDate: POST_CATNAP_BIRTH_DATE,
      createdAt: new Date().toISOString(),
    };
    const testNow = new Date(2026, 2, 14, 17, 15, 0); // 5:15 PM
    const napEndedAt = new Date(2026, 2, 14, 14, 45, 0).toISOString();
    const napStart = new Date(2026, 2, 14, 13, 15, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(postCatnapBaby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).not.toMatch(/catnap/i);
  });

  it('does not suggest catnap when baby has not been awake long enough', () => {
    // testNow = 5:10 PM; baby woke at 4:30 PM (40m ago, << 2h awake window)
    const testNow = new Date(2026, 2, 14, 17, 10, 0); // 5:10 PM
    const napEndedAt = new Date(2026, 2, 14, 16, 30, 0).toISOString(); // 4:30 PM
    const napStart = new Date(2026, 2, 14, 15, 0, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(catnapBaby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).not.toMatch(/catnap/i);
  });
});

describe('getBabyInsight — too-late-for-nap guard', () => {
  // Baby woke from last nap long before bedtime (> 4.5h), so isBedtimeStretch is false.
  // But time has passed and now there's < napMs (2h for Stage 2) before bedtime.
  // The card should show bedtime countdown, not "nap time".
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('shows bedtime countdown (not nap language) when less than napMs before bedtime', () => {
    // testNow = 5:10 PM; bedtime = 7 PM (1h 50m away, < 2h napMs)
    // baby last woke at 10 AM (7h before bedtime → isBedtimeStretch = false)
    const testNow = new Date(2026, 2, 14, 17, 10, 0); // 5:10 PM
    const napEndedAt = new Date(2026, 2, 14, 10, 0, 0).toISOString(); // 10 AM
    const napStart = new Date(2026, 2, 14, 8, 30, 0).toISOString(); // 8:30 AM
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).toContain('Bedtime');
    expect(insight.narrative).not.toContain('nap');
    expect(insight.isBedtimeStretch).toBe(false); // guard is independent of isBedtimeStretch
  });

  it('still shows nap language when there is enough time before bedtime', () => {
    // testNow = 3:00 PM; bedtime = 7 PM (4h away, > 2h napMs)
    // baby last woke at 8 AM (11h before bedtime → isBedtimeStretch = false)
    const testNow = new Date(2026, 2, 14, 15, 0, 0); // 3 PM
    const napEndedAt = new Date(2026, 2, 14, 8, 0, 0).toISOString(); // 8 AM
    const napStart = new Date(2026, 2, 14, 6, 30, 0).toISOString(); // 6:30 AM
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).not.toContain('Bedtime');
    expect(insight.narrative).toContain('nap');
  });

  it('does not apply the guard for Stage 1 newborns', () => {
    // Stage 1 newborns have no bedtime stretch — even < napMs before 10 PM
    // should NOT redirect to bedtime language
    const stage1Baby: Baby = {
      id: BABY_ID,
      name: 'John',
      color: 'sky',
      birthDate: new Date(Date.now() - 3 * 7 * 24 * 60 * 60_000).toISOString(), // 3 weeks old
      createdAt: new Date().toISOString(),
    };
    // testNow = 9:10 PM; stage1 bedtime = 10 PM (50m away, < 90m napMs)
    const testNow = new Date(2026, 2, 14, 21, 10, 0); // 9:10 PM
    const napEndedAt = new Date(2026, 2, 14, 15, 0, 0).toISOString(); // 3 PM (6h ago)
    const napStart = new Date(2026, 2, 14, 13, 30, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(stage1Baby, latest, [], testNow, 0, undefined, 19, 7);
    // Stage 1 should NOT show Bedtime countdown via this guard
    expect(insight.narrative).not.toContain('Bedtime in about');
  });
});

describe('getBabyInsight — past-bedtime nap suppression', () => {
  // After bedtime has passed and baby is not asleep, all nap language should be
  // suppressed. The narrative should reference sleep/bedtime, not nap suggestions.
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('suppresses nap language and shows past-bedtime narrative at 8 PM (Stage 2)', () => {
    // 8 PM — past 7 PM bedtime; baby woke from last nap at 4 PM, not yet asleep
    const testNow = new Date(2026, 2, 14, 20, 0, 0); // 8 PM
    const napEndedAt = new Date(2026, 2, 14, 16, 0, 0).toISOString(); // 4 PM
    const napStart = new Date(2026, 2, 14, 14, 0, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).toContain('past');
    expect(insight.narrative).toContain('John');
    expect(insight.narrative.toLowerCase()).not.toContain('nap');
    expect(insight.urgency).toBe('overdue');
    expect(insight.predictions).toHaveLength(0);
  });

  it('hides bottle and diaper prediction chips after bedtime for Stage 2 awake babies', () => {
    const testNow = new Date(2026, 2, 14, 20, 0, 0); // 8 PM, past 7 PM bedtime
    const napEndedAt = new Date(2026, 2, 14, 16, 0, 0).toISOString(); // 4 PM
    const napStart = new Date(2026, 2, 14, 14, 0, 0).toISOString();
    const lastFeedAt = new Date(2026, 2, 14, 17, 30, 0).toISOString(); // normal next = 9:30 PM
    const lastDiaperAt = new Date(2026, 2, 14, 18, 30, 0).toISOString(); // normal next = 8:30 PM
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
      [`${BABY_ID}:bottle`]: {
        ...makeEvent(BABY_ID, 'bottle', lastFeedAt),
        value: 4,
      },
      [`${BABY_ID}:diaper`]: makeEvent(BABY_ID, 'diaper', lastDiaperAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(true);
    expect(insight.predictions).toHaveLength(0);
  });

  it('shows awake-for-the-day nap language after an early wake before wakeHour', () => {
    // 5 AM — before configured 7 AM wakeHour; baby woke from a real night sleep at 3 AM
    const testNow = new Date(2026, 2, 14, 5, 0, 0); // 5 AM
    const sleepEndedAt = new Date(2026, 2, 14, 3, 0, 0).toISOString(); // 3 AM
    const sleepStart = new Date(2026, 2, 13, 19, 0, 0).toISOString(); // previous night
    const latest: LatestEventMap = {
      [`${BABY_ID}:sleep`]: makeEvent(BABY_ID, 'sleep', sleepStart, sleepEndedAt),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(false);
    expect(insight.narrative.toLowerCase()).toContain('nap');
    expect(insight.urgency).toBe('overdue');
  });

  it('does NOT suppress nap language for Stage 1 (no bedtime concept)', () => {
    const stage1Baby: Baby = {
      id: BABY_ID,
      name: 'John',
      color: 'sky',
      birthDate: new Date(Date.now() - 3 * 7 * 24 * 60 * 60_000).toISOString(), // 3 weeks old
      createdAt: new Date().toISOString(),
    };
    // 10 PM — past Stage 1 effective bedtime (10 PM) but Stage 1 has no nap suppression
    const testNow = new Date(2026, 2, 14, 22, 30, 0); // 10:30 PM
    const napEndedAt = new Date(2026, 2, 14, 20, 0, 0).toISOString(); // 8 PM
    const napStart = new Date(2026, 2, 14, 18, 30, 0).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, napEndedAt),
    };
    const insight = getBabyInsight(stage1Baby, latest, [], testNow, 0, undefined, 19, 7);
    // Stage 1 should NOT show past-bedtime narrative
    expect(insight.narrative).not.toContain('past');
    expect(insight.predictions.some(p => p.type === 'bottle' || p.type === 'diaper')).toBe(false);
  });
});

describe('getBabyInsight — isNight', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('isNight is true when current hour >= bedtimeHour', () => {
    const testNow = new Date(2026, 2, 14, 20, 0, 0); // 8 PM
    const insight = getBabyInsight(baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(true);
  });

  it('isNight is false during daytime hours', () => {
    const testNow = new Date(2026, 2, 14, 10, 0, 0); // 10 AM
    const insight = getBabyInsight(baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(false);
  });

  it('isNight is true before wakeHour', () => {
    const testNow = new Date(2026, 2, 14, 5, 0, 0); // 5 AM
    const insight = getBabyInsight(baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(true);
  });

  it('isNight flips to false after a real night sleep ended before wakeHour', () => {
    const testNow = new Date(2026, 2, 14, 5, 40, 0); // 5:40 AM, still before configured 7 AM wake
    const latest: LatestEventMap = {
      [`${BABY_ID}:sleep`]: makeEvent(
        BABY_ID,
        'sleep',
        new Date(2026, 2, 13, 19, 30, 0).toISOString(),
        new Date(2026, 2, 14, 5, 30, 0).toISOString(),
      ),
    };
    const insight = getBabyInsight(
      baby,
      latest,
      Object.values(latest),
      testNow,
      0,
      undefined,
      19,
      7,
    );
    expect(insight.isNight).toBe(false);
  });

  it('suppresses past-bedtime narrative after an early morning wake before wakeHour', () => {
    const testNow = new Date(2026, 2, 14, 5, 40, 0);
    const sleepEvent = makeEvent(
      BABY_ID,
      'sleep',
      new Date(2026, 2, 13, 19, 30, 0).toISOString(),
      new Date(2026, 2, 14, 5, 30, 0).toISOString(),
    );
    const latest: LatestEventMap = { [`${BABY_ID}:sleep`]: sleepEvent };
    const insight = getBabyInsight(baby, latest, [sleepEvent], testNow, 0, undefined, 19, 7);
    expect(insight.narrative).not.toContain('past');
    expect(insight.narrative).not.toContain('Time for sleep');
  });

  it('no-data headline is "Good night" at night', () => {
    const testNow = new Date(2026, 2, 14, 21, 0, 0); // 9 PM
    const insight = getBabyInsight(baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.headline).toBe('Good night');
  });

  it('no-data headline is "Good morning" during day', () => {
    const testNow = new Date(2026, 2, 14, 9, 0, 0); // 9 AM
    const insight = getBabyInsight(baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.headline).toBe('Good morning');
  });
});

describe('getBabyInsight — isBedtimeStretch', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: STAGE2_BIRTH_DATE,
    createdAt: new Date().toISOString(),
  };

  it('true when baby woke within 4.5h of bedtime and bedtime has not arrived', () => {
    // 3 PM now, bedtime 7 PM (4h away), woke at 2:30 PM (3.5h before bedtime)
    const testNow = new Date(2026, 2, 14, 15, 0, 0);
    const wokeAt = new Date(testNow.getTime() - 30 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        new Date(testNow.getTime() - (NAP_DURATION_MS + 30 * 60_000)).toISOString(),
        wokeAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(true);
  });

  it('false when bedtime is more than 4.5h away', () => {
    // 10 AM now, bedtime 7 PM (9h away)
    const testNow = new Date(2026, 2, 14, 10, 0, 0);
    const wokeAt = new Date(testNow.getTime() - 30 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        new Date(testNow.getTime() - (NAP_DURATION_MS + 30 * 60_000)).toISOString(),
        wokeAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(false);
  });

  it('false when it is already past bedtime (isNight)', () => {
    // 8 PM now, bedtime 7 PM — bedtimeRemainingMs < 0
    const testNow = new Date(2026, 2, 14, 20, 0, 0);
    const wokeAt = new Date(testNow.getTime() - 60 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        new Date(testNow.getTime() - (NAP_DURATION_MS + 60 * 60_000)).toISOString(),
        wokeAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(false);
  });

  it('false when no nap/sleep data (lastWokeMs = 0)', () => {
    const testNow = new Date(2026, 2, 14, 16, 0, 0);
    const insight = getBabyInsight(baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(false);
  });

  it('narrative contains Bedtime when isBedtimeStretch is true', () => {
    const testNow = new Date(2026, 2, 14, 18, 55, 0); // 5 min before 7 PM bedtime
    const wokeAt = new Date(testNow.getTime() - 3 * 60 * 60_000).toISOString(); // 3:55 PM
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        new Date(testNow.getTime() - (NAP_DURATION_MS + 3 * 60 * 60_000)).toISOString(),
        wokeAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(true);
    expect(insight.narrative).toContain('Bedtime');
    expect(insight.urgency).toBe('soon'); // within SOON_THRESHOLD_MS of bedtime
  });
});

describe('getBabyInsight with learnedStats', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    createdAt: new Date().toISOString(),
  };

  it('suggestedOz is rounded avgBottleOz from learnedStats', () => {
    const learned: LearnedStats = {
      avgFeedIntervalMs: null,
      avgBottleOz: 5.6,
      avgNapDurationMs: null,
      avgAwakeWindowMs: null,
      avgNapsPerDay: null,
    };
    const insight = getBabyInsight(baby, {}, [], NOW, 0, learned);
    expect(insight.suggestedOz).toBe(6);
  });

  it('suggestedOz falls back to age-based default when avgBottleOz is null', () => {
    const learned: LearnedStats = {
      avgFeedIntervalMs: null,
      avgBottleOz: null,
      avgNapDurationMs: null,
      avgAwakeWindowMs: null,
      avgNapsPerDay: null,
    };
    const insight = getBabyInsight(baby, {}, [], NOW, 0, learned);
    expect(typeof insight.suggestedOz).toBe('number'); // age default, not null
  });

  it('avgFeedIntervalMs overrides the default feed schedule', () => {
    // With a 5h learned interval, a bottle 4h ago should still be urgency ok
    const learned: LearnedStats = {
      avgFeedIntervalMs: 5 * 3_600_000,
      avgBottleOz: null,
      avgNapDurationMs: null,
      avgAwakeWindowMs: null,
      avgNapsPerDay: null,
    };
    const latest: LatestEventMap = {
      [`${BABY_ID}:bottle`]: makeEvent(BABY_ID, 'bottle', msAgo(4 * 3_600_000)),
    };
    const insight = getBabyInsight(baby, latest, [], NOW, 0, learned);
    expect(insight.urgency).toBe('ok'); // 4h < 5h learned interval
  });
});

describe('getBabyInsight — Stage 1 newborn behavior', () => {
  const stage1Baby: Baby = {
    id: BABY_ID,
    name: 'Lily',
    color: 'sky',
    // No birthDate → defaults to 14 weeks = Stage 1
    createdAt: new Date().toISOString(),
  };

  it('awake window uses nap language (same as Stage 2)', () => {
    const noon = new Date(2026, 2, 14, 12, 0, 0);
    const wokeAt = new Date(noon.getTime() - 30 * 60_000).toISOString();
    const napStart = new Date(noon.getTime() - (90 * 60_000 + 30 * 60_000)).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, wokeAt),
    };
    const insight = getBabyInsight(stage1Baby, latest, [], noon);
    expect(insight.narrative.toLowerCase()).toContain('nap');
  });

  it('awake window narrative does not include nap-anywhere note', () => {
    const noon = new Date(2026, 2, 14, 12, 0, 0);
    const wokeAt = new Date(noon.getTime() - 30 * 60_000).toISOString();
    const napStart = new Date(noon.getTime() - (90 * 60_000 + 30 * 60_000)).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, wokeAt),
    };
    const insight = getBabyInsight(stage1Baby, latest, [], noon);
    expect(insight.narrative).not.toContain('swing');
  });

  it('isBedtimeStretch is always false for Stage 1', () => {
    // Even if woke within 4.5h of 10pm bedtime, Stage 1 suppresses the bedtime stretch
    const testNow = new Date(2026, 2, 14, 19, 30, 0); // 7:30 PM — 2.5h before 10pm
    const wokeAt = new Date(testNow.getTime() - 30 * 60_000).toISOString();
    const napStart = new Date(testNow.getTime() - (90 * 60_000 + 30 * 60_000)).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStart, wokeAt),
    };
    const insight = getBabyInsight(stage1Baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(false);
    expect(insight.narrative).not.toContain('Bedtime');
  });

  it('isNight uses 10pm threshold for Stage 1 regardless of user bedtimeHour pref', () => {
    // 9 PM — user has bedtime set to 7 PM, but Stage 1 uses 10 PM
    const testNow = new Date(2026, 2, 14, 21, 0, 0);
    const insight = getBabyInsight(stage1Baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(false); // not yet 10 PM
  });

  it('isNight is true after 10pm for Stage 1', () => {
    const testNow = new Date(2026, 2, 14, 22, 30, 0);
    const insight = getBabyInsight(stage1Baby, {}, [], testNow, 0, undefined, 19, 7);
    expect(insight.isNight).toBe(true);
  });

  it('active sleep event does not show "sleeping for the night" narrative', () => {
    const sleepStartedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:sleep`]: makeEvent(BABY_ID, 'sleep', sleepStartedAt),
    };
    const insight = getBabyInsight(stage1Baby, latest, [], NOW);
    expect(insight.narrative).not.toContain('night');
  });
});

describe('getBabyInsight — overnight feed wake alert (< 4 weeks)', () => {
  /** Baby under 4 weeks: birth date 2 weeks ago. */
  const newbornBirthDate = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const newborn: Baby = {
    id: BABY_ID,
    name: 'Max',
    color: 'amber',
    birthDate: newbornBirthDate,
    createdAt: new Date().toISOString(),
  };

  it('surfaces wake alert when sleeping > 4h and baby < 4 weeks', () => {
    const sleepStartedAt = new Date(Date.now() - 4.5 * 60 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', sleepStartedAt),
    };
    const insight = getBabyInsight(newborn, latest, [], NOW);
    expect(insight.narrative).toContain('Wake');
    expect(insight.narrative).toContain('feed');
    expect(insight.urgency).toBe('overdue');
  });

  it('does not surface wake alert when sleeping < 4h', () => {
    const sleepStartedAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', sleepStartedAt),
    };
    const insight = getBabyInsight(newborn, latest, [], NOW);
    // Wake-for-feed alert should not show — nap may still be overdue by duration, but not the alert
    expect(insight.narrative).not.toContain('Wake');
    expect(insight.narrative).not.toContain('feed');
  });

  it('does not surface wake alert for babies >= 4 weeks (Stage 1 but older)', () => {
    const fourWeekBirthDate = new Date(Date.now() - 28 * 24 * 60 * 60_000)
      .toISOString()
      .slice(0, 10);
    const fourWeekBaby: Baby = { ...newborn, birthDate: fourWeekBirthDate };
    const sleepStartedAt = new Date(Date.now() - 5 * 60 * 60_000).toISOString();
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', sleepStartedAt),
    };
    const insight = getBabyInsight(fourWeekBaby, latest, [], NOW);
    expect(insight.narrative).not.toContain('Wake Max');
  });
});

describe('getBabyInsight — pre-bedtime feed/diaper snapping', () => {
  /**
   * Stage 2 baby (5 months old). Tests use bedtimeHour=19 (7 PM).
   * PRE_BEDTIME_FEED_BUFFER_MS  = 30m  → feed deadline = 6:30 PM
   * PRE_BEDTIME_DIAPER_BUFFER_MS = 15m → diaper deadline = 6:45 PM
   * DIAPER_INTERVAL_MS = 2h
   */
  const stage2BirthDate = new Date(Date.now() - 20 * 7 * 24 * 60 * 60_000).toISOString();
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    birthDate: stage2BirthDate,
    createdAt: new Date().toISOString(),
  };

  /** Shared helper: build a LatestEventMap with a wakeup at wokeAt and optional feed + diaper. */
  function makeLatest(opts: {
    wokeAt: Date;
    lastFeedAt?: Date;
    lastDiaperAt?: Date;
  }): LatestEventMap {
    const map: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        new Date(opts.wokeAt.getTime() - NAP_DURATION_MS).toISOString(),
        opts.wokeAt.toISOString(),
      ),
    };
    if (opts.lastFeedAt) {
      map[`${BABY_ID}:bottle`] = {
        ...makeEvent(BABY_ID, 'bottle', opts.lastFeedAt.toISOString()),
        value: 4,
      };
    }
    if (opts.lastDiaperAt) {
      map[`${BABY_ID}:diaper`] = makeEvent(BABY_ID, 'diaper', opts.lastDiaperAt.toISOString());
    }
    return map;
  }

  it('narrative shows "Feed by X" when normal next feed overshoots bedtime', () => {
    // testNow = 5:45 PM; bedtime = 7 PM; last feed at 2 PM (Stage 2 = 4h interval → due 6 PM)
    // 6 PM < 7 PM bedtime → no snap needed — BUT the narrative still shows bedtime countdown
    // Adjust: last feed at 3:30 PM → next feed at 7:30 PM → overshoots → snap to 6:30 PM
    const testNow = new Date(2026, 2, 14, 17, 45, 0); // 5:45 PM
    const wokeAt = new Date(testNow.getTime() - 60 * 60_000); // 4:45 PM (1h before now)
    const lastFeedAt = new Date(2026, 2, 14, 15, 30, 0); // 3:30 PM → next = 7:30 PM (overshoots)
    const latest = makeLatest({ wokeAt, lastFeedAt });
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(true);
    expect(insight.narrative).toMatch(/Feed.*by.*6:30 PM/);
    expect(insight.narrative).toContain('Bedtime');
  });

  it('narrative is pure bedtime countdown when last feed was very recent (no snap needed)', () => {
    // testNow = 5 PM; bedtime = 7 PM; last feed at 4 PM (Stage 2 = 4h → due 8 PM overshoots)
    // Wait — that DOES overshoot. Use last feed at 4 PM, but it already counted as "just fed":
    // Actually, last feed at 4:30 PM → next = 8:30 PM → overshoots bedtime → would show "Feed by" —
    // To get pure countdown, last feed must be due BEFORE bedtime:
    // last feed at 3:30 PM → next = 7:30 PM → overshoots → shows "Feed by"
    // last feed at 4:30 PM (just 30m ago) → next feed = 8:30 PM → overshoots → still shows "Feed by"
    // The ONLY way to get pure countdown is when normal next feed <= bedtime:
    // Stage 2 interval = 4h; bedtime = 7 PM; last feed must be after 3 PM for next feed = before 7 PM
    // last feed at 4 PM → next = 8 PM → still overshoots
    // last feed at 3:10 PM → next = 7:10 PM → overshoots (just barely)
    // last feed at 3:00 PM → next = 7:00 PM → exactly bedtime → does NOT overshoot (equal is ok)
    // last feed at 4:00 PM → ... feed at 3 PM = 7 PM exactly → no snap → pure countdown
    const testNow = new Date(2026, 2, 14, 17, 0, 0); // 5 PM
    const wokeAt = new Date(testNow.getTime() - 60 * 60_000); // 4 PM
    const lastFeedAt = new Date(2026, 2, 14, 15, 0, 0); // 3 PM → next = 7 PM exactly (= bedtime, no snap)
    const latest = makeLatest({ wokeAt, lastFeedAt });
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(true);
    expect(insight.narrative).not.toMatch(/Feed.*by/);
    expect(insight.narrative).toContain('Bedtime');
  });

  it('narrative shows urgency overdue when feed window has already passed', () => {
    // testNow = 6:45 PM; bedtime = 7 PM; feed deadline = 6:30 PM (already passed)
    // Last feed overshoots bedtime → feed deadline was 6:30 PM → now past that
    const testNow = new Date(2026, 2, 14, 18, 45, 0); // 6:45 PM
    const wokeAt = new Date(testNow.getTime() - 2 * 60 * 60_000); // 4:45 PM
    // Need overshoot: lastFeedAt at 3:30 PM → next = 7:30 PM; deadline = 6:30 PM; testNow = 6:45 PM → overdue
    const lastFeedAtOvershoot = new Date(2026, 2, 14, 15, 30, 0); // 3:30 PM
    const latestOvershoot = makeLatest({ wokeAt, lastFeedAt: lastFeedAtOvershoot });
    const insight = getBabyInsight(baby, latestOvershoot, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(true);
    expect(insight.urgency).toBe('overdue');
    expect(insight.narrative).toMatch(/Feed.*before bed/);
    expect(insight.narrative).toContain('Bedtime');
  });

  it('narrative includes "+ change" suffix when diaper also needs to happen before bedtime', () => {
    // testNow = 5:30 PM; bedtime = 7 PM; feed overhoots; last diaper > 1h 45m ago
    // last diaper at 3 PM → normal next = 5 PM → past pre-bedtime diaper deadline (6:45 PM)? No.
    // Normal next diaper at 5 PM < 6:45 PM → no snap (not overdue). Need diaper to overshoot too:
    // last diaper at 5 PM → normal next = 7 PM → overshoots 6:45 PM diaper deadline → snap
    const testNow = new Date(2026, 2, 14, 17, 30, 0); // 5:30 PM
    const wokeAt = new Date(testNow.getTime() - 60 * 60_000); // 4:30 PM
    const lastFeedAt = new Date(2026, 2, 14, 15, 30, 0); // 3:30 PM → next = 7:30 PM (overshoots)
    const lastDiaperAt = new Date(2026, 2, 14, 17, 0, 0); // 5 PM → next = 7 PM (overshoots 6:45 PM deadline)
    const latest = makeLatest({ wokeAt, lastFeedAt, lastDiaperAt });
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insight.isBedtimeStretch).toBe(true);
    expect(insight.narrative).toMatch(/\+ change/);
  });

  it('predictions bottle chip snaps to pre-bedtime deadline when normal next feed overshoots', () => {
    // Same scenario as "Feed by X" narrative test: feed snapped from 7:30 PM → 6:30 PM
    const testNow = new Date(2026, 2, 14, 17, 45, 0); // 5:45 PM
    const wokeAt = new Date(testNow.getTime() - 60 * 60_000);
    const lastFeedAt = new Date(2026, 2, 14, 15, 30, 0); // → next = 7:30 PM → snaps to 6:30 PM
    const latest = makeLatest({ wokeAt, lastFeedAt });
    const insight = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    const bottleChip = insight.predictions.find(p => p.type === 'bottle');
    expect(bottleChip).toBeDefined();
    // Normal next = 7:30 PM = testNow + 1h 45m; snapped = 6:30 PM = testNow + 45m
    // Remaining should be ~45 minutes, not 1h 45m
    expect(bottleChip!.remainingMs).toBeLessThan(60 * 60_000); // < 1h (was 1h 45m before snapping)
    expect(bottleChip!.remainingMs).toBeGreaterThan(0);
  });

  it('bedtime uses effectiveBedtimeHour: Stage 2 uses user pref, Stage 1 uses 10pm', () => {
    // Verify Stage 2 baby with bedtimeHour=19 respects that preference
    const testNow = new Date(2026, 2, 14, 18, 30, 0); // 6:30 PM — 30min before 7 PM
    const wokeAt = new Date(testNow.getTime() - 60 * 60_000); // 5:30 PM
    const lastFeedAt = new Date(2026, 2, 14, 15, 30, 0); // 3:30 PM → next = 7:30 PM → snaps to 6:30 PM
    const latest = makeLatest({ wokeAt, lastFeedAt });

    // Stage 2 baby with bedtimeHour=19 → feed deadline = 18:30, testNow = 18:30 → right on the edge
    const insightStage2 = getBabyInsight(baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insightStage2.isBedtimeStretch).toBe(true);

    // Stage 1 baby (no birthDate → 14w default) with same testNow and bedtimeHour=19
    // effectiveBedtimeHour = 22, so todayBedtime = 10 PM → 6:30 PM is 3.5h before 10 PM
    // → isBedtimeStretch should be false (suppressed for Stage 1)
    const stage1Baby: Baby = { ...baby, birthDate: undefined };
    const insightStage1 = getBabyInsight(stage1Baby, latest, [], testNow, 0, undefined, 19, 7);
    expect(insightStage1.isBedtimeStretch).toBe(false);
    expect(insightStage1.narrative).not.toContain('Bedtime');
  });
});
