import type { MapData, MapPosition } from "./models/map";
import { getDocumentDimensions } from "./models/map";
import { calculateTransformFromControlPairs, type ControlPairTransformResult } from "./control-registration";

/**
 * Helpers for the map coordinate transform: the axis-aligned mapping between
 * document millimetres (PDF page space, origin top-left, Y down) and IOF
 * MapPosition (event space).
 *
 *   event = TL + (doc / docSize) * (BR - TL)
 *
 * TL/BR are the event coordinates of the document's top-left and bottom-right
 * corners. A negative span (BR < TL) flips that axis, e.g. Y-up maps.
 * See docs/coordinate-systems.md, "Map transform".
 */
export interface MapTransformCorners {
  tl: MapPosition;
  br: MapPosition;
}

export interface DocumentSize {
  width: number;
  height: number;
}

/** Relative tolerance for treating |sx| and |sy| as equal (0.1 %). */
export const UNIFORM_SCALE_TOLERANCE = 1e-3;

/** Size (mm) of the document that a transform is defined against: the page in manual mode, the composed canvas otherwise. */
export function getTransformDocumentSize(map: MapData): DocumentSize {
  if (map.pageTransformMode === "manual") {
    return { width: map.image.width || 0, height: map.image.height || 0 };
  }
  return getDocumentDimensions(map);
}

/** The transform currently in effect: global, or for one page in manual mode. Missing values default to plain document mm. */
export function getMapTransform(map: MapData, pageIndex?: number): MapTransformCorners {
  const dims = getTransformDocumentSize(map);
  if (map.pageTransformMode === "manual") {
    const pt = map.pageTransforms?.[pageIndex ?? 0];
    return {
      tl: pt?.topLeft ? { ...pt.topLeft } : { x: 0, y: 0 },
      br: pt?.bottomRight ? { ...pt.bottomRight } : { x: dims.width, y: dims.height },
    };
  }
  return {
    tl: map.mapPositionTopLeft ? { ...map.mapPositionTopLeft } : { x: 0, y: 0 },
    br: map.mapPositionBottomRight ? { ...map.mapPositionBottomRight } : { x: dims.width, y: dims.height },
  };
}

/**
 * Return a copy of `map` with the transform replaced. In manual mode the
 * transform of page `pageIndex` (default 0) is replaced and missing pages are
 * filled with the plain-mm default; otherwise the global TL/BR are replaced.
 */
export function setMapTransform(map: MapData, corners: MapTransformCorners, pageIndex?: number): MapData {
  const tl = { ...corners.tl };
  const br = { ...corners.br };
  if (map.pageTransformMode !== "manual") {
    return { ...map, mapPositionTopLeft: tl, mapPositionBottomRight: br };
  }
  const idx = pageIndex ?? 0;
  const pageW = map.image.width || 0;
  const pageH = map.image.height || 0;
  const count = Math.max(map.pageCount || 1, idx + 1, map.pageTransforms?.length ?? 0);
  const pageTransforms = Array.from({ length: count }, (_, i) => {
    const pt = map.pageTransforms?.[i];
    return pt
      ? { topLeft: { ...pt.topLeft }, bottomRight: { ...pt.bottomRight } }
      : { topLeft: { x: 0, y: 0 }, bottomRight: { x: pageW, y: pageH } };
  });
  pageTransforms[idx] = { topLeft: tl, bottomRight: br };
  return { ...map, pageTransforms };
}

/**
 * Transform where MapPosition equals document mm.
 * - "top-left": origin at the top-left corner, Y down.
 * - "bottom-left": origin at the bottom-left corner, Y up (IOF/OCAD convention).
 */
export function mmTransform(dims: DocumentSize, origin: "top-left" | "bottom-left"): MapTransformCorners {
  return origin === "top-left"
    ? { tl: { x: 0, y: 0 }, br: { x: dims.width, y: dims.height } }
    : { tl: { x: 0, y: dims.height }, br: { x: dims.width, y: 0 } };
}

