"use client";

import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, multiPagePixelsToEvent, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { useAppData } from "@indoor-o-route-analysis/ui";
import type { Polygon } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import { mergeRaceCourse } from "@indoor-o-route-analysis/core";
import { getModel3DTool, type Model3DTool } from "./tools";
import {
  POLYGON_NODE_RADIUS,
  POLYGON_STROKE_WIDTH,
  POLYGON_STROKE_COLOR_DEFAULT,
  POLYGON_STROKE_COLOR_SELECTED,
  POLYGON_FILL_COLOR_DEFAULT,
  POLYGON_FILL_COLOR_SELECTED,
  POLYGON_ORIGIN_RADIUS,
  POLYGON_ORIGIN_STROKE_WIDTH,
} from "@indoor-o-route-analysis/core";

interface Model3DMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  scale?: number;
  selectedPolygonId: string | null;
  onSelectPolygon: (id: string | null) => void;
  /** Active interaction tool (see tools.ts). */
  tool: Model3DTool;
}

export interface Model3DMapViewerHandle {
  flyTo: (center: { x: number; y: number }) => void;
}
  
  // Helper function to check if point is inside polygon
const isPointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Helper function to check if point is near edge
const isPointNearEdge = (
  point: { x: number; y: number },
  edge: [{ x: number; y: number }, { x: number; y: number }],
  threshold: number = 5
): { isNear: boolean; t: number } => {
  const [p1, p2] = edge;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { isNear: false, t: 0 };

  // Calculate projection parameter
  const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (length * length)));
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;
  const dist = Math.hypot(point.x - projX, point.y - projY);

  return { isNear: dist <= threshold, t };
};

