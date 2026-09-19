import { useNavigate } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Newlines never reach the URL: a pasted or wrapped request is one line of words. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const supportsFieldSizing = () => typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/**
 * A pill that opens. At rest it is one line, like any search box, with a
 * fade where a long request runs past the edge. Focused, the request wraps
 * and the box grows so the whole question can be read and edited; it folds
 * back on blur. Enter submits.
 */
export function SearchBox({
  initial = '',
  compact = false,
  autoFocus = false,
}: {
  initial?: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const navigate = useNavigate();
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    // Browsers without `field-sizing: content` get the same growth from JS.
    if (!supportsFieldSizing()) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
    if (!expanded) {
      el.scrollLeft = 0;
      setClipped(el.scrollWidth > el.clientWidth);
    }
  }, [value, expanded]);

  const submit = (form: HTMLFormElement | null) => {
    const q = oneLine(value);
    if (!q) return;
    form?.querySelector('textarea')?.blur();
    // A new request resets explicit filters so the judge decides again.
    navigate({ to: '/search', search: { q }, viewTransition: true });
  };

  return (
    <form
      className="vt-searchbox relative"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      role="search"
    >
      {/* The pill is this wrapper, so the text fade below never touches the border. */}
      <div className="rounded-3xl border border-input shadow-sm transition-[color,box-shadow] has-focus-visible:border-ring has-focus-visible:shadow-md has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 dark:bg-input/30">
        <SearchIcon
          aria-hidden
          className={cn('pointer-events-none absolute left-4 text-muted-foreground', compact ? 'top-3 size-4' : 'top-3.5 size-5')}
        />
        <textarea
          aria-label="Search"
          autoComplete="off"
          autoFocus={autoFocus}
          className={cn(
            'block w-full min-w-0 resize-none overflow-hidden bg-transparent pl-11 pr-4 leading-6 outline-none placeholder:text-muted-foreground',
            compact ? 'py-2 text-base md:text-sm' : 'py-3 text-base',
            !expanded && clipped && '[mask-image:linear-gradient(to_right,black_calc(100%-3.5rem),transparent_calc(100%-1rem))]'
          )}
          enterKeyHint="search"
          maxLength={300}
          name="q"
          onBlur={() => setExpanded(false)}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event.currentTarget.form);
            }
          }}
          placeholder="Ask the web any way you like"
          ref={field}
          rows={1}
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          value={value}
          wrap={expanded ? 'soft' : 'off'}
        />
      </div>
    </form>
  );
}
