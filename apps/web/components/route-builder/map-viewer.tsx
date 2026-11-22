"use client";

import { useCallback, useRef, forwardRef, useImperativeHandle, useEffect, useMemo } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import type { Node, Edge, Control } from "@indoor-o-route-analysis/core";
import { edgeKey } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import { ControlRenderer, buildRoutePathSegments, renderDirections } from "@indoor-o-route-analysis/ui";

import { useAppData, useSettings } from "@indoor-o-route-analysis/ui";
import { VideoExporter, type VideoExportContext } from "@indoor-o-route-analysis/core/export";
import type { VideoExportSettings } from "@/components/shared/video-export-dialog";
import {
  GRAPH_EDGE_COLOR,
  GRAPH_NODE_RADIUS,
  ROUTE_PATH_COLOR,
  ROUTE_WAYPOINT_COLOR,
  ROUTE_WAYPOINT_RADIUS,
  COURSE_COLOR,
  MM_TO_METERS,
  PRIMARY_ROUTE_COLOR,
} from "@indoor-o-route-analysis/core";

import { useVisibleDirections } from "@/components/directions/use-visible-directions";
interface RouteBuilderMapViewerProps {
  map: MapData;
  nodes: Node[];
  edges: Edge[];
  controls: Control[];
  pdfUrl: string | null;
  scale?: number;
  showBackgroundMap: boolean;
  backgroundOpacity?: number;
  selectedLegIndex: number | null;
  waypointNodes: string[];
  onWaypointClick: (nodeId: string) => void;
  routePath: string[];
  fromControlId: string | null;
  toControlId: string | null;
  fromControlLabel?: string;
  toControlLabel?: string;
  selectedNodeId: string | null;
  // Graph visibility
  showGraph?: boolean;
  // Playback props
  isPlaying?: boolean;
  playReset?: number;
  followPlayback?: boolean;
  playbackSpeed?: number;
  onPlaybackComplete?: () => void;
  /** Timing schedule for piecewise speed interpolation: [{distMeters, timeSec}] */
  timingSchedule?: { distMeters: number; timeSec: number }[];
}

export interface RouteBuilderMapViewerHandle {
  flyToNode: (nodeId: string) => void;
  flyToLegStart: () => void;
  exportVideo?: (settings: VideoExportSettings, onProgress: (progress: number) => void, filename?: string, autoRoute?: boolean, abortSignal?: AbortSignal) => Promise<void>;
}

