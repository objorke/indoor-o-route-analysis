"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap, updateRaceCourse } from "@indoor-o-route-analysis/core";
import { usePdfUrl } from "@indoor-o-route-analysis/ui";
import { usePlayback } from "@indoor-o-route-analysis/ui";
import RouteBuilderPropertiesPanel from "./properties-panel";
import NewRouteDialog from "./new-route-dialog";
import { VideoExportDialog, type VideoExportSettings } from "@/components/shared/video-export-dialog";
import { ExportNaming } from "@indoor-o-route-analysis/core";
import type { CustomRoute, RouteLeg, RouteLegNode } from "@indoor-o-route-analysis/core";
import type { RouteAnalyzer } from "@indoor-o-route-analysis/core";
import { useEventRouteAnalyzer } from "@indoor-o-route-analysis/ui";
import { GpxGenerator } from "@indoor-o-route-analysis/core";
import { getCourseControlLabels, getActualCourseControls } from "@indoor-o-route-analysis/core";
import { findPolygonForPoint } from "@indoor-o-route-analysis/core";
import { PRIMARY_ROUTE_COLOR } from "@indoor-o-route-analysis/core";

import type { RouteBuilderMapViewerHandle } from "./map-viewer";
import type { RouteAnalysisModelViewerHandle } from "@/components/route-analysis/model-viewer";
import { notify, confirmAction } from "@indoor-o-route-analysis/ui";

