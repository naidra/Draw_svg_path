export type Point = { x: number; y: number };

export type Segment =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | {
      type: 'C';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | {
      type: 'A';
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: boolean;
      sweepFlag: boolean;
      x: number;
      y: number;
    }
  | { type: 'Z' };

export type SegmentType = Segment['type'];

export interface PathShape {
  id: string;
  name: string;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  fill: string;
  fillEnabled: boolean;
  fillOpacity: number;
  visible: boolean;
  segments: Segment[];
}

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

export function buildD(segments: Segment[]): string {
  if (segments.length === 0) return '';
  const parts: string[] = [];
  for (const s of segments) {
    switch (s.type) {
      case 'M':
        parts.push(`M ${fmt(s.x)} ${fmt(s.y)}`);
        break;
      case 'L':
        parts.push(`L ${fmt(s.x)} ${fmt(s.y)}`);
        break;
      case 'C':
        parts.push(
          `C ${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)} ${fmt(s.x)} ${fmt(s.y)}`
        );
        break;
      case 'Q':
        parts.push(`Q ${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x)} ${fmt(s.y)}`);
        break;
      case 'A':
        parts.push(
          `A ${fmt(s.rx)} ${fmt(s.ry)} ${fmt(s.xAxisRotation)} ${
            s.largeArcFlag ? 1 : 0
          } ${s.sweepFlag ? 1 : 0} ${fmt(s.x)} ${fmt(s.y)}`
        );
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
}

const COMMAND_RE = /^[AaCcHhLlMmQqSsTtVvZz]$/;
const TOKEN_RE =
  /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:(?:\d*\.\d+)|(?:\d+\.?))(?:[eE][-+]?\d+)?/g;

const isCommand = (token: string) => COMMAND_RE.test(token);

export function parsePathData(d: string): Segment[] {
  const tokens = d.match(TOKEN_RE) ?? [];
  const segments: Segment[] = [];
  let i = 0;
  let command: string | null = null;
  let current: Point = { x: 0, y: 0 };
  let currentSubpathStart: Point = { x: 0, y: 0 };
  let lastCubicControl: Point | null = null;
  let lastQuadControl: Point | null = null;

  const hasNumber = () => i < tokens.length && !isCommand(tokens[i]);
  const readNumber = () => {
    if (!hasNumber()) {
      throw new Error(`Expected a number after ${command?.toUpperCase() ?? 'command'}.`);
    }
    const value = Number(tokens[i]);
    i += 1;
    if (!Number.isFinite(value)) {
      throw new Error('Path data contains an invalid number.');
    }
    return value;
  };
  const absolutePoint = (x: number, y: number, relative: boolean): Point =>
    relative ? { x: current.x + x, y: current.y + y } : { x, y };

  while (i < tokens.length) {
    const token = tokens[i];
    if (isCommand(token)) {
      command = token;
      i += 1;
    } else if (!command) {
      throw new Error('Path data must start with a path command.');
    }

    if (!command) continue;
    const upper = command.toUpperCase();
    const relative: boolean = command !== upper;

    switch (upper) {
      case 'M': {
        let first = true;
        while (hasNumber()) {
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push(first ? { type: 'M', ...p } : { type: 'L', ...p });
          current = p;
          lastCubicControl = null;
          lastQuadControl = null;
          if (first) currentSubpathStart = p;
          first = false;
        }
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        while (hasNumber()) {
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push({ type: 'L', ...p });
          current = p;
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case 'H': {
        while (hasNumber()) {
          const x = readNumber();
          current = { x: relative ? current.x + x : x, y: current.y };
          segments.push({ type: 'L', ...current });
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case 'V': {
        while (hasNumber()) {
          const y = readNumber();
          current = { x: current.x, y: relative ? current.y + y : y };
          segments.push({ type: 'L', ...current });
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case 'C': {
        while (hasNumber()) {
          const p1 = absolutePoint(readNumber(), readNumber(), relative);
          const p2 = absolutePoint(readNumber(), readNumber(), relative);
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push({ type: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y });
          current = p;
          lastCubicControl = p2;
          lastQuadControl = null;
        }
        break;
      }
      case 'S': {
        while (hasNumber()) {
          const p1: Point = lastCubicControl
            ? { x: current.x * 2 - lastCubicControl.x, y: current.y * 2 - lastCubicControl.y }
            : current;
          const p2 = absolutePoint(readNumber(), readNumber(), relative);
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push({ type: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y });
          current = p;
          lastCubicControl = p2;
          lastQuadControl = null;
        }
        break;
      }
      case 'Q': {
        while (hasNumber()) {
          const p1 = absolutePoint(readNumber(), readNumber(), relative);
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push({ type: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y });
          current = p;
          lastCubicControl = null;
          lastQuadControl = p1;
        }
        break;
      }
      case 'T': {
        while (hasNumber()) {
          const p1: Point = lastQuadControl
            ? { x: current.x * 2 - lastQuadControl.x, y: current.y * 2 - lastQuadControl.y }
            : current;
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push({ type: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y });
          current = p;
          lastCubicControl = null;
          lastQuadControl = p1;
        }
        break;
      }
      case 'A': {
        while (hasNumber()) {
          const rx = readNumber();
          const ry = readNumber();
          const xAxisRotation = readNumber();
          const largeArcFlag = readNumber();
          const sweepFlag = readNumber();
          const p = absolutePoint(readNumber(), readNumber(), relative);
          segments.push({
            type: 'A',
            rx,
            ry,
            xAxisRotation,
            largeArcFlag: largeArcFlag !== 0,
            sweepFlag: sweepFlag !== 0,
            x: p.x,
            y: p.y,
          });
          current = p;
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case 'Z':
        segments.push({ type: 'Z' });
        current = currentSubpathStart;
        lastCubicControl = null;
        lastQuadControl = null;
        command = null;
        break;
      default:
        throw new Error(`Unsupported path command: ${command}`);
    }
  }

  if (segments.length === 0) {
    throw new Error('Path data did not contain any supported segments.');
  }

  return segments;
}

export function segmentStart(segments: Segment[], index: number): Point {
  if (index <= 0) {
    return segmentEndAt(segments, 0);
  }
  return segmentEndAt(segments, index - 1);
}

export function segmentEnd(s: Segment, segments: Segment[]): Point {
  const index = segments.indexOf(s);
  if (index >= 0) return segmentEndAt(segments, index);

  switch (s.type) {
    case 'M':
    case 'L':
      return { x: s.x, y: s.y };
    case 'C':
      return { x: s.x, y: s.y };
    case 'Q':
      return { x: s.x, y: s.y };
    case 'A':
      return { x: s.x, y: s.y };
    case 'Z': {
      const first = segments[0];
      return first ? segmentEnd(first, segments) : { x: 0, y: 0 };
    }
  }
}

export function segmentEndAt(segments: Segment[], index: number): Point {
  const s = segments[index];
  if (!s) return { x: 0, y: 0 };

  switch (s.type) {
    case 'M':
    case 'L':
      return { x: s.x, y: s.y };
    case 'C':
      return { x: s.x, y: s.y };
    case 'Q':
      return { x: s.x, y: s.y };
    case 'A':
      return { x: s.x, y: s.y };
    case 'Z':
      return subpathStart(segments, index);
  }
}

export function subpathStart(segments: Segment[], index: number): Point {
  for (let i = Math.min(index, segments.length - 1); i >= 0; i -= 1) {
    const seg = segments[i];
    if (seg.type === 'M') {
      return { x: seg.x, y: seg.y };
    }
  }
  const firstDrawable = segments.find((seg) => seg.type !== 'Z');
  return firstDrawable ? segmentEnd(firstDrawable, segments) : { x: 0, y: 0 };
}

export function lastSegmentStart(segments: Segment[]): Point | null {
  if (segments.length === 0) return null;
  return segmentStart(segments, segments.length - 1);
}

export function makeLineSegment(from: Point, to: Point): Segment {
  return { type: 'L', x: to.x, y: to.y };
}

export function moveToSegment(p: Point): Segment {
  return { type: 'M', x: p.x, y: p.y };
}

export function convertSegment(
  current: Segment,
  from: Point,
  target: Exclude<SegmentType, 'M'>
): Segment {
  const end = segmentEnd(current, [] as Segment[]);
  const endX = end.x;
  const endY = end.y;
  const dx = endX - from.x;
  const dy = endY - from.y;

  switch (target) {
    case 'L':
      return { type: 'L', x: endX, y: endY };
    case 'C': {
      const x1 = from.x + dx / 3;
      const y1 = from.y + dy / 3;
      const x2 = from.x + (2 * dx) / 3;
      const y2 = from.y + (2 * dy) / 3;
      return { type: 'C', x1, y1, x2, y2, x: endX, y: endY };
    }
    case 'Q': {
      const x1 = from.x + dx / 2;
      const y1 = from.y + dy / 2;
      return { type: 'Q', x1, y1, x: endX, y: endY };
    }
    case 'A': {
      const r = Math.max(1, Math.hypot(dx, dy) / 2);
      return {
        type: 'A',
        rx: r,
        ry: r,
        xAxisRotation: 0,
        largeArcFlag: false,
        sweepFlag: true,
        x: endX,
        y: endY,
      };
    }
    case 'Z':
      return { type: 'Z' };
  }
}

export function segmentEndPoints(seg: Segment): Point[] {
  switch (seg.type) {
    case 'M':
      return [{ x: seg.x, y: seg.y }];
    case 'L':
      return [{ x: seg.x, y: seg.y }];
    case 'C':
      return [
        { x: seg.x1, y: seg.y1 },
        { x: seg.x2, y: seg.y2 },
        { x: seg.x, y: seg.y },
      ];
    case 'Q':
      return [
        { x: seg.x1, y: seg.y1 },
        { x: seg.x, y: seg.y },
      ];
    case 'A':
      return [{ x: seg.x, y: seg.y }];
    case 'Z':
      return [];
  }
}

function scalePoint(p: Point, center: Point, factor: number): Point {
  return {
    x: center.x + (p.x - center.x) * factor,
    y: center.y + (p.y - center.y) * factor,
  };
}

function translatePoint(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

export function pathBounds(segments: Segment[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const points = segments.flatMap(segmentEndPoints);
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pathCenter(segments: Segment[]): Point | null {
  const bounds = pathBounds(segments);
  if (!bounds) return null;
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

export function scaleSegments(
  segments: Segment[],
  factor: number,
  center = pathCenter(segments)
): Segment[] {
  if (!center) return segments;
  return segments.map((seg) => {
    switch (seg.type) {
      case 'M':
      case 'L': {
        const p = scalePoint(seg, center, factor);
        return { ...seg, x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = scalePoint({ x: seg.x1, y: seg.y1 }, center, factor);
        const p2 = scalePoint({ x: seg.x2, y: seg.y2 }, center, factor);
        const p = scalePoint(seg, center, factor);
        return {
          ...seg,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          x: p.x,
          y: p.y,
        };
      }
      case 'Q': {
        const p1 = scalePoint({ x: seg.x1, y: seg.y1 }, center, factor);
        const p = scalePoint(seg, center, factor);
        return { ...seg, x1: p1.x, y1: p1.y, x: p.x, y: p.y };
      }
      case 'A': {
        const p = scalePoint(seg, center, factor);
        return {
          ...seg,
          rx: Math.max(0.01, seg.rx * factor),
          ry: Math.max(0.01, seg.ry * factor),
          x: p.x,
          y: p.y,
        };
      }
      case 'Z':
        return seg;
    }
  });
}

export function translateSegments(
  segments: Segment[],
  dx: number,
  dy: number
): Segment[] {
  return segments.map((seg) => {
    switch (seg.type) {
      case 'M':
      case 'L': {
        const p = translatePoint(seg, dx, dy);
        return { ...seg, x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = translatePoint({ x: seg.x1, y: seg.y1 }, dx, dy);
        const p2 = translatePoint({ x: seg.x2, y: seg.y2 }, dx, dy);
        const p = translatePoint(seg, dx, dy);
        return {
          ...seg,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          x: p.x,
          y: p.y,
        };
      }
      case 'Q': {
        const p1 = translatePoint({ x: seg.x1, y: seg.y1 }, dx, dy);
        const p = translatePoint(seg, dx, dy);
        return { ...seg, x1: p1.x, y1: p1.y, x: p.x, y: p.y };
      }
      case 'A': {
        const p = translatePoint(seg, dx, dy);
        return { ...seg, x: p.x, y: p.y };
      }
      case 'Z':
        return seg;
    }
  });
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function createPath(name: string): PathShape {
  return {
    id: newId(),
    name,
    stroke: '#ffffff',
    strokeWidth: 3,
    strokeOpacity: 1,
    fill: '#3b82f6',
    fillEnabled: false,
    fillOpacity: 0.5,
    visible: true,
    segments: [],
  };
}
