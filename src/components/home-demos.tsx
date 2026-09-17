import { SOURCES } from '@/lib/sources';
import { SourceIcon } from './source-icon';

/** The eleven engines as a quiet row of icons. */
export function EngineStrip() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
      {SOURCES.map((s) => (
        <li className="inline-flex items-center" key={s.id} title={s.label}>
          <SourceIcon className="size-4" id={s.id} on />
        </li>
      ))}
    </ul>
  );
}
