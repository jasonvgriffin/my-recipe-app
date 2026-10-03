import type { IsoDate } from '@/types/meal-plan';

/** Local-time YYYY-MM-DD for a Date. */
export function toIsoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `d` (local time). */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (out.getDay() + 6) % 7; // Mon=0 … Sun=6
  out.setDate(out.getDate() - offset);
  return out;
}

/** The 7 ISO dates of the week starting at `weekStart`. */
export function weekDates(weekStart: IsoDate): IsoDate[] {
  const start = fromIsoDate(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toIsoDate(d);
  });
}

/** Shift an ISO date by a number of calendar days (local time). */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Monday-first short labels for calendar headers. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/** Monday-start grid covering `monthIndex` (0–11), including leading/trailing days. */
export function monthGrid(year: number, monthIndex: number): IsoDate[] {
  const first = new Date(year, monthIndex, 1);
  const start = startOfWeek(first);
  const last = new Date(year, monthIndex + 1, 0);
  const end = startOfWeek(last);
  end.setDate(end.getDate() + 6);
  const dates: IsoDate[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(toIsoDate(d));
  return dates;
}

export function inMonth(iso: IsoDate, year: number, monthIndex: number): boolean {
  const d = fromIsoDate(iso);
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

export function formatMonthYear(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

export function formatShortDate(iso: IsoDate): string {
  const d = fromIsoDate(iso);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatLongDate(iso: IsoDate): string {
  const d = fromIsoDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
