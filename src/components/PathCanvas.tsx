import { useRef, useState, useCallback } from 'react';
import { Minus, Move, Plus, RotateCcw } from 'lucide-react';
import type { PathShape, Segment, Point } from '@/lib/path';
import {
  buildD,
  segmentEnd,
  segmentStart,
  segmentEndPoints,
  convertSegment,
  type Segment as Seg,
} from '@/lib/path';

interface Props {
  shape: PathShape;
  shapes: PathShape[];
  imageSrc: string | null;
  canvasDims: { w: number; h: number };
  onUpdateLastSegment: (seg: Segment) => void;
  onAddSegment: (p: Point) => void;
  onCommit: () => void;
}

type Drag =
  | { kind: 'endpoint'; index: number }
  | { kind: 'control'; segIndex: number; ctrlIndex: number }
  | { kind: 'pan'; pointerId: number; startClient: Point; startPan: Point }
  | null;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const GRID_SIZE = 40;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function PathCanvas({
  shape,
  shapes,
  imageSrc,
  canvasDims,
  onUpdateLastSegment,
  onAddSegment,
  onCommit,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);

  const toSvg = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    const inv = ctm ? ctm.inverse() : svg.getScreenCTM()?.inverse();
    if (inv) {
      const r = pt.matrixTransform(inv);
      return { x: r.x, y: r.y };
    }
    return { x: pt.x, y: pt.y };
  }, []);

  const segs = shape.segments;
  const lastIdx = segs.length - 1;
  const lastSeg = segs[lastIdx];
  const lastStart: Point | null =
    lastIdx >= 0 ? segmentStart(segs, lastIdx) : null;

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) {
      if (segs.length > 0 && lastSeg && lastSeg.type !== 'Z') {
        setHover(toSvg(e));
      }
      return;
    }
    if (drag.kind === 'pan') {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      const nextPan = {
        x: drag.startPan.x - dx * (zoomedW / rect.width),
        y: drag.startPan.y - dy * (zoomedH / rect.height),
      };
      setPan(clampPan(nextPan, zoom));
      return;
    }
    const p = toSvg(e);
    if (drag.kind === 'endpoint' && drag.index === lastIdx) {
      const start = segmentStart(segs, drag.index);
      const next = convertSegment(lastSeg, start, lastSeg.type as never) as Seg;
      const updated = setEndpoint(next, p);
      onUpdateLastSegment(updated);
    } else if (drag.kind === 'control') {
      const seg = segs[drag.segIndex];
      const updated = setControl(seg, drag.ctrlIndex, p);
      if (drag.segIndex === lastIdx) onUpdateLastSegment(updated);
    }
  };

  const setEndpoint = (seg: Seg, p: Point): Seg => {
    switch (seg.type) {
      case 'M':
      case 'L':
        return { ...seg, x: p.x, y: p.y };
      case 'C':
        return { ...seg, x: p.x, y: p.y };
      case 'Q':
        return { ...seg, x: p.x, y: p.y };
      case 'A':
        return { ...seg, x: p.x, y: p.y };
      case 'Z':
        return seg;
    }
  };

  const setControl = (seg: Seg, idx: number, p: Point): Seg => {
    if (seg.type === 'C') {
      if (idx === 0) return { ...seg, x1: p.x, y1: p.y };
      if (idx === 1) return { ...seg, x2: p.x, y2: p.y };
    }
    if (seg.type === 'Q' && idx === 0) return { ...seg, x1: p.x, y1: p.y };
    return seg;
  };

  const endDrag = () => {
    if (drag?.kind === 'pan') {
      svgRef.current?.releasePointerCapture(drag.pointerId);
    }
    if (drag) {
      setDrag(null);
      if (drag.kind !== 'pan') {
        onCommit();
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (drag || panMode) return;
    const tag = (e.target as Element).tagName;
    if (e.target !== e.currentTarget && tag !== 'image' && tag !== 'rect') {
      return;
    }
    const p = toSvg(e);
    onAddSegment(p);
  };

  const isShapeVisible = shape.visible;
  const hasPath = segs.length > 0;
  const showActivePath = isShapeVisible && hasPath;
  const showPreview =
    !drag && !panMode && showActivePath && lastSeg && lastSeg.type !== 'Z' && hover;
  const inactiveShapes = shapes.filter(
    (s) => s.visible && s.id !== shape.id && s.segments.length > 0
  );

  const vbW = canvasDims.w;
  const vbH = canvasDims.h;
  const aspect = vbW / vbH;
  const zoomedW = vbW / zoom;
  const zoomedH = vbH / zoom;
  const maxPanX = Math.max(0, (vbW - zoomedW) / 2);
  const maxPanY = Math.max(0, (vbH - zoomedH) / 2);
  const boundedPan = {
    x: clamp(pan.x, -maxPanX, maxPanX),
    y: clamp(pan.y, -maxPanY, maxPanY),
  };
  const viewX = (vbW - zoomedW) / 2 + boundedPan.x;
  const viewY = (vbH - zoomedH) / 2 + boundedPan.y;
  const gridBleed = GRID_SIZE;

  const clampPan = (nextPan: Point, nextZoom: number) => {
    const nextZoomedW = vbW / nextZoom;
    const nextZoomedH = vbH / nextZoom;
    const nextMaxPanX = Math.max(0, (vbW - nextZoomedW) / 2);
    const nextMaxPanY = Math.max(0, (vbH - nextZoomedH) / 2);
    return {
      x: clamp(nextPan.x, -nextMaxPanX, nextMaxPanX),
      y: clamp(nextPan.y, -nextMaxPanY, nextMaxPanY),
    };
  };

  const setNextZoom = (next: number) => {
    const nextZoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setZoom(nextZoom);
    setPan((currentPan) => clampPan(currentPan, nextZoom));
    if (nextZoom === 1) {
      setPanMode(false);
    }
  };

  const zoomOut = () => setNextZoom(zoom / ZOOM_STEP);
  const zoomIn = () => setNextZoom(zoom * ZOOM_STEP);
  const resetZoom = () => setNextZoom(1);
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const canPan = zoom > 1;

  const startPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panMode || !canPan || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      kind: 'pan',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPan: boundedPan,
    });
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <div
        className="relative max-w-full max-h-full"
        style={{
          aspectRatio: aspect,
          width: `min(100%, calc((100vh - 5.5rem) * ${aspect}))`,
        }}
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/85 p-1 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={zoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
          >
            <Minus size={16} />
          </button>
          <div className="w-14 text-center font-mono text-xs text-slate-300">
            {zoomLabel}
          </div>
          <button
            type="button"
            onClick={zoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={zoom === 1}
            title="Reset zoom"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={() => setPanMode((enabled) => !enabled)}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              panMode
                ? 'bg-blue-500 text-white hover:bg-blue-400'
                : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
            }`}
            disabled={!canPan}
            title="Move zoomed view"
          >
            <Move size={15} />
          </button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`${viewX} ${viewY} ${zoomedW} ${zoomedH}`}
          className="w-full h-full max-h-[80vh] max-w-full rounded-xl shadow-2xl block bg-slate-900"
          style={{
            touchAction: 'none',
            cursor: panMode && canPan ? (drag?.kind === 'pan' ? 'grabbing' : 'grab') : undefined,
          }}
          onPointerMove={onPointerMove}
          onPointerDown={startPan}
          onPointerUp={endDrag}
          onPointerLeave={() => {
            setHover(null);
            endDrag();
          }}
          onClick={handleCanvasClick}
        >
          {imageSrc ? (
            <image
              href={imageSrc}
              x={0}
              y={0}
              width={vbW}
              height={vbH}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <>
              <defs>
                <pattern
                  id="canvas-grid"
                  width={GRID_SIZE}
                  height={GRID_SIZE}
                  patternUnits="userSpaceOnUse"
                >
                  <rect width={GRID_SIZE} height={GRID_SIZE} fill="#1e293b" />
                  <rect width={GRID_SIZE / 2} height={GRID_SIZE / 2} fill="#243246" />
                  <rect
                    x={GRID_SIZE / 2}
                    y={GRID_SIZE / 2}
                    width={GRID_SIZE / 2}
                    height={GRID_SIZE / 2}
                    fill="#243246"
                  />
                </pattern>
              </defs>
              <rect
                x={viewX - gridBleed}
                y={viewY - gridBleed}
                width={zoomedW + gridBleed * 2}
                height={zoomedH + gridBleed * 2}
                fill="url(#canvas-grid)"
                style={{ cursor: 'crosshair' }}
              />
            </>
          )}

          {inactiveShapes.map((s) => (
            <path
              key={s.id}
              d={buildD(s.segments)}
              stroke={s.stroke}
              strokeWidth={s.strokeWidth}
              strokeOpacity={s.strokeOpacity}
              fill={s.fillEnabled ? s.fill : 'none'}
              fillOpacity={s.fillOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {showActivePath && (
            <path
              d={buildD(segs)}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              strokeOpacity={shape.strokeOpacity}
              fill={shape.fillEnabled ? shape.fill : 'none'}
              fillOpacity={shape.fillOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {showPreview && lastStart && lastSeg && (
            <line
              x1={segmentEnd(lastSeg, segs).x}
              y1={segmentEnd(lastSeg, segs).y}
              x2={hover.x}
              y2={hover.y}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              strokeOpacity={0.35}
              strokeDasharray="6 6"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Anchor points for each segment */}
          {isShapeVisible && segs.map((seg, i) => {
            if (seg.type === 'Z') return null;
            const end = segmentEnd(seg, segs);
            return (
              <g key={`a-${i}`} style={{ pointerEvents: 'none' }}>
                {i === 0 && (
                  <circle
                    cx={seg.x}
                    cy={seg.y}
                    r={6}
                    fill="#22d3ee"
                    stroke="#0e7490"
                    strokeWidth={1.5}
                  />
                )}
                <circle
                  cx={end.x}
                  cy={end.y}
                  r={i === lastIdx ? 7 : 5}
                  fill={i === lastIdx ? '#f472b6' : '#22d3ee'}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'all', cursor: 'grab' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDrag({ kind: 'endpoint', index: i });
                  }}
                />
              </g>
            );
          })}

          {/* Control handles for the last segment */}
          {isShapeVisible &&
            lastSeg &&
            (lastSeg.type === 'C' || lastSeg.type === 'Q') &&
            (() => {
              const start = segmentStart(segs, lastIdx);
              const pts = segmentEndPoints(lastSeg);
              const ctrls =
                lastSeg.type === 'C'
                  ? [
                      { p: { x: lastSeg.x1, y: lastSeg.y1 }, idx: 0 },
                      { p: { x: lastSeg.x2, y: lastSeg.y2 }, idx: 1 },
                    ]
                  : [{ p: { x: lastSeg.x1, y: lastSeg.y1 }, idx: 0 }];
              const endP = pts[pts.length - 1];
              return (
                <g style={{ pointerEvents: 'none' }}>
                  {ctrls.map(({ p, idx }) => (
                    <g key={`c-${idx}`}>
                      <line
                        x1={idx === 0 ? start.x : endP.x}
                        y1={idx === 0 ? start.y : endP.y}
                        x2={p.x}
                        y2={p.y}
                        stroke="#f59e0b"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={6}
                        fill="#fbbf24"
                        stroke="#b45309"
                        strokeWidth={1.5}
                        style={{ pointerEvents: 'all', cursor: 'grab' }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDrag({
                            kind: 'control',
                            segIndex: lastIdx,
                            ctrlIndex: idx,
                          });
                        }}
                      />
                    </g>
                  ))}
                </g>
              );
            })()}
        </svg>

      </div>
    </div>
  );
}
