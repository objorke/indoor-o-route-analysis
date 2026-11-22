"use client";

import React, { useMemo, useState, useEffect } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { useAppData, useSettings } from "@indoor-o-route-analysis/ui";
import type { MapData } from "@indoor-o-route-analysis/core";
import type { Control } from "@indoor-o-route-analysis/core";
import type { Node, Edge } from "@indoor-o-route-analysis/core";
import {
  CONTROL_RADIUS,
  CONTROL_STROKE_WIDTH,
  COURSE_COLOR,
  PRIMARY_ROUTE_COLOR,
  PRIMARY_ROUTE_STROKE_WIDTH,
  HUMAN_OVERLAY_TRACKING_COLOR,
  HUMAN_OVERLAY_BACKTRACKING_COLOR,
} from "@indoor-o-route-analysis/core";
import { ControlRenderer, buildRoutePathSegments, renderRoutePolylines } from "@indoor-o-route-analysis/ui";
import { GraphOverlay, HumanRouteOverlay, ClusteredGraphOverlay } from "@/components/shared";
import type { HumanRouteOverlayState } from "./human-thinking/properties-panel";
import type { ClusteredGraphState } from "./clustered-graph/properties-panel";

interface LabsMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  scale: number;
  displayedRoute?: { path: string[], distance?: number, fromLabel?: string, toLabel?: string, forwardSegmentCount?: number } | null;
  humanRouteOverlay?: HumanRouteOverlayState | null;
  clusteredGraph?: ClusteredGraphState | null;
  showNodes?: boolean;
  showEdges?: boolean;
  backgroundMode?: "normal" | "muted" | "hidden";
}

