import { useState } from "react";
import { documentMmToMeters, mapScaleFromMeasurement, type MapPosition } from "@indoor-o-route-analysis/core";

export type MeasureTool = "none" | "measure" | "scale";

interface MeasureLine {
  start: MapPosition;
  end: MapPosition;
}

/**
 * The Map tab's Measure and "Calculate scale" tools. Points are canvas mm
 * (document mm), as reported by the viewer's mouse handlers.
 */
export function useMeasureTools() {
  const [tool, setTool] = useState<MeasureTool>("none");
  const [line, setLine] = useState<MeasureLine | null>(null);
  const [drawing, setDrawing] = useState(false);
  /** Known real distance (m) for the scale tool. */
  const [scaleDistance, setScaleDistance] = useState(100);

  const reset = () => {
    setTool("none");
    setLine(null);
    setDrawing(false);
  };

  /** Start a line; returns false when neither tool is active. */
  const pointerDown = (point: MapPosition): boolean => {
    if (tool === "none") return false;
    setLine({ start: point, end: point });
    setDrawing(true);
    return true;
  };

  const pointerMove = (point: MapPosition) => {
    if (tool !== "none" && drawing && line) setLine({ ...line, end: point });
  };

  /**
   * Finish the line. For the scale tool, returns the map scale (1:N) implied by
   * the line and `scaleDistance`, and clears the line; the measure tool keeps
   * its line visible and returns null.
   */
  const pointerUp = (): number | null => {
    if (!drawing) return null;
    setDrawing(false);
    if (tool !== "scale" || !line) return null;
    const lengthMm = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
    setLine(null);
    return mapScaleFromMeasurement(lengthMm, scaleDistance);
  };

  return { tool, setTool, line, scaleDistance, setScaleDistance, reset, pointerDown, pointerMove, pointerUp };
}

/** SVG overlay for the measure/scale line with its length label (metres, or mm for the scale tool). */
export function MeasureOverlay({
  line,
  tool,
  pixelsPerMM,
  mapScale,
}: {
  line: MeasureLine | null;
  tool: MeasureTool;
  pixelsPerMM: number;
  mapScale: number;
}) {
  if (!line) return null;
  const px = (p: MapPosition) => ({ x: p.x * pixelsPerMM, y: p.y * pixelsPerMM });
  const a = px(line.start);
  const b = px(line.end);
  const lengthMm = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
  const label = tool === "scale" ? `${lengthMm.toFixed(1)} mm` : `${documentMmToMeters(lengthMm, mapScale).toFixed(1)} m`;
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={a.x} cy={a.y} r={4} fill="#2563eb" />
      <circle cx={b.x} cy={b.y} r={4} fill="#2563eb" />
      {/* Label on the map itself (white paper), so fixed light colours in every theme */}
      <g transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}>
        <rect x={-40} y={-14} width={80} height={28} rx={4} fill="white" stroke="#e5e7eb" fillOpacity={0.9} />
        <text x={0} y={5} textAnchor="middle" fontSize={12} className="font-mono font-medium fill-slate-900">
          {label}
        </text>
      </g>
    </g>
  );
}
