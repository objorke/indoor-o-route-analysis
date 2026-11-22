import React from "react";
import {
  OOB_HATCH_SPACING_MM,
  DIRECTION_SYMBOLS,
  DIRECTION_POINT_DRAWINGS,
  directionSymbolScale,
  pointSymbolRadiusMm,
  chevronPolygon,
  oneWayArrowLinePitch,
  oneWayArrowPlacements,
  oneWayChevronSize,
  isDirectionPoint,
  type MapPosition,
  type DirectionFeature,
} from "@indoor-o-route-analysis/core";

/** Halo behind the selected feature (purple selection, like controls). */
const SELECTION_HALO = "#c084fc";

export interface RenderDirectionsOptions {
  features: DirectionFeature[];
  /** IOF MapPosition → canvas pixels (e.g. eventPosToMultiPagePixels). */
  toPx: (p: MapPosition) => MapPosition;
  /** Canvas pixels per printed-map mm; symbol sizes are in mm. */
  pixelsPerMM: number;
  /** Map scale 1:N. Symbol sizes follow ISInOM 3.1 (enlarged above 1:700, never reduced); see directionSymbolScale. */
  mapScale: number | undefined;
  selectedId?: string | null;
  /** Unique per SVG, used for pattern ids. */
  idPrefix?: string;
}

/** SVG paint attributes of a point symbol part (also used by toolbar icons). */
export function pointPartPaint(paint: "round" | "sharp" | "fill", color: string, strokeWidth: number) {
  if (paint === "fill") return { fill: color, stroke: "none" } as const;
  const round = paint === "round";
  return {
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: round ? "round" : "butt",
    strokeLinejoin: round ? "round" : "miter",
  } as const;
}

const pts = (ps: MapPosition[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

/**
 * Shared SVG rendering of the course directions (ISInOM symbols). Returns
 * elements to place inside an <svg> sized like the map canvas. Elements carry
 * `data-direction-id` for hit testing.
 */
export function renderDirections({ features, toPx, pixelsPerMM, mapScale, selectedId, idPrefix = "op" }: RenderDirectionsOptions) {
  // Pixels per symbol mm: the printed size at 1:700, enlarged for larger map scales (ISInOM 3.1)
  const ppm = pixelsPerMM * directionSymbolScale(mapScale);
  if (features.length === 0) return null;
  const hatchId = `${idPrefix}-oob-hatch`;
  const hatch = DIRECTION_SYMBOLS["oob-area"];
  const spacing = Math.max(OOB_HATCH_SPACING_MM * ppm, 1);

  const elements = features.map((f) => {
    const sym = DIRECTION_SYMBOLS[f.kind];
    const width = Math.max(sym.lineWidth * ppm, 0.5);
    const selected = f.id === selectedId;
    const haloWidth = Math.max(width + 6, 8);
    const common = { "data-direction-id": f.id, "data-direction-kind": f.kind } as const;

    if (isDirectionPoint(f)) {
      const c = toPx(f.position);
      const radius = Math.max(pointSymbolRadiusMm(f.kind) * ppm, 8);
      return (
        <g key={f.id} {...common}>
          {selected && <circle cx={c.x} cy={c.y} r={radius} fill={SELECTION_HALO} opacity={0.35} />}
          {/* Drawing in mm, scaled to pixels; the stroke width is in mm too */}
          <g transform={`translate(${c.x} ${c.y}) rotate(${f.rotation}) scale(${ppm})`}>
            {DIRECTION_POINT_DRAWINGS[f.kind].map((part) => (
              <path key={part.paint} d={part.d} {...pointPartPaint(part.paint, sym.color, width / ppm)} />
            ))}
          </g>
          {/* Generous invisible hit area */}
          <circle cx={c.x} cy={c.y} r={radius} fill="transparent" />
        </g>
      );
    }

    const px = f.points.map(toPx);
    if (px.length < 2) return null;

    if (f.kind === "oob-area") {
      const outline = DIRECTION_SYMBOLS["oob-area-boundary"];
      return (
        <g key={f.id} {...common}>
          {selected && (
            <polygon points={pts(px)} fill="none" stroke={SELECTION_HALO} strokeWidth={haloWidth} opacity={0.5} />
          )}
          <polygon points={pts(px)} fill={`url(#${hatchId})`} />
          {f.outline !== false && (
            <polygon points={pts(px)} fill="none" stroke={outline.color} strokeWidth={Math.max(outline.lineWidth * ppm, 0.5)} strokeLinejoin="bevel" />
          )}
        </g>
      );
    }

    if (f.kind === "one-way") {
      // ISInOM 1771.1 (one large arrow at the middle) or 1771.2 (line of arrows): filled chevrons
      const arrows = oneWayArrowPlacements(px, f.style, oneWayArrowLinePitch() * ppm);
      const size = oneWayChevronSize(f.style);
      return (
        <g key={f.id} {...common}>
          {selected && <polyline points={pts(px)} fill="none" stroke={SELECTION_HALO} strokeWidth={haloWidth} opacity={0.5} />}
          {/* Thin guide along the path, so a single arrow can still be picked; the arrows carry the meaning */}
          <polyline points={pts(px)} fill="none" stroke="transparent" strokeWidth={12} />
          {arrows.map((a, i) => (
            <polygon key={i} points={pts(chevronPolygon(a.p, a.angle, size, ppm))} fill={sym.color} />
          ))}
        </g>
      );
    }

    const Tag = f.closed ? "polygon" : "polyline";
    return (
      <g key={f.id} {...common}>
        {selected && <Tag points={pts(px)} fill="none" stroke={SELECTION_HALO} strokeWidth={haloWidth} opacity={0.5} />}
        <Tag points={pts(px)} fill="none" stroke={sym.color} strokeWidth={width} strokeLinejoin={sym.lineJoin ?? "bevel"} strokeLinecap={sym.lineCap ?? "butt"} />
        <Tag points={pts(px)} fill="none" stroke="transparent" strokeWidth={Math.max(width, 12)} />
      </g>
    );
  });

  return (
    <g data-testid="directions">
      <defs>
        {/* Double hatching at ±45°: a square grid rotated by 45° */}
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width={spacing} height={spacing} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={spacing} stroke={hatch.color} strokeWidth={Math.max(hatch.lineWidth * ppm, 0.5)} />
          <line x1={0} y1={0} x2={spacing} y2={0} stroke={hatch.color} strokeWidth={Math.max(hatch.lineWidth * ppm, 0.5)} />
        </pattern>
      </defs>
      {elements}
    </g>
  );
}
