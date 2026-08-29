import { Minus, Spline, Waypoints, CircleDashed, Flag, Trash2 } from 'lucide-react';
import type { Segment, SegmentType, Point } from '@/lib/path';
import { convertSegment, segmentEnd, segmentStart } from '@/lib/path';

const TYPE_OPTIONS: {
  type: Exclude<SegmentType, 'M'>;
  label: string;
  icon: typeof Minus;
}[] = [
  { type: 'L', label: 'Line', icon: Minus },
  { type: 'C', label: 'Cubic', icon: Waypoints },
  { type: 'Q', label: 'Quad', icon: Spline },
  { type: 'A', label: 'Arc', icon: CircleDashed },
  { type: 'Z', label: 'Close', icon: Flag },
];

interface Props {
  segment: Segment;
  index: number;
  allSegments: Segment[];
  onChange: (next: Segment) => void;
  onRemove: () => void;
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <span className="w-14 text-slate-400 flex-shrink-0">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(Number.isFinite(v) ? v : 0);
        }}
        className="w-full min-w-0 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100 font-mono"
      />
    </label>
  );
}

function PointFields({
  label,
  x,
  y,
  onX,
  onY,
}: {
  label: string;
  x: number;
  y: number;
  onX: (v: number) => void;
  onY: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={x} onChange={onX} />
        <NumField label="Y" value={y} onChange={onY} />
      </div>
    </div>
  );
}

export function SegmentEditor({
  segment,
  index,
  allSegments,
  onChange,
  onRemove,
}: Props) {
  const from: Point = segmentStart(allSegments, index);

  const convertTo = (target: Exclude<SegmentType, 'M'>) => {
    if (segment.type === target) return;
    onChange(convertSegment(segment, from, target));
  };

  const isM = segment.type === 'M';
  const isZ = segment.type === 'Z';

  const updateEnd = (x?: number, y?: number) => {
    const cur = segmentEnd(segment, allSegments);
    const nx = x ?? cur.x;
    const ny = y ?? cur.y;
    switch (segment.type) {
      case 'M':
        onChange({ ...segment, x: nx, y: ny });
        break;
      case 'L':
        onChange({ ...segment, x: nx, y: ny });
        break;
      case 'C':
        onChange({ ...segment, x: nx, y: ny });
        break;
      case 'Q':
        onChange({ ...segment, x: nx, y: ny });
        break;
      case 'A':
        onChange({ ...segment, x: nx, y: ny });
        break;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-slate-200 text-slate-700 text-xs font-bold dark:bg-slate-700 dark:text-slate-200">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-slate-200">
            Segment {index + 1}
            <span className="ml-2 text-slate-500 font-mono">{segment.type}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove segment"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {!isM && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
            Type
          </div>
          <div className="grid grid-cols-5 gap-1">
            {TYPE_OPTIONS.map(({ type, label, icon: Icon }) => {
              const active = segment.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => convertTo(type)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] transition-all ${
                    active
                      ? 'bg-blue-50 border-blue-500/70 text-blue-700 dark:bg-blue-500/20 dark:border-blue-500/60 dark:text-blue-300'
                      : 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200'
                  }`}
                  title={label}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isZ && (
        <PointFields
          label={isM ? 'Position' : 'End point'}
          x={segmentEnd(segment, allSegments).x}
          y={segmentEnd(segment, allSegments).y}
          onX={(v) => updateEnd(v, undefined)}
          onY={(v) => updateEnd(undefined, v)}
        />
      )}

      {segment.type === 'C' && (
        <div className="space-y-2">
          <PointFields
            label="Control 1"
            x={segment.x1}
            y={segment.y1}
            onX={(v) => onChange({ ...segment, x1: v })}
            onY={(v) => onChange({ ...segment, y1: v })}
          />
          <PointFields
            label="Control 2"
            x={segment.x2}
            y={segment.y2}
            onX={(v) => onChange({ ...segment, x2: v })}
            onY={(v) => onChange({ ...segment, y2: v })}
          />
        </div>
      )}

      {segment.type === 'Q' && (
        <PointFields
          label="Control"
          x={segment.x1}
          y={segment.y1}
          onX={(v) => onChange({ ...segment, x1: v })}
          onY={(v) => onChange({ ...segment, y1: v })}
        />
      )}

      {segment.type === 'A' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="RX"
              value={segment.rx}
              onChange={(v) => onChange({ ...segment, rx: v })}
            />
            <NumField
              label="RY"
              value={segment.ry}
              onChange={(v) => onChange({ ...segment, ry: v })}
            />
          </div>
          <NumField
            label="Rot°"
            value={segment.xAxisRotation}
            onChange={(v) => onChange({ ...segment, xAxisRotation: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={segment.largeArcFlag}
                onChange={(e) =>
                  onChange({ ...segment, largeArcFlag: e.target.checked })
                }
                className="accent-blue-500"
              />
              Large arc
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={segment.sweepFlag}
                onChange={(e) =>
                  onChange({ ...segment, sweepFlag: e.target.checked })
                }
                className="accent-blue-500"
              />
              Sweep
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
