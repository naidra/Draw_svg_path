import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Play, Plus, Trash2, X } from 'lucide-react';
import { prepareAnimationPath } from '@/lib/pathAnimation';
import { buildPathAnimationSvg, type PathPreviewSettings } from '@/lib/pathAnimationSvg';
import { PathPreviewOptions } from './PathPreviewOptions';

interface PathAnimationSidebarProps {
  onRequestRemove: (name: string, onConfirm: () => void) => void;
}

export function PathAnimationSidebar({ onRequestRemove }: PathAnimationSidebarProps) {
  const id = useId();
  const nextId = useRef(1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const measurementsRef = useRef<SVGGElement>(null);
  const previewPathRef = useRef<SVGPathElement>(null);
  const animationRef = useRef<SVGAnimateElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputs, setInputs] = useState([{ id: 0, value: '' }]);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewBox, setViewBox] = useState('0 0 100 100');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [options, setOptions] = useState<PathPreviewSettings>({
    evenoddFill: false,
    evenoddClip: false,
    nonScalingStroke: true,
    fillEnabled: false,
    strokeEnabled: true,
    fill: '#3b82f6',
    stroke: '#60a5fa',
    fillOpacity: 1,
    strokeOpacity: 1,
    strokeWidth: 2.5,
    duration: 0.3,
  });
  const frames = useMemo(() => inputs.map((input) => prepareAnimationPath(input.value)), [inputs]);
  const validFrames = useMemo(() => frames.filter((frame) => frame.data), [frames]);
  const hasErrors = frames.some((frame) => frame.error);
  const canPreview = validFrames.length > 0 && !hasErrors;
  const canMorph = validFrames.every((frame) => frame.signature === validFrames[0]?.signature);
  const playing = hovered || keyboardFocused;
  const values = validFrames.map((frame) => frame.data).join(';');

  useEffect(() => {
    setCopyStatus('idle');
  }, [values, options, viewBox]);

  useEffect(() => {
    if (copyStatus !== 'success') return;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 2500);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const generateSvg = () => buildPathAnimationSvg({
    paths: validFrames.map((frame) => frame.data),
    viewBox,
    settings: options,
    canMorph,
    id: `path-animation-${crypto.randomUUID()}`,
  });

  const downloadSvg = () => {
    if (!canPreview) return;
    const blob = new Blob([generateSvg()], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'path-animation.svg';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      // Let the browser start the download before releasing the object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const copySvg = async () => {
    if (!canPreview || copyStatus === 'copying') return;
    setCopyStatus('copying');
    try {
      await navigator.clipboard.writeText(generateSvg());
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
  };

  useLayoutEffect(() => {
    const animation = animationRef.current;
    const path = previewPathRef.current;
    if (!animation || !path || !isOpen || reducedMotion || !canPreview || validFrames.length < 2) return;

    // Sample the SVG's current animated geometry before replacing the timeline,
    // so leaving partway through a morph returns smoothly from that shape.
    const computedPath = getComputedStyle(path).getPropertyValue('d');
    const current = computedPath.match(/^path\((?:"([^"]*)"|'([^']*)'|(.+))\)$/);
    const currentData = current?.[1] ?? current?.[2] ?? current?.[3] ?? validFrames[0].data;
    const nextFrames = playing
      ? [currentData, ...validFrames.slice(1).map((frame) => frame.data)]
      : [currentData, validFrames[0].data];

    animation.setAttribute('values', nextFrames.join(';'));
    animation.setAttribute('dur', `${options.duration * (nextFrames.length - 1)}s`);
    animation.beginElement();
  }, [playing, values, isOpen, reducedMotion, canPreview, validFrames, options.duration]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // Keep the sliding panel mounted so its contents survive closing it.
    panelRef.current?.toggleAttribute('inert', !isOpen);
    if (isOpen) panelRef.current?.querySelector('textarea')?.focus();
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !validFrames.length || !measurementsRef.current) return;
    const bounds = measurementsRef.current.getBBox();
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
    const padding = Math.max(bounds.width, bounds.height, 10) * 0.12;
    setViewBox(`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`);
  }, [isOpen, validFrames]);

  const close = () => {
    setIsOpen(false);
    setHovered(false);
    setKeyboardFocused(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-controls={`${id}-panel`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-lg transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <Play size={16} aria-hidden="true" className="text-blue-400" />
        Animation tryout
      </button>

      <aside
        ref={panelRef}
        id={`${id}-panel`}
        aria-labelledby={`${id}-title`}
        aria-hidden={!isOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
        className={`absolute inset-y-0 left-0 z-30 flex w-96 max-w-full flex-col border-r border-slate-800 bg-slate-900 shadow-2xl transition-[transform,visibility] duration-300 ease-in-out motion-reduce:transition-none ${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Play size={16} aria-hidden="true" className="text-blue-400" />
            Path animation tryout
          </h2>
          <button type="button" onClick={close} aria-label="Close animation sidebar" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <p id={`${id}-help`} className="text-xs leading-relaxed text-slate-400">
            Add two or more paths to morph through them in order on hover. Moving away animates back to the first path. Empty frames are skipped.
          </p>
          <div className="space-y-3">
            {inputs.map((input, index) => (
              <div key={input.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${id}-frame-${input.id}`} className="text-xs font-medium text-slate-300">Path {index + 1}</label>
                  {inputs.length > 1 && (
                    <button type="button" aria-label={`Remove path ${index + 1}`} onClick={() => onRequestRemove(`Path ${index + 1}`, () => {
                      setInputs((current) => current.filter((item) => item.id !== input.id));
                      requestAnimationFrame(() => panelRef.current?.querySelector('textarea')?.focus());
                    })} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <textarea
                  id={`${id}-frame-${input.id}`}
                  value={input.value}
                  onChange={(event) => setInputs((current) => current.map((item) => item.id === input.id ? { ...item, value: event.target.value } : item))}
                  placeholder="M 10 50 Q 50 10 90 50"
                  rows={3}
                  spellCheck={false}
                  autoCapitalize="off"
                  aria-invalid={!!frames[index].error}
                  aria-describedby={`${id}-help${frames[index].error ? ` ${id}-error-${input.id}` : ''}`}
                  className="block w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none aria-[invalid=true]:border-red-500"
                />
                {frames[index].error && <p id={`${id}-error-${input.id}`} className="text-xs text-red-400">{frames[index].error}</p>}
              </div>
            ))}
            <button type="button" aria-label="Add path" onClick={() => {
              const frameId = nextId.current++;
              setInputs((current) => [...current, { id: frameId, value: '' }]);
              // Wait for React to mount the new field before focusing it.
              requestAnimationFrame(() => document.getElementById(`${id}-frame-${frameId}`)?.focus());
            }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 py-2 text-xs text-slate-300 transition-colors hover:border-blue-500 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
              <Plus size={16} aria-hidden="true" /> Add path
            </button>
          </div>

          <PathPreviewOptions value={options} onChange={setOptions} />

          <section className="space-y-2" aria-labelledby={`${id}-preview-title`}>
            <h3 id={`${id}-preview-title`} className="text-xs font-semibold uppercase tracking-wider text-slate-400">SVG preview</h3>
            <button
              type="button"
              aria-label="Play path animation preview"
              aria-describedby={`${id}-preview-help`}
              onPointerEnter={() => setHovered(true)}
              onPointerLeave={() => setHovered(false)}
              onPointerCancel={() => setHovered(false)}
              onFocus={(event) => setKeyboardFocused(event.currentTarget.matches(':focus-visible'))}
              onBlur={() => setKeyboardFocused(false)}
              onPointerDown={() => setKeyboardFocused(false)}
              className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 text-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <svg viewBox={viewBox} className="h-full w-full" aria-hidden="true">
                <g ref={measurementsRef} visibility="hidden">
                  {validFrames.map((frame, index) => <path key={index} d={frame.data} />)}
                </g>
                {canPreview && (
                  <path
                    key={`${isOpen}-${reducedMotion}-${values}`}
                    ref={previewPathRef}
                    d={validFrames[0].data}
                    fill={options.fillEnabled ? options.fill : 'none'}
                    stroke={options.strokeEnabled ? options.stroke : 'none'}
                    fillOpacity={options.fillOpacity}
                    strokeOpacity={options.strokeOpacity}
                    strokeWidth={options.strokeWidth}
                    fillRule={options.evenoddFill ? 'evenodd' : undefined}
                    clipRule={options.evenoddClip ? 'evenodd' : undefined}
                    vectorEffect={options.nonScalingStroke ? 'non-scaling-stroke' : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {validFrames.length > 1 && <animate ref={animationRef} begin="indefinite" attributeName="d" fill="freeze" repeatCount="1" calcMode={canMorph ? 'linear' : 'discrete'} />}
                  </path>
                )}
              </svg>
              {!canPreview && <span className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-slate-500">{hasErrors ? 'Fix the path data above to preview.' : 'Enter path data above to see your SVG.'}</span>}
            </button>
            <p id={`${id}-preview-help`} className="text-xs leading-relaxed text-slate-400">
              {reducedMotion ? 'Animation is paused to respect your reduced-motion preference.' : validFrames.length < 2 ? 'Add at least two paths to animate their path data.' : 'Hover to play once to the last path; move away to animate back. Keyboard focus also plays the preview.'}
            </p>
            {canPreview && validFrames.length > 1 && !canMorph && <p className="text-xs leading-relaxed text-amber-500">These paths have different segment types or counts, so frames switch discretely. Use matching commands for a smooth morph.</p>}
          </section>
        </div>
        <div className="flex-shrink-0 space-y-2 border-t border-slate-800 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copySvg}
              disabled={!canPreview || copyStatus === 'copying'}
              className="flex min-w-0 items-center justify-center gap-2 rounded-lg bg-blue-500 px-2 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy size={16} aria-hidden="true" className="flex-shrink-0" />
              <span>Copy SVG to clipboard</span>
            </button>
            <button
              type="button"
              onClick={downloadSvg}
              disabled={!canPreview}
              className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} aria-hidden="true" className="flex-shrink-0" />
              <span>Download SVG</span>
            </button>
          </div>
          <p role="status" aria-live="polite" className={`text-xs ${copyStatus === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
            {copyStatus === 'copying' ? 'Copying…' : copyStatus === 'success' ? 'SVG copied to clipboard.' : copyStatus === 'error' ? 'Could not copy. Allow clipboard access and try again.' : !canPreview ? 'Enter valid path data to enable copying and downloading.' : ''}
          </p>
        </div>
      </aside>
    </>
  );
}
