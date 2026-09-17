import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeAnalytics } from '@/server/analytics';

afterEach(() => vi.restoreAllMocks());

describe('optional analytics', () => {
  it('does not fail a search when the binding is absent or throws', () => {
    expect(writeAnalytics(undefined, { indexes: ['ask'] })).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dataset = { writeDataPoint: vi.fn(() => { throw new Error('Unavailable'); }) };
    expect(writeAnalytics(dataset, { indexes: ['ask'] })).toBe(false);
  });

  it('records an event when the binding is available', () => {
    const dataset = { writeDataPoint: vi.fn() };
    const point = { indexes: ['click'], blobs: ['test query'] };
    expect(writeAnalytics(dataset, point)).toBe(true);
    expect(dataset.writeDataPoint).toHaveBeenCalledWith(point);
  });
});
