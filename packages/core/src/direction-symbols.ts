import type { MapPosition } from "./models/map";
import { isDirectionPointKind, type DirectionFeature, type DirectionKind, type DirectionPointKind } from "./models/directions";

/**
 * Direction symbol definitions (ISInOM). Sizes and colours are taken from the
 * ISInOM symbol drawings (omapwiki). All sizes in printed-map mm.
 */
export const DIRECTION_COLORS = {
  /** Purple, colour 54, as in the ISInOM 708 / 709 drawings. */
  purple: "#C6168D",
  /** Colour 903, as in the ISInOM 1775 drawing (uncrossable border). */
  purple903: "#9C1881",
  /** Orange (one-way passage, compulsory crossing), as in the ISInOM symbol drawings. */
  orange: "#E97C1D",
  /** Green (map flip point), as in the ISInOM 1720 drawing. */
  green: "#007F53",
} as const;

export interface DirectionSymbolDef {
  label: string;
  color: string;
  /** Line width (mm). */
  lineWidth: number;
  /** Line ends and corners of line symbols. Default butt ends and bevelled corners, as in the ISInOM drawings. */
  lineCap?: "round" | "butt";
  lineJoin?: "round" | "bevel";
}

export const DIRECTION_SYMBOLS: Record<DirectionKind, DirectionSymbolDef> = {
  // ISInOM 1775
  uncrossable: { label: "Uncrossable border", color: DIRECTION_COLORS.purple903, lineWidth: 0.7 },
  // ISInOM 708
  "oob-boundary": { label: "Out-of-bounds boundary", color: DIRECTION_COLORS.purple, lineWidth: 1.0 },
  // ISInOM 709.4
  "oob-area-boundary": { label: "Out-of-bounds area boundary", color: DIRECTION_COLORS.purple, lineWidth: 0.4 },
  // ISInOM 709: double hatching, 0.2 mm lines at ±45°, 0.8 mm apart
  "oob-area": { label: "Out-of-bounds area", color: DIRECTION_COLORS.purple, lineWidth: 0.2 },
  // ISInOM 1771.1 / 1771.2: filled chevrons, see ONE_WAY_LARGE_ARROW / ONE_WAY_ARROW_LINE
  "one-way": { label: "One-way passage", color: DIRECTION_COLORS.orange, lineWidth: 0.55 },
  // ISInOM 1772, 1773 and 1774, drawn from DIRECTION_POINT_DRAWINGS
  "compulsory-crossing": { label: "Compulsory crossing", color: DIRECTION_COLORS.orange, lineWidth: 0.25 },
  "compulsory-switch": { label: "Compulsory diagonal switch", color: DIRECTION_COLORS.orange, lineWidth: 0.25 },
  "compulsory-one-way-switch": { label: "Compulsory diagonal one-way switch", color: DIRECTION_COLORS.orange, lineWidth: 0.25 },
  // ISInOM 1720: five 1.40 mm bars
  "map-flip-point": { label: "Map flip point", color: DIRECTION_COLORS.green, lineWidth: 1.4 },
};

/** ISInOM 3.1: base map scale; all symbol dimensions are given at 1:700. */
export const ISINOM_BASE_SCALE = 700;

/**
 * ISInOM 3.1 symbol size factor for a map at 1:`mapScale`. Symbols are enlarged
 * proportionally for larger scales (1:350 → 2), but never reduced: at 1:700 and
 * smaller scales (e.g. 1:1500) they keep their 1:700 size. Unknown scale → 1.
 */
export function directionSymbolScale(mapScale: number | undefined): number {
  if (!mapScale || !(mapScale > 0)) return 1;
  return Math.max(1, ISINOM_BASE_SCALE / mapScale);
}

/** Spacing between hatch lines of an out-of-bounds area (mm), ISInOM 709. */
export const OOB_HATCH_SPACING_MM = 0.8;
/**
 * One-way passage chevron (ISInOM 1771): a filled "›" pointing in the direction
 * of travel. Both arms make `angleDeg` with the line, the arm ends are cut
 * parallel to the line, `height` is the full size across the line and
 * `thickness` the size of an arm measured along the line.
 */
export interface ChevronSize {
  height: number;
  thickness: number;
  angleDeg: number;
}

