export type SourceId = 'hackernews' | 'reddit' | 'github' | 'x' | 'web';

export interface Source {
  id: SourceId;
  label: string;
  /** Domain passed to Search1API `include_sites`. Undefined = open web. */
  site?: string;
  /** Plain-language description handed to the judge. */
  description: string;
}

export const SOURCES: readonly Source[] = [
  {
    id: 'hackernews',
    label: 'Hacker News',
    site: 'news.ycombinator.com',
    description: 'Hacker News threads and comments',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    site: 'reddit.com',
    description: 'Reddit posts and comment threads',
  },
  {
    id: 'github',
    label: 'GitHub',
    site: 'github.com',
    description: 'GitHub repositories, issues, pull requests and releases',
  },
  {
    id: 'x',
    label: 'X',
    site: 'x.com',
    description: 'Posts on X (formerly Twitter)',
  },
  {
    id: 'web',
    label: 'Web',
    description: 'News sites, blogs and documentation anywhere else on the web',
  },
];

export const SOURCE_IDS = SOURCES.map((s) => s.id) as readonly SourceId[];

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

export function sourceById(id: SourceId): Source {
  const found = SOURCES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown source: ${id}`);
  return found;
}

export type WindowId = '24h' | '7d' | '30d';

export interface Window {
  id: WindowId;
  label: string;
  hours: number;
  /** Search1API `time_range` value. */
  timeRange: 'day' | 'week' | 'month';
  description: string;
}

export const WINDOWS: readonly Window[] = [
  {
    id: '24h',
    label: 'Past 24 hours',
    hours: 24,
    timeRange: 'day',
    description: 'Only things from today or the last day',
  },
  {
    id: '7d',
    label: 'Past week',
    hours: 24 * 7,
    timeRange: 'week',
    description: 'Things from the last several days, up to a week',
  },
  {
    id: '30d',
    label: 'Past month',
    hours: 24 * 30,
    timeRange: 'month',
    description: 'Things from the last few weeks, up to a month',
  },
];

export const DEFAULT_WINDOW: WindowId = '7d';

export function isWindowId(value: string): value is WindowId {
  return WINDOWS.some((w) => w.id === value);
}

export function windowById(id: WindowId): Window {
  const found = WINDOWS.find((w) => w.id === id);
  if (!found) throw new Error(`Unknown window: ${id}`);
  return found;
}
