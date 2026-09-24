import { TriangleAlertIcon } from 'lucide-react';
import { shortMessage } from '@/lib/failure';
import { engineLabel, type LaneFailure, type SourceProgress } from '@/lib/progress';
import { sourceById } from '@/lib/sources';

export const NOT_CONFIGURED = 'SEARCH1API_NOT_CONFIGURED';

function failureList(failures: LaneFailure[]): string {
  return failures.map((f) => `${engineLabel(f)}: ${shortMessage(f.message, 140)}`).join('; ');
}

/**
 * Sources that did not fully answer, said once and kept visible while the
 * results they did return stay on the page. A source that failed outright is
 * never presented as having found nothing.
 */
export function SourceNotices({ progress }: { progress: SourceProgress[] }) {
  const troubled = progress.filter((p) => p.status === 'failed' || p.status === 'partial');
  if (troubled.length === 0) return null;

  const failures = troubled.flatMap((p) => p.failures);
  if (failures.every((f) => f.code === NOT_CONFIGURED)) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm" role="status">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <span>
          Search1API key is not configured, so no source could be searched. Add the key with the settings button at the top
          of the page.
        </span>
      </p>
    );
  }

  return (
    <ul aria-label="Sources with failed searches" className="mt-3 flex flex-col gap-1.5 text-sm" role="status">
      {troubled.map((p) => {
        const label = sourceById(p.id).label;
        const others = p.lanes - p.failures.length === 1 ? 'search' : 'searches';
        return (
          <li className="flex items-start gap-2 text-muted-foreground" key={p.id}>
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 wrap-anywhere">
              {p.status === 'failed' ? (
                <>
                  <span className="text-foreground">{label} didn't answer</span>: {failureList(p.failures)}.
                </>
              ) : (
                <>
                  <span className="text-foreground">{label} answered in part</span>: {failureList(p.failures)}.{' '}
                  {p.found > 0 ? `Results from its other ${others} are shown.` : `Its other ${others} found nothing.`}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
