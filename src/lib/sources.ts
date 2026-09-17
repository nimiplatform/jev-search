export type SourceId =
  | 'hackernews'
  | 'reddit'
  | 'github'
  | 'x'
  | 'web'
  | 'arxiv'
  | 'youtube';

/**
 * How a source is queried through Search1API.
 * - `google`: the Google path restricted with `include_sites`. Snippets carry
 *   a "3 days ago" prefix, so freshness is measurable. Undefined site = open web.
 * - `vertical`: one of Search1API's vertical engines (`search_service`). Used
 *   only where Google has no equivalent coverage; most verticals return no
 *   date and honour `time_range` loosely, so they rank on relevance alone.
 */
export type Lane =
  | { kind: 'google'; site?: string }
  | { kind: 'vertical'; service: string };

export interface Source {
  id: SourceId;
  label: string;
  lane: Lane;
  /** Plain-language description handed to the judge. */
  description: string;
  /** Yes/no question the judge answers to decide whether this source is wanted. */
  ask: { question: string; yes: string; no: string };
  /** Searched when the request does not single out any source. */
  defaultOn: boolean;
}

export const SOURCES: readonly Source[] = [
  {
    id: 'hackernews',
    label: 'Hacker News',
    lane: { kind: 'google', site: 'news.ycombinator.com' },
    description: 'Hacker News threads and comments',
    ask: {
      question: 'Does the user ask for Hacker News (HN) specifically?',
      yes: 'The request names Hacker News or HN, or asks what HN commenters think',
      no: 'Hacker News is not mentioned or implied',
    },
    defaultOn: true,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    lane: { kind: 'google', site: 'reddit.com' },
    description: 'Reddit posts and comment threads',
    ask: {
      question: 'Does the user ask for Reddit specifically?',
      yes: 'The request names Reddit, a subreddit (r/…), or redditors',
      no: 'Reddit is not mentioned or implied',
    },
    defaultOn: true,
  },
  {
    id: 'github',
    label: 'GitHub',
    lane: { kind: 'google', site: 'github.com' },
    description: 'GitHub repositories, issues, pull requests and releases',
    ask: {
      question: 'Is the user looking for code: repositories, releases, issues, pull requests or open source projects?',
      yes: 'The request names GitHub, or asks for repos, libraries, releases, issues, PRs, or open source tools',
      no: 'The request is about discussion, news or opinions rather than code',
    },
    defaultOn: true,
  },
  {
    id: 'x',
    label: 'X',
    lane: { kind: 'google', site: 'x.com' },
    description: 'Posts on X (formerly Twitter)',
    ask: {
      question: 'Does the user ask for X (Twitter) specifically?',
      yes: 'The request names X, Twitter, tweets, or a specific account',
      no: 'X / Twitter is not mentioned or implied',
    },
    defaultOn: true,
  },
  {
    id: 'web',
    label: 'Web',
    lane: { kind: 'google' },
    description: 'News sites, blogs and documentation anywhere else on the web',
    ask: {
      question: 'Is the user asking for news coverage, articles or blog posts?',
      yes: 'The request asks for news, coverage, articles, announcements or blog posts',
      no: 'The request is only about community discussion, code, papers or videos',
    },
    defaultOn: true,
  },
  {
    id: 'arxiv',
    label: 'arXiv',
    lane: { kind: 'vertical', service: 'arxiv' },
    description: 'Academic papers and preprints on arXiv',
    ask: {
      question: 'Is the user asking for academic papers, research or preprints?',
      yes: 'The request mentions papers, research, arXiv, studies or preprints',
      no: 'The request is not about academic research',
    },
    defaultOn: false,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    lane: { kind: 'vertical', service: 'youtube' },
    description: 'Videos on YouTube',
    ask: {
      question: 'Is the user asking for videos?',
      yes: 'The request mentions videos, YouTube, talks, tutorials to watch, or channels',
      no: 'The request is not about video content',
    },
    defaultOn: false,
  },
];

export const DEFAULT_SOURCE_IDS = SOURCES.filter((s) => s.defaultOn).map((s) => s.id);

/** Sites that the open-web lane excludes so it does not duplicate the others. */
export const RESTRICTED_SITES = SOURCES.flatMap((s) =>
  s.lane.kind === 'google' && s.lane.site ? [s.lane.site] : []
);

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
