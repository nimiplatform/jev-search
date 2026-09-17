export type SourceId =
  | 'hackernews'
  | 'reddit'
  | 'github'
  | 'x'
  | 'web'
  | 'arxiv'
  | 'youtube';

/**
 * One Search1API `/search` call. `service` is the engine; `site` restricts a
 * general engine with `include_sites`. A source runs all of its lanes in
 * parallel and merges them, so one engine going down or drifting does not
 * take the source with it, and a hit on two engines outranks a hit on one.
 *
 * Probed 2026-09-17 with site restriction + weekly window: google and
 * duckduckgo honour both and prefix snippets with an age ("3 days ago ...");
 * yahoo ignores the window, bing ignores the site, baidu returns nothing.
 */
export interface Lane {
  service: string;
  site?: string;
}

/** General engines that search the whole web and need `exclude_sites` on the open-web source. */
export const GENERAL_ENGINES = new Set(['google', 'duckduckgo', 'bing', 'yahoo']);

const COMMUNITY_ENGINES = ['google', 'duckduckgo'] as const;

function siteLanes(site?: string): Lane[] {
  return COMMUNITY_ENGINES.map((service) => (site ? { service, site } : { service }));
}

export interface Source {
  id: SourceId;
  label: string;
  lanes: Lane[];
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
    lanes: siteLanes('news.ycombinator.com'),
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
    lanes: siteLanes('reddit.com'),
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
    lanes: siteLanes('github.com'),
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
    lanes: siteLanes('x.com'),
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
    lanes: siteLanes(),
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
    lanes: [{ service: 'arxiv' }],
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
    lanes: [{ service: 'youtube' }],
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
export const RESTRICTED_SITES = [
  ...new Set(SOURCES.flatMap((s) => s.lanes.flatMap((l) => (l.site ? [l.site] : [])))),
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
