import {
  getNextAction,
  getAgeWeeks,
  getScheduleForAge,
  getScheduleStage,
  getSelfSoothingMinutes,
  getBabyInsight,
  isNightFireTime,
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
    createdAt: new Date().toISOString(),
  };

  it('sleeping baby: headline contains "Sleeping", alarmMs > 0, narrative mentions name', () => {
    const napStartedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.headline).toContain('Sleeping');
    expect(insight.alarmMs).toBeGreaterThan(0);
    expect(insight.narrative).toContain('John');
    expect(insight.urgency).toBe('ok');
  });

  it('overdue nap: alarmMs is null, urgency overdue', () => {
    const napStartedAt = msAgo(NAP_DURATION_MS + 15 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.alarmMs).toBeNull();
    expect(insight.urgency).toBe('overdue');
    expect(insight.narrative).toContain('longer than usual');
  });

  it('awake within window: headline contains "Awake", alarmMs null, narrative mentions nap timing', () => {
    const napEndedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        msAgo(NAP_DURATION_MS + 30 * 60_000),
        napEndedAt,
      ),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.headline).toContain('Awake');
    expect(insight.alarmMs).toBeNull();
    expect(insight.urgency).toBe('ok');
  });

  it('awake, nap overdue: urgency overdue', () => {
    const napEndedAt = msAgo(AWAKE_DURATION_MS + 10 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(
        BABY_ID,
        'nap',
        msAgo(NAP_DURATION_MS + AWAKE_DURATION_MS + 10 * 60_000),
        napEndedAt,
      ),
    };
    // bedtimeHour=23 prevents isBedtimeStretch from masking the overdue result
    // regardless of what time of day the test runs.
    const insight = getBabyInsight(baby, latest, [], NOW, 0, undefined, 23, 6);
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

  it('no events: urgency ok, no alarm, narrative mentions name', () => {
    // Use a fixed 10am time so headline is deterministically "Good morning"
    const testNow = new Date(2026, 2, 14, 10, 0, 0);
    const insight = getBabyInsight(baby, {}, [], testNow);
    expect(insight.urgency).toBe('ok');
    expect(insight.alarmMs).toBeNull();
    expect(insight.narrative).toContain('John');
    expect(insight.headline).toBe('Good morning');
  });

  it('scheduleStage is 1 when no birthDate (default ~14w = Stage 1)', () => {
    const insight = getBabyInsight(baby, {}, [], NOW);
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

  it('totalOzToday respects non-zero resetHour: event before reset excluded, event after included', () => {
    // NOW is a fixed point in time; we build a "now" that is 10:00 AM on some date
    const testNow = new Date(2026, 2, 14, 10, 0, 0); // 10 AM March 14
    // resetHour = 6: period starts at 6 AM today
    // bottle at 5:00 AM today → before 6 AM reset → NOT counted
    const beforeReset: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', '2026-03-14T05:00:00'),
      id: 'br1',
      value: 10,
    };
    // bottle at 7:00 AM today → after 6 AM reset → counted
    const afterReset: TrackerEvent = {
      ...makeEvent(BABY_ID, 'bottle', '2026-03-14T07:00:00'),
      id: 'br2',
      value: 4,
    };
    const insight = getBabyInsight(baby, {}, [beforeReset, afterReset], testNow, 6);
    expect(insight.totalOzToday).toBe(4); // only afterReset counts
  });
});

describe('getBabyInsight — night sleep (sleep event type)', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    createdAt: new Date().toISOString(),
  };

  it('active sleep event shows "Sleeping for the night" narrative', () => {
    const latest: LatestEventMap = {
      [`${BABY_ID}:sleep`]: makeEvent(BABY_ID, 'sleep', msAgo(2 * 60 * 60_000)),
    };
    const insight = getBabyInsight(baby, latest, [], NOW);
    expect(insight.headline).toContain('Sleeping');
    expect(insight.narrative).toContain('night');
    expect(insight.alarmMs).toBeNull(); // no alarm for night sleep
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

describe('getBabyInsight — sleep training hint', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
    createdAt: new Date().toISOString(),
  };

  it('appends self-soothing hint to narrative when sleep training is on and nap is active', () => {
    const napStartedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW, 0, undefined, 19, 7, true);
    expect(insight.narrative).toContain('wait');
    expect(insight.narrative).toMatch(/\d+m/); // "Xm" wait time
  });

  it('does not include self-soothing hint when sleep training is off', () => {
    const napStartedAt = msAgo(30 * 60_000);
    const latest: LatestEventMap = {
      [`${BABY_ID}:nap`]: makeEvent(BABY_ID, 'nap', napStartedAt),
    };
    const insight = getBabyInsight(baby, latest, [], NOW, 0, undefined, 19, 7, false);
    expect(insight.narrative).not.toContain('wait');
  });
});

describe('getBabyInsight — isNight', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
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

describe('isNightFireTime', () => {
  // bedtimeHour=19, wakeHour=7
  it('returns true for an hour at bedtime (19:00)', () => {
    const d = new Date(2026, 2, 14, 19, 0, 0);
    expect(isNightFireTime(d.getTime(), 19, 7)).toBe(true);
  });

  it('returns true for a middle-of-night hour (2:00)', () => {
    const d = new Date(2026, 2, 14, 2, 0, 0);
    expect(isNightFireTime(d.getTime(), 19, 7)).toBe(true);
  });

  it('returns true for just before wake hour (6:59)', () => {
    const d = new Date(2026, 2, 14, 6, 59, 0);
    expect(isNightFireTime(d.getTime(), 19, 7)).toBe(true);
  });

  it('returns false at wake hour (7:00)', () => {
    const d = new Date(2026, 2, 14, 7, 0, 0);
    expect(isNightFireTime(d.getTime(), 19, 7)).toBe(false);
  });

  it('returns false midday (12:00)', () => {
    const d = new Date(2026, 2, 14, 12, 0, 0);
    expect(isNightFireTime(d.getTime(), 19, 7)).toBe(false);
  });

  it('returns false just before bedtime (18:59)', () => {
    const d = new Date(2026, 2, 14, 18, 59, 0);
    expect(isNightFireTime(d.getTime(), 19, 7)).toBe(false);
  });
});

describe('getBabyInsight — isBedtimeStretch', () => {
  const baby: Baby = {
    id: BABY_ID,
    name: 'John',
    color: 'sky',
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
    };
    const latest: LatestEventMap = {
      [`${BABY_ID}:bottle`]: makeEvent(BABY_ID, 'bottle', msAgo(4 * 3_600_000)),
    };
    const insight = getBabyInsight(baby, latest, [], NOW, 0, learned);
    expect(insight.urgency).toBe('ok'); // 4h < 5h learned interval
  });
});
