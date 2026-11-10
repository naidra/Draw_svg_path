import type { PathPreviewSettings } from '@/lib/pathAnimationSvg';

interface Props {
  value: PathPreviewSettings;
  onChange: (value: PathPreviewSettings) => void;
}

export function PathPreviewOptions({ value, onChange }: Props) {
  const toggles = [
    ['evenoddFill', 'fill-rule="evenodd"'],
    ['evenoddClip', 'clip-rule="evenodd"'],
    ['nonScalingStroke', 'vector-effect="non-scaling-stroke"'],
    ['fillEnabled', 'Fill'],
    ['strokeEnabled', 'Stroke'],
  ] as const;

  return (
    <details className="rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-300">
      <summary className="cursor-pointer rounded-lg p-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">SVG options</summary>
      <div className="space-y-3 border-t border-slate-800 p-3">
        {toggles.map(([key, label]) => (
          <label key={key} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} className="accent-blue-500" />
            <span className="break-all">{label}</span>
          </label>
        ))}
        {(['fill', 'stroke'] as const).map((key) => (
          <label key={key} className="flex items-center justify-between gap-2">
            <span>{key === 'fill' ? 'Fill color' : 'Stroke color'}</span>
            <input type="color" value={value[key]} disabled={!value[key === 'fill' ? 'fillEnabled' : 'strokeEnabled']} onChange={(event) => onChange({ ...value, [key]: event.target.value })} className="h-7 w-12 cursor-pointer rounded border border-slate-700 bg-slate-800 disabled:opacity-40" />
          </label>
        ))}
        {(['fillOpacity', 'strokeOpacity'] as const).map((key) => (
          <label key={key} className="flex items-center justify-between gap-2">
            <span>{key === 'fillOpacity' ? 'Fill opacity' : 'Stroke opacity'}</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={value[key]}
              disabled={!value[key === 'fillOpacity' ? 'fillEnabled' : 'strokeEnabled']}
              onChange={(event) => {
                const opacity = event.target.valueAsNumber;
                if (Number.isFinite(opacity)) onChange({ ...value, [key]: Math.min(1, Math.max(0, opacity)) });
              }}
              className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-40"
            />
          </label>
        ))}
        <label className="flex items-center justify-between gap-2">
          <span>Stroke width</span>
          <input type="number" min="0" max="100" step="0.5" value={value.strokeWidth} disabled={!value.strokeEnabled} onChange={(event) => {
            const width = event.target.valueAsNumber;
            if (Number.isFinite(width)) onChange({ ...value, strokeWidth: Math.min(100, Math.max(0, width)) });
          }} className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-40" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>Seconds per transition</span>
          <input type="number" min="0.1" max="10" step="0.1" value={value.duration} onChange={(event) => {
            const duration = event.target.valueAsNumber;
            if (Number.isFinite(duration)) onChange({ ...value, duration: Math.min(10, Math.max(0.1, duration)) });
          }} className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100" />
        </label>
      </div>
    </details>
  );
}
