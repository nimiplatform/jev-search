/**
 * Search1API's Google path prefixes snippets with a relative age such as
 * "19 hours ago ..." or an absolute date such as "Sep 12, 2026 ...". That is
 * the only publication signal available per result, so freshness is derived
 * from it here rather than from a separate metadata field.
 */

const RELATIVE_RE =
  /^\s*(\d+)\s+(minute|min|hour|hr|day|week|month|year)s?\s+ago\b/i;
const ABSOLUTE_RE =
  /^\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;

const UNIT_HOURS: Record<string, number> = {
  minute: 1 / 60,
  min: 1 / 60,
  hour: 1,
  hr: 1,
  day: 24,
  week: 24 * 7,
  month: 24 * 30,
  year: 24 * 365,
};

/** Age in hours parsed from the snippet prefix, or null when absent. */
export function parseAgeHours(snippet: string, now = Date.now()): number | null {
  const rel = RELATIVE_RE.exec(snippet);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2]!.toLowerCase();
    const factor = UNIT_HOURS[unit];
    if (factor !== undefined) return n * factor;
  }
  const abs = ABSOLUTE_RE.exec(snippet);
  if (abs) {
    const ts = Date.parse(`${abs[1]!} UTC`);
    if (!Number.isNaN(ts)) return Math.max(0, (now - ts) / 3_600_000);
  }
  return null;
}

/** Remove the age prefix so the snippet reads as prose. */
export function stripAgePrefix(snippet: string): string {
  return snippet
    .replace(RELATIVE_RE, '')
    .replace(ABSOLUTE_RE, '')
    .replace(/^\s*(\.\.\.|…)\s*/, '')
    .trim();
}

/**
 * 1.0 for brand new, decaying linearly to 0 at the edge of the window.
 * Unknown age gets a flat prior so it neither wins nor sinks on freshness.
 */
export function freshnessScore(
  ageHours: number | null,
  windowHours: number
): number {
  if (ageHours === null) return 0.35;
  return Math.max(0, Math.min(1, 1 - ageHours / windowHours));
}
