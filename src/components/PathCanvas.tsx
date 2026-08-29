import { useRef, useState, useCallback } from 'react';
import { Minus, MousePointer2, Plus, RotateCcw } from 'lucide-react';
import type { PathShape, Segment, Point } from '@/lib/path';
import {
  buildD,
  segmentEnd,
  segmentStart,
  segmentEndPoints,
  type Segment as Seg,
} from '@/lib/path';

export type SelectedPathPoint = {
  shapeId: string;
  segmentIndex: number;
  pointIndex: number;
};

interface Props {
  shape: PathShape;
  shapes: PathShape[];
  selectedPoints: SelectedPathPoint[];
  imageSrc: string | null;
  canvasDims: { w: number; h: number };
  onUpdateSegment: (index: number, seg: Segment) => void;
  onAddSegment: (p: Point) => void;
  onSelectPoints: (points: SelectedPathPoint[]) => void;
  onScalePoints: (points: SelectedPathPoint[], factor: number, center: Point) => void;
  onRotatePoints: (points: SelectedPathPoint[], angle: number, center: Point) => void;
  onMovePoints: (points: SelectedPathPoint[], dx: number, dy: number) => void;
  onCommit: () => void;
}

type Drag =
  | { kind: 'endpoint'; index: number }
  | { kind: 'control'; segIndex: number; ctrlIndex: number }
  | { kind: 'pan'; pointerId: number; startClient: Point; startPan: Point }
  | { kind: 'marquee'; pointerId: number; start: Point; current: Point }
  | { kind: 'moveSelection'; pointerId: number; last: Point; points: SelectedPathPoint[] }
  | {
      kind: 'scaleSelection';
      pointerId: number;
      center: Point;
      lastDistance: number;
      cursor: ScaleCursor;
      points: SelectedPathPoint[];
    }
  | {
      kind: 'rotateSelection';
      pointerId: number;
      center: Point;
      lastAngle: number;
      points: SelectedPathPoint[];
    }
  | null;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const GRID_SIZE = 40;
const SCALE_HANDLE_SIZE = 8;
const ROTATE_HANDLE_RADIUS = 7;
const ROTATE_HANDLE_OFFSET = 34;
const MIN_SCALE_DISTANCE = 4;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Bounds = { x: number; y: number; w: number; h: number };
type ScaleCursor = 'nwse-resize' | 'nesw-resize';
type ScaleHandle = {
  key: 'nw' | 'ne' | 'se' | 'sw';
  x: number;
  y: number;
  cursor: ScaleCursor;
};

const normalizeBounds = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

const containsPoint = (bounds: Bounds, p: Point) =>
  p.x >= bounds.x &&
  p.x <= bounds.x + bounds.w &&
  p.y >= bounds.y &&
  p.y <= bounds.y + bounds.h;

