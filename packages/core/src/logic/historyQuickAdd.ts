/**
 * Pick a sensible default timestamp when quick-adding from a day bucket in History.
 *
 * Most past-day quick adds should default to local noon so the parent can fine-tune from
 * a neutral starting point. The exception is the "just after midnight" case: when the
 * latest visible bucket is still "Yesterday", parents are usually logging something that
 * happened right now, not back-filling noon yesterday.
 */
export function defaultQuickAddDateForHistoryDay(date: Date, now = new Date()): Date {
  const selectedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (selectedDay.getTime() === today.getTime()) {
    return new Date(now);
  }

  // Parents commonly quick-add from yesterday's top history bucket shortly after midnight.
  // In that case, default to "now" instead of noon yesterday so fresh overnight logs don't
  // silently land in the wrong day.
  if (now.getHours() < 6 && selectedDay.getTime() === yesterday.getTime()) {
    return new Date(now);
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}
