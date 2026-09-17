import { useEffect, useMemo, useRef, useState } from 'react';
import { compareItems, type RankedItem, type SortMode } from './rank';

/**
 * Order for a list that grows while the reader is looking at it.
 *
 * New rows are inserted where their score puts them, but rows already on
 * screen never swap places because of a later arrival. Changing the sort
 * mode is a deliberate act, so that re-sorts everything at once.
 */
export function useStableOrder(items: RankedItem[], mode: SortMode): RankedItem[] {
  const [order, setOrder] = useState<string[]>([]);
  const lastMode = useRef(mode);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    if (items.length === 0) {
      setOrder([]);
      lastMode.current = mode;
      return;
    }
    const modeChanged = lastMode.current !== mode;
    lastMode.current = mode;
    setOrder((prev) => {
      const known = new Set(prev.filter((id) => byId.has(id)));
      if (modeChanged) {
        return [...items].sort((a, b) => compareItems(a, b, mode)).map((i) => i.id);
      }
      const next = prev.filter((id) => byId.has(id));
      const fresh = items.filter((i) => !known.has(i.id)).sort((a, b) => compareItems(a, b, mode));
      for (const item of fresh) {
        let at = next.length;
        for (let i = 0; i < next.length; i += 1) {
          const other = byId.get(next[i]!);
          if (other && compareItems(item, other, mode) < 0) {
            at = i;
            break;
          }
        }
        next.splice(at, 0, item.id);
      }
      return next;
    });
  }, [items, mode, byId]);

  return useMemo(
    () => order.map((id) => byId.get(id)).filter((i): i is RankedItem => Boolean(i)),
    [order, byId]
  );
}
