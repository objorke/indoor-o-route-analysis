"use client"

import { useState, useEffect, useMemo, useCallback, useRef, startTransition } from "react";
import dynamic from "next/dynamic";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap, getEventMapScale } from "@indoor-o-route-analysis/core";
import { usePdfUrl } from "@indoor-o-route-analysis/ui";
import type { MapData } from "@indoor-o-route-analysis/core";
import type { RouteInfo } from "@indoor-o-route-analysis/core";
import RouteAnalysisPropertiesPanel from "./properties-panel";
import { VideoExportDialog, type VideoExportSettings } from "@/components/shared/video-export-dialog";
import { ExportNaming, resolveLoadExampleParam, toLoadExampleParam } from "@indoor-o-route-analysis/core";
import { getCourseControlLabels, getActualCourseControls } from "@indoor-o-route-analysis/core";
import type { RouteAnalysisMapViewerHandle } from "./map-viewer";
import type { RouteAnalysisModelViewerHandle } from "./model-viewer";
import { notify } from "@indoor-o-route-analysis/ui";

const RouteAnalysisMapViewer = dynamic<{
  map?: MapData;
  pdfUrl: string | null;
  scale: number;
  selectedLeg: number | null;
  selectedCourseId: string | null;
  selectedRoute: number | null;
  showBackgroundMap: boolean;
  showEdges: boolean;
  showDecisionPoints: boolean;
  showBranchingPoints: boolean;
  isPlaying: boolean;
  playReset: number;
  followPlayback: boolean;
  onPlaybackComplete?: () => void;
  onPlaybackTimeUpdate?: (currentTime: number, totalTime: number) => void;
  findAllRoutes?: boolean;
  playbackSpeed?: number;
  runningSpeed?: number;
  precomputedRoutes?: RouteInfo[];
}>(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

const RouteAnalysisModelViewer = dynamic(() => import("./model-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

type RouteAnalysisProps = {
  exampleSourceUrls?: Record<string, string>;
  /** When this event is selected (an example was just opened), select the first leg once. */
  selectFirstLegForEventId?: string | null;
  onFirstLegSelected?: () => void;
};

export default function RouteAnalysis({ exampleSourceUrls, selectFirstLegForEventId, onFirstLegSelected }: RouteAnalysisProps) {
  const { selectedEvent, selectedCourseId, setSelectedCourseId, pdfBlobUrl, runningSpeed, eventFilenames } = useAppData();

  const [viewMode, setViewMode] = useState<"map" | "3d">("map");
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [showBackgroundMap, setShowBackgroundMap] = useState(true);
  const [isMapMuted, setIsMapMuted] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const [showDecisionPoints, setShowDecisionPoints] = useState(false);
  const [showBranchingPoints, setShowBranchingPoints] = useState(false);
  const [playReset, setPlayReset] = useState(0);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(4); // Default 4x speed
  const [findAllRoutes, setFindAllRoutes] = useState(false);
  const [hideUpperLevels, setHideUpperLevels] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [frameAllTrigger, setFrameAllTrigger] = useState(false);
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState(0);
  const [playbackTotalTime, setPlaybackTotalTime] = useState(0);

  const [analysisRoutes, setAnalysisRoutes] = useState<Record<number, RouteInfo[]>>({});

  const [showVideoExportDialog, setShowVideoExportDialog] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  
  const [isMapExporting, setIsMapExporting] = useState(false);
  const [mapExportProgress, setMapExportProgress] = useState(0);
  const mapExportAbortControllerRef = useRef<AbortController | null>(null);

  const mapRef = useRef<RouteAnalysisMapViewerHandle>(null);
  const modelRef = useRef<RouteAnalysisModelViewerHandle>(null);
  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const precomputedRoutes = selectedLeg !== null ? (analysisRoutes[selectedLeg] ?? undefined) : undefined;
  
  const { pdfUrl, isLoading: _isLoading } = usePdfUrl(activeMap, pdfBlobUrl);

  // Derived state for names
  const courseName = useMemo(() => {
    return selectedEvent?.raceCourses?.[0]?.courses?.find(c => c.id === selectedCourseId)?.name;
  }, [selectedEvent, selectedCourseId]);

  const legName = useMemo(() => {
    if (!selectedEvent || !selectedCourseId || selectedLeg === null) return null;
    const course = selectedEvent.raceCourses?.[0]?.courses?.find(c => c.id === selectedCourseId);
    if (!course?.controls) return null;
    
    const controls = selectedEvent.raceCourses?.[0]?.controls || [];
    // Use filtered controls (intermediate start controls removed) for leg indexing
    const filteredControls = getActualCourseControls(course.controls, controls);
    const courseLabels = getCourseControlLabels(filteredControls, controls);

    if (selectedLeg >= 0 && selectedLeg < filteredControls.length - 1) {
        return `${courseLabels[selectedLeg]} → ${courseLabels[selectedLeg + 1]}`;
    }
    return null;
  }, [selectedEvent, selectedCourseId, selectedLeg]);
  
  const routeName = selectedRoute !== null ? `Route ${selectedRoute + 1}` : null;

  // `?load-example=` value for share links: a filename for files in the default example
  // repository, otherwise the absolute URL the event was loaded from.
  const shareableExampleFile = useMemo(() => {
    const sourceUrl = exampleSourceUrls?.[selectedEvent?.id ?? ""];
    if (sourceUrl) return toLoadExampleParam(sourceUrl);
    // Fallback: the event's filename, assumed to exist in the default repository
    const filename = eventFilenames[selectedEvent?.id ?? ""];
    return filename && resolveLoadExampleParam(filename) ? filename : null;
  }, [exampleSourceUrls, eventFilenames, selectedEvent]);

  useEffect(() => {
    const handleExportRequest = () => setShowVideoExportDialog(true);
    window.addEventListener("route-analysis:export-video", handleExportRequest);
    return () => window.removeEventListener("route-analysis:export-video", handleExportRequest);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input elements are focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "Escape") {
        if (showVideoExportDialog) {
           setShowVideoExportDialog(false);
           return;
        }

        if (selectedRoute !== null) {
          setSelectedRoute(null);
        } else if (selectedLeg !== null) {
          setSelectedLeg(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showVideoExportDialog, selectedRoute, selectedLeg]);

  const handleExportMap = useCallback(async (signal?: AbortSignal) => {
    await mapRef.current?.exportImage?.(signal);
  }, []);

  const handleExportPdf = useCallback(async (signal?: AbortSignal) => {
    await mapRef.current?.exportPdf?.(signal);
  }, []);

  const handleExportAllLegs = useCallback(async (onProgress?: (p: number) => void, signal?: AbortSignal) => {
    await mapRef.current?.exportAllLegsPdf?.(onProgress, signal);
  }, []);

  const handleCancelMapExport = useCallback(() => {
    if (mapExportAbortControllerRef.current) {
        mapExportAbortControllerRef.current.abort();
    }
  }, []);

  const handleExportRequest = useCallback(async (format: "png" | "pdf", scope: "current-route" | "current-leg" | "all-legs") => {
    if (scope === "all-legs") {
      if (format === "pdf") {
          setIsMapExporting(true);
          setMapExportProgress(0);
          const abortController = new AbortController();
          mapExportAbortControllerRef.current = abortController;
          
          try {
               await handleExportAllLegs((p) => setMapExportProgress(p), abortController.signal);
          } catch (e) {
               if (abortController.signal.aborted) {
                   console.log("Export cancelled");
               } else {
                   console.error(e);
                   notify("Export failed: " + (e instanceof Error ? e.message : String(e)), { kind: "error" });
               }
          } finally {
               setIsMapExporting(false);
               mapExportAbortControllerRef.current = null;
          }
      }
      return;
    }

    // Handle "Current Leg" vs "Current Route" visibility
    // If user wants "Current Leg" but a specific route is selected, temporarily deselect it
    const needsRouteDeselect = scope === "current-leg" && selectedRoute !== null;
    const oldRoute = selectedRoute;

    if (needsRouteDeselect) {
      setSelectedRoute(null);
      // Allow time for map to re-render
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Create abort controller for single leg/route export
    const abortController = new AbortController();
    mapExportAbortControllerRef.current = abortController;

    // For single exports, we want to show the progress/loading state too
    setIsMapExporting(true);
    setMapExportProgress(0); // 0 means indeterminate or just started
    
    // Tiny delay to let the dialog render the "Exporting..." state before blocking the main thread
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      if (format === "png") {
        await handleExportMap(abortController.signal);
      } else {
        await handleExportPdf(abortController.signal);
      }
      // Fake progress completion
      setMapExportProgress(1);
      await new Promise(resolve => setTimeout(resolve, 500)); // Show 100% for a moment
    } catch (e) {
       if (abortController.signal.aborted) {
           console.log("Export cancelled");
       } else {
           console.error(e);
           notify("Export failed: " + (e instanceof Error ? e.message : String(e)), { kind: "error" });
       }
    } finally {
      setIsMapExporting(false);
      mapExportAbortControllerRef.current = null;
      
      if (needsRouteDeselect) {
        setSelectedRoute(oldRoute);
      }
    }
  }, [handleExportAllLegs, handleExportMap, handleExportPdf, selectedRoute]);

  const handleCancelExport = useCallback(() => {
    if (exportAbortControllerRef.current) {
        exportAbortControllerRef.current.abort();
    }
  }, []);

  const handleExportVideo = async (settings: VideoExportSettings) => {
    setIsExportingVideo(true);
    setExportProgress(0);
    
    // Create new abort controller
    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;

    // Handle "Current Leg" vs "Current Route" visibility
    // If user wants "Current Leg" but a specific route is selected, temporarily deselect it
    const originalRoute = selectedRoute;
    const needsRouteDeselect = settings.scope === "current-leg" && selectedRoute !== null;

    if (needsRouteDeselect) {
      setSelectedRoute(null);
      // Allow time for map to re-render
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // If user wants "Full Course", allow autoRoute behavior
    const isAutoRoute = settings.scope === "all-legs";

    try {
        const filename = ExportNaming.getFilename({
            eventDate: selectedEvent?.startTime,
            eventName: selectedEvent?.name ?? null,
            courseName: courseName ?? null,
            legName: isAutoRoute ? null : legName,
            routeName: (settings.scope === "current-leg" || isAutoRoute) ? null : routeName // If full course or current leg, don't put route name in filename
        });
        
        // const autoRoute = selectedLeg === null && selectedRoute === null; // OLD logic

        if (viewMode === '3d') {
             if (!modelRef.current?.exportVideo) {
                // If using dynamic import and ref is not yet attached?
                // Or maybe ref is not working properly
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
             if (!mapRef.current?.exportVideo) {
                 throw new Error("Map viewer not ready. Please ensure you are in 2D view.");
             }
             await mapRef.current?.exportVideo(settings, (progress: number) => {
                setExportProgress(progress);
             }, filename, isAutoRoute, abortController.signal);
        }

        if (!abortController.signal.aborted) {
           setShowVideoExportDialog(false);
        }
    } catch (err) {
        if (abortController.signal.aborted) {
             // Just reset UI
             console.log("Video export cancelled");
        } else {
             console.error("Video export error:", err);
             notify("Video export failed: " + (err instanceof Error ? err.message : String(err)), { kind: "error" });
        }
    } finally {
        setIsExportingVideo(false);
        exportAbortControllerRef.current = null;
        
        // Restore route selection if needed
        if (needsRouteDeselect) {
           setSelectedRoute(originalRoute);
        }
    }
  };

  const handleFrameAll = useCallback(() => {
    setFrameAllTrigger(true);
    setTimeout(() => setFrameAllTrigger(false), 100);
  }, []);

  // Calculate total legs count for auto-advance
  const totalLegs = useMemo(() => {
    const courses = selectedEvent?.raceCourses?.[0]?.courses;
    const allControls = selectedEvent?.raceCourses?.[0]?.controls || [];
    if (!selectedCourseId || !courses) return 0;
    const course = courses.find((c) => c.id === selectedCourseId);
    if (!course || !course.controls) return 0;
    const filteredControls = getActualCourseControls(course.controls, allControls);
    return Math.max(0, filteredControls.length - 1);
  }, [selectedCourseId, selectedEvent]);

  // Opening an example selects its first course (File menu / ?load-example=) and here its
  // first leg and that leg's first route
  useEffect(() => {
    if (!selectFirstLegForEventId || selectedEvent?.id !== selectFirstLegForEventId || !selectedCourseId) return;
    if (totalLegs > 0) {
      if (selectedLeg === 0) {
        setSelectedRoute(0);
      } else {
        // The leg-change effect below picks route 0 instead of clearing the route
        keepRouteOnAdvanceRef.current = true;
        setSelectedLeg(0);
      }
    } else {
      setSelectedLeg(null);
    }
    onFirstLegSelected?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on request; selectedLeg read, not tracked
  }, [selectFirstLegForEventId, selectedEvent?.id, selectedCourseId, totalLegs, onFirstLegSelected]);

  const handlePlaybackTimeUpdate = useCallback((currentTime: number, totalTime: number) => {
    startTransition(() => {
      setPlaybackCurrentTime(currentTime);
      setPlaybackTotalTime(totalTime);
    });
  }, []);

  const handlePlaybackTimeChange = useCallback((time: number) => {
    mapRef.current?.setPlaybackTime?.(time);
    modelRef.current?.setPlaybackTime?.(time);
    setPlaybackCurrentTime(time);
  }, []);

  // When auto-advancing with a route selected, keep a route selected on the next
  // leg (first route) instead of letting the leg-change effect clear it.
  const keepRouteOnAdvanceRef = useRef(false);

  // Handle playback completion - advance to the next leg and keep playing.
  const handlePlaybackComplete = useCallback(() => {
    // Use setTimeout to defer state update until after render completes
    setTimeout(() => {
      // Advance to the next leg and keep playing; stop at the last leg.
      if (autoAdvance && selectedLeg !== null && selectedLeg < totalLegs - 1) {
        // If a route was selected, select the first route on the next leg.
        keepRouteOnAdvanceRef.current = selectedRoute !== null;
        setSelectedLeg(selectedLeg + 1);
        // isPlaying stays true so playback continues on the next leg.
      } else {
        setIsPlaying(false);
      }
    }, 0);
  }, [autoAdvance, selectedLeg, selectedRoute, totalLegs]);

  // Map scale of the course's map (same source as every route analyzer)
  const mapScale = getEventMapScale(selectedEvent, selectedCourseId);

  // Reset selectedRoute when leg changes. When auto-advancing with a route
  // selected, keep the first route on the next leg instead of clearing it.
  // Don't stop playing on leg change (for auto-advance).
  useEffect(() => {
    if (keepRouteOnAdvanceRef.current) {
      keepRouteOnAdvanceRef.current = false;
      setSelectedRoute(0);
    } else {
      setSelectedRoute(null);
    }
  }, [selectedLeg]);

  // Reset analysis routes when course changes
  useEffect(() => {
    setAnalysisRoutes({});
  }, [selectedCourseId]);

  // Reset timer on explicit stop or when leg/course/route changes
  useEffect(() => {
    setPlayReset((n) => n + 1);
    setPlaybackCurrentTime(0);
  }, [selectedLeg, selectedRoute, selectedCourseId]);

  // Spacebar shortcut to toggle play
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return;
      }
      // Don't hijack Ctrl+Space (IME switch) or Alt+Space (Windows system menu).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space") {
        // Allow spacebar to toggle play when either a route or a leg is selected
        if (selectedRoute !== null || selectedLeg !== null) {
          e.preventDefault();
          setIsPlaying((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRoute, selectedLeg]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main View */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {viewMode === "map" ? (
          <RouteAnalysisMapViewer
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...{ref: mapRef} as any}
            map={activeMap}
            pdfUrl={pdfUrl}
            scale={mapScale}
            selectedLeg={selectedLeg}
            selectedCourseId={selectedCourseId}
            selectedRoute={selectedRoute}
            showBackgroundMap={showBackgroundMap}
            backgroundOpacity={isMapMuted ? 0.5 : 1}
            showEdges={showEdges}
            showDecisionPoints={showDecisionPoints}
            showBranchingPoints={showBranchingPoints}
            isPlaying={isPlaying}
            // Pass the playbackSpeed prop
            playbackSpeed={playbackSpeed}
            runningSpeed={runningSpeed}
            playReset={playReset}
            followPlayback={followPlayback}
            onPlaybackComplete={handlePlaybackComplete}
            onPlaybackTimeUpdate={handlePlaybackTimeUpdate}
            findAllRoutes={findAllRoutes}
            precomputedRoutes={precomputedRoutes}
          />
        ) : (
          <div className="flex-1 h-full bg-gray-900">
            <RouteAnalysisModelViewer
              ref={modelRef}
              pdfUrl={pdfUrl}
              scale={mapScale}
              isPlaying={isPlaying}
              onFrameAllTrigger={frameAllTrigger}
              selectedCourseId={selectedCourseId}
              selectedLeg={selectedLeg}
              selectedRoute={selectedRoute}
              onPlaybackComplete={handlePlaybackComplete}
              onPlaybackTimeUpdate={handlePlaybackTimeUpdate}
              showBackgroundMap={showBackgroundMap}
              backgroundOpacity={isMapMuted ? 0.5 : 1}
              showEdges={showEdges}
              hideUpperLevels={hideUpperLevels}
              followPlayback={followPlayback}
              playbackSpeed={playbackSpeed}
              playReset={playReset}
              setRouteError={setRouteError}
            />
          </div>
        )}
      </div>

      {/* Properties Panel */}
      <RouteAnalysisPropertiesPanel
        loadedExampleFile={shareableExampleFile}
        selectedLeg={selectedLeg}
        selectedCourseId={selectedCourseId}
        selectedRoute={selectedRoute}
        onLegSelect={setSelectedLeg}
        onCourseSelect={setSelectedCourseId}
        onRouteSelect={setSelectedRoute}
        showBackgroundMap={showBackgroundMap}
        isMapMuted={isMapMuted}
        onMuteChange={setIsMapMuted}
        onShowBackgroundMapChange={setShowBackgroundMap}
        showEdges={showEdges}
        onShowEdgesChange={setShowEdges}
        showDecisionPoints={showDecisionPoints}
        onShowDecisionPointsChange={setShowDecisionPoints}
        showBranchingPoints={showBranchingPoints}
        onShowBranchingPointsChange={setShowBranchingPoints}
        mapScale={mapScale}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        playReset={playReset}
        followPlayback={followPlayback}
        onFollowPlaybackChange={setFollowPlayback}
        autoAdvance={autoAdvance}
        onAutoAdvanceChange={setAutoAdvance}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStopPlay={() => {
          setIsPlaying(false);
          setPlayReset((x) => x + 1);
          setPlaybackCurrentTime(0);
        }}
        playbackCurrentTime={playbackCurrentTime}
        playbackTotalTime={playbackTotalTime}
        onPlaybackTimeChange={handlePlaybackTimeChange}
        onExportMap={handleExportMap}
        onExportPdf={handleExportPdf}
        onExportAllLegs={handleExportAllLegs}
        onExportVideo={() => setShowVideoExportDialog(true)}
        onExportRequest={handleExportRequest}
        isMapExporting={isMapExporting}
        mapExportProgress={mapExportProgress}
        onCancelMapExport={handleCancelMapExport}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        findAllRoutes={findAllRoutes}
        onFindAllRoutesChange={setFindAllRoutes}
        onAnalysisRoutesChange={setAnalysisRoutes}
        hideUpperLevels={hideUpperLevels}
        onHideUpperLevelsChange={setHideUpperLevels}
        routeError={routeError}
        onFrameAll={viewMode === "3d" ? handleFrameAll : undefined}
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
        initialMode={viewMode === '3d' ? '3d' : '2d'}
        courseName={courseName}
        legName={legName}
        routeName={routeName}
        hasSelectedRoute={selectedRoute !== null}
        hasSelectedLeg={selectedLeg !== null}
      />
    </div>
  );
}
