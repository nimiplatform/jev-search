import { Slider } from '@/components/ui/slider';
import { DEFAULT_WEIGHTS, type Weights as WeightsValue } from '@/lib/rank';

const ROWS: { key: keyof WeightsValue; label: string; hint: string }[] = [
  { key: 'relevance', label: 'On topic', hint: 'How much the judge thinks it is about your request' },
  { key: 'freshness', label: 'Fresh', hint: 'Newer within the window ranks higher' },
  { key: 'position', label: 'Engine rank', hint: "Google's own ordering within each source" },
];

export function Weights({
  value,
  onChange,
}: {
  value: WeightsValue;
  onChange: (next: WeightsValue) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Ranking</h2>
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => onChange(DEFAULT_WEIGHTS)}
          type="button"
        >
          reset
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Re-sorts instantly, no new search.</p>
      <div className="mt-4 flex flex-col gap-4">
        {ROWS.map((row) => (
          <label className="flex flex-col gap-1.5" key={row.key} title={row.hint}>
            <span className="flex justify-between text-xs">
              <span>{row.label}</span>
              <span className="text-muted-foreground">{Math.round(value[row.key] * 100)}</span>
            </span>
            <Slider
              max={100}
              min={0}
              onValueChange={([v]) => onChange({ ...value, [row.key]: (v ?? 0) / 100 })}
              step={5}
              value={[Math.round(value[row.key] * 100)]}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