/** 1771.1 One-way passage, one large arrow (style "single"), placed at the middle of the path. */
export const ONE_WAY_LARGE_ARROW: ChevronSize = { height: 3.7, thickness: 1.1, angleDeg: 55 };
/** 1771.2 One-way passage, line of arrows (style "line"). */
export const ONE_WAY_ARROW_LINE: ChevronSize = { height: 1.84, thickness: 0.55, angleDeg: 55 };
/** 1771.2: clear gap between two chevrons, along the line (mm). */
export const ONE_WAY_ARROW_LINE_GAP_MM = 0.6;

/** Distance between consecutive chevrons of a line of arrows, along the line (mm). */
export const oneWayArrowLinePitch = (): number => ONE_WAY_ARROW_LINE.thickness + ONE_WAY_ARROW_LINE_GAP_MM;

/** The chevron size for a one-way style. */
export const oneWayChevronSize = (style: "single" | "line"): ChevronSize =>
  style === "single" ? ONE_WAY_LARGE_ARROW : ONE_WAY_ARROW_LINE;
/**
 * One part of a point symbol drawing: SVG path data in printed-map mm, centred
 * on the symbol position, rotation 0. "round" and "sharp" parts are stroked
 * with the symbol's line width (round caps/joins, or butt caps/miter joins);
 * "fill" parts are filled.
 */
export interface PointSymbolPart {
  paint: "round" | "sharp" | "fill";
  d: string;
}

/**
 * Point symbol drawings, traced from the ISInOM symbol drawings (SVG) and
 * scaled so the labelled width is measured on the line centres:
 * - 1772 Compulsory crossing: 2.03 × 2.03 mm, two diagonals with arrowheads in
 *   all four corners, one passing over the other with a loop at the centre.
 * - 1773 Compulsory diagonal switch: 2.8 mm wide (2.2 mm high), two
 *   horizontal arrows in both directions that swap rows via a crossing with a loop.
 * - 1774 Compulsory diagonal one-way switch: 2.8 mm wide (1.74 mm high), as
 *   1773 but with arrowheads only on the upper row (rotate to set the direction).
 * - 1720 Map flip point: green five-armed star, 4.7 mm high, 1.40 mm bars
 *   (each arm 2.4 mm from the centre, 72° apart, one pointing up).
 * Rotation 0 is the symbol as drawn; rotate with the passage.
 */
