import { parseLocalDateInputValue } from '@tt/core';

export function getBirthDatePickerInitialDate(
  birthDate: string | null | undefined,
  fallback = new Date(),
): Date {
  return birthDate ? parseLocalDateInputValue(birthDate) : fallback;
}
