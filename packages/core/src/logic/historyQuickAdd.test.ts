import { defaultQuickAddDateForHistoryDay } from './historyQuickAdd';

describe('defaultQuickAddDateForHistoryDay', () => {
  it('uses the current time when quick-adding for today', () => {
    const now = new Date('2026-04-22T00:10:00');
    const todayBucket = new Date('2026-04-22T00:00:00');

    const result = defaultQuickAddDateForHistoryDay(todayBucket, now);

    expect(result.toISOString()).toBe(now.toISOString());
  });

  it('uses the current time just after midnight when quick-adding from yesterday', () => {
    const now = new Date('2026-04-22T00:10:00');
    const yesterdayBucket = new Date('2026-04-21T00:00:00');

    const result = defaultQuickAddDateForHistoryDay(yesterdayBucket, now);

    expect(result.toISOString()).toBe(now.toISOString());
  });

  it('falls back to noon for yesterday once the overnight window has passed', () => {
    const now = new Date('2026-04-22T08:10:00');
    const yesterdayBucket = new Date('2026-04-21T00:00:00');

    const result = defaultQuickAddDateForHistoryDay(yesterdayBucket, now);

    expect(result.toISOString()).toBe(new Date('2026-04-21T12:00:00').toISOString());
  });

  it('uses noon for older history buckets', () => {
    const now = new Date('2026-04-22T00:10:00');
    const olderBucket = new Date('2026-04-19T00:00:00');

    const result = defaultQuickAddDateForHistoryDay(olderBucket, now);

    expect(result.toISOString()).toBe(new Date('2026-04-19T12:00:00').toISOString());
  });
});