export const DIRECTION_POINT_DRAWINGS: Record<DirectionPointKind, PointSymbolPart[]> = {
  "compulsory-crossing": [
    { paint: "sharp", d: "M-0.999,1.008 L0.066,-0.059 M0.994,0.987 L0.165,0.158 M-0.421,1.008 L-0.999,1.008 L-0.999,0.414 M-0.179,-0.186 L-0.999,-1.006 M-0.268,-0.266 C-0.289,-0.245 -0.327,-0.232 -0.338,-0.202 M0.185,0.317 C0.205,0.296 0.235,0.277 0.254,0.258 C0.402,0.118 0.402,-0.127 0.254,-0.266 C0.117,-0.414 -0.131,-0.414 -0.268,-0.266 M0.432,-0.425 L1.015,-1.006 M1.018,0.435 L1.018,1.012 L0.427,1.012 M0.427,-1.012 L1.005,-1.012 L1.005,-0.42 M-1.018,-0.428 L-1.018,-1.001 L-0.432,-1.001" },
  ],
  "compulsory-switch": [
    { paint: "round", d: "M-1.333,0.631 L-0.459,0.631 L-0.335,0.475 M1.345,0.631 L0.45,0.631 L0.011,0.084 M0.371,-0.42 L0.55,-0.645 L1.345,-0.645 M-1.345,-0.645 L-0.56,-0.645" },
    { paint: "sharp", d: "M0.236,-0.252 L0.37,-0.42 M-0.335,0.475 L-0.258,0.374 M-0.918,-0.169 L-1.382,-0.627 L-0.906,-1.104 M0.942,-1.104 L1.4,-0.639 L0.926,-0.163 M-0.936,1.098 L-1.4,0.637 L-0.924,0.161 M0.926,0.161 L1.384,0.627 L0.908,1.104" },
    { paint: "fill", d: "M-0.392,0.329 L-0.301,0.218 L-0.123,0.43 L-0.191,0.509 L-0.392,0.329 M0.27,-0.511 L0.09,-0.286 L0.258,-0.074 L0.426,-0.264 L0.371,-0.42 L0.27,-0.511 M-0.124,0.43 C-0.301,0.218 -0.347,-0.007 -0.191,-0.175 C-0.066,-0.309 0.181,-0.242 0.258,-0.074 C0.359,-0.197 0.325,-0.175 0.337,-0.23 C0.359,-0.331 0.27,-0.365 0.191,-0.42 C-0.033,-0.544 -0.201,-0.487 -0.38,-0.319 C-0.57,-0.118 -0.527,0.185 -0.347,0.554 L-0.124,0.43 M-0.448,-0.722 L-0.335,-0.554 C-0.369,-0.521 -0.414,-0.533 -0.448,-0.499 C-0.481,-0.465 -0.481,-0.432 -0.515,-0.398 L-0.695,-0.6 L-0.448,-0.722" },
  ],
  "compulsory-one-way-switch": [
    { paint: "round", d: "M-1.366,0.868 L-0.487,0.868 L-0.364,0.711 M1.328,0.868 L0.426,0.868 L-0.014,0.317 M0.346,-0.19 L0.527,-0.417 L1.328,-0.417 M-1.378,-0.417 L-0.589,-0.417" },
    { paint: "sharp", d: "M0.211,-0.021 L0.346,-0.19 M-0.364,0.711 L-0.284,0.61 M-0.933,0.075 L-1.4,-0.389 L-0.921,-0.868 M0.939,-0.868 L1.4,-0.399 L0.921,0.081" },
    { paint: "fill", d: "M-0.42,0.564 L-0.33,0.452 L-0.149,0.665 L-0.217,0.745 L-0.42,0.564 M0.245,-0.281 L0.066,-0.055 L0.235,0.158 L0.404,-0.033 L0.346,-0.19 L0.245,-0.281 M-0.149,0.665 C-0.33,0.452 -0.376,0.226 -0.217,0.057 C-0.093,-0.079 0.155,-0.011 0.235,0.158 C0.336,0.035 0.302,0.057 0.312,0.001 C0.336,-0.1 0.245,-0.134 0.167,-0.19 C-0.06,-0.315 -0.229,-0.258 -0.41,-0.088 C-0.601,0.114 -0.555,0.419 -0.376,0.79 L-0.149,0.665 M-0.477,-0.496 L-0.364,-0.325 C-0.398,-0.291 -0.443,-0.303 -0.477,-0.269 C-0.511,-0.236 -0.511,-0.202 -0.545,-0.168 L-0.724,-0.371 L-0.477,-0.496" },
  ],
  "map-flip-point": [{ paint: "sharp", d: "M0,0 L0,-2.398 M0,0 L2.281,-0.741 M0,0 L1.41,1.94 M0,0 L-1.41,1.94 M0,0 L-2.281,-0.741" }],
};

/**
 * Radius (mm) around a point symbol's position that its drawing covers (plus
 * half a line width): used for the selection halo and the hit area.
 */
export function pointSymbolRadiusMm(kind: DirectionPointKind): number {
  const nums = DIRECTION_POINT_DRAWINGS[kind].flatMap((p) => (p.d.match(/-?\d*\.?\d+/g) ?? []).map(Number));
  let r = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) r = Math.max(r, Math.hypot(nums[i], nums[i + 1]));
  return r + DIRECTION_SYMBOLS[kind].lineWidth / 2;
}

/** Point and direction at distance `d` along a polyline, or null past its end. */
function pointAlong(points: MapPosition[], d: number): { p: MapPosition; angle: number } | null {
  let remaining = d;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    if (remaining <= len) {
      const t = remaining / len;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    remaining -= len;
  }
  return null;
}

export function polylineLength(points: MapPosition[]): number {
  let len = 0;
  for (let i = 0; i + 1 < points.length; i++) len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return len;
}

/**
 * Arrow placements (centre and direction in radians) along a path in document
 * mm: one in the middle for "single", or evenly spaced chevrons for "line" (at least one).
 */
