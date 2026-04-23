export function formatLocalDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayLocalDateInputValue(now = new Date()): string {
  return formatLocalDateInputValue(now);
}

export function isFutureLocalDateInputValue(
  value: string | null | undefined,
  now = new Date(),
): boolean {
  if (!value) {
    return false;
  }
  return value > todayLocalDateInputValue(now);
}
