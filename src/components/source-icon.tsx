import {
  siArxiv,
  siDuckduckgo,
  siGithub,
  siGoogle,
  siImdb,
  siReddit,
  siWechat,
  siWikipedia,
  siX,
  siYcombinator,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons';
import type { SourceId } from '@/lib/sources';
import { cn } from '@/lib/utils';

const ICONS: Record<SourceId, SimpleIcon> = {
  google: siGoogle,
  duckduckgo: siDuckduckgo,
  hackernews: siYcombinator,
  reddit: siReddit,
  github: siGithub,
  x: siX,
  arxiv: siArxiv,
  youtube: siYoutube,
  wikipedia: siWikipedia,
  imdb: siImdb,
  wechat: siWechat,
};

/** Brand colour for the source, as a CSS colour. Black-on-white brands get the text colour so they survive dark mode. */
export function sourceColor(id: SourceId): string {
  const hex = ICONS[id].hex;
  return hex === '000000' || hex === '181717' ? 'currentColor' : `#${hex}`;
}

/** The source's logo, inline SVG from simple-icons. Grey unless `on`. */
export function SourceIcon({ id, on = true, className }: { id: SourceId; on?: boolean; className?: string }) {
  const icon = ICONS[id];
  return (
    <svg
      aria-hidden
      className={cn('shrink-0 transition-colors duration-200', className ?? 'size-3.5')}
      fill={on ? sourceColor(id) : 'currentColor'}
      style={on ? undefined : { opacity: 0.45 }}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  );
}
