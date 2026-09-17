import { useEffect, useMemo, useRef, useState } from 'react';
import { compositeScore, type RankedItem, type Weights } from './rank';

/**
 * Order for a list that grows while the reader is looking at it.
 *
 * New rows are inserted where their score puts them, but rows already on
 * screen never swap places because of a later arrival. Changing the weights
 * is a deliberate act, so that re-sorts everything at once.
 */
export function useStableOrder(items: RankedItem[], weights: Weights): RankedItem[] {
  const [order, setOrder] = useState<string[]>([]);
  const lastWeights = useRef(weights);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    if (items.length === 0) {
      setOrder([]);
      lastWeights.current = weights;
      return;
    }
    const weightsChanged = lastWeights.current !== weights;
    lastWeights.current = weights;
    setOrder((prev) => {
      const known = new Set(prev.filter((id) => byId.has(id)));
      if (weightsChanged) {
        return [...items].sort((a, b) => compositeScore(b, weights) - compositeScore(a, weights)).map((i) => i.id);
      }
      const next = prev.filter((id) => byId.has(id));
      const fresh = items
        .filter((i) => !known.has(i.id))
        .sort((a, b) => compositeScore(b, weights) - compositeScore(a, weights));
      for (const item of fresh) {
        const score = compositeScore(item, weights);
        let at = next.length;
        for (let i = 0; i < next.length; i += 1) {
          const other = byId.get(next[i]!);
          if (other && compositeScore(other, weights) < score) {
            at = i;
            break;
          }
        }
        next.splice(at, 0, item.id);
      }
      return next;
    });
  }, [items, weights, byId]);

  return useMemo(
    () => order.map((id) => byId.get(id)).filter((i): i is RankedItem => Boolean(i)),
    [order, byId]
  );
}