/** Event units per document mm on each axis (signed), and whether |sx| ≈ |sy|. */
export function transformScale(
  corners: MapTransformCorners,
  dims: DocumentSize,
): { sx: number; sy: number; uniform: boolean } {
  const sx = dims.width ? (corners.br.x - corners.tl.x) / dims.width : 0;
  const sy = dims.height ? (corners.br.y - corners.tl.y) / dims.height : 0;
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  const uniform = ax > 0 && ay > 0 && Math.abs(ax - ay) <= UNIFORM_SCALE_TOLERANCE * Math.max(ax, ay);
  return { sx, sy, uniform };
}

/** Human-readable size: kB below 1 MB, otherwise MB with one decimal. */
export function formatByteSize(bytes: number): string {
  if (!(bytes > 0)) return "0 kB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** Approximate decoded size of base64 data (without a data: prefix). */
export function estimateBase64ByteLength(encoded: string): number {
  const data = encoded.includes(",") && encoded.startsWith("data:") ? encoded.slice(encoded.indexOf(",") + 1) : encoded;
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

/**
 * Compact info line for a map file, e.g. "2.4 MB · 3 pages · 297 × 210 mm".
 * Dimensions are per page. `byteLength` falls back to the embedded data size.
 */
export function formatMapFileInfo(map: MapData | undefined, byteLength?: number): string {
  if (!map) return "";
  const parts: string[] = [];
  const bytes = byteLength && byteLength > 0
    ? byteLength
    : map.image.encodedData
      ? estimateBase64ByteLength(map.image.encodedData)
      : 0;
  if (bytes > 0) parts.push(formatByteSize(bytes));
  const pages = map.pageCount || 1;
  parts.push(`${pages} page${pages === 1 ? "" : "s"}`);
  if (map.image.width && map.image.height) {
    parts.push(`${Math.round(map.image.width)} × ${Math.round(map.image.height)} mm`);
  }
  return parts.join(" · ");
}

/**
 * Canvas offset (mm) of a page in a manual per-page, multi-page layout: page N
 * sits at N × pageWidth (horizontal) or N × pageHeight (vertical). Zero in
 * automatic mode and for the "pages" layout.
 */
export function getPageCanvasOffset(map: MapData, pageIndex: number): MapPosition {
  if (map.pageTransformMode !== "manual") return { x: 0, y: 0 };
  if (map.layout === "horizontal") return { x: pageIndex * (map.image.width || 0), y: 0 };
  if (map.layout === "vertical") return { x: 0, y: pageIndex * (map.image.height || 0) };
  return { x: 0, y: 0 };
}

export interface RegistrationPair {
  /** The control's IOF MapPosition. */
  event: MapPosition;
  /** Where the user placed its mark, in canvas mm (as reported by mouse events). */
  canvasMark: MapPosition;
}

/**
 * New transform from two controls and their placed marks (the two-control
 * registration tool). Marks are converted from canvas mm to the page's
 * document mm; the current transform's axis orientation is kept when it can't
 * be derived from the marks. Returns null when the marks are too close.
 */
export function registrationFromMarks(
  map: MapData,
  pageIndex: number | undefined,
  pairs: [RegistrationPair, RegistrationPair],
  uniform: boolean,
): ControlPairTransformResult | null {
  const dims = getTransformDocumentSize(map);
  const offset = getPageCanvasOffset(map, pageIndex ?? 0);
  const local = (p: MapPosition) => ({ x: p.x - offset.x, y: p.y - offset.y });
  const current = transformScale(getMapTransform(map, pageIndex), dims);
  return calculateTransformFromControlPairs(
    pairs[0].event,
    local(pairs[0].canvasMark),
    pairs[1].event,
    local(pairs[1].canvasMark),
    dims.width || 1,
    dims.height || 1,
    { uniform, orientation: { x: current.sx < 0 ? -1 : 1, y: current.sy < 0 ? -1 : 1 } },
  );
}

/** Real-world length (m) of `documentMm` millimetres on a map at 1:`scale`. */
export function documentMmToMeters(documentMm: number, scale: number): number {
  return (documentMm * scale) / 1000;
}

/**
 * Map scale from a measurement: a line `documentMm` long on the map is
 * `realMeters` in reality → 1:N, rounded. Null when either length is not positive.
 */
export function mapScaleFromMeasurement(documentMm: number, realMeters: number): number | null {
  if (!(documentMm > 0) || !(realMeters > 0)) return null;
  return Math.round(realMeters / (documentMm / 1000));
}
