"use client"

import type React from "react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ControlRenderer, renderDirections, useAppData } from "@indoor-o-route-analysis/ui";
import {
  eventPosToMultiPagePixels,
  minDirectionPoints,
  multiPagePixelsToEvent,
  nearestSegment,
  type Control,
  type MapData,
  type MapPosition,
  type DirectionFeature,
  type DirectionPointKind,
} from "@indoor-o-route-analysis/core";
import type { MapViewerState } from "@/components/map-viewer";
import { getDirectionTool, type DirectionTool } from "./tools";

const MapViewer = dynamic(() => import("@/components/map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-muted" />,
});

/** A feature to add, before it gets an id. */
export type NewDirectionFeature = DirectionFeature extends infer F ? (F extends DirectionFeature ? Omit<F, "id"> : never) : never;

interface Props {
  map: MapData | undefined;
  controls: Control[];
  features: DirectionFeature[];
  tool: DirectionTool;
  oneWayStyle: "single" | "line";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (feature: NewDirectionFeature) => void;
  /** Live move of a feature during a drag (deltas in MapPosition units). */
  onMove: (id: string, dx: number, dy: number) => void;
  /** Vertex editing of the selected line/area/one-way feature. */
  onMoveVertex: (id: string, index: number, to: MapPosition) => void;
  onRemoveVertex: (id: string, index: number) => void;
  onInsertVertex: (id: string, afterIndex: number, at: MapPosition) => void;
}

const CLICK_TOLERANCE_PX = 4;

/**
 * Map with the course directions: draws/edits direction symbols with the active
 * tool. Controls are shown faintly for orientation. All mouse handlers call
 * preventDefault so no text selection appears while drawing or dragging.
 */