// Inner component to handle side-effects and rendering based on MapState
const MapOverlay = ({
  mapState,
  displayedRoute,
  humanRouteOverlay,
  clusteredGraph,
  controller,
  nodes,
  controls,
  edges,
  map,
  showNodes,
  showEdges,
}: {
  mapState: MapViewerState,
  displayedRoute?: { path: string[], distance?: number, fromLabel?: string, toLabel?: string, forwardSegmentCount?: number } | null,
  humanRouteOverlay?: HumanRouteOverlayState | null,
  clusteredGraph?: ClusteredGraphState | null,
  controller: MapViewerController | null,
  nodes: Node[],
  controls: Control[],
  edges: Edge[],
  map: MapData | undefined,
  showNodes?: boolean,
  showEdges?: boolean,
}) => {
  const { showControlPoints } = useSettings();
  const lastPannedRouteRef = React.useRef<{ path: string[], distance?: number } | null>(null);

  // Fly to the start of the selected leg when it changes
  useEffect(() => {
    // Only fly if we have a controller and a route
    if (!controller || !displayedRoute || displayedRoute.path.length === 0 || !mapState.pixelsPerMM) {
      return;
    }

    // Check if this is a new route selection
    if (lastPannedRouteRef.current === displayedRoute) {
        return;
    }

    // Find the start point (first node/control in the path)
    const startNodeId = displayedRoute.path[0];
    const startNode = nodes.find((n: Node) => n.id === startNodeId);
    const startControl = controls.find((c: Control) => c.id === startNodeId);

    // Extract coordinates: nodes have x/y directly, controls have mapPosition.x/y
    let startMM: { x: number; y: number } | null = null;
    if (startNode && "x" in startNode) {
      startMM = { x: startNode.x, y: startNode.y };
    } else if (startControl?.mapPosition) {
      startMM = { x: startControl.mapPosition.x, y: startControl.mapPosition.y };
    }
    if (!startMM) return;

    lastPannedRouteRef.current = displayedRoute;

    const startPx = eventPosToMultiPagePixels(startMM, map, mapState.pixelsPerMM);
    controller.flyTo(startPx);
  }, [displayedRoute, controller, nodes, controls, map, mapState.pixelsPerMM]);

  // Derived Geometry for rendering
  const { routePolylines, startCircle, endCircle, legLine } = useMemo(() => {
      if (!displayedRoute || displayedRoute.path.length < 2) return {};

      // Helper to get pixel position
      const getPixelPos = (id: string) => {
        const node = nodes.find((n: Node) => n.id === id);
        const control = controls.find((c: Control) => c.id === id);
        if (node && "x" in node && "y" in node) {
            return eventPosToMultiPagePixels({ x: node.x, y: node.y }, map, mapState.pixelsPerMM);
        }
        if (control?.mapPosition) {
            return eventPosToMultiPagePixels({ x: control.mapPosition.x, y: control.mapPosition.y }, map, mapState.pixelsPerMM);
        }
        return null;
      };

      const pathPoints = displayedRoute.path
        .map(id => getPixelPos(id))
        .filter(p => p !== null) as {x: number, y: number}[];
      
      if (pathPoints.length < 2) return {};

      const startPos = pathPoints[0];
      const endPos = pathPoints[pathPoints.length - 1];

      // Styling Constants
      const mainColor = COURSE_COLOR; 
      const routeColor = PRIMARY_ROUTE_COLOR;
      const _shadowStrokeWidth = CONTROL_STROKE_WIDTH + 2.5;
      const strokeWidth = CONTROL_STROKE_WIDTH;

      // Leg Line Calculation (trim start/end to be outside control circles)
      const dx = endPos.x - startPos.x;
      const dy = endPos.y - startPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let lSx = startPos.x;
      let lSy = startPos.y;
      let lEx = endPos.x;
      let lEy = endPos.y;

      // Only trim if leg is longer than 2 radii (otherwise line would cross itself or be negative)
      if (dist > 2 * CONTROL_RADIUS) {
          const ux = dx / dist;
          const uy = dy / dist;
          
          lSx = startPos.x + ux * CONTROL_RADIUS;
          lSy = startPos.y + uy * CONTROL_RADIUS;
          
          lEx = endPos.x - ux * CONTROL_RADIUS;
          lEy = endPos.y - uy * CONTROL_RADIUS;
      }

      // Leg Line (White halo + Foreground)
      const legLine = (
          <g>
            <line
                x1={lSx} y1={lSy} x2={lEx} y2={lEy}
                stroke="white" strokeWidth={strokeWidth + 4} strokeOpacity={0.8} strokeLinecap="round"
            />
            <line
                x1={lSx} y1={lSy} x2={lEx} y2={lEy}
                stroke={mainColor} strokeWidth={strokeWidth} strokeOpacity={0.8} strokeLinecap="round"
            />
          </g>
      );

      // Render start and end controls using ControlRenderer
      const makeControlWithPos = (id: string, pos: {x: number, y: number}) => {
        const ctrl = controls.find((c: Control) => c.id === id);
        if (ctrl) {
          return { ...ctrl, x: pos.x, y: pos.y };
        }
        // Fallback for node IDs: create a synthetic control
        return { id, type: "control" as const, mapPosition: { x: 0, y: 0 }, x: pos.x, y: pos.y };
      };

      const startId = displayedRoute.path[0];
      const endId = displayedRoute.path[displayedRoute.path.length - 1];
      const startCtrl = makeControlWithPos(startId, startPos);
      const endCtrl = makeControlWithPos(endId, endPos);

      const startCircle = ControlRenderer.renderControl({
        control: startCtrl,
        courseControls: [],
        // Marking the control as "in course" (matching its own id) suppresses
        // ControlRenderer's raw-code fallback text, which would otherwise be
        // drawn on top of the label below at the same position.
        courseControlCodes: [startCtrl.id],
        strokeColor: mainColor,
        showLabel: true,
        label: displayedRoute.fromLabel ?? startCtrl.id,
        showControlPoint: showControlPoints,
      });
      const endCircle = ControlRenderer.renderControl({
        control: endCtrl,
        courseControls: [],
        courseControlCodes: [endCtrl.id],
        strokeColor: mainColor,
        showLabel: true,
        label: displayedRoute.toLabel ?? endCtrl.id,
        showControlPoint: showControlPoints,
      });

      // Route Polyline (handling ignoreLength/map-segment transitions via the
      // shared segment-splitting helper; the transition segment itself is
      // dropped, leaving the same before/after segments as a manual split).
      const segments = buildRoutePathSegments(
        displayedRoute.path,
        getPixelPos,
        (fromId, toId) => !!edges.find(e =>
          (e.from === fromId && e.to === toId) ||
          (!e.oneWay && e.from === toId && e.to === fromId)
        )?.ignoreLength,
      ).filter(seg => !seg.isMapSegmentTransition);

      // Human Thinking legs carry forwardSegmentCount: segments before it are
      // the tracking side's own corridor stretches (colored blue, matching
      // the exploration-time polylines), the rest are backtracking's (amber).
      // Other labs' single-color route is unaffected (forwardSegmentCount undefined).
      const forwardSegmentCount = displayedRoute.forwardSegmentCount;

      // Solid strong red route, rendered like the best route in Route Analysis.
      // Human Thinking keeps its blue/amber split so each side's contribution stays visible.
      const routePolylines = (
        <g>
          {forwardSegmentCount === undefined
            ? renderRoutePolylines(segments, { color: routeColor, strokeWidth: PRIMARY_ROUTE_STROKE_WIDTH })
            : segments.map((seg, i) => (
                <g key={i}>
                  {renderRoutePolylines([seg], {
                    color: i < forwardSegmentCount ? HUMAN_OVERLAY_TRACKING_COLOR : HUMAN_OVERLAY_BACKTRACKING_COLOR,
                    strokeWidth: PRIMARY_ROUTE_STROKE_WIDTH,
                  })}
                </g>
              ))}
        </g>
      );

      return { routePolylines, startCircle, endCircle, legLine };
  }, [displayedRoute, nodes, controls, edges, map, mapState.pixelsPerMM]);

  // Convert graph nodes/controls to pixel space for GraphOverlay and the
  // Human Thinking / Clustered Graph overlays (the latter two need node
  // positions regardless of the showNodes/showEdges debug toggles).
  const { nodesPx, controlsPx } = useMemo(() => {
    if ((!showNodes && !showEdges && !humanRouteOverlay && !clusteredGraph) || !mapState.pixelsPerMM) return { nodesPx: [], controlsPx: [] };
    const toPos = (mm: { x: number; y: number }) => eventPosToMultiPagePixels(mm, map, mapState.pixelsPerMM);
    const nodesPx = nodes
      .filter((n): n is Node & { x: number; y: number } => "x" in n && "y" in n)
      .map(n => ({ id: n.id, ...toPos({ x: n.x, y: n.y }) }));
    const controlsPx = controls
      .filter(c => c.mapPosition)
      .map(c => ({ id: c.id, ...toPos({ x: c.mapPosition!.x, y: c.mapPosition!.y }) }));
    return { nodesPx, controlsPx };
  }, [showEdges, showNodes, humanRouteOverlay, clusteredGraph, nodes, controls, map, mapState.pixelsPerMM]);

  return (
    <svg
        width={mapState.pdfDimensions.width}
        height={mapState.pdfDimensions.height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
        <GraphOverlay edges={edges} nodes={nodesPx} controls={controlsPx} showEdges={showEdges} showNodes={showNodes} />
        {humanRouteOverlay && (
          // Controls can themselves be graph nodes (and thus clusters/origins/
          // candidate destinations) in this model, not just vertices - see
          // buildControlNodeMap's identity mapping in RouteAnalyzer.
          <HumanRouteOverlay overlay={humanRouteOverlay.overlay} clusterOf={humanRouteOverlay.clusterOf} nodes={[...nodesPx, ...controlsPx]} />
        )}
        {clusteredGraph && (
          <ClusteredGraphOverlay
            edges={edges}
            nodes={[...nodesPx, ...controlsPx]}
            clusterOf={clusteredGraph.clusterOf}
            clusterColors={clusteredGraph.clusterColors}
          />
        )}
        {legLine}
        {routePolylines}
        {startCircle}
        {endCircle}
    </svg>
  );
};

export default function LabsMapViewer({
  map,
  pdfUrl,
  scale: _scale,
  displayedRoute,
  humanRouteOverlay,
  clusteredGraph,
  showNodes,
  showEdges,
  backgroundMode = "normal",
}: LabsMapViewerProps) {
  const { selectedEvent } = useAppData();
  const [controller, setController] = useState<MapViewerController | null>(null);

  const controls = useMemo(() => selectedEvent?.raceCourses?.[0]?.controls || [], [selectedEvent]);
  const nodes = useMemo(() => selectedEvent?.raceCourses?.[0]?.vertices || [], [selectedEvent]);
  const edges = useMemo(() => selectedEvent?.raceCourses?.[0]?.edges || [], [selectedEvent]);
  const bgOpacity = backgroundMode === "muted" ? 0.3 : backgroundMode === "hidden" ? 0 : 1;

  return (
    <MapViewer
      pdfUrl={pdfUrl || undefined}
      showBackgroundMap={backgroundMode !== "hidden"}
      backgroundOpacity={bgOpacity}
      onControllerReady={setController}
    >
      {(mapState: MapViewerState) => (
        <MapOverlay
          mapState={mapState}
          displayedRoute={displayedRoute}
          humanRouteOverlay={humanRouteOverlay}
          clusteredGraph={clusteredGraph}
          controller={controller}
          nodes={nodes}
          controls={controls}
          edges={edges}
          map={map}
          showNodes={showNodes}
          showEdges={showEdges}
        />
      )}
    </MapViewer>
  );
}
