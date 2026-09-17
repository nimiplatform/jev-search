import { describe, expect, it } from 'vitest';
import { freshnessScore, parseAgeHours, stripAgePrefix } from '@/lib/freshness';

describe('parseAgeHours', () => {
  it('reads relative prefixes from Search1API snippets', () => {
    expect(parseAgeHours('19 hours ago ... r/sdforall')).toBe(19);
    expect(parseAgeHours('3 days ago ... I believe')).toBe(72);
    expect(parseAgeHours('1 day ago ... In the next')).toBe(24);
    expect(parseAgeHours('45 minutes ago ... x')).toBeCloseTo(0.75);
  });
  it('reads absolute dates', () => {
    const now = Date.parse('2026-09-17T00:00:00Z');
    expect(parseAgeHours('Sep 12, 2026 ... release', now)).toBeCloseTo(120, 0);
  });
  it('returns null when there is no date', () => {
    expect(parseAgeHours('Develop, test, run, and bundle')).toBeNull();
  });
});

describe('stripAgePrefix', () => {
  it('drops the prefix and ellipsis', () => {
    expect(stripAgePrefix('19 hours ago ... r/sdforall - Resolume')).toBe('r/sdforall - Resolume');
    expect(stripAgePrefix('Plain snippet')).toBe('Plain snippet');
  });
});

describe('freshnessScore', () => {
  it('decays across the window', () => {
    expect(freshnessScore(0, 24)).toBe(1);
    expect(freshnessScore(12, 24)).toBe(0.5);
    expect(freshnessScore(48, 24)).toBe(0);
    expect(freshnessScore(null, 24)).toBe(0.35);
  });
});