export default function DirectionsMapViewer({
  map,
  controls,
  features,
  tool,
  oneWayStyle,
  selectedId,
  onSelect,
  onAdd,
  onMove,
  onMoveVertex,
  onRemoveVertex,
  onInsertVertex,
}: Props) {
  const { pdfBlobUrl } = useAppData();
  const [draft, setDraft] = useState<MapPosition[]>([]);
  const [cursor, setCursor] = useState<MapPosition | null>(null);
  const pointer = useRef<{
    client: MapPosition;
    event: MapPosition;
    dragId: string | null;
    /** Set when dragging one vertex of the selected feature. */
    vertex: number | null;
    moved: boolean;
  } | null>(null);
  const selected = features.find((f) => f.id === selectedId);
  const selectedPoints = selected && "points" in selected ? selected.points : null;
  const toolDef = getDirectionTool(tool);

  // Switching tools discards an unfinished drawing
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient drawing state on tool change
    setDraft([]);
  }, [tool]);

  const finishDraft = (raw: MapPosition[]) => {
    if (toolDef.geometry !== "line" && toolDef.geometry !== "area") return;
    // A double-click adds the same point twice: drop consecutive duplicates
    const points = raw.filter((p, i) => i === 0 || Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) > 1e-6);
    if (points.length < minDirectionPoints(toolDef.id as DirectionFeature["kind"])) return;
    if (tool === "one-way") onAdd({ kind: "one-way", points, style: oneWayStyle });
    else if (tool === "oob-area") onAdd({ kind: "oob-area", points, outline: true });
    else if (tool === "uncrossable" || tool === "oob-boundary" || tool === "oob-area-boundary") onAdd({ kind: tool, points });
    setDraft([]);
  };

  // Enter finishes, Backspace removes the last point, Esc cancels
  useEffect(() => {
    if (draft.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === "Enter") {
        e.preventDefault();
        finishDraft(draft);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDraft([]);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const mapUrl = map?.image?.url?.startsWith("http") ? map.image.url : undefined;

  return (
    <MapViewer pdfUrl={pdfBlobUrl || mapUrl} showBackgroundMap mapLayout={map?.layout || "horizontal"} initialFit>
      {(state: MapViewerState) => {
        const ppm = state.pixelsPerMM;
        const toPx = (p: MapPosition) => eventPosToMultiPagePixels(p, map, ppm);
        const canvasPx = (e: React.MouseEvent<SVGSVGElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          return { x: (e.clientX - rect.left) / state.zoom, y: (e.clientY - rect.top) / state.zoom };
        };
        const toEvent = (e: React.MouseEvent<SVGSVGElement>) => multiPagePixelsToEvent(canvasPx(e), map, ppm);

        const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
          if (e.button !== 0) return;
          const target = e.target as Element;
          const vertexAttr = tool === "select" ? target.closest("[data-vertex-index]")?.getAttribute("data-vertex-index") : null;
          const vertex = vertexAttr != null ? Number(vertexAttr) : null;
          const hit = target.closest("[data-direction-id]")?.getAttribute("data-direction-id") ?? null;
          const dragId = tool === "select" ? (vertex !== null ? selectedId : hit) : null;
          if (dragId) {
            e.preventDefault();
            e.stopPropagation(); // don't pan while moving a symbol or a point
            if (vertex === null) onSelect(dragId);
          }
          pointer.current = { client: { x: e.clientX, y: e.clientY }, event: toEvent(e), dragId, vertex, moved: false };
        };

        const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
          const here = toEvent(e);
          setCursor(here);
          const p = pointer.current;
          if (!p) return;
          if (Math.hypot(e.clientX - p.client.x, e.clientY - p.client.y) > CLICK_TOLERANCE_PX) p.moved = true;
          if (p.dragId && p.moved) {
            e.preventDefault();
            if (p.vertex !== null) onMoveVertex(p.dragId, p.vertex, here);
            else onMove(p.dragId, here.x - p.event.x, here.y - p.event.y);
            p.event = here;
          }
        };

        const onMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
          const p = pointer.current;
          pointer.current = null;
          if (!p || p.moved) return; // a drag (pan or move), not a click
          e.preventDefault();
          const here = toEvent(e);
          if (tool === "select") {
            if (!p.dragId) onSelect(null);
          } else if (toolDef.geometry === "point") {
            onAdd({ kind: tool as DirectionPointKind, position: here, rotation: 0 });
          } else {
            setDraft((d) => [...d, here]);
          }
        };

        const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
          if (tool === "select" && selected && selectedPoints) {
            const target = e.target as Element;
            const vertexAttr = target.closest("[data-vertex-index]")?.getAttribute("data-vertex-index");
            e.preventDefault();
            if (vertexAttr != null) {
              onRemoveVertex(selected.id, Number(vertexAttr)); // double-click a point: delete it
            } else if (target.closest("[data-direction-id]")?.getAttribute("data-direction-id") === selected.id) {
              // double-click the selected line: add a point on the nearest segment
              const closed = selected.kind === "oob-area" || ("closed" in selected && !!selected.closed);
              const near = nearestSegment(selectedPoints, toEvent(e), closed);
              if (near) onInsertVertex(selected.id, near.index, near.point);
            }
            return;
          }
          if (draft.length === 0) return;
          e.preventDefault();
          // The double-click's second click already added a point at the same spot
          finishDraft(draft);
        };

        const draftPx = draft.map(toPx);
        const previewPx = cursor && draft.length > 0 ? [...draftPx, toPx(cursor)] : draftPx;

        return (
          <svg
            width={state.pdfDimensions.width}
            height={state.pdfDimensions.height}
            style={{ position: "absolute", top: 0, left: 0, cursor: tool === "select" ? "default" : "crosshair", userSelect: "none" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={onDoubleClick}
            onMouseLeave={() => setCursor(null)}
          >
            {/* Controls, faint, for orientation */}
            <g opacity={0.35} pointerEvents="none">
              {controls.map((c) =>
                ControlRenderer.renderControl({
                  control: { ...c, ...toPx(c.mapPosition) },
                  courseControls: [],
                  courseControlCodes: [c.id],
                  strokeColor: "#a855f7",
                }),
              )}
            </g>
            {renderDirections({ features, toPx, pixelsPerMM: ppm, mapScale: map?.scale, selectedId, idPrefix: "directions-view" })}
            {/* Point handles of the selected line/area (Select tool) */}
            {tool === "select" && selectedPoints && (
              <g data-testid="directions-vertices">
                {selectedPoints.map((p, i) => {
                  const q = toPx(p);
                  return (
                    <rect
                      key={i}
                      data-vertex-index={i}
                      x={q.x - 4}
                      y={q.y - 4}
                      width={8}
                      height={8}
                      fill="white"
                      stroke="#7c3aed"
                      strokeWidth={1.5}
                      style={{ cursor: "move" }}
                    />
                  );
                })}
              </g>
            )}
            {previewPx.length > 0 && (
              <g pointerEvents="none" data-testid="directions-draft">
                <polyline
                  points={previewPx.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                {draftPx.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill="#a855f7" />
                ))}
              </g>
            )}
          </svg>
        );
      }}
    </MapViewer>
  );
}
