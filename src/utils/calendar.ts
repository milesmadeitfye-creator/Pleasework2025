/**
 * Calendar utility functions for date and week calculations
 */

/**
 * Get the start of the week for a given date
 * @param date - The date to find the start of week for
 * @param weekStartsOn - Day of week to start on (0 = Sunday, 1 = Monday)
 */
export function getStartOfWeek(date: Date, weekStartsOn: number = 0): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the week for a given date
 * @param date - The date to find the end of week for
 * @param weekStartsOn - Day of week to start on (0 = Sunday, 1 = Monday)
 */
export function getEndOfWeek(date: Date, weekStartsOn: number = 0): Date {
  const start = getStartOfWeek(date, weekStartsOn);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(0, 0, 0, 0);
  return end;
}

/**
 * Format a time range for display
 */
export function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit'
  };

  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

/**
 * Get an array of dates for the week
 */
export function getWeekDays(date: Date, weekStartsOn: number = 0): Date[] {
  const start = getStartOfWeek(date, weekStartsOn);
  const days: Date[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  return days;
}
