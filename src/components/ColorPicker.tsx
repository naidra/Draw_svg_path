import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

const PRESETS = [
  '#ffffff',
  '#000000',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors text-sm"
      >
        <span
          className="w-5 h-5 rounded-md border border-slate-500 flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <span className="text-slate-200 flex-1 text-left">{label}</span>
        <Palette size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 right-0 w-56 p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl">
          <div className="grid grid-cols-5 gap-2 mb-3">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                }}
                className="relative w-8 h-8 rounded-md border border-slate-600 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              >
                {value.toLowerCase() === c.toLowerCase() && (
                  <Check
                    size={14}
                    className="absolute inset-0 m-auto text-slate-900 mix-blend-difference"
                  />
                )}
              </button>
            ))}
          </div>
          <label className="block text-xs text-slate-400 mb-1">
            Custom color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-10 h-8 rounded bg-transparent border border-slate-600 cursor-pointer"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm text-slate-100 font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