const RouteBuilderMapViewer = dynamic(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

const RouteAnalysisModelViewer = dynamic(() => import("../route-analysis/model-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

/**
 * Try to merge consecutive old legs that span from `fromId` to `toId`.
 * This handles the case where A→S and S→B are being combined into A→B:
 * we concatenate the paths, dropping the duplicate intermediate control node,
 * and keep all timing points.
 */
function tryMergeOldLegs(fromId: string, toId: string, oldLegs: RouteLeg[]): RouteLegNode[] | null {
  // Find the first old leg starting from `fromId`
  const startIdx = oldLegs.findIndex(l => l.fromControlId === fromId);
  if (startIdx < 0) return null;

  const mergedPath: RouteLegNode[] = [...oldLegs[startIdx].path];
  let currentToId = oldLegs[startIdx].toControlId;

  // Follow the chain of consecutive legs until we reach `toId`
  for (let i = startIdx + 1; i < oldLegs.length && currentToId !== toId; i++) {
    if (oldLegs[i].fromControlId !== currentToId) return null; // gap in chain
    // Append path, skipping the first node (it's the shared control)
    mergedPath.push(...oldLegs[i].path.slice(1));
    currentToId = oldLegs[i].toControlId;
  }

  if (currentToId === toId) {
    return mergedPath;
  }

  return null;
}

export default function RouteBuilder() {
  const { selectedEvent, updateEvent, pdfBlobUrl, runningSpeed } = useAppData();
  const [selectedRoute, setSelectedRoute] = useState<CustomRoute | null>(null);
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showBackgroundMap, setShowBackgroundMap] = useState(true);
  const [isMapMuted, setIsMapMuted] = useState(false);
  const [mapScale, setMapScale] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"map" | "3d">("map");
  const [hideUpperLevels, setHideUpperLevels] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [frameAllTrigger, setFrameAllTrigger] = useState(false);

  // New route dialog state
  const [showNewRouteDialog, setShowNewRouteDialog] = useState(false);

  // Video export state
  const [showVideoExportDialog, setShowVideoExportDialog] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbortControllerRef = useRef<AbortController | null>(null);

  const mapViewerRef = useRef<RouteBuilderMapViewerHandle>(null);
  const modelRef = useRef<RouteAnalysisModelViewerHandle>(null);

  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedRoute?.courseId ?? null);
  const raceCourse = selectedEvent?.raceCourses?.[0];
  const routes = useMemo(() => raceCourse?.customRoutes || [], [raceCourse?.customRoutes]);
  // Keep the selected route in step with the event (e.g. after undo): refresh it, or clear it when gone
  useEffect(() => {
    if (!selectedRoute) return;
    const current = routes.find((r) => r.id === selectedRoute.id);
    if (!current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing selection with event data
      setSelectedRoute(null);
      setSelectedLegIndex(null);
    } else if (current !== selectedRoute) {
      setSelectedRoute(current);
    }
  }, [routes, selectedRoute]);
  const nodes = useMemo(() => raceCourse?.vertices || [], [raceCourse?.vertices]);
  const edges = useMemo(() => raceCourse?.edges || [], [raceCourse?.edges]);
  const controls = useMemo(() => raceCourse?.controls || [], [raceCourse?.controls]);
  const courses = useMemo(() => raceCourse?.courses || [], [raceCourse?.courses]);
  const polygons = useMemo(() => raceCourse?.polygons || [], [raceCourse?.polygons]);

  const { pdfUrl } = usePdfUrl(activeMap, pdfBlobUrl);

  // Playback hook
  const playback = usePlayback({
    defaultSpeed: 4,
    defaultFollow: true,
    resetDeps: [selectedLegIndex, selectedRoute?.id],
    spacebarEnabled: selectedRoute !== null && selectedLegIndex !== null,
  });

  // Handle playback completion
  const handlePlaybackComplete = useCallback(() => {
    setTimeout(() => {
      playback.setIsPlaying(false);
    }, 0);
  }, [playback]);

  // Initialize RouteAnalyzer
  const routeAnalyzer = useEventRouteAnalyzer(selectedEvent, { courseId: selectedRoute?.courseId ?? null });

  // Calculate leg time based on timing points and remaining distance
  const calculateLegTime = useCallback((leg: RouteLeg, routeAnalyzer: RouteAnalyzer | null): number => {
    const SPEED = 5; // m/s
    const timingPoints = leg.path.slice(1, -1); // Exclude from/to controls
    
    if (timingPoints.length === 0) {
      // No timing points - calculate time based on total distance
      const totalDistance = routeAnalyzer?.calculatePathDistanceThroughGraph(leg.path.map(n => n.nodeId)) ?? 0;
      return totalDistance / SPEED;
    }
    
    // Get time at last timing point
    const lastTimingPoint = timingPoints[timingPoints.length - 1];
    const timeAtLastPoint = lastTimingPoint.legTime ?? 0;
    
    // Calculate remaining distance from last timing point to end control
    let remainingDistance = 0;
    if (routeAnalyzer) {
      const lastPointIndex = leg.path.findIndex(n => n.nodeId === lastTimingPoint.nodeId);
      if (lastPointIndex >= 0 && lastPointIndex < leg.path.length - 1) {
        // Get path from last timing point to end
        const remainingPath = leg.path.slice(lastPointIndex).map(n => n.nodeId);
        remainingDistance = routeAnalyzer.calculatePathDistanceThroughGraph(remainingPath);
      }
    }
    
    return timeAtLastPoint + (remainingDistance / SPEED);
  }, []);

  // Update map scale when map changes
  useEffect(() => {
    if (activeMap?.scale) {
      setMapScale(activeMap.scale);
    }
  }, [activeMap]);

  // Get the selected course
  const selectedCourse = selectedRoute
    ? courses.find((c) => c.id === selectedRoute.courseId)
    : null;

  // Calculate leg analysis
  const legAnalysis = selectedRoute && selectedCourse && routeAnalyzer
    ? selectedRoute.legs.map((leg, index) => {
        const course = selectedCourse;
        // Use filtered controls (intermediate start controls removed) for display names
        const filteredControls = getActualCourseControls(course.controls, controls);
        const courseFromControl = filteredControls[index];
        const courseToControl = filteredControls[index + 1];
        
        // Use ID for start/finish controls, otherwise use mapText (number) or fallback to index
        const getControlDisplayName = (courseControl: typeof courseFromControl, allControls: typeof controls, fallbackIndex: number) => {
          if (!courseControl) return "?";
          
          const control = allControls.find(c => c.id === courseControl.controlId);
          if (control && (control.type === "start" || control.type === "finish")) {
            return control.id;
          }
          
          return courseControl.mapText || String(fallbackIndex);
        };
        
        const fromText = getControlDisplayName(courseFromControl, controls, index);
        const toText = getControlDisplayName(courseToControl, controls, index + 1);
        
        const legName = `${fromText}-${toText}`;

        // Calculate route length using shortest path through the graph between waypoints
        const routeLength = leg.path.length > 1
          ? routeAnalyzer.calculatePathDistanceThroughGraph(leg.path.map(n => n.nodeId))
          : 0;

        // Find the actual control objects
        const fromControl = controls.find(c => c.id === leg.fromControlId);
        const toControl = controls.find(c => c.id === leg.toControlId);

        // Calculate optimal route length
        const optimalRoute = fromControl && toControl
          ? routeAnalyzer.findShortestPathBetweenControls(fromControl, toControl)
          : null;
        const optimalLength = optimalRoute?.distance ?? 0;

        const routeLengthDiff = routeLength - optimalLength;
        const routeTime = calculateLegTime(leg, routeAnalyzer);
        
        // Calculate optimal time based on optimal distance
        const optimalTime = optimalLength / 5; // 5 m/s constant speed
        const routeTimeDiff = routeTime - optimalTime;

        // Calculate difficulty of the shortest route for this leg
        const difficulty = optimalRoute
          ? routeAnalyzer.calculatePathDifficulty(optimalRoute.path)
          : 0;

        return {
          legName,
          from: fromText,
          to: toText,
          routeLength,
          routeLengthDiff,
          routeTime,
          routeTimeDiff,
          difficulty,
        };
      })
    : [];

  // Calculate totals
  const totals = legAnalysis.reduce(
    (acc, leg) => ({
      totalLength: acc.totalLength + leg.routeLength,
      totalLengthDiff: acc.totalLengthDiff + leg.routeLengthDiff,
      totalTime: acc.totalTime + leg.routeTime,
      totalTimeDiff: acc.totalTimeDiff + leg.routeTimeDiff,
    }),
    { totalLength: 0, totalLengthDiff: 0, totalTime: 0, totalTimeDiff: 0 }
  );

  // Open new route dialog
  const handleNewRoute = useCallback(() => {
    if (!selectedEvent || !raceCourse || courses.length === 0) {
      notify("Please select an event and create at least one course first.");
      return;
    }
    setShowNewRouteDialog(true);
  }, [selectedEvent, raceCourse, courses]);

  // Create route after dialog confirmation
  const handleCreateRoute = useCallback((name: string, courseId: string) => {
    if (!selectedEvent || !raceCourse) return;

    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    const newRoute: CustomRoute = {
      id: `route-${Date.now()}`,
      name,
      courseId: course.id,
      legs: [],
      timestamp: new Date().toISOString(),
    };

    // Initialize legs for the course (skip intermediate start controls)
    const filteredControls = getActualCourseControls(course.controls, controls);
    for (let i = 0; i < filteredControls.length - 1; i++) {
      const fromControl = filteredControls[i];
      const toControl = filteredControls[i + 1];

      newRoute.legs.push({
        fromControlId: fromControl.controlId,
        toControlId: toControl.controlId,
        path: [
          { nodeId: fromControl.controlId },
          { nodeId: toControl.controlId }
        ],
      });
    }

    // Save the new route
    // Applied to the latest routes, so edits made meanwhile are kept
    updateEvent(selectedEvent.id, (e) =>
      updateRaceCourse(e, (rc) => {
        const latest = rc.customRoutes ?? [];
        return { ...rc, customRoutes: [...latest, newRoute] };
      }),
      undefined,
      { label: "New route" },
    );

    setSelectedRoute(newRoute);
    setSelectedLegIndex(null);
  }, [selectedEvent, raceCourse, courses, routes, controls, updateEvent]);

  // Handle duplicate route
  const handleDuplicateRoute = useCallback((route: CustomRoute) => {
    if (!selectedEvent || !raceCourse) return;

    const duplicatedRoute: CustomRoute = {
      ...route,
      id: `route-${Date.now()}`,
      name: `${route.name} (copy)`,
      timestamp: new Date().toISOString(),
      legs: route.legs.map(leg => ({ ...leg })),
    };

    // Applied to the latest routes, so edits made meanwhile are kept
    updateEvent(selectedEvent.id, (e) =>
      updateRaceCourse(e, (rc) => {
        const latest = rc.customRoutes ?? [];
        return { ...rc, customRoutes: [...latest, duplicatedRoute] };
      }),
      undefined,
      { label: "Duplicate route" },
    );

    setSelectedRoute(duplicatedRoute);
  }, [selectedEvent, raceCourse, routes, updateEvent]);

  // Handle delete route
  const handleDeleteRoute = useCallback(async (routeId: string) => {
    if (!selectedEvent || !raceCourse) return;

    if (!(await confirmAction("Delete this route? You can undo this with Ctrl/Cmd+Z.", { title: "Delete route", confirmLabel: "Delete", destructive: true }))) return;

    // Applied to the latest routes, so edits made meanwhile are kept
    updateEvent(selectedEvent.id, (e) =>
      updateRaceCourse(e, (rc) => {
        const latest = rc.customRoutes ?? [];
        return { ...rc, customRoutes: latest.filter((r) => r.id !== routeId) };
      }),
      undefined,
      { label: "Delete route" },
    );
    
    if (selectedRoute?.id === routeId) {
      setSelectedRoute(null);
      setSelectedLegIndex(null);
    }
  }, [selectedEvent, raceCourse, routes, updateEvent, selectedRoute]);

  // Handle route change
  const handleRouteChange = useCallback((updatedRoute: CustomRoute) => {
    if (!selectedEvent || !raceCourse) return;

    // Update local state immediately to reflect changes in UI
    setSelectedRoute(updatedRoute);

    // Update the route in the list (global state)
    // Applied to the latest routes, so edits made meanwhile are kept
    updateEvent(selectedEvent.id, (e) =>
      updateRaceCourse(e, (rc) => {
        const latest = rc.customRoutes ?? [];
        return { ...rc, customRoutes: latest.map((r) => (r.id === updatedRoute.id ? updatedRoute : r)) };
      }),
      undefined,
      { label: "Edit route" },
    );
  }, [selectedEvent, raceCourse, routes, updateEvent]);

  // Update course controls for an existing route, preserving timing points
  const handleUpdateCourseForRoute = useCallback((route: CustomRoute) => {
    if (!selectedEvent || !raceCourse) return;

    const course = courses.find(c => c.id === route.courseId);
    if (!course) return;

    const filteredControls = getActualCourseControls(course.controls, controls);

    // Build a lookup from old legs keyed by "fromControlId->toControlId"
    const oldLegMap = new Map<string, RouteLeg>();
    for (const leg of route.legs) {
      oldLegMap.set(`${leg.fromControlId}->${leg.toControlId}`, leg);
    }

    const newLegs: RouteLeg[] = [];
    for (let i = 0; i < filteredControls.length - 1; i++) {
      const fromId = filteredControls[i].controlId;
      const toId = filteredControls[i + 1].controlId;
      const key = `${fromId}->${toId}`;

      if (oldLegMap.has(key)) {
        // Exact leg match — keep the existing leg with all timing points
        newLegs.push(oldLegMap.get(key)!);
      } else {
        // This is a combined leg (e.g. A→B replacing A→S + S→B).
        // Try to find consecutive old legs that together span from fromId to toId,
        // and merge their timing points.
        const mergedPath = tryMergeOldLegs(fromId, toId, route.legs);
        if (mergedPath) {
          newLegs.push({
            fromControlId: fromId,
            toControlId: toId,
            path: mergedPath,
          });
        } else {
          // Fallback: create a fresh leg with no timing points
          newLegs.push({
            fromControlId: fromId,
            toControlId: toId,
            path: [
              { nodeId: fromId },
              { nodeId: toId },
            ],
          });
        }
      }
    }

    const updatedRoute: CustomRoute = {
      ...route,
      legs: newLegs,
      timestamp: new Date().toISOString(),
    };

    handleRouteChange(updatedRoute);
    setSelectedLegIndex(null);
  }, [selectedEvent, raceCourse, courses, controls, handleRouteChange]);

  // Handle waypoint click - add the clicked node to the custom route at the correct position
  const handleWaypointClick = useCallback((nodeId: string) => {
    if (!selectedRoute || selectedLegIndex === null) return;

    const leg = selectedRoute.legs[selectedLegIndex];
    if (!leg) return;

    // Check if this node is already in the custom nodes list (timing points between from/to controls)
    const customNodes = leg.path.slice(1, -1);
    if (customNodes.some(n => n.nodeId === nodeId)) {
      // Node already exists, just select it to show properties
      setSelectedNodeId(nodeId);
      return;
    }
    
    // Don't add the from control as a timing point
    if (nodeId === leg.fromControlId) {
      return;
    }

    // Always add new timing points at the end of the existing timing points (before the destination control)
    const waypoints = leg.path.map(n => n.nodeId);
    const bestInsertIndex = leg.path.length - 1; 

    // Calculate interpolated time for the new node based on distance along the route
    // Assume constant speed (5 m/s)
    const SPEED = 5; // m/s
    let distanceToNewNode = 0;
    
    if (routeAnalyzer) {
      const newWaypoints = [
        ...waypoints.slice(0, bestInsertIndex),
        nodeId,
        ...waypoints.slice(bestInsertIndex)
      ];
      
      // Calculate distance from start to the new node
      for (let i = 0; i < bestInsertIndex; i++) {
        const pathResult = routeAnalyzer.dijkstra(newWaypoints[i], newWaypoints[i + 1]);
        if (pathResult && pathResult.distance < Infinity) {
          distanceToNewNode += pathResult.distance;
        }
      }
    }
    
    const interpolatedTime = distanceToNewNode / SPEED;

    // Insert the new node at the best position with interpolated time
    const newPath = [
      ...leg.path.slice(0, bestInsertIndex),
      { nodeId, legTime: interpolatedTime },
      ...leg.path.slice(bestInsertIndex)
    ];
    
    const updatedLeg = { ...leg, path: newPath };
    const updatedLegs = [...selectedRoute.legs];
    updatedLegs[selectedLegIndex] = updatedLeg;
    handleRouteChange({ ...selectedRoute, legs: updatedLegs });
    
    // Select the node to show its properties
    setSelectedNodeId(nodeId);
  }, [selectedRoute, selectedLegIndex, handleRouteChange, routeAnalyzer]);

  const handleNavigateToNode = useCallback((nodeId: string) => {
    mapViewerRef.current?.flyToNode(nodeId);
  }, []);

  // Pan to leg when selected
  useEffect(() => {
    if (selectedLegIndex !== null) {
      // Small timeout to allow render to propogate new props to map viewer
      setTimeout(() => {
        mapViewerRef.current?.flyToLegStart();
      }, 50);
    }
  }, [selectedLegIndex]);

  // Handle backspace/delete/escape keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      // Escape to deselect node
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        return;
      }

      // Delete/Backspace only deletes the selected timing point
      if ((e.key === "Backspace" || e.key === "Delete") && selectedRoute && selectedLegIndex !== null && selectedNodeId) {
        const leg = selectedRoute.legs[selectedLegIndex];
        if (!leg) return;

        const nodeIndex = leg.path.findIndex(n => n.nodeId === selectedNodeId);
        
        // Check if it's not the first or last (which are controls)
        if (nodeIndex > 0 && nodeIndex < leg.path.length - 1) {
          const newPath = [...leg.path];
          newPath.splice(nodeIndex, 1);
          
          const updatedLeg = { ...leg, path: newPath };
          const updatedLegs = [...selectedRoute.legs];
          updatedLegs[selectedLegIndex] = updatedLeg;
          
          handleRouteChange({ ...selectedRoute, legs: updatedLegs });
          setSelectedNodeId(null); // Deselect after delete
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRoute, selectedLegIndex, handleRouteChange, selectedNodeId]);

  // Handle node time update
  const handleNodeTimeChange = useCallback((nodeId: string, time: number) => {
    if (!selectedRoute || selectedLegIndex === null) return;

    const leg = selectedRoute.legs[selectedLegIndex];
    if (!leg) return;

    // Update the legTime for the specific node
    const updatedPath = leg.path.map(node => 
      node.nodeId === nodeId ? { ...node, legTime: time } : node
    );

    const updatedLeg = {
      ...leg,
      path: updatedPath,
    };
    
    const updatedLegs = [...selectedRoute.legs];
    updatedLegs[selectedLegIndex] = updatedLeg;
    handleRouteChange({ ...selectedRoute, legs: updatedLegs });
  }, [selectedRoute, selectedLegIndex, handleRouteChange]);

  // Handle delete timing point
  const handleDeleteTimingPoint = useCallback((nodeId: string) => {
    if (!selectedRoute || selectedLegIndex === null) return;

    const leg = selectedRoute.legs[selectedLegIndex];
    if (!leg) return;

    const nodeIndex = leg.path.findIndex(n => n.nodeId === nodeId);
    
    // Check if it's not the first or last (which are controls)
    if (nodeIndex > 0 && nodeIndex < leg.path.length - 1) {
      const newPath = [...leg.path];
      newPath.splice(nodeIndex, 1);
      
      const updatedLeg = { ...leg, path: newPath };
      const updatedLegs = [...selectedRoute.legs];
      updatedLegs[selectedLegIndex] = updatedLeg;
      
      handleRouteChange({ ...selectedRoute, legs: updatedLegs });
      
      // If the deleted node was selected, deselect it
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    }
  }, [selectedRoute, selectedLegIndex, handleRouteChange, selectedNodeId]);

  // Get waypoint nodes and route path for selected leg
  const selectedLeg = selectedRoute && selectedLegIndex !== null
    ? selectedRoute.legs[selectedLegIndex]
    : null;

  // Include all timing points (nodes between from/to, plus toControl if it has a legTime set)
  const waypointNodes = selectedLeg ? selectedLeg.path.slice(1).filter(n => n.legTime !== undefined).map(n => n.nodeId) : [];
  
  // Calculate the full route path using shortest paths between consecutive waypoints
  const calculateFullRoutePath = (leg: RouteLeg | null): string[] => {
    if (!leg || !routeAnalyzer) return [];
    
    const waypoints = leg.path.map(n => n.nodeId);
    if (waypoints.length < 2) return waypoints;
    
    const fullPath: string[] = [];
    
    // For each consecutive pair of waypoints, calculate shortest path
    for (let i = 0; i < waypoints.length - 1; i++) {
      const fromNodeId = waypoints[i];
      const toNodeId = waypoints[i + 1];
      
      // Get shortest path between these two waypoints
      const pathResult = routeAnalyzer.dijkstra(fromNodeId, toNodeId);
      
      if (pathResult && pathResult.path.length > 0) {
        // Add nodes from the path, avoiding duplicates
        if (i === 0) {
          // For the first segment, add all nodes
          fullPath.push(...pathResult.path);
        } else {
          // For subsequent segments, skip the first node (already added as last node of previous segment)
          fullPath.push(...pathResult.path.slice(1));
        }
      } else {
        // Fallback: if no path found, add the from node directly
        if (i === 0) {
          fullPath.push(fromNodeId);
        }
        // For the last segment, ensure we add the destination
        if (i === waypoints.length - 2) {
          fullPath.push(toNodeId);
        }
      }
    }
    
    return fullPath;
  };
  
  const routePath = calculateFullRoutePath(selectedLeg);
  const fromControlId = selectedLeg ? selectedLeg.fromControlId : null;
  const toControlId = selectedLeg ? selectedLeg.toControlId : null;

  // Compute route description for the selected leg (concatenated edge labels along expanded path)
  const selectedLegRouteDescription = useMemo(() => {
    if (routePath.length < 2) return "";
    const labels: string[] = [];
    for (let i = 0; i < routePath.length - 1; i++) {
      const u = routePath[i];
      const v = routePath[i + 1];
      const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
      if (edge) {
        const label = (edge.from === u) ? edge.label : (edge.reverseLabel ?? edge.label);
        if (label) labels.push(label);
      }
    }
    return labels.join("");
  }, [routePath, edges]);

  // Build a timing schedule: maps cumulative real-world distance (meters) to time (seconds)
  // at each timing point. Used by the map viewer for piecewise speed interpolation.
  const timingSchedule = useMemo(() => {
    if (!selectedLeg || !routeAnalyzer || routePath.length < 2) return undefined;

    // Collect timing points from the leg path (nodes that have legTime set)
    const timingPoints = selectedLeg.path.filter(n => n.legTime !== undefined);
    if (timingPoints.length === 0) return undefined;

    // Build a map of cumulative distance along routePath for each node
    const nodeDistMap = new Map<string, number>();
    let cumulDist = 0;
    nodeDistMap.set(routePath[0], 0);
    for (let i = 0; i < routePath.length - 1; i++) {
      const dist = routeAnalyzer.calculatePathDistance([routePath[i], routePath[i + 1]]);
      cumulDist += dist;
      nodeDistMap.set(routePath[i + 1], cumulDist);
    }

    // Build schedule entries: [{distMeters, timeSec}]
    // Start at (0, 0)
    const schedule: { distMeters: number; timeSec: number }[] = [{ distMeters: 0, timeSec: 0 }];

    for (const tp of timingPoints) {
      const d = nodeDistMap.get(tp.nodeId);
      if (d !== undefined && tp.legTime !== undefined) {
        schedule.push({ distMeters: d, timeSec: tp.legTime });
      }
    }

    // Add end point: total distance, with time extrapolated from last timing point
    const totalDist = cumulDist;
    const lastTp = schedule[schedule.length - 1];
    const remainingDist = totalDist - lastTp.distMeters;
    const speed = runningSpeed > 0 ? runningSpeed : 3;
    const endTime = lastTp.timeSec + (remainingDist / speed);
    schedule.push({ distMeters: totalDist, timeSec: endTime });

    return schedule;
  }, [selectedLeg, routeAnalyzer, routePath, runningSpeed]);

  // Calculate labels for map viewer
  const selectedLegData = selectedLegIndex !== null ? legAnalysis[selectedLegIndex] : null;
  const fromControl = controls.find(c => c.id === fromControlId);
  const toControl = controls.find(c => c.id === toControlId);
  
  // Don't show labels for start/finish controls (ControlRenderer handles symbols)
  const isStartOrFinish = (c: typeof fromControl) => c?.type === 'start' || c?.type === 'finish';
  const fromControlLabel = isStartOrFinish(fromControl) ? undefined : selectedLegData?.from;
  const toControlLabel = isStartOrFinish(toControl) ? undefined : selectedLegData?.to;

  const handleExportGpx = useCallback((route: CustomRoute) => {
    if (!selectedEvent) return;
    
    // Generate GPX content
    const gpxContent = GpxGenerator.generateGpx(route, selectedEvent);
    
    // Download file
    const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${route.name || "route"}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedEvent]);

  // Derived state for export naming
  const courseName = useMemo(() => {
    return selectedCourse?.name;
  }, [selectedCourse]);

  const legName = useMemo(() => {
    if (!selectedRoute || !selectedCourse || selectedLegIndex === null) return null;
    const filteredCC = getActualCourseControls(selectedCourse.controls, controls);
    const courseLabels = getCourseControlLabels(filteredCC, controls);
    if (selectedLegIndex >= 0 && selectedLegIndex < filteredCC.length - 1) {
      return `${courseLabels[selectedLegIndex]} → ${courseLabels[selectedLegIndex + 1]}`;
    }
    return null;
  }, [selectedRoute, selectedCourse, selectedLegIndex, controls]);

  // Calculate current playback duration for timer
  const currentDuration = useMemo(() => {
    if (!selectedRoute || selectedLegIndex === null) return 0;
    const leg = selectedRoute.legs[selectedLegIndex];
    if (!leg || !routeAnalyzer) return 0;

    // If we have a timing schedule, use its end time
    if (timingSchedule && timingSchedule.length > 0) {
      return timingSchedule[timingSchedule.length - 1].timeSec;
    }

    // Fallback: constant speed
    const distance = routeAnalyzer.calculatePathDistanceThroughGraph(leg.path.map(n => n.nodeId));
    const speed = runningSpeed > 0 ? runningSpeed : 3;
    return distance / speed;
  }, [selectedRoute, selectedLegIndex, routeAnalyzer, runningSpeed, timingSchedule]);

  // Video export handler
  const handleCancelExport = useCallback(() => {
    if (exportAbortControllerRef.current) {
      exportAbortControllerRef.current.abort();
    }
  }, []);

  const handleExportVideo = useCallback(async (settings: VideoExportSettings) => {
    setIsExportingVideo(true);
    setExportProgress(0);

    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;

    try {
      const filename = ExportNaming.getFilename({
        eventDate: selectedEvent?.startTime,
        eventName: selectedEvent?.name ?? null,
        courseName: courseName ?? null,
        legName: settings.scope === "all-legs" ? null : legName,
        routeName: selectedRoute?.name ?? null,
      });

      if (viewMode === "3d") {
        if (!modelRef.current?.exportVideo) {
          throw new Error("3D viewer not ready. Please ensure you are in 3D view.");
        }
        const lastDotIndex = filename.lastIndexOf('.');
        const videoFilename = lastDotIndex !== -1
          ? `${filename.slice(0, lastDotIndex)} (3D)${filename.slice(lastDotIndex)}`
          : `${filename} (3D)`;
        await modelRef.current.exportVideo(settings, (progress: number) => {
          setExportProgress(progress);
        }, videoFilename, abortController.signal);
      } else {
        if (!mapViewerRef.current?.exportVideo) {
          throw new Error("Map viewer not ready for video export.");
        }
        await mapViewerRef.current.exportVideo(settings, (progress: number) => {
          setExportProgress(progress);
        }, filename, false, abortController.signal);
      }

      if (!abortController.signal.aborted) {
        setShowVideoExportDialog(false);
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        console.log("Video export cancelled");
      } else {
        console.error("Video export error:", err);
        notify("Video export failed: " + (err instanceof Error ? err.message : String(err)), { kind: "error" });
      }
    } finally {
      setIsExportingVideo(false);
      exportAbortControllerRef.current = null;
    }
  }, [selectedEvent, courseName, legName, selectedRoute, viewMode]);

  const handleFrameAll = useCallback(() => {
    setFrameAllTrigger(true);
    setTimeout(() => setFrameAllTrigger(false), 100);
  }, []);

  // Build the selected course ID for the model viewer
  const selectedCourseId = selectedRoute?.courseId ?? null;

  // For 3D view, we need to map selectedLegIndex to the equivalent "leg index" that model-viewer expects
  // The model viewer expects selectedLeg as an index, and it uses course controls
  const selectedLegFor3D = selectedLegIndex;

  // Compute 3D route segments from the custom route path so the 3D viewer shows only this route
  const customRouteSegments = useMemo(() => {
    if (routePath.length < 2) return undefined;

    const ROUTE_COLOR = PRIMARY_ROUTE_COLOR;

    const getPoint = (id: string) => {
      const node = nodes.find(n => n.id === id);
      if (node) return { x: node.x, y: node.y };
      const control = controls.find(c => c.id === id);
      if (control?.mapPosition) return { x: control.mapPosition.x, y: control.mapPosition.y };
      return null;
    };

    // Determine start level from the first control
    let currentLevel = 0;
    const firstPt = getPoint(routePath[0]);
    if (firstPt && polygons.length > 0) {
      const poly = findPolygonForPoint(firstPt, polygons);
      if (poly?.level !== undefined) currentLevel = poly.level;
    }

    const allSegments: { points: { x: number; y: number; level?: number }[]; isIgnoreLength: boolean; isMapSegmentTransition: boolean; color: string }[] = [];
    let currentSegment: typeof allSegments[0] = { points: [], isIgnoreLength: false, isMapSegmentTransition: false, color: ROUTE_COLOR };

    if (firstPt) {
      currentSegment.points.push({ ...firstPt, level: currentLevel });
    }

    for (let i = 0; i < routePath.length - 1; i++) {
      const u = routePath[i];
      const v = routePath[i + 1];
      const p2 = getPoint(v);
      if (!p2) continue;

      const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
      const poly2 = findPolygonForPoint(p2, polygons);
      const nextLevel = poly2?.level ?? currentLevel;
      const isIgnoreLength = edge?.ignoreLength || false;

      if (isIgnoreLength !== currentSegment.isIgnoreLength) {
        if (currentSegment.points.length > 1) allSegments.push(currentSegment);
        const p1 = getPoint(u);
        currentSegment = {
          points: [
            p1 ? { ...p1, level: currentLevel } : { x: 0, y: 0, level: currentLevel },
            { ...p2, level: nextLevel },
          ],
          isIgnoreLength,
          isMapSegmentTransition: isIgnoreLength,
          color: ROUTE_COLOR,
        };
      } else {
        currentSegment.points.push({ ...p2, level: nextLevel });
      }
      currentLevel = nextLevel;
    }

    if (currentSegment.points.length > 1) allSegments.push(currentSegment);
    return allSegments.length > 0 ? allSegments : undefined;
  }, [routePath, nodes, controls, edges, polygons]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main View */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {viewMode === "map" ? (
          activeMap ? (
            <RouteBuilderMapViewer
              ref={mapViewerRef}
              map={activeMap}
              nodes={nodes}
              edges={edges}
              controls={controls}
              pdfUrl={pdfUrl}
              scale={mapScale}
              showBackgroundMap={showBackgroundMap}
              backgroundOpacity={isMapMuted ? 0.5 : 1}
              selectedLegIndex={selectedLegIndex}
              waypointNodes={waypointNodes}
              onWaypointClick={handleWaypointClick}
              routePath={routePath}
              fromControlId={fromControlId}
              toControlId={toControlId}
              fromControlLabel={fromControlLabel}
              toControlLabel={toControlLabel}
              selectedNodeId={selectedNodeId}
              showGraph={showEdges}
              isPlaying={playback.isPlaying}
              playReset={playback.playReset}
              followPlayback={playback.followPlayback}
              playbackSpeed={playback.playbackSpeed}
              onPlaybackComplete={handlePlaybackComplete}
              timingSchedule={timingSchedule}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              No map available. Please configure a map in Event → Map.
            </div>
          )
        ) : (
          <div className="flex-1 h-full bg-gray-900">
            <RouteAnalysisModelViewer
              ref={modelRef}
              pdfUrl={pdfUrl}
              scale={mapScale}
              isPlaying={playback.isPlaying}
              onFrameAllTrigger={frameAllTrigger}
              selectedCourseId={selectedCourseId}
              selectedLeg={selectedLegFor3D}
              selectedRoute={null}
              onPlaybackComplete={handlePlaybackComplete}
              showBackgroundMap={showBackgroundMap}
              backgroundOpacity={isMapMuted ? 0.5 : 1}
              showEdges={showEdges}
              hideUpperLevels={hideUpperLevels}
              followPlayback={playback.followPlayback}
              playbackSpeed={playback.playbackSpeed}
              customRouteSegments={customRouteSegments}
              timingSchedule={timingSchedule}
            />
          </div>
        )}
      </div>

      {/* Properties Panel */}
      <RouteBuilderPropertiesPanel
        edges={edges}
        selectedLegRouteDescription={selectedLegRouteDescription}
        showBackgroundMap={showBackgroundMap}
        onShowBackgroundMapChange={setShowBackgroundMap}
        isMapMuted={isMapMuted}
        onMuteChange={setIsMapMuted}
        selectedRoute={selectedRoute}
        onSelectRoute={setSelectedRoute}
        selectedLegIndex={selectedLegIndex}
        onSelectLeg={setSelectedLegIndex}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onNavigateToNode={handleNavigateToNode}
        onNodeTimeChange={handleNodeTimeChange}
        onDeleteTimingPoint={handleDeleteTimingPoint}
        onRouteChange={handleRouteChange}
        onNewRoute={handleNewRoute}
        onDuplicateRoute={handleDuplicateRoute}
        onDeleteRoute={handleDeleteRoute}
        onUpdateCourse={handleUpdateCourseForRoute}
        onExportGpx={handleExportGpx}
        onExportVideo={() => setShowVideoExportDialog(true)}
        legAnalysis={legAnalysis}
        totals={totals}
        // Playback props
        isPlaying={playback.isPlaying}
        playbackSpeed={playback.playbackSpeed}
        playReset={playback.playReset}
        followPlayback={playback.followPlayback}
        onTogglePlay={playback.togglePlay}
        onStopPlay={playback.stopPlay}
        onPlaybackSpeedChange={playback.setPlaybackSpeed}
        onFollowPlaybackChange={playback.setFollowPlayback}
        playbackDuration={currentDuration}
        // View mode props
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showEdges={showEdges}
        onShowEdgesChange={setShowEdges}
        hideUpperLevels={hideUpperLevels}
        onHideUpperLevelsChange={setHideUpperLevels}
        onFrameAll={viewMode === "3d" ? handleFrameAll : undefined}
      />

      <NewRouteDialog
        open={showNewRouteDialog}
        onOpenChange={setShowNewRouteDialog}
        courses={courses}
        defaultName={`New Route ${routes.length + 1}`}
        classAssignments={raceCourse?.classAssignments}
        onConfirm={handleCreateRoute}
      />

      <VideoExportDialog
        open={showVideoExportDialog}
        onOpenChange={(open) => {
          if (!isExportingVideo) setShowVideoExportDialog(open);
        }}
        onExport={handleExportVideo}
        onCancel={handleCancelExport}
        isExporting={isExportingVideo}
        progress={exportProgress}
        initialMode={viewMode === "3d" ? "3d" : "2d"}
        courseName={courseName}
        legName={legName}
        routeName={selectedRoute?.name ?? null}
        hasSelectedRoute={selectedRoute !== null}
        hasSelectedLeg={selectedLegIndex !== null}
      />
    </div>
  );
}
