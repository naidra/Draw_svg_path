import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Plus,
  Trash2,
  Download,
  Eye,
  EyeOff,
  Layers,
  ChevronDown,
  ChevronRight,
  MousePointerClick,
  Undo2,
  Spline,
  ImageIcon,
  Maximize,
  AlertTriangle,
  Flag,
  ClipboardPaste,
} from 'lucide-react';
import { PathCanvas } from '@/components/PathCanvas';
import { ColorPicker } from '@/components/ColorPicker';
import { SegmentEditor } from '@/components/SegmentEditor';
import {
  type PathShape,
  type Segment,
  type Point,
  createPath,
  buildD,
  parsePathData,
  makeLineSegment,
  moveToSegment,
  pathBounds,
  segmentEnd,
  scaleSegments,
  translateSegments,
} from '@/lib/path';

const DEFAULT_CANVAS = { w: 1000, h: 700 };

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number }>(DEFAULT_CANVAS);
  const [dimsInput, setDimsInput] = useState<{ w: string; h: string }>({
    w: String(DEFAULT_CANVAS.w),
    h: String(DEFAULT_CANVAS.h),
  });
  const [shapes, setShapes] = useState<PathShape[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [pathDataInput, setPathDataInput] = useState('');
  const [pathDataError, setPathDataError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<
    { kind: 'segment'; index: number } | { kind: 'path'; id: string; name: string } | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const latestSegmentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const active = shapes.find((s) => s.id === activeId) ?? null;
  const activeSegmentCount = active?.segments.length ?? 0;
  const activePathData = active ? buildD(active.segments) : '';

  const selectPaths = (ids: string[]) => {
    setSelectedPathIds(ids);
    if (ids.length > 0) {
      setActiveId(ids[ids.length - 1]);
      setExpanded(true);
    }
  };

  useEffect(() => {
    if (!activeId || activeSegmentCount === 0 || !expanded) return;
    latestSegmentRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [activeId, activeSegmentCount, expanded]);

  useEffect(() => {
    setPathDataInput(activePathData);
    setPathDataError(null);
  }, [activeId, activePathData]);

  const commit = useCallback((next: PathShape[]) => {
    setShapes(next);
  }, []);

  const commitRef = useRef(commit);
  commitRef.current = commit;

  const updateActive = (updater: (s: PathShape) => PathShape) => {
    if (!activeId) return;
    const next = shapes.map((s) => (s.id === activeId ? updater(s) : s));
    setShapes(next);
  };

  const togglePathVisibility = (id: string) => {
    setShapes((current) =>
      current.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  };

  const loadImage = (src: string) => {
    const img = new Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      setImageDims(dims);
      setCanvasDims(dims);
      setDimsInput({ w: String(dims.w), h: String(dims.h) });
    };
    img.src = src;
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      setImageSrc(src);
      loadImage(src);
    };
    reader.readAsDataURL(file);
  };

  const addPath = () => {
    const p = createPath(`Path ${shapes.length + 1}`);
    const next = [...shapes, p];
    commit(next);
    setActiveId(p.id);
    setSelectedPathIds([p.id]);
    setExpanded(true);
  };

  const importPathData = () => {
    try {
      const segments = parsePathData(pathDataInput);
      setPathDataError(null);
      setExpanded(true);
      setPathDataInput(buildD(segments));

      if (!activeId) {
        const p = { ...createPath(`Path ${shapes.length + 1}`), segments };
        commit([...shapes, p]);
        setActiveId(p.id);
        setSelectedPathIds([p.id]);
        return;
      }

      commit(
        shapes.map((s) => (s.id === activeId ? { ...s, segments } : s))
      );
    } catch (error) {
      setPathDataError(error instanceof Error ? error.message : 'Could not parse path data.');
    }
  };

  const confirmRemove = () => {
    if (!pendingRemove) {
      setPendingRemove(null);
      return;
    }
    if (pendingRemove.kind === 'segment') {
      if (active) {
        const i = pendingRemove.index;
        const updated = active.segments.filter((_, idx) => idx !== i);
        commit(
          shapes.map((s) => (s.id === active.id ? { ...s, segments: updated } : s))
        );
      }
    } else {
      const id = pendingRemove.id;
      const next = shapes.filter((s) => s.id !== id);
      commit(next);
      setSelectedPathIds((current) => current.filter((selected) => selected !== id));
      if (activeId === id) setActiveId(next[0]?.id ?? null);
    }
    setPendingRemove(null);
  };

  const addSegment = (p: Point) => {
    if (!activeId) {
      const np = createPath(`Path ${shapes.length + 1}`);
      const next = [...shapes, np];
      commit(next);
      setActiveId(np.id);
      setSelectedPathIds([np.id]);
      setExpanded(true);
      const withSeg: PathShape = {
        ...np,
        segments: [moveToSegment(p)],
      };
      commit(next.map((s) => (s.id === np.id ? withSeg : s)));
      return;
    }
    updateActive((s) => {
      if (s.segments.length === 0) {
        return { ...s, segments: [moveToSegment(p)] };
      }
      const last = s.segments[s.segments.length - 1];
      if (last.type === 'Z') {
        return { ...s, segments: [...s.segments, moveToSegment(p)] };
      }
      const from = segmentEnd(last, s.segments);
      return { ...s, segments: [...s.segments, makeLineSegment(from, p)] };
    });
  };

  const updateSegment = (index: number, seg: Segment) => {
    if (!activeId) return;
    updateActive((s) => {
      if (index < 0 || index >= s.segments.length) return s;
      const next = [...s.segments];
      next[index] = seg;
      return { ...s, segments: next };
    });
  };

  const scalePaths = (ids: string[], factor: number) => {
    const selected = shapes.filter((s) => ids.includes(s.id));
    const bounds = selected
      .map((s) => pathBounds(s.segments))
      .filter((b): b is { x: number; y: number; w: number; h: number } => b !== null);
    if (bounds.length === 0) return;
    const minX = Math.min(...bounds.map((b) => b.x));
    const minY = Math.min(...bounds.map((b) => b.y));
    const maxX = Math.max(...bounds.map((b) => b.x + b.w));
    const maxY = Math.max(...bounds.map((b) => b.y + b.h));
    const center = { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 };
    setShapes((current) =>
      current.map((s) =>
        ids.includes(s.id)
          ? { ...s, segments: scaleSegments(s.segments, factor, center) }
          : s
      )
    );
  };

  const movePaths = (ids: string[], dx: number, dy: number) => {
    if (ids.length === 0) return;
    setShapes((current) =>
      current.map((s) =>
        ids.includes(s.id)
          ? { ...s, segments: translateSegments(s.segments, dx, dy) }
          : s
      )
    );
  };

  const onCommit = useCallback(() => {
    commitRef.current(shapes);
  }, [shapes]);

  const undo = () => {
    if (!active || active.segments.length === 0) return;
    const trimmed = active.segments.slice(0, -1);
    commit(
      shapes.map((s) => (s.id === active.id ? { ...s, segments: trimmed } : s))
    );
  };

  const applyDims = () => {
    const w = Math.max(50, Math.round(parseFloat(dimsInput.w) || canvasDims.w));
    const h = Math.max(50, Math.round(parseFloat(dimsInput.h) || canvasDims.h));
    const next = { w, h };
    setCanvasDims(next);
    setDimsInput({ w: String(w), h: String(h) });
  };

  const resetDims = () => {
    const dims = imageDims ?? DEFAULT_CANVAS;
    setCanvasDims(dims);
    setDimsInput({ w: String(dims.w), h: String(dims.h) });
  };

  const setPreset = (w: number, h: number) => {
    setCanvasDims({ w, h });
    setDimsInput({ w: String(w), h: String(h) });
  };

  const buildPathsDefs = () =>
    shapes
      .filter((s) => s.visible)
      .map(
        (s) =>
          `<path d="${buildD(s.segments)}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-opacity="${s.strokeOpacity}" fill="${
            s.fillEnabled ? s.fill : 'none'
          }" fill-opacity="${s.fillOpacity}" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join('\n    ');

  const downloadFile = (svg: string, name: string) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPathsOnly = () => {
    const vw = canvasDims.w;
    const vh = canvasDims.h;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">
    ${buildPathsDefs()}
  </svg>`;
    downloadFile(svg, 'paths-only.svg');
    setExportOpen(false);
  };

  const exportWithImage = () => {
    if (!imageSrc) return;
    const vw = canvasDims.w;
    const vh = canvasDims.h;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">
    <image href="${imageSrc}" x="0" y="0" width="${vw}" height="${vh}" preserveAspectRatio="xMidYMid meet"/>
    ${buildPathsDefs()}
  </svg>`;
    downloadFile(svg, 'paths-with-image.svg');
    setExportOpen(false);
  };

  const lastSeg = active?.segments[active.segments.length - 1] ?? null;
  const canUndo = !!active && active.segments.length > 0;
  const canCloseActivePath = !!lastSeg && lastSeg.type !== 'M' && lastSeg.type !== 'Z';

  const closeActivePath = () => {
    if (!canCloseActivePath) return;
    updateActive((s) => ({ ...s, segments: [...s.segments, { type: 'Z' }] }));
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Layers size={18} className="text-white" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">SVG Path Studio</h1>
        </div>

        <div className="h-6 w-px bg-slate-700 mx-1" />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm transition-colors"
        >
          <ImagePlus size={15} />
          {imageSrc ? 'Change image' : 'Choose image'}
        </button>
        <div className="flex-1" />

        <button
          onClick={undo}
          disabled={!canUndo}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo"
        >
          <Undo2 size={16} />
        </button>

        {shapes.length > 0 && (
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition-colors"
            >
              <Download size={15} />
              Export
              <ChevronDown size={14} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden z-50">
                <button
                  onClick={exportPathsOnly}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Spline size={16} className="text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-100">SVG paths only</div>
                    <div className="text-xs text-slate-400">Just the vector shapes</div>
                  </div>
                </button>
                <div className="h-px bg-slate-800" />
                <button
                  onClick={exportWithImage}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <ImageIcon size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-100">SVG with image</div>
                    <div className="text-xs text-slate-400">Paths and background image together</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <main className="flex-1 relative bg-slate-950 overflow-hidden">
          <PathCanvas
            shape={
              active ?? {
                id: 'empty',
                name: '',
                stroke: '#ffffff',
                strokeWidth: 3,
                strokeOpacity: 1,
                fill: '#3b82f6',
                fillEnabled: false,
                fillOpacity: 0.5,
                visible: true,
                segments: [],
              }
            }
            shapes={shapes}
            selectedShapeIds={selectedPathIds}
            imageSrc={imageSrc}
            canvasDims={canvasDims}
            onUpdateSegment={updateSegment}
            onAddSegment={addSegment}
            onSelectShapes={selectPaths}
            onScaleShapes={scalePaths}
            onMoveShapes={movePaths}
            onCommit={onCommit}
          />
        </main>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900/60 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Canvas dimensions */}
            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Maximize size={13} />
                Canvas size
              </h2>
              <div className="flex items-end gap-2">
                <label className="flex-1 space-y-1 text-xs text-slate-400">
                  <span>Width</span>
                  <input
                    type="number"
                    min={50}
                    value={dimsInput.w}
                    onChange={(e) =>
                      setDimsInput((d) => ({ ...d, w: e.target.value }))
                    }
                    onBlur={applyDims}
                    onKeyDown={(e) => e.key === 'Enter' && applyDims()}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-mono text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="flex-1 space-y-1 text-xs text-slate-400">
                  <span>Height</span>
                  <input
                    type="number"
                    min={50}
                    value={dimsInput.h}
                    onChange={(e) =>
                      setDimsInput((d) => ({ ...d, h: e.target.value }))
                    }
                    onBlur={applyDims}
                    onKeyDown={(e) => e.key === 'Enter' && applyDims()}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-mono text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
                <button
                  onClick={applyDims}
                  className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium transition-colors"
                >
                  Apply
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Square', w: 800, h: 800 },
                  { label: '16:9', w: 1280, h: 720 },
                  { label: '4:3', w: 1024, h: 768 },
                  { label: 'A4', w: 794, h: 1123 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPreset(p.w, p.h)}
                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
                {imageDims && (
                  <button
                    onClick={resetDims}
                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 transition-colors"
                  >
                    Image size
                  </button>
                )}
              </div>
            </section>

            {/* Paths list */}
            <section className="pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Paths
                  </h2>
                  <button
                    onClick={addPath}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-xs font-medium transition-colors"
                  >
                    <Plus size={13} />
                    New
                  </button>
                </div>
                {shapes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center bg-slate-800/40 rounded-lg">
                    No paths yet. Click "New" to create one.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {shapes.map((s) => (
                      <li
                        key={s.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                          s.id === activeId
                            ? 'bg-blue-500/15 border border-blue-500/40'
                            : 'hover:bg-slate-800 border border-transparent'
                        }`}
                        onClick={() => {
                          setActiveId(s.id);
                          setSelectedPathIds([s.id]);
                          setExpanded(true);
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded border border-slate-600 flex-shrink-0"
                          style={{
                            backgroundColor: s.fillEnabled ? s.fill : 'transparent',
                          borderColor: s.stroke,
                          }}
                        />
                        <span
                          className={`text-sm flex-1 truncate ${
                            s.visible ? 'text-slate-100' : 'text-slate-500'
                          }`}
                        >
                          {s.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {s.segments.length} seg
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePathVisibility(s.id);
                          }}
                          className={`p-1 rounded transition-colors ${
                            s.visible
                              ? 'text-slate-400 hover:text-slate-100'
                              : 'text-slate-600 hover:text-slate-300'
                          }`}
                          title={s.visible ? 'Hide path' : 'Show path'}
                        >
                          {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingRemove({ kind: 'path', id: s.id, name: s.name });
                          }}
                          className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Path data */}
              <section className="space-y-3 pt-4 border-t border-slate-800">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <ClipboardPaste size={13} />
                  Path data
                </h2>
                <textarea
                  value={pathDataInput}
                  onChange={(e) => {
                    setPathDataInput(e.target.value);
                    setPathDataError(null);
                  }}
                  rows={5}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 font-mono text-xs text-slate-100 outline-none transition-colors focus:border-blue-500"
                  placeholder="M 267.89 123.11 L 266.88 121.61 C ..."
                />
                {pathDataError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200">
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{pathDataError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={importPathData}
                  disabled={!pathDataInput.trim()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ClipboardPaste size={15} />
                  Import path data
                </button>
              </section>

              {active && (
                <>
                  {/* Style */}
                  <section className="space-y-3 pt-4 border-t border-slate-800">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Stroke
                    </h2>
                    <ColorPicker
                      label="Color"
                      value={active.stroke}
                      onChange={(c) =>
                        updateActive((s) => ({ ...s, stroke: c }))
                      }
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-xs text-slate-400">
                        <span>Width</span>
                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.5}
                          value={active.strokeWidth}
                          onChange={(e) =>
                            updateActive((s) => ({
                              ...s,
                              strokeWidth: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-blue-500"
                        />
                        <span className="text-slate-300 font-mono">
                          {active.strokeWidth}px
                        </span>
                      </label>
                      <label className="space-y-1 text-xs text-slate-400">
                        <span>Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={active.strokeOpacity}
                          onChange={(e) =>
                            updateActive((s) => ({
                              ...s,
                              strokeOpacity: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-blue-500"
                        />
                        <span className="text-slate-300 font-mono">
                          {Math.round(active.strokeOpacity * 100)}%
                        </span>
                      </label>
                    </div>
                  </section>

                  {/* Fill */}
                  <section className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Fill
                      </h2>
                      <button
                        onClick={() =>
                          updateActive((s) => ({ ...s, fillEnabled: !s.fillEnabled }))
                        }
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${
                          active.fillEnabled
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {active.fillEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
                        {active.fillEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    {active.fillEnabled && (
                      <>
                        <ColorPicker
                          label="Fill color"
                          value={active.fill}
                          onChange={(c) => updateActive((s) => ({ ...s, fill: c }))}
                        />
                        <label className="space-y-1 text-xs text-slate-400 block">
                          <span>Opacity</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={active.fillOpacity}
                            onChange={(e) =>
                              updateActive((s) => ({
                                ...s,
                                fillOpacity: parseFloat(e.target.value),
                              }))
                            }
                            className="w-full accent-emerald-500"
                          />
                          <span className="text-slate-300 font-mono">
                            {Math.round(active.fillOpacity * 100)}%
                          </span>
                        </label>
                      </>
                    )}
                  </section>

                  {/* Segments */}
                  <section className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {expanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                        Segments ({active.segments.length})
                      </button>
                      <button
                        type="button"
                        onClick={closeActivePath}
                        disabled={!canCloseActivePath}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Close current subpath"
                      >
                        <Flag size={12} />
                        Close
                      </button>
                    </div>

                    {expanded && (
                      <div className="space-y-4">
                        {active.segments.length === 0 && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
                            <MousePointerClick size={14} className="mt-0.5 flex-shrink-0" />
                            <span>
                              Click anywhere on the canvas to drop the first point.
                              Keep clicking to add straight-line segments.
                            </span>
                          </div>
                        )}

                        {lastSeg?.type === 'Z' && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-100">
                            <MousePointerClick size={14} className="mt-0.5 flex-shrink-0" />
                            <span>
                              Click the canvas to move and continue this same path.
                            </span>
                          </div>
                        )}

                        {active.segments.map((seg, i) => (
                          <div
                            key={i}
                            ref={
                              i === active.segments.length - 1
                                ? latestSegmentRef
                                : null
                            }
                            className={`p-3 rounded-xl border ${
                              i === active.segments.length - 1
                                ? 'bg-slate-800/60 border-pink-500/30'
                                : 'bg-slate-800/30 border-slate-700/60'
                            }`}
                          >
                            <SegmentEditor
                              segment={seg}
                              index={i}
                              allSegments={active.segments}
                              onChange={(next) => {
                                const updated = [...active.segments];
                                updated[i] = next;
                                updateActive((s) => ({ ...s, segments: updated }));
                              }}
                              onRemove={() =>
                                setPendingRemove({ kind: 'segment', index: i })
                              }
                            />
                          </div>
                        ))}

                        {lastSeg && lastSeg.type !== 'M' && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                            <span className="w-2 h-2 rounded-full bg-pink-400" />
                            Points and curve handles are draggable.
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
          </div>
        </aside>
      </div>

      {pendingRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {pendingRemove.kind === 'path'
                      ? 'Remove path?'
                      : 'Remove segment?'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {pendingRemove.kind === 'path'
                      ? `This will delete "${pendingRemove.name}" and all of its segments. This action cannot be undone.`
                      : `This will delete segment #${pendingRemove.index + 1} from the current path. This action cannot be undone.`}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-3 bg-slate-950/50 border-t border-slate-800">
              <button
                onClick={() => setPendingRemove(null)}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="flex-1 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
