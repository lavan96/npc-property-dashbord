/**
 * Converts a date string (YYYY-MM-DD) and time string (HH:MM) into an ISO
 * timestamp that represents that wall-clock time in Australia/Sydney,
 * regardless of the user's browser timezone.
 *
 * Example: toSydneyISO('2025-02-07', '16:30') → '2025-02-07T05:30:00.000Z'
 * (because Sydney is UTC+11 in Feb, so 16:30 AEDT = 05:30 UTC)
 */
export function toSydneyISO(dateStr: string, timeStr: string): string {
  // Build a locale string that forces Australia/Sydney interpretation
  // We construct the date parts and use Intl to find the Sydney UTC offset,
  // then manually apply it.
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Create a rough UTC date to probe the Sydney offset on that day
  const probe = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));

  // Get what Sydney shows for this UTC instant
  const sydneyStr = probe.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  // sydneyStr is like "7/2/2025, 4:30:00 pm"
  const sydneyDate = parseSydneyLocale(sydneyStr);

  // The difference (in ms) between sydneyDate and probe is the offset
  // But we need the offset for the TARGET wall time, not the probe.
  // A more reliable approach: format the target wall-clock as if it were Sydney,
  // then compute what UTC that corresponds to.

  // Use Intl.DateTimeFormat to get the UTC offset for Sydney on the target date
  const offsetMinutes = getSydneyOffsetMinutes(year, month - 1, day, hours, minutes);

  // Target wall-clock in Sydney → UTC = wall-clock - offset
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0) - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Given a Date object representing a time that should be treated as Sydney
 * wall-clock time, return an ISO string in UTC.
 */
export function dateToSydneyISO(date: Date): string {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return toSydneyISO(dateStr, timeStr);
}

function getSydneyOffsetMinutes(year: number, month: number, day: number, hours: number, minutes: number): number {
  // Build a UTC timestamp for the desired wall-clock time
  const utcGuess = Date.UTC(year, month, day, hours, minutes, 0, 0);

  // Format that instant as Sydney time parts
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(utcGuess));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);

  const sydneyMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));

  // offset = sydney_time - utc_time (in minutes)
  return (sydneyMs - utcGuess) / 60_000;
}

function parseSydneyLocale(_str: string): Date {
  // Unused now but kept for reference
  return new Date();
}