const unionBounds = (bounds: Bounds[]): Bounds | null => {
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((b) => b.x));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxX = Math.max(...bounds.map((b) => b.x + b.w));
  const maxY = Math.max(...bounds.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const boundsCenter = (bounds: Bounds): Point => ({
  x: bounds.x + bounds.w / 2,
  y: bounds.y + bounds.h / 2,
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const angleBetween = (a: Point, b: Point) => Math.atan2(a.y - b.y, a.x - b.x);

type SelectablePoint = SelectedPathPoint & {
  x: number;
  y: number;
  kind: 'endpoint' | 'control';
};

const pointKey = (point: SelectedPathPoint) =>
  `${point.shapeId}:${point.segmentIndex}:${point.pointIndex}`;

const selectablePointsForShape = (shape: PathShape): SelectablePoint[] =>
  shape.segments.flatMap((seg, segmentIndex) => {
    if (seg.type === 'Z') return [];
    const points: SelectablePoint[] = [
      {
        shapeId: shape.id,
        segmentIndex,
        pointIndex: 0,
        x: segmentEnd(seg, shape.segments).x,
        y: segmentEnd(seg, shape.segments).y,
        kind: 'endpoint',
      },
    ];
    if (seg.type === 'C') {
      points.push(
        {
          shapeId: shape.id,
          segmentIndex,
          pointIndex: 1,
          x: seg.x1,
          y: seg.y1,
          kind: 'control',
        },
        {
          shapeId: shape.id,
          segmentIndex,
          pointIndex: 2,
          x: seg.x2,
          y: seg.y2,
          kind: 'control',
        }
      );
    } else if (seg.type === 'Q') {
      points.push({
        shapeId: shape.id,
        segmentIndex,
        pointIndex: 1,
        x: seg.x1,
        y: seg.y1,
        kind: 'control',
      });
    }
    return points;
  });

function PanHandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export function PathCanvas({
  shape,
  shapes,
  selectedPoints,
  imageSrc,
  canvasDims,
  onUpdateSegment,
  onAddSegment,
  onSelectPoints,
  onScalePoints,
  onRotatePoints,
  onMovePoints,
  onCommit,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

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
      if (segs.length > 0 && lastSeg) {
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
    if (drag.kind === 'marquee') {
      setDrag({ ...drag, current: toSvg(e) });
      return;
    }
    if (drag.kind === 'moveSelection') {
      const p = toSvg(e);
      onMovePoints(drag.points, p.x - drag.last.x, p.y - drag.last.y);
      setDrag({ ...drag, last: p });
      return;
    }
    if (drag.kind === 'scaleSelection') {
      const p = toSvg(e);
      const nextDistance = Math.max(
        MIN_SCALE_DISTANCE,
        distance(p, drag.center)
      );
      const factor = nextDistance / drag.lastDistance;
      onScalePoints(drag.points, factor, drag.center);
      setDrag({ ...drag, lastDistance: nextDistance });
      return;
    }
    if (drag.kind === 'rotateSelection') {
      const p = toSvg(e);
      const nextAngle = angleBetween(p, drag.center);
      onRotatePoints(drag.points, nextAngle - drag.lastAngle, drag.center);
      setDrag({ ...drag, lastAngle: nextAngle });
      return;
    }
    const p = toSvg(e);
    if (drag.kind === 'endpoint') {
      const seg = segs[drag.index];
      const updated = setEndpoint(seg, p);
      onUpdateSegment(drag.index, updated);
    } else if (drag.kind === 'control') {
      const seg = segs[drag.segIndex];
      const updated = setControl(seg, drag.ctrlIndex, p);
      onUpdateSegment(drag.segIndex, updated);
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
    if (
      drag?.kind === 'pan' ||
      drag?.kind === 'marquee' ||
      drag?.kind === 'moveSelection' ||
      drag?.kind === 'scaleSelection' ||
      drag?.kind === 'rotateSelection'
    ) {
      svgRef.current?.releasePointerCapture(drag.pointerId);
    }
    if (drag) {
      if (drag.kind === 'marquee') {
        const marquee = normalizeBounds(drag.start, drag.current);
        const isClick = marquee.w < 3 && marquee.h < 3;
        const points = isClick
          ? []
          : selectablePoints.filter((point) => containsPoint(marquee, point));
        onSelectPoints(points);
      }
      setDrag(null);
      if (
        drag.kind !== 'pan' &&
        drag.kind !== 'marquee' &&
        drag.kind !== 'moveSelection' &&
        drag.kind !== 'scaleSelection' &&
        drag.kind !== 'rotateSelection'
      ) {
        onCommit();
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (drag || panMode || selectMode) return;
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
    !drag &&
    !panMode &&
    !selectMode &&
    showActivePath &&
    lastSeg &&
    lastSeg.type !== 'Z' &&
    hover;
  const showMovePreview =
    !drag &&
    !panMode &&
    !selectMode &&
    showActivePath &&
    lastSeg &&
    lastSeg.type === 'Z' &&
    hover;
  const inactiveShapes = shapes.filter(
    (s) => s.visible && s.id !== shape.id && s.segments.length > 0
  );
  const selectablePoints = shapes
    .filter((s) => s.visible && s.segments.length > 0)
    .flatMap(selectablePointsForShape);
  const selectedPointSet = new Set(selectedPoints.map(pointKey));
  const selectedCanvasPoints = selectablePoints.filter((point) =>
    selectedPointSet.has(pointKey(point))
  );
  const selectedPointBounds = selectedCanvasPoints.map((point) => ({
    x: point.x,
    y: point.y,
    w: 0,
    h: 0,
  }));
  const selectedGroupBounds = unionBounds(selectedPointBounds);
  const scaleHandles: ScaleHandle[] = selectedGroupBounds
    ? [
        {
          key: 'nw',
          x: selectedGroupBounds.x - 10,
          y: selectedGroupBounds.y - 10,
          cursor: 'nwse-resize',
        },
        {
          key: 'ne',
          x: selectedGroupBounds.x + selectedGroupBounds.w + 10,
          y: selectedGroupBounds.y - 10,
          cursor: 'nesw-resize',
        },
        {
          key: 'se',
          x: selectedGroupBounds.x + selectedGroupBounds.w + 10,
          y: selectedGroupBounds.y + selectedGroupBounds.h + 10,
          cursor: 'nwse-resize',
        },
        {
          key: 'sw',
          x: selectedGroupBounds.x - 10,
          y: selectedGroupBounds.y + selectedGroupBounds.h + 10,
          cursor: 'nesw-resize',
        },
      ]
    : [];
  const rotateHandle = selectedGroupBounds
    ? {
        x: selectedGroupBounds.x + selectedGroupBounds.w / 2,
        y: selectedGroupBounds.y - ROTATE_HANDLE_OFFSET,
      }
    : null;
  const marqueeBounds =
    drag?.kind === 'marquee' ? normalizeBounds(drag.start, drag.current) : null;

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
  const panCursor =
    panMode && canPan ? (drag?.kind === 'pan' ? 'grabbing' : 'grab') : undefined;
  const isMovingSelection = drag?.kind === 'moveSelection';
  const isScalingSelection = drag?.kind === 'scaleSelection';
  const isRotatingSelection = drag?.kind === 'rotateSelection';
  const interactionCursor =
    panCursor ??
    (selectMode
      ? isMovingSelection
        ? 'grabbing'
        : isScalingSelection
          ? drag.cursor
          : isRotatingSelection
            ? 'grabbing'
            : 'crosshair'
      : undefined);

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

  const startMarquee = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!selectMode || panMode || e.button !== 0) return;
    const targetTag = (e.target as Element).tagName;
    if (e.target !== e.currentTarget && targetTag !== 'image' && targetTag !== 'rect') {
      return;
    }
    const p = toSvg(e);
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'marquee', pointerId: e.pointerId, start: p, current: p });
  };

  const startPointSelectionMove = (
    e: React.PointerEvent<SVGElement>,
    point: SelectedPathPoint
  ) => {
    if (!selectMode || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const points = selectedPointSet.has(pointKey(point)) ? selectedPoints : [point];
    onSelectPoints(points);
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
    setDrag({ kind: 'moveSelection', pointerId: e.pointerId, last: toSvg(e), points });
  };

  const startSelectionScale = (
    e: React.PointerEvent<SVGElement>,
    cursor: ScaleCursor
  ) => {
    if (!selectMode || e.button !== 0 || !selectedGroupBounds) return;
    const center = boundsCenter(selectedGroupBounds);
    const start = toSvg(e);
    const lastDistance = Math.max(MIN_SCALE_DISTANCE, distance(start, center));
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
    setDrag({
      kind: 'scaleSelection',
      pointerId: e.pointerId,
      center,
      lastDistance,
      cursor,
      points: selectedPoints,
    });
  };

  const startSelectionRotate = (e: React.PointerEvent<SVGElement>) => {
    if (!selectMode || e.button !== 0 || !selectedGroupBounds) return;
    const center = boundsCenter(selectedGroupBounds);
    const start = toSvg(e);
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
    setDrag({
      kind: 'rotateSelection',
      pointerId: e.pointerId,
      center,
      lastAngle: angleBetween(start, center),
      points: selectedPoints,
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
            onClick={() => {
              setSelectMode((enabled) => !enabled);
              setPanMode(false);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              selectMode
                ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
            }`}
            title="Select points"
          >
            <MousePointer2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setPanMode((enabled) => !enabled);
              setSelectMode(false);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              panMode
                ? 'bg-blue-500 text-white hover:bg-blue-400'
                : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
            }`}
            disabled={!canPan}
            title="Move zoomed view"
          >
            <PanHandIcon />
          </button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`${viewX} ${viewY} ${zoomedW} ${zoomedH}`}
          preserveAspectRatio="none"
          className="w-full h-full max-h-[80vh] max-w-full rounded-xl shadow-2xl block bg-slate-900"
          style={{
            touchAction: 'none',
            cursor: interactionCursor,
          }}
          onPointerMove={onPointerMove}
          onPointerDown={(e) => {
            startPan(e);
            startMarquee(e);
          }}
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
                  <rect width={GRID_SIZE} height={GRID_SIZE} fill="var(--canvas-grid-a)" />
                  <rect width={GRID_SIZE / 2} height={GRID_SIZE / 2} fill="var(--canvas-grid-b)" />
                  <rect
                    x={GRID_SIZE / 2}
                    y={GRID_SIZE / 2}
                    width={GRID_SIZE / 2}
                    height={GRID_SIZE / 2}
                    fill="var(--canvas-grid-b)"
                  />
                </pattern>
              </defs>
              <rect
                x={viewX - gridBleed}
                y={viewY - gridBleed}
                width={zoomedW + gridBleed * 2}
                height={zoomedH + gridBleed * 2}
                fill="url(#canvas-grid)"
                style={{ cursor: interactionCursor ?? 'crosshair' }}
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
              fillRule="evenodd"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                pointerEvents: 'none',
              }}
            />
          ))}

          {showActivePath && (
            <>
              <path
                d={buildD(segs)}
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                strokeOpacity={shape.strokeOpacity}
                fill={shape.fillEnabled ? shape.fill : 'none'}
                fillOpacity={shape.fillOpacity}
                fillRule="evenodd"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {selectMode &&
            selectedCanvasPoints.map((point) => (
              <circle
                key={`selected-${pointKey(point)}`}
                cx={point.x}
                cy={point.y}
                r={9}
                fill="rgba(34, 211, 238, 0.18)"
                stroke="#22d3ee"
                strokeWidth={1.75}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'grab', pointerEvents: 'all' }}
                onPointerDown={(e) => startPointSelectionMove(e, point)}
              />
            ))}

          {selectMode &&
            selectedGroupBounds &&
            selectedCanvasPoints.length > 0 && (
              <g>
                {rotateHandle && (
                  <line
                    x1={selectedGroupBounds.x + selectedGroupBounds.w / 2}
                    y1={selectedGroupBounds.y - 10}
                    x2={rotateHandle.x}
                    y2={rotateHandle.y}
                    stroke="#67e8f9"
                    strokeWidth={1.25}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <rect
                  x={selectedGroupBounds.x - 10}
                  y={selectedGroupBounds.y - 10}
                  width={selectedGroupBounds.w + 20}
                  height={selectedGroupBounds.h + 20}
                  fill="none"
                  stroke="#67e8f9"
                  strokeWidth={1.75}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            )}

          {selectMode && rotateHandle && selectedCanvasPoints.length > 0 && (
            <g
              style={{
                cursor: isRotatingSelection ? 'grabbing' : 'grab',
                pointerEvents: 'all',
              }}
              onPointerDown={startSelectionRotate}
            >
              <circle
                cx={rotateHandle.x}
                cy={rotateHandle.y}
                r={ROTATE_HANDLE_RADIUS}
                fill="#ecfeff"
                stroke="#0891b2"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M ${rotateHandle.x - 3.5} ${rotateHandle.y + 1.5} A 4.5 4.5 0 1 1 ${rotateHandle.x + 3} ${rotateHandle.y - 2.8}`}
                fill="none"
                stroke="#0891b2"
                strokeWidth={1.3}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
              <path
                d={`M ${rotateHandle.x + 3} ${rotateHandle.y - 2.8} L ${rotateHandle.x + 3.7} ${rotateHandle.y - 6} L ${rotateHandle.x + 6.1} ${rotateHandle.y - 3.8}`}
                fill="none"
                stroke="#0891b2"
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )}

          {selectMode &&
            scaleHandles.map((handle) => (
              <rect
                key={`scale-${handle.key}`}
                x={handle.x - SCALE_HANDLE_SIZE / 2}
                y={handle.y - SCALE_HANDLE_SIZE / 2}
                width={SCALE_HANDLE_SIZE}
                height={SCALE_HANDLE_SIZE}
                fill="#ecfeff"
                stroke="#0891b2"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{
                  cursor: handle.cursor,
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => startSelectionScale(e, handle.cursor)}
              />
            ))}

          {marqueeBounds && (
            <rect
              x={marqueeBounds.x}
              y={marqueeBounds.y}
              width={marqueeBounds.w}
              height={marqueeBounds.h}
              fill="rgba(34, 211, 238, 0.12)"
              stroke="#22d3ee"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {selectMode &&
            selectablePoints.map((point) => {
              const selected = selectedPointSet.has(pointKey(point));
              return (
                <circle
                  key={`selectable-${pointKey(point)}`}
                  cx={point.x}
                  cy={point.y}
                  r={point.kind === 'endpoint' ? 5.5 : 5}
                  fill={point.kind === 'endpoint' ? '#22d3ee' : '#fbbf24'}
                  stroke={selected ? '#ecfeff' : '#0f172a'}
                  strokeWidth={selected ? 2 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'grab', pointerEvents: 'all' }}
                  onPointerDown={(e) => startPointSelectionMove(e, point)}
                />
              );
            })}

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

          {showMovePreview && (
            <g style={{ pointerEvents: 'none' }}>
              <circle
                cx={hover.x}
                cy={hover.y}
                r={7}
                fill="none"
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                strokeOpacity={0.5}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r={2.5}
                fill={shape.stroke}
                opacity={0.65}
              />
            </g>
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
                  style={{
                    pointerEvents: selectMode ? 'none' : 'all',
                    cursor: selectMode ? undefined : 'grab',
                  }}
                  onPointerDown={(e) => {
                    if (selectMode) return;
                    e.stopPropagation();
                    setDrag({ kind: 'endpoint', index: i });
                  }}
                />
              </g>
            );
          })}

          {/* Control handles for curve segments */}
          {isShapeVisible &&
            segs.map((seg, i) => {
              if (seg.type !== 'C' && seg.type !== 'Q') return null;
              const start = segmentStart(segs, i);
              const pts = segmentEndPoints(seg);
              const ctrls =
                seg.type === 'C'
                  ? [
                      { p: { x: seg.x1, y: seg.y1 }, idx: 0 },
                      { p: { x: seg.x2, y: seg.y2 }, idx: 1 },
                    ]
                  : [{ p: { x: seg.x1, y: seg.y1 }, idx: 0 }];
              const endP = pts[pts.length - 1];
              return (
                <g key={`controls-${i}`} style={{ pointerEvents: 'none' }}>
                  {ctrls.map(({ p, idx }) => (
                    <g key={`c-${i}-${idx}`}>
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
                        style={{
                          pointerEvents: selectMode ? 'none' : 'all',
                          cursor: selectMode ? undefined : 'grab',
                        }}
                        onPointerDown={(e) => {
                          if (selectMode) return;
                          e.stopPropagation();
                          setDrag({
                            kind: 'control',
                            segIndex: i,
                            ctrlIndex: idx,
                          });
                        }}
                      />
                    </g>
                  ))}
                </g>
              );
            })}
        </svg>

      </div>
    </div>
  );
}
