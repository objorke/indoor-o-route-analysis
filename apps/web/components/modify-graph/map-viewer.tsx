"use client";

import React, { useMemo, useCallback, useState, useEffect } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { useAppData, buildRoutePathSegments, renderRoutePolylines } from "@indoor-o-route-analysis/ui";
import type { MapData } from "@indoor-o-route-analysis/core";
import type { Control } from "@indoor-o-route-analysis/core";
import type { Node, Edge } from "@indoor-o-route-analysis/core";
import type { Polygon } from "@indoor-o-route-analysis/core";
import { 
  CONTROL_RADIUS, 
  GRAPH_NODE_RADIUS,
  GRAPH_EDGE_COLOR,
  PRIMARY_ROUTE_COLOR,
  ROUTE_ANALYSIS_COLORS,
  PRIMARY_ROUTE_STROKE_WIDTH,
  ALTERNATIVE_ROUTE_STROKE_WIDTH,
} from "@indoor-o-route-analysis/core";

import type { AnalysisResult } from "./analysis-logic";

 interface ModifyGraphMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  scale: number;
  displayedRoute?: { path: string[], distance?: number, modification?: AnalysisResult["modification"] } | null;
  pickingEnabled?: boolean;
  onPick?: (id: string) => void;
  
  // Visualization
  showNodes?: boolean;
  showEdges?: boolean;
  backgroundMode?: "normal" | "muted" | "hidden";
  modifyFrom?: string;
  modifyTo?: string;
  originalRoute?: { path: string[], difficulty: number } | null;
  excludeStairs?: boolean;
}

