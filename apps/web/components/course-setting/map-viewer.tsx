"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { useAppData, useSettings } from "@indoor-o-route-analysis/ui";
import { ControlRenderer, renderLegConnections, renderDirections } from "@indoor-o-route-analysis/ui";
import { getCourseControlLabelMap } from "@indoor-o-route-analysis/core";
import { type MapViewerState, type MapViewerController, mapToEvent, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { CONTROL_RADIUS } from "@indoor-o-route-analysis/core";
import type { Control, RaceCourseData, MapExchangeType } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import { getEventTransform, updateRaceCourse } from "@indoor-o-route-analysis/core";

import { useVisibleDirections } from "@/components/directions/use-visible-directions";
const MapViewer = dynamic(() => import("@/components/map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

const getNextControlCode = (controls: Control[]) => {
  const numericCodes = controls.map((c) => parseInt(c.id, 10)).filter((n) => !Number.isNaN(n));
  const base = 30; // start numbering at 31
  const maxExisting = numericCodes.length > 0 ? Math.max(...numericCodes) : base;
  return String(maxExisting + 1);
};

interface CourseSettingMapViewerProps {
  map?: MapData;
  selectedControlId?: string | null;
  onControlSelected?: (controlId: string) => void;
  onMoveControl?: (delta: { x: number; y: number }) => void;
  showBackgroundMap?: boolean;

  backgroundOpacity?: number;
  controlColors?: Map<string, string>;
  autoAddToCourse?: boolean;
}

export interface CourseSettingMapViewerHandle {
  flyTo: (center: { x: number; y: number }) => void;
}

const CourseSettingMapViewer = forwardRef<CourseSettingMapViewerHandle, CourseSettingMapViewerProps>(
  (
    {
      map,
      selectedControlId,
      onControlSelected,
      onMoveControl,
      showBackgroundMap = true,
      backgroundOpacity = 1,
      controlColors,
      autoAddToCourse,
    },
    ref,
  ) => {
    const [pointerDown, setPointerDown] = useState<{ x: number; y: number } | null>(null);
    const [didDrag, setDidDrag] = useState(false);
    const [pointerControlId, setPointerControlId] = useState<string | null>(null);
    const [isDraggingControl, setIsDraggingControl] = useState(false);
    const { selectedEvent, updateEvent, selectedCourseId, pdfBlobUrl } = useAppData();
    const directions = useVisibleDirections(selectedEvent);
    /** Apply `fn` to the first race course of the latest event. */
    const updateLatestRaceCourse = (fn: (rc: RaceCourseData) => RaceCourseData, label?: string) => {
      if (selectedEvent) void updateEvent(selectedEvent.id, (e) => updateRaceCourse(e, fn), undefined, { label });
    };
    const { showControlPoints } = useSettings();

    const mapControllerRef = useRef<MapViewerController | null>(null);
    const mapStateRef = useRef<MapViewerState | null>(null);
    const lastMapInteractionControlIdRef = useRef<string | null>(null);

    // Transformation helpers
    const transform = getEventTransform(map);

    useImperativeHandle(ref, () => ({
      flyTo: (center: { x: number; y: number }) => {
        if (mapControllerRef.current && mapStateRef.current) {
          const p = eventPosToMultiPagePixels(center, map, mapStateRef.current.pixelsPerMM);
          mapControllerRef.current.flyTo(p);
        }
      },
    }), [map]);

    const toPixels = (state: MapViewerState, p: { x: number; y: number }) => eventPosToMultiPagePixels(p, map, state.pixelsPerMM);

  const toEvent = (state: MapViewerState, p: { x: number; y: number }) => mapToEvent(p, transform, state.pixelsPerMM);

  const hitTestControlPx = (controlPx: { x: number; y: number }, xPx: number, yPx: number, radiusPx = CONTROL_RADIUS) => {
    const dx = xPx - controlPx.x;
    const dy = yPx - controlPx.y;
    return Math.hypot(dx, dy) <= radiusPx;
  };

  const svgCoordsFromMouse = (event: React.MouseEvent<SVGElement>, state: MapViewerState) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / state.zoom,
      y: (event.clientY - rect.top) / state.zoom,
    };
  };

  const handleMouseDown = (state: MapViewerState, controlsMM: Control[]) => (e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = svgCoordsFromMouse(e, state);
    const hit = controlsMM.find((control) => hitTestControlPx(toPixels(state, control.mapPosition), x, y));

    // Prevent map panning when interacting with an existing control
    if (hit) {
      e.preventDefault(); // Prevent browser text selection during interactions
      e.stopPropagation();
    }

    setPointerDown({ x: e.clientX, y: e.clientY });
    setDidDrag(false);
    setIsDraggingControl(false);
    setPointerControlId(hit?.id ?? null);
    lastMapInteractionControlIdRef.current = hit?.id ?? null;

    if (hit) {
      if (autoAddToCourse && selectedCourseId && selectedEvent) {
        // Auto-add the clicked control to the current course
        const courseId = selectedCourseId;
        updateLatestRaceCourse((rc) => ({
          ...rc,
          courses: (rc.courses ?? []).map((c) =>
            c.id === courseId ? { ...c, controls: [...(c.controls ?? []), { controlId: hit.id }] } : c,
          ),
        }), "Add control to course");
      }
      onControlSelected?.(hit.id);
    }
  };

  const handleMouseMove =
    (state: MapViewerState, _controlsSnapshot: Control[]) => (e: React.MouseEvent<SVGSVGElement>) => {
      if (!pointerDown) return;
      if (pointerControlId) {
        e.preventDefault(); // Prevent browser text selection during control drag
      }

      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      const dist = Math.hypot(dx, dy);

      if (pointerControlId) {
        if (!isDraggingControl && dist > 5) {
          setIsDraggingControl(true);
        }

        if (isDraggingControl) {
          if (!selectedEvent?.id) return;
          if (state.pixelsPerMM <= 0) return;

          const { x, y } = svgCoordsFromMouse(e, state);
          const { x: xEvent, y: yEvent } = toEvent(state, { x, y });
          const draggedId = pointerControlId;
          updateLatestRaceCourse((rc) => ({
            ...rc,
            controls: (rc.controls ?? []).map((control) =>
              control.id === draggedId ? { ...control, mapPosition: { x: xEvent, y: yEvent } } : control,
            ),
          }), "Move control");
        }
        return;
      }

      if (dist > 5) {
        setDidDrag(true);
      }
    };

  const handleMouseUp = (state: MapViewerState, controlsMM: Control[]) => (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pointerDown) return;

    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    const moved = Math.hypot(dx, dy) > 5;
    const coords = svgCoordsFromMouse(e, state);

    const resetInteraction = () => {
      setPointerDown(null);
      setIsDraggingControl(false);
      setPointerControlId(null);
      setDidDrag(false);
    };

    // Existing control path
    if (pointerControlId) {
      if (!isDraggingControl && !moved) {
        onControlSelected?.(pointerControlId);
      }
      resetInteraction();
      return;
    }

    // Nothing targeted and user dragged: treat as pan
    if (didDrag || moved) {
      resetInteraction();
      return;
    }

    if (!selectedEvent?.id) {
      resetInteraction();
      return;
    }

    const hit = controlsMM.find((control) =>
      hitTestControlPx(toPixels(state, control.mapPosition), coords.x, coords.y),
    );
    if (hit) {
      onControlSelected?.(hit.id);
      resetInteraction();
      return;
    }

    const existingControls = selectedEvent.raceCourses?.[0]?.controls ?? [];
    const isFirstControl = existingControls.length === 0;
    if (state.pixelsPerMM <= 0) {
      resetInteraction();
      return;
    }
    const { x: xEvent, y: yEvent } = toEvent(state, coords);
    const newControl = isFirstControl
      ? {
          id: "S",
          type: "start" as const,
          mapPosition: { x: xEvent, y: yEvent },
          extensions: {},
        }
      : ({
          id: getNextControlCode(existingControls),
          type: "control" as const,
          mapPosition: { x: xEvent, y: yEvent },
          extensions: {},
        } as Control); // Cast to ensure it matches strict interface if needed

    const addToCourseId = autoAddToCourse ? selectedCourseId : null;
    updateLatestRaceCourse((rc) => ({
      ...rc,
      controls: [...(rc.controls ?? []), newControl],
      courses: addToCourseId
        ? (rc.courses ?? []).map((c) =>
            c.id === addToCourseId ? { ...c, controls: [...(c.controls ?? []), { controlId: newControl.id }] } : c,
          )
        : rc.courses,
    }), "Add control");
    onControlSelected?.(newControl.id);
    resetInteraction();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // If we're interacting with a form element, don't move the map control
      const isFormElement = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return false;
        const tag = target.tagName;
        const editable = target.getAttribute("contenteditable");
        return tag === "INPUT" || tag === "TEXTAREA" || editable === "true";
      };
      if (isFormElement(event.target)) return;
      // Don't hijack Alt/Cmd+arrow (browser back/forward) or Ctrl+arrow.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (!selectedControlId || !onMoveControl) return;

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();

        const state = mapStateRef.current;
        if (!state || state.pixelsPerMM <= 0) return;

        const screenStep = event.shiftKey ? 10 : 1; // 1 pixel step for precision, 10 with shift

        const screenDelta = { x: 0, y: 0 };
        if (event.key === "ArrowUp") screenDelta.y = -screenStep;
        if (event.key === "ArrowDown") screenDelta.y = screenStep;
        if (event.key === "ArrowLeft") screenDelta.x = -screenStep;
        if (event.key === "ArrowRight") screenDelta.x = screenStep;

        const zoom = state.zoom;
        const pixelsPerMM = state.pixelsPerMM;

        // Delta in PDF/Image Logical MM (used by transform)
        // zoom cancels out because screenDelta is in screen pixels, not PDF pixels?
        // Wait, screen pixels are related to PDF pixels via zoom.
        // ScreenP = PDFP * zoom
        // PDFP = ScreenP / zoom
        // MM = PDFP / pixelsPerMM
        // So MM = (ScreenP / zoom) / pixelsPerMM

        const imageDeltaMM = {
          x: (screenDelta.x / zoom) / pixelsPerMM,
          y: (screenDelta.y / zoom) / pixelsPerMM,
        }

        // Now transform MM delta to Map Coordinates delta
        // Since transform is linear (scaling + offset), Delta(Map) = Scale * Delta(MM)
        // We can't simply subtract positions because of potential rotation (though current transform assumes axis aligned)
        // But let's follow the safe way:
        // P1_event = toEvent(0,0)
        // P2_event = toEvent(dx, dy)
        // Delta = P2 - P1

        const p1 = transform.toEvent({ x: 0, y: 0 });
        const p2 = transform.toEvent({ x: imageDeltaMM.x, y: imageDeltaMM.y });

        const mapDelta = {
          x: p2.x - p1.x,
          y: p2.y - p1.y,
        };

        onMoveControl(mapDelta);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedControlId, onMoveControl, transform]);



  if (map && !pdfBlobUrl) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading map...</div>;
  }

  const controls = selectedEvent?.raceCourses?.[0]?.controls ?? [];
  const currentCourse = selectedEvent?.raceCourses?.[0]?.courses?.find((c) => c.id === selectedCourseId);
  const courseControlIds = currentCourse?.controls?.map((c) => c.controlId) ?? [];
  const courseControls = courseControlIds
    .map((id) => controls.find((c) => c.id === id))
    .filter(Boolean) as typeof controls;
  const controlLabelMap = getCourseControlLabelMap(currentCourse?.controls ?? [], controls);

  const mapUrl =
    map?.image?.url && (map.image.url.startsWith("http") || map.image.url.startsWith("https"))
      ? map.image.url
      : undefined;
  const viewerUrl = pdfBlobUrl || mapUrl;

  return (
    <MapViewer
      pdfUrl={viewerUrl}
      showBackgroundMap={showBackgroundMap}
      backgroundOpacity={backgroundOpacity}
      mapLayout={map?.layout || "horizontal"}
      initialFit={true}
      onControllerReady={(controller: MapViewerController) => {
        mapControllerRef.current = controller;
      }}
    >
      {(state: MapViewerState) => {
        mapStateRef.current = state;
        return (
          <svg
            width={state.pdfDimensions.width}
            height={state.pdfDimensions.height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              cursor: "crosshair",
            }}
            onMouseDown={handleMouseDown(state, controls)}
            onMouseMove={handleMouseMove(state, controls)}
            onMouseUp={handleMouseUp(state, controls)}
          >
            <defs>
              <filter id="control-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#c084fc" floodOpacity="0.8" />
              </filter>
            </defs>

            {!showBackgroundMap && (
              <rect x={0} y={0} width={state.pdfDimensions.width} height={state.pdfDimensions.height} fill="white" />
            )}

            {(() => {
              const controlsPx = controls.map((c) => {
                const pos = c.mapPosition || { x: 0, y: 0 };
                return { ...c, ...eventPosToMultiPagePixels(pos, map, state.pixelsPerMM) };
              });
              const courseControlsPx = courseControls
                .map((c) => controlsPx.find((cp) => cp.id === c.id))
                .filter(Boolean) as typeof controlsPx;

              // Map exchanges (change/flip) in the selected course, keyed by control ID.
              // The triangle points towards the next control in the course.
              const courseEntries = currentCourse?.controls ?? [];
              const mapExchanges = new Map<string, { type: MapExchangeType; next?: { x: number; y: number } }>();
              courseEntries.forEach((cc, i) => {
                if (!cc.mapExchange || mapExchanges.has(cc.controlId)) return;
                const nextId = courseEntries[i + 1]?.controlId;
                const next = nextId ? controlsPx.find((cp) => cp.id === nextId) : undefined;
                mapExchanges.set(cc.controlId, { type: cc.mapExchange, next });
              });

              return (
                <>
                  {/* Course directions (drawn in the Directions view), below the course */}
                  <g pointerEvents="none">
                    {renderDirections({
                      features: directions,
                      toPx: (p) => eventPosToMultiPagePixels(p, map, state.pixelsPerMM),
                      pixelsPerMM: state.pixelsPerMM,
                      mapScale: map?.scale,
              idPrefix: "course-setting-op",
                    })}
                  </g>
                  {renderLegConnections({ controls: courseControlsPx })}

                  {controlsPx.map((control) => {
                    const isSelected = selectedControlId === control.id;
                    const difficultyColor = controlColors?.get(control.id);
                    // Pass undefined if difficultyColor is missing, so ControlRenderer knows to use default/orange logic
                    const strokeColor = isSelected ? "#c084fc" : difficultyColor; 
                    const maybeGlow = isSelected ? "url(#control-glow)" : undefined;

                    return ControlRenderer.renderControl({
                      control,
                      courseControls: courseControlsPx,
                      courseControlCodes: courseControlIds,
                      isSelected,
                      strokeColor,
                      maybeGlow,
                      controlLabelMap,
                      showControlPoint: showControlPoints,
                      mapExchange: mapExchanges.get(control.id),
                    });
                  })}
                </>
              );
            })()}
          </svg>
        );
      }}
    </MapViewer>
  );
});

CourseSettingMapViewer.displayName = "CourseSettingMapViewer";
export default CourseSettingMapViewer;


