import { SOURCES, sourceById, windowById, type SourceId, type WindowId } from '@/lib/sources';
import { SourceIcon } from './source-icon';

/** What Jev would choose for a request: the strip lights those engines. */
export interface EnginePreview {
  window: WindowId;
  sources: SourceId[];
}

/**
 * The engines as a quiet labelled row; no count, the list changes. With a
 * preview (an example being hovered) the chosen engines stay coloured, the
 * rest go grey, and the label becomes the time window: the results page's
 * filter row in miniature. Phones have no hover, so they only get the row.
 */
export function EngineStrip({ preview }: { preview?: EnginePreview | null }) {
  const chosen = preview ? new Set(preview.sources) : null;
  const windowLabel = preview ? windowById(preview.window).label : null;
  const caption = preview
    ? `Jev would look in ${preview.sources.map((id) => sourceById(id).label).join(' and ')}, ${windowLabel!.toLowerCase()}.`
    : '';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <p className="text-xs text-muted-foreground sm:w-28 sm:text-right">
          {windowLabel ? `${windowLabel} ·` : 'Search via'}
        </p>
        <ul
          aria-label="Search engines"
          className="grid grid-cols-6 gap-x-[22px] gap-y-4 sm:flex sm:items-center sm:gap-x-3 sm:gap-y-1.5"
        >
          {SOURCES.map((s) => (
            <li className="inline-flex items-center" key={s.id} title={s.label}>
              <SourceIcon className="size-4 transition-opacity duration-200" id={s.id} on={!chosen || chosen.has(s.id)} />
            </li>
          ))}
        </ul>
        <span aria-hidden className="hidden sm:block sm:w-28" />
      </div>
      <p aria-live="polite" className="hidden h-[18px] text-xs text-primary-text sm:block">
        {caption}
      </p>
    </div>
  );
}