// Inner component to handle side-effects and rendering based on MapState
const MapOverlay = ({
  mapState,
  displayedRoute,
  controller,
  nodes,
  controls,
  edges,
  polygons: _polygons,
  map,
  pickingEnabled,
  onPick,
  showNodes,
  showEdges,
  modifyFrom,
  modifyTo,
  originalRoute,
  excludeStairs: _excludeStairs
}: {
  mapState: MapViewerState,
  displayedRoute?: { path: string[], distance?: number, modification?: AnalysisResult["modification"] } | null,
  controller: MapViewerController | null,
  nodes: Node[],
  controls: Control[],
  edges: Edge[],
  polygons: Polygon[],
  map?: MapData,
  pickingEnabled?: boolean,
  onPick?: (id: string) => void,
  showNodes?: boolean,
  showEdges?: boolean,
  modifyFrom?: string,
  modifyTo?: string,
  originalRoute?: { path: string[], difficulty: number } | null,
  excludeStairs?: boolean
}) => {
  const lastPannedRouteRef = React.useRef<{ path: string[], distance?: number } | null>(null);

  // New Rendering Functions
  const renderGraphPoint = useCallback((
      point: Node | Control, 
      text: string | null,
      state: MapViewerState,
      isSelected: boolean,
      isControl: boolean,
      onClick?: (e: React.MouseEvent) => void
  ) => {
      let px: number, py: number;
      if ("mapPosition" in point && point.mapPosition) {
           const p = eventPosToMultiPagePixels(point.mapPosition, map, state.pixelsPerMM);
           px = p.x; py = p.y;
      } else if ("x" in point && "y" in point) {
           const p = eventPosToMultiPagePixels({ x: point.x, y: point.y }, map, state.pixelsPerMM);
           px = p.x; py = p.y;
      } else {
          return null;
      }

      const radius = GRAPH_NODE_RADIUS;
      const color = GRAPH_EDGE_COLOR; 
      const strokeColor = isControl ? "#a855f7" : color;

      return (
          <g key={`pt-${text || Math.random()}`} 
             onClick={onClick}
             style={{ cursor: onClick ? 'pointer' : 'default', pointerEvents: onClick ? 'all' : 'none' }}>
               
               {isSelected && (
                   <>
                    <circle cx={px} cy={py} r={radius + 6} stroke="white" strokeWidth={4} strokeOpacity={0.7} fill="none" />
                    <circle cx={px} cy={py} r={radius + 2} stroke="magenta" strokeWidth={3} fill="none" />
                   </>
               )}
               
               <circle
                  cx={px}
                  cy={py}
                  r={radius}
                  fill={color}
                  fillOpacity="0.5"
                  stroke={strokeColor}
                  strokeWidth={1.5}
               />
               
               {text && (isSelected || isControl) && (
                   <text 
                     x={px + radius + 5} 
                     y={py} 
                     fill={isSelected ? "magenta" : (isControl ? "#a855f7" : color)} 
                     fontSize={12} 
                     fontWeight="bold" 
                     dy="0.3em" 
                     stroke="white" 
                     strokeWidth={3} 
                     paintOrder="stroke"
                     pointerEvents="none"
                   >
                     {text}
                   </text>
               )}
          </g>
      );
  }, [map]);

  const renderLegConnection = (
      p1: {x:number, y:number}, 
      p2: {x:number, y:number}
  ) => {
     const dx = p2.x - p1.x;
     const dy = p2.y - p1.y;
     const dist = Math.sqrt(dx*dx + dy*dy);
     
     let lSx = p1.x, lSy = p1.y, lEx = p2.x, lEy = p2.y;
     if (dist > 2 * GRAPH_NODE_RADIUS) {
         const ux = dx/dist, uy = dy/dist;
         lSx += ux * GRAPH_NODE_RADIUS;
         lSy += uy * GRAPH_NODE_RADIUS;
         lEx -= ux * GRAPH_NODE_RADIUS;
         lEy -= uy * GRAPH_NODE_RADIUS;
     }
     
     return (
         <g>
            <line x1={lSx} y1={lSy} x2={lEx} y2={lEy} stroke="white" strokeWidth={5} strokeOpacity={0.7} />
            <line x1={lSx} y1={lSy} x2={lEx} y2={lEy} stroke="magenta" strokeWidth={2} />
         </g>
     );
  };
  
  // Helpers
  const getPixelPos = useCallback((id: string) => {
    const node = nodes.find((n: Node) => n.id === id);
    const control = controls.find((c: Control) => c.id === id);
    const point = (node || control) as Node | Control | undefined;
    
    if (point) {
        if ("mapPosition" in point && point.mapPosition) {
             return eventPosToMultiPagePixels(point.mapPosition, map, mapState.pixelsPerMM);
        }
        if ("x" in point && "y" in point) {
            return eventPosToMultiPagePixels({ x: point.x, y: point.y }, map, mapState.pixelsPerMM);
        }
    }
    return null;
  }, [nodes, controls, map, mapState.pixelsPerMM]);
  
  const getPoint = useCallback((id: string) => {
    const node = nodes.find((n: Node) => n.id === id);
    const control = controls.find((c: Control) => c.id === id);
    return (node || control) as Node | Control | undefined;
  }, [nodes, controls]);

  // Pan to selected route when it changes
  useEffect(() => {
    // Only pan if we have a controller and a route
    if (!controller || !displayedRoute || !mapState.pixelsPerMM) {
      return;
    }

    const castRoute = displayedRoute as { path: string[], distance?: number, modification?: AnalysisResult["modification"], centerOnModification?: boolean };
    if (!castRoute.centerOnModification) return;

    // We only want to process this route if we haven't already OR if it's forced
    // Since we check the flag, we just need to ensure we don't spam.
    // Assuming object identity changes on click.
    if (lastPannedRouteRef.current === displayedRoute) return;

    // Calculate center of modification if exists
    let centerMM = null;
    
    if (castRoute.modification && castRoute.modification.originalEdge) {
        const edge = castRoute.modification.originalEdge;
        const p1 = nodes.find((n: Node) => n.id === edge.from) || controls.find((c: Control) => c.id === edge.from);
        const p2 = nodes.find((n: Node) => n.id === edge.to) || controls.find((c: Control) => c.id === edge.to);
        
        if (p1 && p2 && "x" in p1 && "x" in p2) {
            const x = ((p1 as Node).x + (p2 as Node).x) / 2;
            const y = ((p1 as Node).y + (p2 as Node).y) / 2;
            centerMM = { x, y };
        }
    }

    // Fallback to route center (should not happen if modification exists)
    if (!centerMM && displayedRoute.path.length > 0) {
         const points: { x: number; y: number }[] = [];
         for (const nodeId of displayedRoute.path) {
            const node = nodes.find((n: Node) => n.id === nodeId);
            const control = controls.find((c: Control) => c.id === nodeId);
            const point = (node || control) as Node | Control | undefined;
            if (point && "x" in point && "y" in point) {
                points.push({ x: point.x, y: point.y });
            }
         }
         if (points.length > 0) {
             const minX = Math.min(...points.map((p) => p.x));
             const maxX = Math.max(...points.map((p) => p.x));
             const minY = Math.min(...points.map((p) => p.y));
             const maxY = Math.max(...points.map((p) => p.y));
             centerMM = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
         }
    }

    if (!centerMM) return;

    lastPannedRouteRef.current = displayedRoute;

    const centerPx = eventPosToMultiPagePixels(centerMM, map, mapState.pixelsPerMM);

    controller.flyTo(centerPx);
  }, [displayedRoute, controller, nodes, controls, map, mapState.pixelsPerMM]);

  // Derived Geometry for rendering
  const { 
      routePolylines, 
      startCircle, 
      endCircle, 
      legLine,
      originalRoutePolylines,
      modificationOverlay,
      highlightedMarkers,
      legLineOverlay
  } = useMemo(() => {
      // Basic picking/highlighting for From/To
      let highlightedMarkers = null;
      let legLineOverlay = null;
      const _getControl = (id: string) => controls.find(c => c.id === id);

      if (modifyFrom || modifyTo) {
          const p1 = modifyFrom ? getPixelPos(modifyFrom) : null;
          const p2 = modifyTo ? getPixelPos(modifyTo) : null;
          
          const p1Item = modifyFrom ? getPoint(modifyFrom) : null;
          const p2Item = modifyTo ? getPoint(modifyTo) : null;
          
          // Highlight Background
          highlightedMarkers = (
              <g>
                   {p1Item && renderGraphPoint(
                       p1Item, 
                       modifyFrom!, 
                       mapState, 
                       true, 
                       !!controls.find(c => c.id === modifyFrom)
                   )}
                   {p2Item && renderGraphPoint(
                       p2Item, 
                       modifyTo!, 
                       mapState, 
                       true, 
                       !!controls.find(c => c.id === modifyTo)
                   )}
              </g>
          );
          
          if (p1 && p2) {
             legLineOverlay = renderLegConnection(p1, p2);
          }
      }

      // Route polylines, rendered the same way as in Route Analysis (shared renderer, solid lines)
      const createRouteElements = (path: string[], color: string, strokeWidth: number) => {
         if (!mapState.pixelsPerMM) return null;

         const points = path.map(id => getPixelPos(id)).filter(Boolean) as {x:number, y:number}[];
         if (points.length < 2) return null;

         const segments = buildRoutePathSegments(
           path,
           getPixelPos,
           (fromId, toId) => !!edges.find(e => (e.from === fromId && e.to === toId) || (!e.oneWay && e.from === toId && e.to === fromId))?.ignoreLength,
         );

         return <g>{renderRoutePolylines(segments, { color, strokeWidth })}</g>;
      };
      
      // Original route: strong red, like the best route in Route Analysis
      const originalRoutePolylines = originalRoute
          ? createRouteElements(originalRoute.path, PRIMARY_ROUTE_COLOR, PRIMARY_ROUTE_STROKE_WIDTH)
          : null;
      
      // Displayed route (selected result) - Route Analysis' second route color - only if different from original
      const isDisplayedDifferentFromOriginal = displayedRoute && originalRoute && 
          displayedRoute.path.join(',') !== originalRoute.path.join(',');
      const routePolylines = isDisplayedDifferentFromOriginal 
          ? createRouteElements(displayedRoute.path, ROUTE_ANALYSIS_COLORS[1], ALTERNATIVE_ROUTE_STROKE_WIDTH) 
          : null;

      // Start/End Circles from Route (legacy support, or keep for simple analysis)
      // Since we now have 'highlightedMarkers' for From/To, we might suppress these if they overlap?
      // But displayedRoute might be just a segment. 
      // Let's keep them if picking modifyFrom/To is not active.
      // Start/End circles from the route are not rendered while editing the graph
      // (the From/To markers are shown via highlightedMarkers instead).
      const startCircle = null, endCircle = null, legLine = null;

      // Modification Overlay
      let modificationOverlay = null;
      if (displayedRoute?.modification) {
          const mod = displayedRoute.modification;
          const edge = mod.originalEdge;
          const p1 = getPixelPos(edge.from);
          const p2 = getPixelPos(edge.to);
          
          if (p1 && p2) {
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              const ux = dx/dist;
              const uy = dy/dist;

              if (mod.type === "remove") {
                  modificationOverlay = (
                      <g>
                          {/* Highlight Background */}
                          <circle cx={mx} cy={my} r={40} fill="white" fillOpacity={0.4} />

                          {/* Cut Mark */}
                          <line 
                             x1={mx - uy * 10} y1={my + ux * 10} 
                             x2={mx + uy * 10} y2={my - ux * 10} 
                             stroke="red" strokeWidth={4} 
                          />
                      </g>
                  );
              } else if (mod.type === "oneway-fwd" || mod.type === "oneway-rev") {
                  // Determine actual direction
                  let start = p1, end = p2;
                  if (mod.type === "oneway-rev") { start = p2; end = p1; }
                  
                  const ddx = end.x - start.x;
                  const ddy = end.y - start.y;
                  const _ddist = Math.sqrt(ddx*ddx + ddy*ddy);
                  const angle = Math.atan2(ddy, ddx);

                  // Calculate chevron points at multiple positions along the edge (3 arrows)
                  const chevronSize = 5;
                  const tipLength = 6;
                  const chevronPositions = [0.25, 0.5, 0.75]; // 25%, 50%, 75% along the line

                  const midX = (start.x + end.x) / 2;
                  const midY = (start.y + end.y) / 2;
                  
                  const createChevron = (t: number) => {
                      const chevronX = start.x + (end.x - start.x) * t;
                      const chevronY = start.y + (end.y - start.y) * t;
                      const tipX = chevronX + tipLength * Math.cos(angle);
                      const tipY = chevronY + tipLength * Math.sin(angle);
                      const baseAngle1 = angle + (2 * Math.PI) / 3;
                      const baseAngle2 = angle - (2 * Math.PI) / 3;
                      const base1X = chevronX + chevronSize * Math.cos(baseAngle1);
                      const base1Y = chevronY + chevronSize * Math.sin(baseAngle1);
                      const base2X = chevronX + chevronSize * Math.cos(baseAngle2);
                      const base2Y = chevronY + chevronSize * Math.sin(baseAngle2);
                      return { tipX, tipY, base1X, base1Y, base2X, base2Y };
                  };
  
                  modificationOverlay = (
                      <g>
                           {/* Highlight Background */}
                           <circle cx={midX} cy={midY} r={40} fill="white" fillOpacity={0.4} />

                           {/* 3 Arrows instead of solid line */}
                           {chevronPositions.map((t, idx) => {
                              const chev = createChevron(t);
                              return (
                                <polyline
                                    key={`chev-${idx}`}
                                    points={`${chev.base1X},${chev.base1Y} ${chev.tipX},${chev.tipY} ${chev.base2X},${chev.base2Y}`}
                                    fill="none"
                                    stroke="red"
                                    strokeWidth={3}
                                />
                              );
                           })}
                      </g>
                  );
              }
          }
      }

      return { 
          routePolylines, startCircle, endCircle, legLine, 
          originalRoutePolylines, modificationOverlay, highlightedMarkers, legLineOverlay 
      };
  }, [displayedRoute, controls, edges, mapState, modifyFrom, modifyTo, originalRoute, getPixelPos, getPoint, renderGraphPoint]);

  // Nodes and Edges Visualization
  const graphOverlay = useMemo(() => {
     if (!showNodes && !showEdges) return null;
     if (!mapState.pixelsPerMM) return null;

    const visibleEdges = edges.filter(e => !e.ignoreLength);

     const getPos = (item: Node | Control | undefined) => {
         if (!item) return null;
         if ("mapPosition" in item && item.mapPosition) return eventPosToMultiPagePixels(item.mapPosition, map, mapState.pixelsPerMM);
         if ("x" in item && "y" in item) return eventPosToMultiPagePixels({x:item.x, y:item.y}, map, mapState.pixelsPerMM);
         return null;
     };

     return (
         <g>
             {showEdges && visibleEdges.map((edge, i) => {
                 const p1 = getPos(nodes.find(n => n.id === edge.from) || controls.find(c => c.id === edge.from));
                 const p2 = getPos(nodes.find(n => n.id === edge.to) || controls.find(c => c.id === edge.to));
                 if(!p1 || !p2) return null;
                 return (
                     <line 
                        key={`edge-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                        stroke="rgba(0,0,0,0.2)" strokeWidth={1} 
                     />
                 );
             })}
             {showNodes && nodes.map(node => {
                 const p = getPos(node);
                 if(!p) return null;
                 return (
                     <circle key={`node-${node.id}`} cx={p.x} cy={p.y} r={2} fill="rgba(0,0,255,0.3)" />
                 );
             })}
         </g>
     );
  }, [showEdges, showNodes, nodes, edges, controls, map, mapState.pixelsPerMM]);

  // Render interactive elements (Controls always, Nodes if enabled)
  const interactiveOverlay = useMemo(() => {
    if (!mapState.pixelsPerMM) return null;

    // Always render controls, but only make them interactive if picking is enabled
    const renderedControls = controls.map(control => {
        const isPickable = pickingEnabled && onPick;
        const isSelected = control.id === modifyFrom || control.id === modifyTo;

        return renderGraphPoint(
            control,
            control.id,
            mapState,
            isSelected,
            true,
            isPickable ? (e: React.MouseEvent) => { 
               if (onPick) {
                   e.stopPropagation(); 
                   onPick(control.id); 
               }
            } : undefined
        );
    });

    // Only render nodes pick targets if picking is enabled
    const renderedNodes = (pickingEnabled && onPick) ? nodes.map(node => {
        if (controls.some(c => c.id === node.id)) return null;
        
        const isSelected = node.id === modifyFrom || node.id === modifyTo;

        return renderGraphPoint(
            node,
            null,
            mapState,
            isSelected,
            false,
            (e: React.MouseEvent) => { e.stopPropagation(); onPick(node.id); }
        );
    }) : null;

    return (
        <g>
            {renderedNodes}
            {renderedControls}
        </g>
    );

  }, [pickingEnabled, onPick, controls, nodes, mapState, modifyFrom, modifyTo, renderGraphPoint]);


  return (
    <svg
        width={mapState.pdfDimensions.width}
        height={mapState.pdfDimensions.height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
        {graphOverlay}
        
        {/* Routes should be under controls */}
        {originalRoutePolylines}
        {routePolylines}

        {interactiveOverlay}
        {legLineOverlay}
        {legLine}
        {highlightedMarkers}
        {startCircle}
        {endCircle}
        {modificationOverlay}
    </svg>
  );
};

export default function ModifyGraphMapViewer({
  map,
  pdfUrl,
  scale: _scale,
  displayedRoute,
  pickingEnabled,
  onPick,
  showNodes,
  showEdges,
  backgroundMode,
  modifyFrom,
  modifyTo,
  originalRoute,
  excludeStairs
}: ModifyGraphMapViewerProps) {
  const { selectedEvent } = useAppData();
  const [controller, setController] = useState<MapViewerController | null>(null);

  const controls = useMemo(() => selectedEvent?.raceCourses?.[0]?.controls || [], [selectedEvent]);
  const nodes = useMemo(() => selectedEvent?.raceCourses?.[0]?.vertices || [], [selectedEvent]);
  const edges = useMemo(() => selectedEvent?.raceCourses?.[0]?.edges || [], [selectedEvent]);
  const polygons = useMemo(() => selectedEvent?.raceCourses?.[0]?.polygons || [], [selectedEvent]);
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
          controller={controller}
          nodes={nodes}
          controls={controls}
          edges={edges}
          polygons={polygons}
          map={map}
          pickingEnabled={pickingEnabled}
          onPick={onPick}
          showNodes={showNodes}
          showEdges={showEdges}
          modifyFrom={modifyFrom}
          modifyTo={modifyTo}
          originalRoute={originalRoute}
          excludeStairs={excludeStairs}
        />
      )}
    </MapViewer>
  );
}
