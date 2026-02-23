/**
 * Timezone utilities for the calendar system.
 *
 * PRINCIPLE: All bookings are made in Australia/Sydney wall-clock time.
 * These utilities ensure:
 * 1. Display always shows Sydney time as the primary time
 * 2. Optionally shows the user's local time for reference
 * 3. Formatting is consistent across all calendar components
 */

const SYDNEY_TZ = 'Australia/Sydney';

/**
 * Format a UTC ISO string as Sydney wall-clock time.
 * This is the PRIMARY display format for all calendar times.
 *
 * @param isoString - UTC ISO timestamp (e.g., from GHL API)
 * @param options   - Intl.DateTimeFormat options (defaults to time only)
 */
export function formatInSydney(
  isoString: string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';

    const defaults: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: SYDNEY_TZ,
    };

    return new Intl.DateTimeFormat('en-AU', { ...defaults, ...options }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format a UTC ISO string as Sydney time with full date.
 */
export function formatDateInSydney(
  isoString: string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';

    const defaults: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: SYDNEY_TZ,
    };

    return new Intl.DateTimeFormat('en-AU', { ...defaults, ...options }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format a UTC ISO string as time in the user's local timezone.
 * Used as a secondary reference display (e.g., "Your time: 1:30 PM").
 */
export function formatInLocal(
  isoString: string | undefined | null,
  userTimezone?: string
): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';

    const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Get the short timezone abbreviation for Sydney at a given date.
 * Returns "AEST" or "AEDT" depending on daylight saving.
 */
export function getSydneyTzAbbr(isoString?: string | null): string {
  try {
    const date = isoString ? new Date(isoString) : new Date();
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: SYDNEY_TZ,
      timeZoneName: 'short',
    }).formatToParts(date);

    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value || 'AEST';
  } catch {
    return 'AEST';
  }
}

/**
 * Check if the user's browser timezone is different from Sydney.
 * When true, we should show a local time reference.
 */
export function isNonSydneyTimezone(userTimezone?: string): boolean {
  const local = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return local !== SYDNEY_TZ;
}

/**
 * Get the Sydney date/time parts from a UTC ISO string.
 * Useful for pre-filling form inputs with Sydney wall-clock values.
 *
 * Returns { dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM' } in Sydney time.
 */
export function getSydneyDateTimeParts(isoString: string): {
  dateStr: string;
  timeStr: string;
} {
  const date = new Date(isoString);

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const timeStr = `${get('hour')}:${get('minute')}`;

  return { dateStr, timeStr };
}

/**
 * Format a time range in Sydney time: "2:00 PM – 3:00 PM AEST"
 */
export function formatSydneyTimeRange(
  startISO: string | undefined | null,
  endISO: string | undefined | null
): string {
  const start = formatInSydney(startISO);
  const end = formatInSydney(endISO);
  const abbr = getSydneyTzAbbr(startISO);
  return `${start} – ${end} ${abbr}`;
}

/**
 * Format a full display string with optional local time reference.
 * Example: "2:00 PM – 3:00 PM AEST (Your time: 12:00 PM – 1:00 PM)"
 */
export function formatSydneyTimeRangeWithLocal(
  startISO: string | undefined | null,
  endISO: string | undefined | null,
  userTimezone?: string
): { sydneyRange: string; localRange?: string } {
  const sydneyRange = formatSydneyTimeRange(startISO, endISO);

  if (!isNonSydneyTimezone(userTimezone)) {
    return { sydneyRange };
  }

  const localStart = formatInLocal(startISO, userTimezone);
  const localEnd = formatInLocal(endISO, userTimezone);
  return {
    sydneyRange,
    localRange: `${localStart} – ${localEnd}`,
  };
}