const RouteBuilderMapViewer = forwardRef<RouteBuilderMapViewerHandle, RouteBuilderMapViewerProps>(({
  map,
  nodes,
  edges,
  controls,
  pdfUrl,
  scale: _scale = 1,
  showBackgroundMap,
  backgroundOpacity = 1,
  selectedLegIndex,
  waypointNodes,
  onWaypointClick,
  routePath,
  fromControlId,
  toControlId,
  fromControlLabel,
  toControlLabel,
  selectedNodeId,
  showGraph = true,
  isPlaying = false,
  playReset = 0,
  followPlayback = false,
  playbackSpeed = 4,
  onPlaybackComplete,
  timingSchedule,
}, ref) => {
  const { runningSpeed: contextRunningSpeed, selectedEvent } = useAppData();
  const directions = useVisibleDirections(selectedEvent);
  const { showControlPoints } = useSettings();
  const effectiveRunningSpeed = contextRunningSpeed > 0 ? contextRunningSpeed : 3;

  const EDGE_COLOR = GRAPH_EDGE_COLOR;

  // Playback state
  const accumulatedTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const playPosRef = useRef<{ x: number; y: number } | null>(null);
  const playDoneRef = useRef<boolean>(false);
  const completionNotifiedRef = useRef<boolean>(false);
  const isExportingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const runnerGroupRef = useRef<SVGGElement | null>(null);
  const onPlaybackCompleteRef = useRef(onPlaybackComplete);
  onPlaybackCompleteRef.current = onPlaybackComplete;
  const followPlaybackRef = useRef(followPlayback);
  followPlaybackRef.current = followPlayback;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const timingScheduleRef = useRef(timingSchedule);
  timingScheduleRef.current = timingSchedule;

  // Cache for route pixel segments — avoids allocations in the 60fps animation loop
  const cachedSegmentsRef = useRef<{ pixelsPerMM: number; routePathKey: string; segments: { x1: number; y1: number; x2: number; y2: number; dist: number }[]; totalDist: number } | null>(null);

  const getCachedSegments = (state: MapViewerState) => {
    const key = routePath.join(',');
    const cached = cachedSegmentsRef.current;
    if (cached && cached.pixelsPerMM === state.pixelsPerMM && cached.routePathKey === key) {
      return cached;
    }
    const segments = getRoutePixelSegments(state);
    const totalDist = segments.reduce((sum, s) => sum + s.dist, 0);
    cachedSegmentsRef.current = { pixelsPerMM: state.pixelsPerMM, routePathKey: key, segments, totalDist };
    return cachedSegmentsRef.current;
  };

  const WAYPOINT_COLOR = ROUTE_WAYPOINT_COLOR;
  const PATH_COLOR = ROUTE_PATH_COLOR;
  const FROM_TO_COLOR = COURSE_COLOR;
  const CONTROL_LINE_COLOR = COURSE_COLOR;

  const controllerRef = useRef<MapViewerController | null>(null);
  const lastStateRef = useRef<MapViewerState | null>(null);

  const nodeRadius = GRAPH_NODE_RADIUS;
  const _nodeRadius_px = ROUTE_WAYPOINT_RADIUS;
  const mapStateRef = useRef<MapViewerState | null>(null);

  type GraphNode = {
    id: string;
    x: number;
    y: number;
    type: "node" | "control";
    data: Node | Control;
  };

  const getGraphNodes = useCallback((state: MapViewerState) => {
    const nodesMap = new Map<string, GraphNode>();
    nodes.forEach((n) => {
      const px = eventPosToMultiPagePixels({ x: n.x, y: n.y }, map, state.pixelsPerMM);
      nodesMap.set(n.id, { id: n.id, x: px.x, y: px.y, type: "node", data: n });
    });
    controls.forEach((c) => {
      const px = eventPosToMultiPagePixels({ x: c.mapPosition.x, y: c.mapPosition.y }, map, state.pixelsPerMM);
      nodesMap.set(c.id, { id: c.id, x: px.x, y: px.y, type: "control", data: c });
    });
    return nodesMap;
  }, [nodes, controls, map]);

  // Calculate total route distance in pixels for playback
  const getRoutePixelSegments = useCallback((state: MapViewerState) => {
    if (routePath.length < 2) return [];
    const graphNodes = getGraphNodes(state);
    const segments: { x1: number; y1: number; x2: number; y2: number; dist: number }[] = [];
    for (let i = 0; i < routePath.length - 1; i++) {
      const n1 = graphNodes.get(routePath[i]);
      const n2 = graphNodes.get(routePath[i + 1]);
      if (!n1 || !n2) continue;
      // Skip edges with ignoreLength
      const edge = edges.find(
        (e) => (e.from === routePath[i] && e.to === routePath[i + 1]) ||
               (e.from === routePath[i + 1] && e.to === routePath[i])
      );
      if (edge?.ignoreLength) continue;
      const dist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
      segments.push({ x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, dist });
    }
    return segments;
  }, [routePath, edges, getGraphNodes]);

  // Calculate total route distance in real meters for playback duration
  const totalRouteMeters = useMemo(() => {
    if (routePath.length < 2 || !_scale) return 0;
    let total = 0;
    const nodeMap = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => {
      nodeMap.set(n.id, { x: n.x, y: n.y });
    });
    controls.forEach(c => {
      nodeMap.set(c.id, { x: c.mapPosition.x, y: c.mapPosition.y });
    });

    for (let i = 0; i < routePath.length - 1; i++) {
      const p1 = nodeMap.get(routePath[i]);
      const p2 = nodeMap.get(routePath[i + 1]);
      if (!p1 || !p2) continue;
      const edge = edges.find(
        (e) => (e.from === routePath[i] && e.to === routePath[i + 1]) ||
               (e.from === routePath[i + 1] && e.to === routePath[i])
      );
      if (edge?.ignoreLength) continue;
      const distMM = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      total += distMM * _scale * MM_TO_METERS;
    }
    return total;
  }, [routePath, nodes, controls, edges, _scale]);

  const totalRouteMetersRef = useRef(totalRouteMeters);
  totalRouteMetersRef.current = totalRouteMeters;
  const effectiveRunningSpeedRef = useRef(effectiveRunningSpeed);
  effectiveRunningSpeedRef.current = effectiveRunningSpeed;

  // Reset playback when playReset changes
  useEffect(() => {
    accumulatedTimeRef.current = 0;
    lastFrameTimeRef.current = 0;
    playPosRef.current = null;
    playDoneRef.current = false;
    completionNotifiedRef.current = false;
    // Hide the runner marker via DOM
    const g = runnerGroupRef.current;
    if (g) g.setAttribute("visibility", "hidden");
  }, [playReset]);

  // Animation loop for playback — updates runner marker via DOM, no React re-renders
  useEffect(() => {
    if (!isPlaying) {
      lastFrameTimeRef.current = 0;
      return;
    }

    if (playDoneRef.current) {
      accumulatedTimeRef.current = 0;
      playDoneRef.current = false;
      completionNotifiedRef.current = false;
      playPosRef.current = null;
    }

    let animationId: number;
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = performance.now();
    }

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = timestamp;
      const dt = (timestamp - lastFrameTimeRef.current) / 1000;
      if (dt > 0 && dt < 1.0) {
        accumulatedTimeRef.current += dt * playbackSpeedRef.current;
      }
      lastFrameTimeRef.current = timestamp;

      // Update runner marker position directly via DOM
      const state = mapStateRef.current || lastStateRef.current;
      if (state) {
        const pos = getPlaybackPositionCached(state);
        const g = runnerGroupRef.current;
        if (pos && g) {
          playPosRef.current = pos;
          g.setAttribute("visibility", "visible");
          const circles = g.querySelectorAll("circle");
          circles.forEach(c => {
            c.setAttribute("cx", String(pos.x));
            c.setAttribute("cy", String(pos.y));
          });

          // Follow playback
          if (followPlaybackRef.current && controllerRef.current) {
            controllerRef.current.flyTo(pos, 150);
          }

          // Completion detection
          if (pos.progress >= 1.0 && !completionNotifiedRef.current) {
            completionNotifiedRef.current = true;
            playDoneRef.current = true;
            const cb = onPlaybackCompleteRef.current;
            if (cb) {
              setTimeout(() => cb(), 0);
            }
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation loop intentionally reads from refs to avoid restarting on every state change
  }, [isPlaying]);

  useImperativeHandle(ref, () => ({
    flyToNode: (nodeId: string) => {
      const state = lastStateRef.current;
      const controller = controllerRef.current;
      if (!state || !controller) return;

      const control = controls.find((c) => c.id === nodeId);
      if (control) {
        const px = eventPosToMultiPagePixels(control.mapPosition, map, state.pixelsPerMM);
        controller.frameItem(px, 3.0);
        return;
      }

      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const px = eventPosToMultiPagePixels({ x: node.x, y: node.y }, map, state.pixelsPerMM);
        controller.frameItem(px, 3.0);
        return;
      }
    },
    flyToLegStart: () => {
      const state = lastStateRef.current;
      const controller = controllerRef.current;
      if (!state || !controller) return;

      // Fly to the start control of the current leg
      if (fromControlId) {
        const c = controls.find(c => c.id === fromControlId);
        if (c) {
          const px = eventPosToMultiPagePixels(c.mapPosition, map, state.pixelsPerMM);
          controller.flyTo(px);
          return;
        }
      }
    },
    exportVideo: async (
      settings: VideoExportSettings,
      onProgress: (progress: number) => void,
      filename?: string,
      _autoRoute?: boolean,
      _abortSignal?: AbortSignal,
    ) => {
      const state = mapStateRef.current || lastStateRef.current;
      if (!state) throw new Error("Map state not available");

      const svg = svgRef.current;
      const controller = controllerRef.current;
      if (!controller) throw new Error("Map controller not available");

      const canvas = controller.getCanvas();
      if (!canvas) throw new Error("Map canvas not available");

      isExportingRef.current = true;
      const originalTime = accumulatedTimeRef.current;
      const originalSchedule = timingScheduleRef.current;

      // Determine simulation/video duration based on timing schedule
      let simulationDuration: number;
      let videoDuration: number;
      const schedule = timingScheduleRef.current;

      if (schedule && schedule.length >= 2) {
        // Timing schedule exists - use it for pacing
        if (settings.duration > 0) {
          // User specified a video duration: adjust the last segment's time
          // Time from start to second-to-last entry (last timing point) is fixed
          const lastTimingPoint = schedule[schedule.length - 2];
          if (settings.duration > lastTimingPoint.timeSec) {
            // Adjust the last entry so the remaining segment fills the rest
            const adjustedSchedule = schedule.map((entry, i) =>
              i === schedule.length - 1
                ? { ...entry, timeSec: settings.duration }
                : entry
            );
            timingScheduleRef.current = adjustedSchedule;
            simulationDuration = settings.duration;
          } else {
            // Duration is shorter than the time at the last timing point - use schedule as-is
            simulationDuration = schedule[schedule.length - 1].timeSec;
          }
        } else {
          // No duration specified - use the schedule's natural total time
          simulationDuration = schedule[schedule.length - 1].timeSec;
        }
        // With timing schedule, video duration = simulation duration (1:1 real-time)
        videoDuration = simulationDuration;
      } else {
        // No timing schedule - constant speed fallback
        simulationDuration = totalRouteMeters / effectiveRunningSpeed;
        videoDuration = settings.duration || simulationDuration;
      }

      try {
        const context: VideoExportContext = {
          getCanvas: () => canvas,
          getSvg: () => svg,
          setSimulationTime: async (time: number) => {
            accumulatedTimeRef.current = time;
            // Update runner marker position via DOM for export
            const pos = getPlaybackPosition(state);
            const g = runnerGroupRef.current;
            if (pos && g) {
              playPosRef.current = pos;
              g.setAttribute("visibility", "visible");
              const circles = g.querySelectorAll("circle");
              circles.forEach(c => {
                c.setAttribute("cx", String(pos.x));
                c.setAttribute("cy", String(pos.y));
              });
            }
            await new Promise(r => setTimeout(r, 50));
          },
          getPlayPosition: () => playPosRef.current,
          getZoom: () => state.zoom,
        };

        const exporter = new VideoExporter();
        await exporter.export(
          settings,
          filename || "route-builder-video.mp4",
          videoDuration,
          simulationDuration,
          context,
          onProgress,
        );
      } finally {
        accumulatedTimeRef.current = originalTime;
        timingScheduleRef.current = originalSchedule;
        isExportingRef.current = false;
        // Restore runner marker visibility
        const g = runnerGroupRef.current;
        if (g) g.setAttribute("visibility", "hidden");
      }
    },
  }));

  const findNearestNode = useCallback((x: number, y: number, graphNodes: Map<string, GraphNode>): GraphNode | null => {
    let nearest: GraphNode | null = null;
    let minDist = Infinity;
    const clickRadius = nodeRadius * 3;

    graphNodes.forEach((node) => {
      // Allow clicking both nodes and controls
      const dist = Math.hypot(x - node.x, y - node.y);
      if (dist < clickRadius && dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    });

    return nearest;
  }, [nodeRadius]);

  const svgCoordsFromMouse = (event: React.MouseEvent<SVGElement>, state: MapViewerState) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / state.zoom,
      y: (event.clientY - rect.top) / state.zoom,
    };
  };

  const handleMouseDown = useCallback((state: MapViewerState) => (e: React.MouseEvent<SVGElement>) => {
    const { x, y } = svgCoordsFromMouse(e, state);
    const graphNodes = getGraphNodes(state);

    const nearestNode = findNearestNode(x, y, graphNodes);
    if (nearestNode && selectedLegIndex !== null) {
      e.stopPropagation();
      onWaypointClick(nearestNode.id);
    }
  }, [getGraphNodes, selectedLegIndex, onWaypointClick, findNearestNode]);

  const renderRoutePath = useCallback((graphNodes: Map<string, GraphNode>) => {
    if (selectedLegIndex === null || routePath.length < 2) return null;

    const pathNodes = routePath.map((id) => graphNodes.get(id)).filter((n): n is GraphNode => n !== undefined);
    
    if (pathNodes.length < 2) return null;

    // Build continuous polyline segments, breaking at ignoreLength edges
    const polylines = buildRoutePathSegments(
      routePath,
      (id) => graphNodes.get(id) ?? null,
      (fromId, toId) => !!edges.find((e) =>
        (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
      )?.ignoreLength,
    )
      .filter((seg) => !seg.isMapSegmentTransition && seg.points.length >= 2)
      .map((seg) => seg.points.map((p) => `${p.x},${p.y}`).join(" "));

    return (
      <g key="route-path">
        {polylines.map((points, i) => (
          <g key={`route-polyline-${i}`}>
            {/* White halo/shadow */}
            <polyline
              points={points}
              fill="none"
              stroke="white"
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.8}
              pointerEvents="none"
            />
            {/* Route line */}
            <polyline
              points={points}
              fill="none"
              stroke={PATH_COLOR}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.8}
              pointerEvents="none"
            />
          </g>
        ))}
      </g>
    );
  }, [selectedLegIndex, routePath, edges, PATH_COLOR]);

  // Calculate playback runner position along route using CACHED segments
  // Uses timing schedule for piecewise speed when available, otherwise constant speed
  // This function is called 60 times/sec in the animation loop — avoid allocations.
  const getPlaybackPositionCached = (state: MapViewerState): { x: number; y: number; progress: number } | null => {
    if ((!isPlaying && !isExportingRef.current) || routePath.length < 2) return null;
    if (accumulatedTimeRef.current <= 0) return null;

    const cached = getCachedSegments(state);
    const { segments, totalDist: totalPixelDist } = cached;
    if (segments.length === 0 || totalPixelDist === 0) return null;

    // Determine how far along the route (as a fraction) based on accumulated time
    let progress: number;

    const schedule = timingScheduleRef.current;
    if (schedule && schedule.length >= 2) {
      // Piecewise-linear interpolation using timing schedule
      const totalDistMeters = schedule[schedule.length - 1].distMeters;
      const totalTimeSec = schedule[schedule.length - 1].timeSec;
      if (totalTimeSec <= 0 || totalDistMeters <= 0) {
        progress = 1.0;
      } else {
        const t = accumulatedTimeRef.current;
        if (t >= totalTimeSec) {
          progress = 1.0;
        } else {
          // Find which segment of the schedule we're in
          let distAtTime = 0;
          for (let i = 0; i < schedule.length - 1; i++) {
            const s0 = schedule[i];
            const s1 = schedule[i + 1];
            if (t >= s0.timeSec && t <= s1.timeSec) {
              const segDuration = s1.timeSec - s0.timeSec;
              const frac = segDuration > 0 ? (t - s0.timeSec) / segDuration : 0;
              distAtTime = s0.distMeters + frac * (s1.distMeters - s0.distMeters);
              break;
            }
          }
          progress = Math.min(distAtTime / totalDistMeters, 1.0);
        }
      }
    } else {
      // Constant speed fallback
      const simulationDuration = totalRouteMetersRef.current / effectiveRunningSpeedRef.current;
      if (simulationDuration <= 0) return null;
      progress = Math.min(accumulatedTimeRef.current / simulationDuration, 1.0);
    }

    const targetDist = progress * totalPixelDist;

    let accumulated = 0;
    for (const seg of segments) {
      if (accumulated + seg.dist >= targetDist) {
        const t = (targetDist - accumulated) / seg.dist;
        const x = seg.x1 + (seg.x2 - seg.x1) * t;
        const y = seg.y1 + (seg.y2 - seg.y1) * t;
        return { x, y, progress };
      }
      accumulated += seg.dist;
    }

    // Return last point
    const last = segments[segments.length - 1];
    return { x: last.x2, y: last.y2, progress: 1.0 };
  };

  // Non-cached version for video export (which may need fresh state)
  const getPlaybackPosition = (state: MapViewerState): { x: number; y: number; progress: number } | null => {
    // Invalidate cache to force fresh computation
    cachedSegmentsRef.current = null;
    return getPlaybackPositionCached(state);
  };

  const renderSvgContent = useCallback(
    (state: MapViewerState, includeWhiteBackground: boolean = false) => {
      const graphNodes = getGraphNodes(state);

      const nodesList: GraphNode[] = [];
      const controlsList: GraphNode[] = [];
      graphNodes.forEach((item) => {
        if (item.type === "node") nodesList.push(item);
        else controlsList.push(item);
      });

      return (
        <svg
          ref={svgRef}
          width={state.pdfDimensions.width}
          height={state.pdfDimensions.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            cursor: "crosshair",
          }}
          onMouseDown={handleMouseDown(state)}
        >
          <defs>
            <filter id="control-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="white" floodOpacity="0.8" />
            </filter>
          </defs>

          {includeWhiteBackground && (
            <rect x={0} y={0} width={state.pdfDimensions.width} height={state.pdfDimensions.height} fill="white" />
          )}

          {/* Course directions (Directions view) */}
          <g pointerEvents="none">
            {renderDirections({
              features: directions,
              toPx: (p) => eventPosToMultiPagePixels(p, map, state.pixelsPerMM),
              pixelsPerMM: state.pixelsPerMM,
              mapScale: map?.scale,
              idPrefix: "route-builder-op",
            })}
          </g>

          {/* Edges - skip edges marked ignoreLength */}
          {showGraph && edges.map((edge) => {
            // Skip edges marked ignoreLength (stairs)
            if (edge.ignoreLength) return null;

            const fromNode = graphNodes.get(edge.from);
            const toNode = graphNodes.get(edge.to);

            if (!fromNode || !toNode) return null;

            const centerX1 = fromNode.x;
            const centerY1 = fromNode.y;
            const centerX2 = toNode.x;
            const centerY2 = toNode.y;
            const dx = centerX2 - centerX1;
            const dy = centerY2 - centerY1;
            const angle = Math.atan2(dy, dx);
            const dist = Math.hypot(dx, dy);

            const x1 = dist > nodeRadius * 2 ? centerX1 + nodeRadius * Math.cos(angle) : centerX1;
            const y1 = dist > nodeRadius * 2 ? centerY1 + nodeRadius * Math.sin(angle) : centerY1;
            const x2 = dist > nodeRadius * 2 ? centerX2 - nodeRadius * Math.cos(angle) : centerX2;
            const y2 = dist > nodeRadius * 2 ? centerY2 - nodeRadius * Math.sin(angle) : centerY2;

            return (
              <line
                key={`edge-${edgeKey(edge)}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={EDGE_COLOR}
                strokeWidth={1.5}
                opacity={0.3}
                pointerEvents="none"
              />
            );
          })}

          {/* Regular graph nodes (below route) */}
          {showGraph && nodesList.map((node, _index) => {
            const isWaypoint = waypointNodes.includes(node.id);
            const isSelected = selectedNodeId === node.id;
            
            return (
              <g key={`node-${node.id}`}>
                {/* Main node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? nodeRadius * 2.0 : (isWaypoint ? nodeRadius * 1.8 : nodeRadius)}
                  fill={isSelected ? "#FFC107" : (isWaypoint ? WAYPOINT_COLOR : EDGE_COLOR)}
                  fillOpacity={isSelected ? 1.0 : (isWaypoint ? 0.8 : 0.5)}
                  stroke={isSelected ? "#FFC107" : (isWaypoint ? WAYPOINT_COLOR : EDGE_COLOR)}
                  strokeWidth={isSelected ? 3 : (isWaypoint ? 2.5 : 1.5)}
                  style={{ cursor: "pointer", filter: isSelected ? "url(#control-glow)" : undefined }}
                />
                {/* Node number - centered in circle */}
                {isWaypoint && (
                  <text
                    x={node.x}
                    y={node.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="12"
                    fontWeight="bold"
                    fill="white"
                    pointerEvents="none"
                    style={{
                      textShadow: "0 0 2px rgba(0,0,0,0.8)",
                      paintOrder: "stroke fill",
                      stroke: "rgba(0,0,0,0.5)",
                      strokeWidth: 1,
                    }}
                  >
                    {waypointNodes.indexOf(node.id) + 1}
                  </text>
                )}
              </g>
            );
          })}

          {/* Route path for selected leg */}
          {renderRoutePath(graphNodes)}

          {/* Control line between from and to controls - using shared renderer */}
          {selectedLegIndex !== null && fromControlId && toControlId && (() => {
            const fromNode = graphNodes.get(fromControlId);
            const toNode = graphNodes.get(toControlId);
            if (!fromNode || !toNode) return null;

            return ControlRenderer.renderLeg({
              from: { x: fromNode.x, y: fromNode.y },
              to: { x: toNode.x, y: toNode.y },
              color: CONTROL_LINE_COLOR,
              width: 2,
              filter: "drop-shadow(0 0 2px white)", // White effect around the line
            });
          })()}

          {/* Controls - using shared renderer for selected leg, others as normal nodes */}
          {controlsList.map((controlNode) => {
            const control = controlNode.data as Control;
            const isFromControl = control.id === fromControlId;
            const isToControl = control.id === toControlId;
            
            // If graph is hidden and this isn't a from/to control, skip
            if (!showGraph && !isFromControl && !isToControl) return null;
            
            // If it's the start or end of the leg, show proper control symbol
            if (isFromControl || isToControl) {
              // Construct pseudo-course controls for rendering context
              const courseControls: (Control & { x: number; y: number })[] = [];
              const fromData = fromControlId ? graphNodes.get(fromControlId) : undefined;
              const toData = toControlId ? graphNodes.get(toControlId) : undefined;
              
              if (fromData) courseControls.push({ ...fromData.data as Control, x: fromData.x, y: fromData.y });
              if (toData) courseControls.push({ ...toData.data as Control, x: toData.x, y: toData.y });
              
              const courseControlCodes = courseControls.map(c => c.id);
              
              // Use provided label overrides if available
              let label: string | undefined ;
              if (isFromControl) label = fromControlLabel;
              if (isToControl) label = toControlLabel;

              const controlElement = ControlRenderer.renderControl({
                control: { ...control, x: controlNode.x, y: controlNode.y },
                courseControls,
                courseControlCodes,
                isSelected: true,
                strokeColor: FROM_TO_COLOR,
                maybeGlow: "drop-shadow(0 0 2px white)",
                showLabel: true,
                label,
                showControlPoint: showControlPoints,
              });
              
              // If this control is also a waypoint (timing point), show the number
              const waypointIndex = waypointNodes.indexOf(control.id);
              if (waypointIndex >= 0) {
                return (
                  <g key={`control-waypoint-${control.id}`}>
                    {controlElement}
                    <circle
                      cx={controlNode.x + 15}
                      cy={controlNode.y - 15}
                      r={10}
                      fill={WAYPOINT_COLOR}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                    <text
                      x={controlNode.x + 15}
                      y={controlNode.y - 15}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10"
                      fontWeight="bold"
                      fill="white"
                      pointerEvents="none"
                    >
                      {waypointIndex + 1}
                    </text>
                  </g>
                );
              }
              
              return controlElement;
            }

            // Otherwise show as a normal node (blue circle)
            return (
              <g key={`control-${control.id}`}>
                <circle
                  cx={controlNode.x}
                  cy={controlNode.y}
                  r={nodeRadius}
                  fill={EDGE_COLOR}
                  fillOpacity={0.5}
                  stroke={EDGE_COLOR}
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}

          {/* Playback runner marker — positioned via DOM in animation loop */}
          <g ref={runnerGroupRef} key="playback-runner" visibility="hidden">
            <circle cx={0} cy={0} r={10} fill="white" opacity={0.6} pointerEvents="none" />
            <circle cx={0} cy={0} r={7} fill={PRIMARY_ROUTE_COLOR} stroke="white" strokeWidth={2} pointerEvents="none" />
          </g>
        </svg>
      );
    },
    [edges, waypointNodes, fromControlId, toControlId, selectedLegIndex, selectedNodeId, showGraph,
     CONTROL_LINE_COLOR, EDGE_COLOR, FROM_TO_COLOR, WAYPOINT_COLOR, fromControlLabel, toControlLabel, nodeRadius, showControlPoints,
     getGraphNodes, handleMouseDown, renderRoutePath, directions],
  );

  return (
    <MapViewer
      pdfUrl={pdfUrl ?? undefined}
      showBackgroundMap={showBackgroundMap}
      backgroundOpacity={backgroundOpacity}
      mapLayout={map?.layout || "horizontal"}
      onControllerReady={(c) => (controllerRef.current = c)}
    >
      {(state: MapViewerState) => {
        lastStateRef.current = state;
        mapStateRef.current = state;
        return renderSvgContent(state, !showBackgroundMap);
      }}
    </MapViewer>
  );
});

RouteBuilderMapViewer.displayName = "RouteBuilderMapViewer";

export default RouteBuilderMapViewer;
