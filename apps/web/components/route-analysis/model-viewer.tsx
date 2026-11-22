"use client";

import React, { useMemo, useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { createEventRouteAnalyzer } from "@indoor-o-route-analysis/core";
import { findPolygonForPoint } from "@indoor-o-route-analysis/core";
import { getActualCourseControls } from "@indoor-o-route-analysis/core"; 
import { VideoExporter } from "@indoor-o-route-analysis/core/export";
import type { VideoExportSettings } from "@/components/shared/video-export-dialog";
import type { MapData } from "@indoor-o-route-analysis/core";
import { ROUTE_ANALYSIS_COLORS } from "@indoor-o-route-analysis/core";
import { mapToWorld, worldToVector3 } from "@indoor-o-route-analysis/core/3d";

// Import core 3D viewer
import Model3DViewer, { type Model3DViewerHandle } from "@/components/model-3d/viewer-3d";
// Import route-specific 3D elements
import { RouteVisualizer, PlaybackMarker, GraphVisualizer, type RouteSegment, type TimingScheduleEntry } from "./3d-elements";
import { Vector3, CatmullRomCurve3 } from "three";

interface RouteAnalysisModelViewerProps {
  pdfUrl: string | null;
  scale: number;
  isPlaying: boolean;
  onFrameAllTrigger?: boolean;
  selectedCourseId: string | null;
  selectedLeg: number | null;
  selectedRoute: number | null;
  onPlaybackComplete?: () => void;
  onPlaybackTimeUpdate?: (currentTime: number, totalTime: number) => void;
  showBackgroundMap?: boolean;
  backgroundOpacity?: number;
  showEdges?: boolean;
  hideUpperLevels?: boolean;
  followPlayback?: boolean;
  playbackSpeed?: number;
  playReset?: number;
  setRouteError?: (error: string | null) => void;
  /** Pre-computed route segments (used by route-builder to show a custom route) */
  customRouteSegments?: RouteSegment[];
  /** Timing schedule for piecewise speed interpolation (from route-builder timing points) */
  timingSchedule?: TimingScheduleEntry[];
}

export interface RouteAnalysisModelViewerHandle {
  exportVideo: (
    settings: VideoExportSettings,
    onProgress: (progress: number) => void,
    filename?: string,
    abortSignal?: AbortSignal
  ) => Promise<void>;
  setPlaybackTime: (time: number) => void;
}

const RouteAnalysisModelViewer = forwardRef<RouteAnalysisModelViewerHandle, RouteAnalysisModelViewerProps>(({
  pdfUrl,
  scale,
  isPlaying,
  onFrameAllTrigger,
  selectedCourseId,
  selectedLeg,
  selectedRoute,
  onPlaybackComplete,
  onPlaybackTimeUpdate,
  showBackgroundMap = true,
  backgroundOpacity = 1,
  showEdges = false,
  hideUpperLevels = false,
  followPlayback = false,
  playbackSpeed = 4,
  playReset,
  setRouteError,
  customRouteSegments,
  timingSchedule,
}, ref) => {
  const { selectedEvent, runningSpeed } = useAppData();
  const activeFloorRef = useRef<number>(-Infinity);
  
  // Ref to the 3D viewer to access canvas
  const viewerRef = useRef<Model3DViewerHandle>(null);
  
  // Shared state for synchronization between marker and trail
  const _playbackStateRef = useRef<{ distance: number }>({ distance: 0 });

  // State for manual time control during export and user seeking
  const [manualTime, setManualTime] = useState<number | null>(null);
  // Override timing schedule during export (e.g. when settings.duration adjusts the last segment)
  const [exportTimingScheduleOverride, setExportTimingScheduleOverride] = useState<TimingScheduleEntry[] | null>(null);

  // Track previous isPlaying to detect play transitions
  const prevIsPlayingRef = useRef(isPlaying);

  // When play starts after a seek, clear manualTime so animation resumes from seek position
  useEffect(() => {
    if (isPlaying && !prevIsPlayingRef.current && manualTime !== null) {
      setManualTime(null);
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, manualTime]);

  // Clear manualTime when playback is reset (stop button)
  useEffect(() => {
    setManualTime(null);
  }, [playReset]);

  // Effective timing schedule: use the export override when active, otherwise the prop
  const effectiveTimingSchedule = exportTimingScheduleOverride ?? timingSchedule;

  const polygons = useMemo(() => selectedEvent?.raceCourses?.[0]?.polygons || [], [selectedEvent]);

  const activeMapData = useMemo<MapData | undefined>(() => selectedEvent?.raceCourses?.[0]?.maps?.[0], [selectedEvent]);

  const routeData = useMemo(() => {
    let errorFound = false;

    const raceCourse = selectedEvent?.raceCourses?.[0];
    if (!selectedCourseId || !raceCourse?.courses || selectedLeg === null) return null;

    const course = raceCourse.courses.find((c) => c.id === selectedCourseId);
    if (!course || !course.controls) return null;

    // Use filtered controls (intermediate start controls removed) for leg indexing
    const allControls = raceCourse.controls || [];
    const filteredControls = getActualCourseControls(course.controls, allControls);
    if (selectedLeg >= filteredControls.length - 1) return null;

    const c1 = filteredControls[selectedLeg];
    const c2 = filteredControls[selectedLeg + 1];

    if (!c1.controlId || !c2.controlId) return null;

    const controls = raceCourse.controls || [];
    const nodes = raceCourse.vertices || [];
    const edges = raceCourse.edges || [];

    // Same analyzer setup as every other view (floor polygons, map scale, event scoring model)
    const routeAnalyzer = createEventRouteAnalyzer(selectedEvent, { courseId: selectedCourseId });
    const allRoutes = routeAnalyzer.findAlternativePathsBetweenControls(c1.controlId, c2.controlId);

    // Ensure sorted by distance (shortest first) to prioritize best routes during filtering
    allRoutes.sort((a, b) => a.distance - b.distance);

    // Filter to show only unique stair sequences (default behavior)
    const uniqueStairSequences = new Set<string>();
    const routes = allRoutes
      .filter((route) => {
        const stairSeq = routeAnalyzer.getStairSequence(route.path);
        if (uniqueStairSequences.has(stairSeq)) {
          return false;
        }
        uniqueStairSequences.add(stairSeq);
        return true;
      })
      .slice(0, 6);

    // Helper to get point
    const getPoint = (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (node) return { x: node.x, y: node.y };
      const control = controls.find((c) => c.id === id);
      if (control) {
        if (control.mapPosition) {
          return { x: control.mapPosition.x, y: control.mapPosition.y };
        }
        // TODO: report error?
        return null;
      }
      return null;
    };

    // Route colors - shared with MapViewer and PropertiesPanel via ROUTE_ANALYSIS_COLORS
    const ROUTE_COLORS = ROUTE_ANALYSIS_COLORS;

    // If a specific route is selected, show only that one. Otherwise show all.
    const routesToShow = selectedRoute !== null ? [routes[selectedRoute]] : routes;

    // Convert all routes to segments
    const allSegments: Array<{
      points: { x: number; y: number; level?: number }[];
      isIgnoreLength: boolean;
      isMapSegmentTransition: boolean;
      color: string;
    }> = [];

    // Find start level from start control
    const startControl = controls.find((c) => c.id === c1.controlId);
    let startLevel = 0;
    if (startControl && polygons.length > 0) {
      const polygon = findPolygonForPoint(startControl.mapPosition, polygons);
      startLevel = polygon?.level ?? 0;
    }

    routesToShow.forEach((routeInfo, idx) => {
      if (!routeInfo || !routeInfo.path) return;

      // Use original index for color consistency if we are filtering
      const colorIndex = selectedRoute !== null ? selectedRoute : idx;
      const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];

      let currentLevel = startLevel;

      let currentSegment: { points: { x: number; y: number; level?: number }[]; isIgnoreLength: boolean; isMapSegmentTransition: boolean; color: string } = {
        points: [],
        isIgnoreLength: false,
        isMapSegmentTransition: false,
        color,
      };

      // Helper to check polygon and mark error
      const checkPoint = (p: { x: number; y: number; level: number }) => {
        const poly = findPolygonForPoint(p, polygons);
        if (!poly) {
          errorFound = true;
        }
      };

      if (routeInfo.path.length > 0) {
        const p = getPoint(routeInfo.path[0]);
        if (p) {
          const pt = { ...p, level: currentLevel };
          checkPoint(pt);
          currentSegment.points.push(pt);
        }
      }

      for (let i = 0; i < routeInfo.path.length - 1; i++) {
        const u = routeInfo.path[i];
        const v = routeInfo.path[i + 1];

        const p1 = getPoint(u);
        const p2 = getPoint(v);

        if (!p1 || !p2) continue;

        // Check if edge has ignoreLength property
        const edge = edges.find((e) => (e.from === u && e.to === v) || (!e.oneWay && e.from === v && e.to === u));

        // Determine level from polygon - use p2's polygon to get next level
        let nextLevel = currentLevel;
        const poly2 = findPolygonForPoint(p2, polygons);
        if (poly2 && poly2.level !== undefined) {
          nextLevel = poly2.level;
        }

        const isIgnoreLength = edge?.ignoreLength || false;

        if (isIgnoreLength !== currentSegment.isIgnoreLength) {
          // Push current segment
          if (currentSegment.points.length > 1) {
            allSegments.push(currentSegment);
          }
          // Start new segment
          // Note: p1 should have level=currentLevel, p2 should have level=nextLevel
          const pt1 = { ...p1, level: currentLevel };
          const pt2 = { ...p2, level: nextLevel };

          if (!isIgnoreLength) {
            checkPoint(pt1);
            checkPoint(pt2);
          }

          currentSegment = {
            points: [pt1, pt2],
            isIgnoreLength: isIgnoreLength,
            isMapSegmentTransition: isIgnoreLength,
            color,
          };
        } else {
          // Continue segment
          const pt2 = { ...p2, level: nextLevel };
          if (!isIgnoreLength) {
            checkPoint(pt2);
          }
          currentSegment.points.push(pt2);
        }

        currentLevel = nextLevel;
      }

      if (currentSegment.points.length > 1) {
        allSegments.push(currentSegment);
      }
    });

    return { segments: errorFound ? [] : allSegments, error: errorFound };
  }, [selectedCourseId, selectedEvent, selectedLeg, selectedRoute, scale]);

  // Use custom segments if provided (route-builder), otherwise use computed route data
  const displayRouteSegments = customRouteSegments ?? routeData?.segments;
  const hasPolygonError = customRouteSegments ? false : (routeData?.error || false);

  useEffect(() => {
    if (setRouteError) {
      setRouteError(hasPolygonError ? "Cannot transform to 3D, missing polygon?" : null);
    }
  }, [hasPolygonError, setRouteError]);

  // Expose handle methods
  useImperativeHandle(ref, () => ({
    setPlaybackTime: (time: number) => {
      setManualTime(time);
    },
    exportVideo: async (settings, onProgress, filename, abortSignal) => {
      const { width, height, fps, bitrate } = settings;
      const canvas = viewerRef.current?.getCanvas();
      if (!canvas) {
        console.error("Canvas not available");
        // Try fallback to standard ref pattern if method fails
        return;
      }
      
      // Allow export even if segments are empty, though it will be just the model
      const segmentsToExport = displayRouteSegments || [];

      // 1. Calculate max duration of all routes dynamically to match playback
      // We borrow logic from PlaybackMarker to calculate exact duration
      let maxRouteDuration = 0;
      
      const routesByColor: Record<string, RouteSegment[]> = {};
      
      segmentsToExport.forEach(seg => {
        const key = seg.color || "default";
        if (!routesByColor[key]) routesByColor[key] = [];
        routesByColor[key].push(seg);
      });

      Object.values(routesByColor).forEach(segments => {
        let routeDist = 0;
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        segments.forEach((seg: any) => {
            if (seg.isIgnoreLength) return;
            // Use CatmullRomCurve3 to match the actual 3D curve lengths used by
            // SinglePlaybackMarker/RouteVisualizerGroup for totalRunnableLength
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const points3D = seg.points.map((p: any) => {
                const polygon = findPolygonForPoint(p, polygons);
                const level = p.level !== undefined ? p.level : (polygon?.level ?? 0);
                const z = polygon?.elevation ?? (level * 3.0);
                if (activeMapData) {
                    const wp = mapToWorld(p, polygon || { id: '', points: [], level, origin: { x: 0, y: 0 } }, activeMapData);
                    return worldToVector3({ ...wp, z });
                }
                // Fallback if no mapData
                const scaleFactor = scale / 1000;
                const origin = polygon?.origin || { x: 0, y: 0 };
                return new Vector3((p.x - origin.x) * scaleFactor, (p.y - origin.y) * scaleFactor, z);
            });
            if (points3D.length >= 2) {
                const curve = new CatmullRomCurve3(points3D);
                routeDist += curve.getLength();
            }
        });
        
        const d = routeDist / (runningSpeed * playbackSpeed);
        if (d > maxRouteDuration) maxRouteDuration = d;
      });
      
      let simulationDuration: number;
      let videoDuration: number;
      let exportTimingSchedule = timingSchedule;

      if (timingSchedule && timingSchedule.length >= 2) {
        // Use timing schedule for pacing
        if (settings.duration > 0) {
          // User specified video duration: adjust only the last segment's time
          const lastTimingPoint = timingSchedule[timingSchedule.length - 2];
          if (settings.duration > lastTimingPoint.timeSec) {
            exportTimingSchedule = timingSchedule.map((entry, i) =>
              i === timingSchedule.length - 1
                ? { ...entry, timeSec: settings.duration }
                : entry
            );
            simulationDuration = settings.duration;
          } else {
            simulationDuration = timingSchedule[timingSchedule.length - 1].timeSec;
          }
        } else {
          simulationDuration = timingSchedule[timingSchedule.length - 1].timeSec;
        }
        videoDuration = simulationDuration;
      } else {
        simulationDuration = maxRouteDuration > 0 ? maxRouteDuration : 10;
        videoDuration = settings.duration || simulationDuration;
      }

      // Save current size for restoration
      const originalSize = viewerRef.current?.getSize() || { width: 0, height: 0 };
      const originalRatio = viewerRef.current?.getPixelRatio() || 1;

      // Resize 3D renderer to match export settings
      if (viewerRef.current?.setSize) {
        viewerRef.current.setSize(width, height, false);
        viewerRef.current.setPixelRatio(1);
      }

      // 2. Setup Exporter
      const exporter = new VideoExporter({
        canvas,
        fps,
        width,
        height,
        bitrate,
        filename: filename || "indoor-o-route-3d.webm" 
      });

      await exporter.start();

      // 3. Render loop
      const totalFrames = Math.ceil(videoDuration * fps);
      // We step through simulation time
      const timeStep = simulationDuration / totalFrames;
      
          // Set the adjusted schedule for export (components will pick it up via effectiveTimingSchedule)
          if (exportTimingSchedule && exportTimingSchedule !== timingSchedule) {
            setExportTimingScheduleOverride(exportTimingSchedule);
          }

          setManualTime(0);

      try {
        // Give React a moment to render the initial state (time 0)
        await new Promise(r => setTimeout(r, 100));

        for (let i = 0; i < totalFrames; i++) {
            if (abortSignal?.aborted) {
                await exporter.cancel();
                throw new Error("Export cancelled");
            }

            const simTime = i * timeStep; // Time in seconds to pass to 3d-elements
            
            setManualTime(simTime); 
            
            // Force R3F to wake up and render the frame manually if needed, 
            // passing through the state update as well.
            if (viewerRef.current?.invalidate) {
                viewerRef.current.invalidate();
            }

            // Wait for React and Three to update
            await new Promise(r => setTimeout(r, 50)); 
            
            await exporter.addFrame();
            
            if (onProgress) {
                onProgress(i / totalFrames);
            }
        }

        await exporter.stop();
        if (onProgress) onProgress(1);

      } catch (err) {
        if (abortSignal?.aborted) {
             setManualTime(null);
             setExportTimingScheduleOverride(null);
             return;
        }
        throw err;
      } finally {
        setManualTime(null);
        setExportTimingScheduleOverride(null);
        // Restore original size
        if (viewerRef.current?.setSize && originalSize.width > 0) {
             viewerRef.current.setSize(originalSize.width, originalSize.height, false);
             viewerRef.current.setPixelRatio(originalRatio);
             viewerRef.current.invalidate();
        }
      }
    }
  }));

  // If background is muted (opacity < 1), force 0.5 opacity for 3D floors
  const activePolygonOpacity = backgroundOpacity < 1 ? 0.5 : 0.8;

  return (
    <Model3DViewer
      ref={viewerRef}
      pdfUrl={pdfUrl}
      scale={scale}
      polygonOpacity={activePolygonOpacity}
      showBackgroundMap={showBackgroundMap}
      onFrameAllTrigger={onFrameAllTrigger}
      maxVisibilityElevationRef={hideUpperLevels ? activeFloorRef : undefined}
    >
      {displayRouteSegments && displayRouteSegments.length > 0 && activeMapData && (
        <>
          <RouteVisualizer
            segments={displayRouteSegments}
            mapData={activeMapData}
            levelPolygons={polygons}
            isPlaying={isPlaying}
            manualTime={manualTime}
            playbackSpeed={playbackSpeed}
            baseSpeed={runningSpeed}
            timingSchedule={effectiveTimingSchedule}
          />
          <PlaybackMarker
            segments={displayRouteSegments}
            isPlaying={isPlaying}
            onPlaybackComplete={onPlaybackComplete}
            levelPolygons={polygons}
            mapData={activeMapData}
            hideUpperLevels={hideUpperLevels}
            activeElevationRef={activeFloorRef}
            followPlayback={followPlayback}
            playbackSpeed={playbackSpeed}
            baseSpeed={runningSpeed}
            manualTime={manualTime}
            timingSchedule={effectiveTimingSchedule}
            onTimeUpdate={onPlaybackTimeUpdate}
            playReset={playReset}
          />
        </>
      )}

      {showEdges &&
        activeMapData &&
        selectedEvent?.raceCourses?.[0]?.vertices &&
        selectedEvent.raceCourses?.[0]?.edges && (
        <GraphVisualizer
            nodes={selectedEvent.raceCourses[0].vertices}
            edges={selectedEvent.raceCourses[0].edges}
            levelPolygons={polygons}
            mapData={activeMapData}
        />
      )}
    </Model3DViewer>
  );
});

RouteAnalysisModelViewer.displayName = "RouteAnalysisModelViewer";

export default RouteAnalysisModelViewer;