const Model3DMapViewer = forwardRef<Model3DMapViewerHandle, Model3DMapViewerProps>(({
  map,
  pdfUrl,
  scale: _scale = 1,
  selectedPolygonId,
  onSelectPolygon,
  tool,
}, ref) => {
  const { selectedEvent, updateEvent } = useAppData();

  const toPixels = useCallback(
    (state: MapViewerState, p: { x: number; y: number }) => eventPosToMultiPagePixels(p, map, state.pixelsPerMM),
    [map],
  );

  const toEvent = useCallback(
    (state: MapViewerState, p: { x: number; y: number }) => multiPagePixelsToEvent(p, map, state.pixelsPerMM),
    [map],
  );

  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [isCreatingPolygon, setIsCreatingPolygon] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState<Array<{ x: number; y: number }>>([]);
  const [isDraggingPoint, setIsDraggingPoint] = useState(false);
  const [dragPointIndex, setDragPointIndex] = useState<number | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [isDraggingOrigin, setIsDraggingOrigin] = useState(false);
  const [selectedOriginPolygonId, setSelectedOriginPolygonId] = useState<string | null>(null);
  const [adjustOriginStart, setAdjustOriginStart] = useState<{ x: number; y: number } | null>(null);
  // Polygon whose origin is being set by the "origin by reference" drag
  const [adjustOriginSourceId, setAdjustOriginSourceId] = useState<string | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
  const [pointerDown, setPointerDown] = useState<{ x: number; y: number; mapX: number; mapY: number } | null>(null);
  const [snapToAxis, _setSnapToAxis] = useState(true);
  const controllerRef = useRef<MapViewerController | null>(null);
  const lastStateRef = useRef<MapViewerState | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (center: { x: number; y: number }) => {
      if (controllerRef.current && map && lastStateRef.current) {
        const p = eventPosToMultiPagePixels(center, map, lastStateRef.current.pixelsPerMM);
        controllerRef.current.flyTo(p);
      }
    },
  }), [map]);

  // Switching tools cancels any in-progress interaction
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient interaction state on tool change
    setCurrentPolygon([]);
    setIsCreatingPolygon(false);
    setSelectedPointIndex(null);
    setSelectedOriginPolygonId(null);
    setAdjustOriginStart(null);
    setAdjustOriginSourceId(null);
    setIsDraggingPoint(false);
    setIsDraggingOrigin(false);
    setPointerDown(null);
  }, [tool]);

  // Node radius for points (same as graph editor)
  const nodeRadius = POLYGON_NODE_RADIUS;

  // Load polygons from selectedEvent
  useEffect(() => {
    const polygons = selectedEvent?.raceCourses?.[0]?.polygons;
    if (polygons) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state from event data
      setPolygons(polygons);
    } else {
       
      setPolygons([]);
    }
  }, [selectedEvent?.id, selectedEvent?.raceCourses]); // Dependency on deep structure needed or ID

  // Save polygons to event
  const savePolygons = useCallback(
    (newPolygons: Polygon[]) => {
      if (selectedEvent?.raceCourses) {
        updateEvent(selectedEvent.id, (e) => mergeRaceCourse(e, { polygons: newPolygons }), undefined, { label: "Edit polygons" });
      }
    },
    [selectedEvent, updateEvent],
  );

  // Helper to calculate centroid of polygon
  const getCentroid = useCallback((points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return { x: 0, y: 0 };
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return { x, y };
  }, []);

  // Finish creating polygon
  const finishPolygon = useCallback(() => {
    if (currentPolygon.length >= 3) {
      const centroid = getCentroid(currentPolygon);
      const newPolygon: Polygon = {
        id: `polygon-${Date.now()}`,
        points: currentPolygon,
        level: 0,
        origin: centroid, // Set origin at centroid
      };
      const newPolygons = [...polygons, newPolygon];
      setPolygons(newPolygons);
      savePolygons(newPolygons);
      setCurrentPolygon([]);
      setIsCreatingPolygon(false);
      onSelectPolygon(newPolygon.id);
    }
  }, [currentPolygon, polygons, savePolygons, onSelectPolygon, getCentroid]);

  // Snap point to horizontal or vertical relative to reference point
  const _snapPoint = useCallback((point: { x: number; y: number }, refPoint: { x: number; y: number }) => {
    const dx = Math.abs(point.x - refPoint.x);
    const dy = Math.abs(point.y - refPoint.y);

    // Snap to horizontal or vertical based on which is closer
    if (dx < dy) {
      return { x: refPoint.x, y: point.y }; // Snap to vertical
    } else {
      return { x: point.x, y: refPoint.y }; // Snap to horizontal
    }
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if focus is on an input element
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      // Don't hijack Alt/Cmd+arrow (browser back/forward) or other Ctrl/Cmd/Alt chords.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter" && isCreatingPolygon && currentPolygon.length >= 3) {
        // Finish creating polygon
        finishPolygon();
      } else if (e.key === "Escape") {
        // Deselect all / cancel polygon creation
        setCurrentPolygon([]);
        setIsCreatingPolygon(false);
        onSelectPolygon(null);
        setSelectedPointIndex(null);
        setSelectedOriginPolygonId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedPolygonId && tool === "polygon") {
        if (selectedPointIndex !== null) {
          // Delete selected point from polygon
          const polygon = polygons.find((p) => p.id === selectedPolygonId);
          if (polygon) {
            // If deleting would define less than 3 points, delete the polygon
            if (polygon.points.length <= 3) {
              const newPolygons = polygons.filter((p) => p.id !== selectedPolygonId);
              setPolygons(newPolygons);
              savePolygons(newPolygons);
              onSelectPolygon(null);
              setSelectedPointIndex(null);
            } else {
              const newPoints = [...polygon.points];
              newPoints.splice(selectedPointIndex, 1);
              const newPolygons = polygons.map((p) => (p.id === selectedPolygonId ? { ...p, points: newPoints } : p));
              setPolygons(newPolygons);
              savePolygons(newPolygons);
              setSelectedPointIndex(null);
            }
          }
        } else {
          // Delete selected polygon
          const newPolygons = polygons.filter((p) => p.id !== selectedPolygonId);
          setPolygons(newPolygons);
          savePolygons(newPolygons);
          onSelectPolygon(null);
        }
      } else if (selectedPointIndex !== null && selectedPolygonId) {
        // Arrow keys for fine adjustment of selected point
        const polygon = polygons.find((p) => p.id === selectedPolygonId);
        if (polygon && selectedPointIndex < polygon.points.length) {
          let dx = 0;
          let dy = 0;
          const step = e.shiftKey ? 1.0 : 0.1; // Shift for larger steps

          if (e.key === "ArrowLeft") {
            dx = -step;
            e.preventDefault();
          } else if (e.key === "ArrowRight") {
            dx = step;
            e.preventDefault();
          } else if (e.key === "ArrowUp") {
            dy = step;
            e.preventDefault();
          } else if (e.key === "ArrowDown") {
            dy = -step;
            e.preventDefault();
          }

          if (dx !== 0 || dy !== 0) {
            const newPoints = [...polygon.points];
            newPoints[selectedPointIndex] = {
              x: newPoints[selectedPointIndex].x + dx,
              y: newPoints[selectedPointIndex].y + dy,
            };
            const newPolygons = polygons.map((p) => (p.id === selectedPolygonId ? { ...p, points: newPoints } : p));
            setPolygons(newPolygons);
            savePolygons(newPolygons);
          }
        }
      } else if (selectedOriginPolygonId) {
        // Arrow keys for fine adjustment of origin point
        const polygon = polygons.find((p) => p.id === selectedOriginPolygonId);
        if (polygon) {
          let dx = 0;
          let dy = 0;
          const step = e.shiftKey ? 1.0 : 0.1;

          if (e.key === "ArrowLeft") {
            dx = -step;
            e.preventDefault();
          } else if (e.key === "ArrowRight") {
            dx = step;
            e.preventDefault();
          } else if (e.key === "ArrowUp") {
            dy = step;
            e.preventDefault();
          } else if (e.key === "ArrowDown") {
            dy = -step;
            e.preventDefault();
          }

          if (dx !== 0 || dy !== 0) {
            const currentOrigin = polygon.origin || getCentroid(polygon.points);
            const newOrigin = { x: currentOrigin.x + dx, y: currentOrigin.y + dy };
            const newPolygons = polygons.map((p) =>
              p.id === selectedOriginPolygonId ? { ...p, origin: newOrigin } : p,
            );
            setPolygons(newPolygons);
            savePolygons(newPolygons);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isCreatingPolygon,
    currentPolygon,
    selectedPolygonId,
    selectedPointIndex,
    selectedOriginPolygonId,
    polygons,
    onSelectPolygon,
    savePolygons,
    finishPolygon,
    getCentroid,
    tool,
  ]);

  const handleControllerReady = useCallback((controller: MapViewerController) => {
    controllerRef.current = controller;
  }, []);

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();

      if (!lastStateRef.current) return;

      const { zoom } = lastStateRef.current;
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;

      // Convert screen coordinates to map coordinates
      const p = toEvent(lastStateRef.current, { x, y });
      const mapX = p.x;
      const mapY = p.y;

      setCurrentMousePos({ x: mapX, y: mapY });

      // Handle dragging a polygon point
      if (isDraggingPoint && dragPointIndex !== null && selectedPolygonId) {
        const polygon = polygons.find((p) => p.id === selectedPolygonId);
        if (polygon && dragPointIndex < polygon.points.length) {
          const newPoints = [...polygon.points];
          newPoints[dragPointIndex] = { x: mapX, y: mapY };
          const newPolygons = polygons.map((p) => (p.id === selectedPolygonId ? { ...p, points: newPoints } : p));
          setPolygons(newPolygons);
          savePolygons(newPolygons);
        }
      }

      // Handle dragging origin point
      if (isDraggingOrigin && selectedOriginPolygonId) {
        const polygon = polygons.find((p) => p.id === selectedOriginPolygonId);
        if (polygon) {
          const newOrigin = { x: mapX, y: mapY };
          const newPolygons = polygons.map((p) => (p.id === selectedOriginPolygonId ? { ...p, origin: newOrigin } : p));
          setPolygons(newPolygons);
          savePolygons(newPolygons);
        }
      }
    },
    [
      polygons,
      selectedPolygonId,
      isDraggingPoint,
      dragPointIndex,
      isDraggingOrigin,
      selectedOriginPolygonId,
      savePolygons,
      toEvent,
    ],
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();

      if (!lastStateRef.current) return;

      const { zoom } = lastStateRef.current;
      const xPx = (e.clientX - rect.left) / zoom;
      const yPx = (e.clientY - rect.top) / zoom;

      // Convert screen coordinates to map coordinates
      const p = toEvent(lastStateRef.current, { x: xPx, y: yPx });
      const mapX = p.x;
      const mapY = p.y;

      const pointerInfo = { x: e.clientX, y: e.clientY, mapX, mapY };
      const hitPolygon = (excludeId?: string | null) =>
        polygons.find((poly) => poly.id !== excludeId && isPointInPolygon({ x: mapX, y: mapY }, poly.points));

      // Select tool: only select/deselect polygons; empty space pans the map
      if (tool === "select") {
        const inSelected = selectedPolygonId
          ? polygons.find((poly) => poly.id === selectedPolygonId && isPointInPolygon({ x: mapX, y: mapY }, poly.points))
          : undefined;
        const hit = inSelected ?? hitPolygon();
        if (hit) {
          e.stopPropagation();
          onSelectPolygon(hit.id);
        } else {
          onSelectPolygon(null);
        }
        return;
      }

      // Origin-by-reference tool: press inside a polygon (the one whose origin is
      // updated), drag to the matching point in another polygon, release.
      if (tool === "origin-ref") {
        const source = hitPolygon();
        if (source) {
          e.stopPropagation();
          onSelectPolygon(source.id);
          setAdjustOriginSourceId(source.id);
          setAdjustOriginStart({ x: mapX, y: mapY });
          setPointerDown(pointerInfo);
        }
        return;
      }

      // --- Polygon tool below: add and edit polygons ---

      // If creating a polygon, capture pointer for MouseUp to add point and skip selection
      if (isCreatingPolygon) {
        e.stopPropagation();
        setPointerDown(pointerInfo);
        return;
      }

      // Check priority selection on currently selected polygon
      if (selectedPolygonId) {
        const polygon = polygons.find((p) => p.id === selectedPolygonId);
        if (polygon) {
          // 1. Check Origin Point (only for selected polygon)
          const origin = polygon.origin || getCentroid(polygon.points);
          const originPx = toPixels(lastStateRef.current, origin);
          if (Math.hypot(xPx - originPx.x, yPx - originPx.y) <= 8) {
            e.stopPropagation();
            setIsDraggingOrigin(true);
            setSelectedOriginPolygonId(polygon.id);
            setSelectedPointIndex(null);
            setPointerDown(pointerInfo);
            return;
          }

          // 2. Check Points
          for (let i = 0; i < polygon.points.length; i++) {
            const point = polygon.points[i];
            const px = toPixels(lastStateRef.current, point);
            if (Math.hypot(xPx - px.x, yPx - px.y) <= 8) {
              e.stopPropagation();
              setIsDraggingPoint(true);
              setDragPointIndex(i);
              setSelectedPointIndex(i);
              setSelectedOriginPolygonId(null);
              setPointerDown(pointerInfo);
              return;
            }
          }

          // 3. Check Edges (for splitting)
          for (let i = 0; i < polygon.points.length; i++) {
            const p1 = polygon.points[i];
            const p2 = polygon.points[(i + 1) % polygon.points.length];
            const result = isPointNearEdge({ x: mapX, y: mapY }, [p1, p2], 1.5); // Threshold in MM
            if (result.isNear) {
              e.stopPropagation();
              // Split the edge at this point
              const newPoint = { x: mapX, y: mapY };
              const newPoints = [...polygon.points];
              newPoints.splice(i + 1, 0, newPoint);
              const newPolygons = polygons.map((p) => (p.id === selectedPolygonId ? { ...p, points: newPoints } : p));
              setPolygons(newPolygons);
              savePolygons(newPolygons);
              setSelectedPointIndex(i + 1);
              setSelectedOriginPolygonId(null);
              // Action complete, don't set pointerDown to avoid MouseUp creation
              return;
            }
          }
          // 4. Click inside selected polygon: keep it selected (alignment is its own tool)
          if (isPointInPolygon({ x: mapX, y: mapY }, polygon.points)) {
            e.stopPropagation();
            return;
          }
        }
      }

      // Check if clicking inside other polygons (Select)
      for (const polygon of polygons) {
        if (polygon.id !== selectedPolygonId && isPointInPolygon({ x: mapX, y: mapY }, polygon.points)) {
          e.stopPropagation();
          onSelectPolygon(polygon.id);
          setSelectedPointIndex(null);
          setSelectedOriginPolygonId(null);
          // Selection complete, don't set pointerDown to avoid MouseUp creation
          return;
        }
      }

      // If we got here, no polygon/point/origin was clicked, so deselect enable panning
      onSelectPolygon(null);
      setSelectedPointIndex(null);
      setSelectedOriginPolygonId(null);
      // Start potential creation or deselection click
      setPointerDown(pointerInfo);
    },
    [polygons, selectedPolygonId, onSelectPolygon, savePolygons, getCentroid, isCreatingPolygon, toPixels, toEvent, tool],
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!pointerDown || !lastStateRef.current) return;

      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      const moved = Math.hypot(dx, dy) > 5;

      if (isDraggingPoint) {
        setIsDraggingPoint(false);
        setDragPointIndex(null);
        setPointerDown(null);
        return;
      }

      if (isDraggingOrigin) {
        setIsDraggingOrigin(false);
        setPointerDown(null);
        return;
      }

      if (adjustOriginStart) {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const { zoom } = lastStateRef.current;
        const xPx = (e.clientX - rect.left) / zoom;
        const yPx = (e.clientY - rect.top) / zoom;
        const p = toEvent(lastStateRef.current, { x: xPx, y: yPx });
        const mapX = p.x;
        const mapY = p.y;

        // Find if we released over another polygon
        const sourceId = adjustOriginSourceId;
        const targetPolygon = polygons.find(
          (p) => p.id !== sourceId && isPointInPolygon({ x: mapX, y: mapY }, p.points),
        );

        if (targetPolygon && sourceId) {
          const sourcePolygon = polygons.find((p) => p.id === sourceId);
          if (sourcePolygon) {
            // The pressed point (source) and the released point (target) are the same
            // physical spot: make them coincide in world coordinates.
            const targetOrigin = targetPolygon.origin || getCentroid(targetPolygon.points);
            const newOriginX = adjustOriginStart.x - mapX + targetOrigin.x;
            const newOriginY = adjustOriginStart.y - mapY + targetOrigin.y;

            const newPolygons = polygons.map((p) =>
              p.id === sourceId ? { ...p, origin: { x: newOriginX, y: newOriginY } } : p,
            );
            setPolygons(newPolygons);
            savePolygons(newPolygons);
          }
        }
        setAdjustOriginStart(null);
        setAdjustOriginSourceId(null);
        setPointerDown(null);
        return;
      }

      // If not moved since mouse down, this is a click - add point to polygon (Polygon tool only)
      if (!moved && tool === "polygon") {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const { zoom } = lastStateRef.current;
        const xPx = (e.clientX - rect.left) / zoom;
        const yPx = (e.clientY - rect.top) / zoom;

        const p = toEvent(lastStateRef.current, { x: xPx, y: yPx });
        const mapX = p.x;
        const mapY = p.y;

        // If we're creating a polygon, add point
        if (isCreatingPolygon || currentPolygon.length > 0) {
          const newPoints = [...currentPolygon, { x: mapX, y: mapY }];
          setCurrentPolygon(newPoints);
          setIsCreatingPolygon(true);
        } else {
          // Start a new polygon
          setCurrentPolygon([{ x: mapX, y: mapY }]);
          setIsCreatingPolygon(true);
        }
      }

      setPointerDown(null);
    },
    [
      pointerDown,
      tool,
      isDraggingPoint,
      isDraggingOrigin,
      isCreatingPolygon,
      currentPolygon,
      adjustOriginStart,
      adjustOriginSourceId,
      polygons,
      getCentroid,
      savePolygons,
      toEvent,
    ],
  );

  const handleCanvasRightClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Cancel polygon creation
    setCurrentPolygon([]);
    setIsCreatingPolygon(false);
  }, []);

  const renderPolygons = useCallback(
    (state: MapViewerState) => {
      lastStateRef.current = state;
      const canvas = controllerRef.current?.getCanvas();
      if (!canvas) return null;

      const { pixelsPerMM: _pixelsPerMM } = state;

      return (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: state.pdfDimensions.width,
            height: state.pdfDimensions.height,
            pointerEvents: "none",
          }}
        >
          <g>
            {/* Render completed polygons */}
            {polygons.map((polygon) => {
              const isSelected = polygon.id === selectedPolygonId;

              return (
                <g key={polygon.id}>
                  {/* Render polygon with holes using path element */}
                  <path
                    d={(() => {
                      // Main polygon path
                      let pathData = `M ${polygon.points
                        .map((p) => {
                          const pt = toPixels(state, p);
                          return `${pt.x},${pt.y}`;
                        })
                        .join(" L ")} Z`;

                      // Add holes if present
                      if (polygon.holes) {
                        polygon.holes.forEach((hole) => {
                          pathData += ` M ${hole
                            .map((p) => {
                              const pt = toPixels(state, p);
                              return `${pt.x},${pt.y}`;
                            })
                            .join(" L ")} Z`;
                        });
                      }

                      return pathData;
                    })()}
                    fill={isSelected ? POLYGON_FILL_COLOR_SELECTED : POLYGON_FILL_COLOR_DEFAULT}
                    stroke={isSelected ? POLYGON_STROKE_COLOR_SELECTED : POLYGON_STROKE_COLOR_DEFAULT}
                    strokeWidth={POLYGON_STROKE_WIDTH}
                    fillRule="evenodd"
                  />

                  {/* Render polygon points as circles when selected */}
                  {isSelected &&
                    polygon.points.map((point, i) => {
                      const pt = toPixels(state, point);
                      const isPointSelected = selectedPointIndex === i && selectedPolygonId === polygon.id;
                      return (
                        <circle
                          key={`point-${i}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={nodeRadius}
                          fill={isPointSelected ? "#ff6600" : "#007bff"}
                          fillOpacity={isPointSelected ? "0.8" : "0.5"}
                          stroke={isPointSelected ? "#ff6600" : "#007bff"}
                          strokeWidth={isPointSelected ? 3.5 : 2.5}
                          style={{ cursor: "pointer" }}
                        />
                      );
                    })}

                  {/* Render origin point (ONLY IF SELECTED) */}
                  {isSelected &&
                    (() => {
                      const origin = polygon.origin || getCentroid(polygon.points);
                      const pt = toPixels(state, origin);
                      const isOriginSelected = selectedOriginPolygonId === polygon.id;
                      const originRadius = POLYGON_ORIGIN_RADIUS;
                      return (
                        <g key={`origin-${polygon.id}`}>
                          {/* White Halo */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={originRadius + 3}
                            fill="none"
                            stroke="white"
                            strokeWidth={POLYGON_ORIGIN_STROKE_WIDTH}
                            strokeOpacity={0.8}
                          />
                          {/* Cross for origin point */}
                          <line
                            x1={pt.x - 10}
                            y1={pt.y}
                            x2={pt.x + 10}
                            y2={pt.y}
                            stroke={isOriginSelected ? "#ff6600" : "#007bff"}
                            strokeWidth={isOriginSelected ? 3 : 2}
                          />
                          <line
                            x1={pt.x}
                            y1={pt.y - 10}
                            x2={pt.x}
                            y2={pt.y + 10}
                            stroke={isOriginSelected ? "#ff6600" : "#007bff"}
                            strokeWidth={isOriginSelected ? 3 : 2}
                          />
                          {/* Circle for origin point */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={originRadius}
                            fill="none"
                            stroke={isOriginSelected ? "#ff6600" : "#007bff"}
                            strokeWidth={isOriginSelected ? 3 : 2}
                            style={{ cursor: "pointer" }}
                          />
                        </g>
                      );
                    })()}

                  {/* Render level/floor number at centroid */}
                  {polygon.points.length > 0 &&
                    (() => {
                      const centroid = getCentroid(polygon.points);
                      const pt = toPixels(state, centroid);
                      return (
                        <text
                          x={pt.x}
                          y={pt.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={isSelected ? "#007bff" : "#ffa500"}
                          fontSize={48}
                          fontWeight="bold"
                        >
                          {polygon.level ?? 0}
                        </text>
                      );
                    })()}
                </g>
              );
            })}

            {/* Render adjustment line */}
            {adjustOriginStart &&
              currentMousePos &&
              (() => {
                const startPt = toPixels(state, adjustOriginStart);
                const endPt = toPixels(state, currentMousePos);
                return (
                  <line
                    x1={startPt.x}
                    y1={startPt.y}
                    x2={endPt.x}
                    y2={endPt.y}
                    stroke="#007bff"
                    strokeWidth={2}
                    strokeDasharray="5,5"
                  />
                );
              })()}

            {/* Render current polygon being created */}
            {isCreatingPolygon && currentPolygon.length > 0 && (
              <g>
                {currentPolygon.map((p, i) => {
                  const pt = toPixels(state, p);
                  return (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={nodeRadius}
                      fill="#00ff00"
                      fillOpacity="0.5"
                      stroke="#00ff00"
                      strokeWidth={2.5}
                    />
                  );
                })}
                {currentPolygon.length >= 1 &&
                  currentMousePos &&
                  snapToAxis &&
                  // Show preview line when snapping
                  (() => {
                    const lastPoint = currentPolygon[currentPolygon.length - 1];
                    const lastPt = toPixels(state, lastPoint);
                    const previewPt = toPixels(state, currentMousePos);
                    return (
                      <line
                        x1={lastPt.x}
                        y1={lastPt.y}
                        x2={previewPt.x}
                        y2={previewPt.y}
                        stroke="#00ff00"
                        strokeWidth={2}
                        strokeDasharray="5,5"
                      />
                    );
                  })()}
                {currentPolygon.length >= 2 && (
                  <polyline
                    points={currentPolygon
                      .map((p) => {
                        const pt = toPixels(state, p);
                        return `${pt.x},${pt.y}`;
                      })
                      .join(" ")}
                    fill="none"
                    stroke="#00ff00"
                    strokeWidth={2}
                  />
                )}
              </g>
            )}
          </g>
        </svg>
      );
    },
    [
      polygons,
      selectedPolygonId,
      isCreatingPolygon,
      currentPolygon,
      currentMousePos,
      nodeRadius,
      selectedPointIndex,
      selectedOriginPolygonId,
      getCentroid,
      snapToAxis,
      toPixels,
      adjustOriginStart,
    ],
  );

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden h-full">
      <MapViewer pdfUrl={pdfUrl || undefined} showBackgroundMap={true} onControllerReady={handleControllerReady}>
        {(state: MapViewerState) => (
          <>
            {renderPolygons(state)}
            <canvas
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                cursor: isDraggingPoint || isDraggingOrigin ? "grabbing" : tool === "select" ? "default" : "crosshair",
              }}
              onContextMenu={handleCanvasRightClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            />
          </>
        )}
      </MapViewer>
      {/* Active tool hint */}
      <div className="absolute top-2 left-12 z-10 pointer-events-none rounded border border-border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
        <span className="font-medium text-foreground">{getModel3DTool(tool).label}:</span> {getModel3DTool(tool).hint}
      </div>
    </div>
  );
});

Model3DMapViewer.displayName = "Model3DMapViewer";
export default Model3DMapViewer;