export function oneWayArrowPlacements(
  points: MapPosition[],
  style: "single" | "line",
  spacing = oneWayArrowLinePitch(),
): { p: MapPosition; angle: number }[] {
  const total = polylineLength(points);
  if (total === 0) return [];
  if (style === "single") {
    const mid = pointAlong(points, total / 2);
    return mid ? [mid] : [];
  }
  const count = Math.max(1, Math.floor(total / spacing));
  const step = total / count;
  const out: { p: MapPosition; angle: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = pointAlong(points, step * (i + 0.5));
    if (at) out.push(at);
  }
  return out;
}

/**
 * Filled chevron polygon centred on `p` (middle of its length along the line),
 * pointing along `angle` (radians), all sizes scaled by `scale` (e.g. pixels per mm).
 * Points: tip, outer arm end, back of arm, inner apex, back of arm, outer arm end.
 */
export function chevronPolygon(p: MapPosition, angle: number, size: ChevronSize, scale = 1): MapPosition[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const h = (size.height / 2) * scale;
  const t = size.thickness * scale;
  const run = h / Math.tan((size.angleDeg * Math.PI) / 180); // arm length along the line
  const c = (run + t) / 2; // centre the chevron on p
  const at = (dx: number, dy: number) => ({ x: p.x + (dx + c) * cos - dy * sin, y: p.y + (dx + c) * sin + dy * cos });
  return [at(0, 0), at(-run, -h), at(-run - t, -h), at(-t, 0), at(-run - t, h), at(-run, h)];
}

/** Move a feature by (dx, dy) in MapPosition units. */
export function translateDirectionFeature<T extends DirectionFeature>(f: T, dx: number, dy: number): T {
  const move = (p: MapPosition) => ({ x: p.x + dx, y: p.y + dy });
  if ("position" in f) return { ...f, position: move(f.position) };
  return { ...f, points: f.points.map(move) };
}

/** Rotate a point symbol by `deltaDeg`, normalised to [0, 360). Other features are returned unchanged. */
export function rotateDirectionFeature<T extends DirectionFeature>(f: T, deltaDeg: number): T {
  if (!("rotation" in f)) return f;
  return { ...f, rotation: (((f.rotation + deltaDeg) % 360) + 360) % 360 };
}

/** Minimum number of points for a drawn feature of this kind. */
export function minDirectionPoints(kind: DirectionKind): number {
  if (kind === "oob-area") return 3;
  if (isDirectionPointKind(kind)) return 1;
  return 2;
}

type PathFeature = Exclude<DirectionFeature, { position: MapPosition }>;
const isPathFeature = (f: DirectionFeature): f is PathFeature => "points" in f;

/** Move vertex `index` of a line/area/one-way feature. */
export function moveDirectionVertex<T extends DirectionFeature>(f: T, index: number, to: MapPosition): T {
  if (!isPathFeature(f) || index < 0 || index >= f.points.length) return f;
  const points = [...f.points];
  points[index] = { ...to };
  return { ...f, points };
}

/** Remove vertex `index`, unless the feature would drop below its minimum number of points. */
export function removeDirectionVertex<T extends DirectionFeature>(f: T, index: number): T {
  if (!isPathFeature(f) || f.points.length <= minDirectionPoints(f.kind)) return f;
  return { ...f, points: f.points.filter((_, i) => i !== index) };
}

/** Insert a vertex after `afterIndex` (i.e. on the segment afterIndex → afterIndex + 1). */
export function insertDirectionVertex<T extends DirectionFeature>(f: T, afterIndex: number, p: MapPosition): T {
  if (!isPathFeature(f)) return f;
  const points = [...f.points];
  points.splice(afterIndex + 1, 0, { ...p });
  return { ...f, points };
}

/**
 * Nearest segment of a path to `p`: the index of its first vertex, the closest
 * point on it, and the distance. Includes the closing segment when `closed`.
 */
export function nearestSegment(
  points: MapPosition[],
  p: MapPosition,
  closed = false,
): { index: number; point: MapPosition; distance: number } | null {
  const n = points.length;
  const segments = closed ? n : n - 1;
  let best: { index: number; point: MapPosition; distance: number } | null = null;
  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.distance) best = { index: i, point: q, distance: d };
  }
  return best;
}
