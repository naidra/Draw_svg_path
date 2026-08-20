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

export function segmentStart(segments: Segment[], index: number): Point {
  if (index <= 0) {
    return segmentEnd(segments[0], segments);
  }
  const prev = segments[index - 1];
  return segmentEnd(prev, segments);
}

export function segmentEnd(s: Segment, segments: Segment[]): Point {
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
      return segmentEnd(segments[0], segments);
    }
  }
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
