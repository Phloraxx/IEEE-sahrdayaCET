export const APP_TIME_ZONE = 'Asia/Kolkata';
const APP_UTC_OFFSET_MINUTES = 330;
const DATE_LOCALE = 'en-IN';

function parseDate(dateString: string): Date | null {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Convert an instant to the wall-clock value expected by `<input type="datetime-local">`. */
export function toAppDateTimeLocal(dateString: string | undefined): string {
  if (!dateString) return '';
  const date = parseDate(dateString);
  if (!date) return '';
  const shifted = new Date(date.getTime() + APP_UTC_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/** Interpret a `datetime-local` wall clock as Asia/Kolkata and return UTC ISO. */
export function fromAppDateTimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  const wallClock = new Date(wallClockUtc);
  if (
    wallClock.getUTCFullYear() !== year ||
    wallClock.getUTCMonth() !== month - 1 ||
    wallClock.getUTCDate() !== day ||
    wallClock.getUTCHours() !== hour ||
    wallClock.getUTCMinutes() !== minute
  ) return undefined;
  return new Date(wallClockUtc - APP_UTC_OFFSET_MINUTES * 60_000).toISOString();
}

/** UTC ISO bounds for the Asia/Kolkata calendar day containing the supplied instant. */
export function getAppDayBounds(date: Date = new Date()): { startIso: string; endIso: string } {
  const shifted = new Date(date.getTime() + APP_UTC_OFFSET_MINUTES * 60_000);
  const shiftedMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  const start = shiftedMidnight - APP_UTC_OFFSET_MINUTES * 60_000;
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** ISO string helper for building PocketBase date filters. */
export function toIso(date: Date): string {
  return date.toISOString();
}

export function formatDate(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';

  // Build the display text from semantic parts instead of Intl punctuation.
  // Node and Chromium format en-IN punctuation differently, which can cause SSR
  // hydration mismatches even when the underlying date is identical.
  const parts = new Intl.DateTimeFormat(DATE_LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('weekday')}, ${value('day')} ${value('month')} ${value('year')}`;
}

export function formatDateTime(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleString(DATE_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });
}

/** Kickoff chip: date and time split so narrow screens don't overflow. */
export function formatKickoffParts(dateString: string): { date: string; time: string } {
  const date = parseDate(dateString);
  if (!date) return { date: '', time: '' };
  return {
    date: date.toLocaleDateString(DATE_LOCALE, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: APP_TIME_ZONE,
    }),
    time: date.toLocaleTimeString(DATE_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: APP_TIME_ZONE,
    }),
  };
}

export function formatDateLong(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString(DATE_LOCALE, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDateShort(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString(DATE_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDateCompact(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString(DATE_LOCALE, {
    month: 'short',
    day: 'numeric',
    timeZone: APP_TIME_ZONE,
  });
}

export function formatTime(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleTimeString(DATE_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDay(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString(DATE_LOCALE, {
    day: '2-digit',
    timeZone: APP_TIME_ZONE,
  });
}

export function formatMonth(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString(DATE_LOCALE, {
    month: 'short',
    timeZone: APP_TIME_ZONE,
  }).toUpperCase();
}

export function formatHour12(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat(DATE_LOCALE, {
    hour: '2-digit',
    hour12: true,
    timeZone: APP_TIME_ZONE,
  }).formatToParts(date);
  return parts.find((part) => part.type === 'hour')?.value ?? '';
}

export function formatAMPM(dateString: string): string {
  const date = parseDate(dateString);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat(DATE_LOCALE, {
    hour: '2-digit',
    hour12: true,
    timeZone: APP_TIME_ZONE,
  }).formatToParts(date);
  return (parts.find((part) => part.type === 'dayPeriod')?.value ?? '').toUpperCase();
}
