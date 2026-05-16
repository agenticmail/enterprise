/**
 * Minimal cron expression parser + next-fire computation with IANA timezone.
 *
 * Supported fields (5-field cron):  minute  hour  day-of-month  month  day-of-week
 *
 * Per-field syntax:
 *   *           any value
 *   N           single value
 *   N,M,...     enumeration
 *   N-M         inclusive range
 *   *\/N        every N (step from min)
 *   N-M/S       range with step
 *
 * Day-of-week: 0=Sunday … 6=Saturday (7 also accepted for Sunday).
 *
 * Combined day-of-month + day-of-week behaves like Vixie cron:
 *   - if either field is *, the other applies alone
 *   - if both are specific, a date matches when EITHER matches (OR)
 *
 * Timezone-aware: the cron expression is evaluated against wall-clock time
 * in the supplied IANA timezone (e.g. "America/Chicago"). DST jumps are
 * handled by re-converting each candidate minute through Intl.
 */

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59],   // minute
  [0, 23],   // hour
  [1, 31],   // day-of-month
  [1, 12],   // month
  [0, 6],    // day-of-week
];

interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  doms: Set<number>;
  months: Set<number>;
  dows: Set<number>;
  /** true when the field was literally "*" — needed for dom/dow OR-vs-AND semantics */
  domStar: boolean;
  dowStar: boolean;
}

function parseField(expr: string, idx: number): { set: Set<number>; isStar: boolean } {
  const [min, max] = FIELD_RANGES[idx];
  const isStar = expr === '*';
  const out = new Set<number>();
  for (const part of expr.split(',')) {
    const stepSplit = part.split('/');
    const base = stepSplit[0];
    const step = stepSplit[1] ? parseInt(stepSplit[1], 10) : 1;
    if (!Number.isFinite(step) || step <= 0) throw new Error(`bad cron step: ${part}`);

    let lo: number;
    let hi: number;
    if (base === '*') {
      lo = min;
      hi = max;
    } else if (base.includes('-')) {
      const [a, b] = base.split('-').map((n) => parseInt(n, 10));
      lo = a;
      hi = b;
    } else {
      lo = hi = parseInt(base, 10);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`bad cron value: ${part}`);

    // day-of-week: accept 7 as Sunday
    if (idx === 4) {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }

    if (lo > hi) throw new Error(`bad cron range: ${part}`);
    if (lo < min || hi > max) throw new Error(`cron value out of range: ${part}`);

    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return { set: out, isStar };
}

export function parseCron(rule: string): ParsedCron {
  const parts = rule.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron must have 5 fields, got ${parts.length}: "${rule}"`);
  const [m, h, dom, mon, dow] = parts.map((p, i) => parseField(p, i));
  return {
    minutes: m.set,
    hours: h.set,
    doms: dom.set,
    months: mon.set,
    dows: dow.set,
    domStar: dom.isStar,
    dowStar: dow.isStar,
  };
}

/**
 * Convert a UTC Date to wall-clock parts in the given IANA timezone.
 * Returns { year, month (1-12), day (1-31), hour, minute, dow (0-6, Sun=0) }.
 */
function toZonedParts(date: Date, tz: string): {
  year: number; month: number; day: number; hour: number; minute: number; dow: number;
} {
  // Intl.DateTimeFormat with all parts gives us tz-local wall clock.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    dow: dowMap[parts.weekday] ?? 0,
  };
}

/**
 * Compute the next time at which the cron expression matches, strictly after `after`.
 *
 * Returns a UTC Date, or null if no match is found within `maxLookaheadMs` (default 366 days).
 *
 * Implementation: walk forward in 1-minute steps. We skip ahead when the hour, day, or
 * month doesn't match to keep this fast in the worst case (~24M iterations / year → ~50ms).
 * For typical recurrences (a few times a day) it returns in microseconds.
 */
export function computeNextFire(
  rule: string,
  timezone: string,
  after: Date = new Date(),
  maxLookaheadMs: number = 366 * 24 * 60 * 60 * 1000,
): Date | null {
  const parsed = parseCron(rule);
  const tz = timezone || 'UTC';

  // Start at the next whole minute.
  const cursor = new Date(after);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const limit = after.getTime() + maxLookaheadMs;

  // Safety cap on iterations.
  for (let i = 0; i < 2_000_000; i++) {
    if (cursor.getTime() > limit) return null;
    const z = toZonedParts(cursor, tz);

    if (!parsed.months.has(z.month)) {
      // Jump to the first day of next month (in UTC; close enough — we'll re-check).
      cursor.setUTCDate(1);
      cursor.setUTCHours(0, 0, 0, 0);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      continue;
    }

    const domMatch = parsed.doms.has(z.day);
    const dowMatch = parsed.dows.has(z.dow);
    let dayMatch: boolean;
    if (parsed.domStar && parsed.dowStar) dayMatch = true;
    else if (parsed.domStar) dayMatch = dowMatch;
    else if (parsed.dowStar) dayMatch = domMatch;
    else dayMatch = domMatch || dowMatch;
    if (!dayMatch) {
      // Step by 1 hour, not 1 day — because in non-UTC timezones the
      // local-day boundary doesn't line up with UTC-day. Walking by UTC
      // days can leapfrog a valid local-day window that starts mid-UTC-day.
      // 1-hour steps are still cheap (max 366*24 ≈ 8.8k iterations/year).
      cursor.setUTCMinutes(0, 0, 0);
      cursor.setUTCHours(cursor.getUTCHours() + 1);
      continue;
    }

    if (!parsed.hours.has(z.hour)) {
      cursor.setUTCMinutes(0, 0, 0);
      cursor.setUTCHours(cursor.getUTCHours() + 1);
      continue;
    }

    if (!parsed.minutes.has(z.minute)) {
      cursor.setUTCSeconds(0, 0);
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
      continue;
    }

    return cursor;
  }
  return null;
}

/**
 * Validate a cron expression without computing the next fire.
 * Returns null on success, an error message on failure.
 */
export function validateCron(rule: string): string | null {
  try {
    parseCron(rule);
    return null;
  } catch (e: any) {
    return e.message;
  }
}
