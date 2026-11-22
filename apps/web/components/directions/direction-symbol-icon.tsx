import { MousePointer2 } from "lucide-react";
import { ISINOM_BASE_SCALE, isDirectionPointKind, pointSymbolRadiusMm, type DirectionFeature, type DirectionKind } from "@indoor-o-route-analysis/core";
import { renderDirections } from "@indoor-o-route-analysis/ui";
import type { DirectionTool } from "./tools";

/** Icon box (printed-map mm) and drawing scale (SVG units per mm, keeps thin lines above the renderer's minimum width). */
const BOX_MM = 7;
const SCALE = 10;

/** A small sample of each symbol, in mm inside the icon box. */
function sampleFeature(kind: DirectionKind): DirectionFeature {
  const id = `icon-${kind}`;
  const c = BOX_MM / 2;
  if (isDirectionPointKind(kind)) return { id, kind, position: { x: c, y: c }, rotation: 0 };
  if (kind === "oob-area")
    return { id, kind, points: [{ x: 0.6, y: 0.6 }, { x: 6.4, y: 0.6 }, { x: 6.4, y: 6.4 }, { x: 0.6, y: 6.4 }] };
  const line = [{ x: 0.4, y: c }, { x: BOX_MM - 0.4, y: c }];
  if (kind === "one-way") return { id, kind, points: line, style: "line" };
  return { id, kind, points: line };
}

/**
 * Toolbar icon of an directions tool: a sample of the symbol drawn by the shared
 * directions renderer, in its real colours, so the icon always matches the map.
 */
export function DirectionSymbolIcon({ kind, className }: { kind: DirectionKind; className?: string }) {
  // Point symbols are zoomed to their own size; lines and areas show a 7 mm sample
  const half = isDirectionPointKind(kind) ? pointSymbolRadiusMm(kind) : BOX_MM / 2;
  const min = (BOX_MM / 2 - half) * SCALE;
  return (
    <svg viewBox={`${min} ${min} ${2 * half * SCALE} ${2 * half * SCALE}`} className={className} aria-hidden="true">
      {renderDirections({
        features: [sampleFeature(kind)],
        toPx: (p) => ({ x: p.x * SCALE, y: p.y * SCALE }),
        pixelsPerMM: SCALE,
        mapScale: ISINOM_BASE_SCALE, // true symbol size
        idPrefix: `icon-${kind}`,
      })}
    </svg>
  );
}

/** Icon of an directions tool: the pointer for Select, otherwise a sample of the symbol. */
export function ToolIcon({ tool, className }: { tool: DirectionTool; className?: string }) {
  if (tool === "select") return <MousePointer2 className={className} />;
  return <DirectionSymbolIcon kind={tool} className={className} />;
}
