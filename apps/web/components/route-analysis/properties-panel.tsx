"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Menu,
  Info,
  Box,
  Maximize2,
  Tractor,
  Repeat,
  ArrowUpDown,
  Brain,
  Share2,
  Split,
  Waypoints,
  Rat,
} from "lucide-react";

import { useAppData, useEventRouteAnalyzer } from "@indoor-o-route-analysis/ui"
import { Button } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { PlaybackControls } from "@/components/shared/playback-controls";
import { ScoringModelSelect } from "@/components/shared";
import RouteAnalysisInfoDialog from "./info-dialog";
import { type RouteInfo, getDifficultyCategory, getCourseDifficulty, findTrapEasierRoute } from "@indoor-o-route-analysis/core";
import { ScoringModelRegistry } from "@indoor-o-route-analysis/core";
import { buildCourseReportHTML } from "./course-analysis-report";
import { DifficultyTag } from "./difficulty-tag";
import { TrainingExportDialog } from "./training-export-dialog";
import { MapExportDialog } from "./map-export-dialog";
import { ReportExportDialog } from "./report-export-dialog";
import AllCoursesAnalysisDialog from "./all-courses-analysis-dialog";
import ShareLinkDialog from "./share-link-dialog";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import { analyzeCourseLegsGenerator, type Leg } from "@indoor-o-route-analysis/core";
import { getRouteEnumerationAlgorithmInfo } from "@indoor-o-route-analysis/core";
import { DIFFICULTY_CATEGORIES } from "@indoor-o-route-analysis/core";
import { LegName } from "@/components/leg-name";
import { getCourseControlLabels, getActualCourseControls } from "@indoor-o-route-analysis/core";
import { CHART_BACKGROUND_OPACITY } from "@indoor-o-route-analysis/core";
import { ROUTE_ANALYSIS_COLORS as ROUTE_COLORS } from "@indoor-o-route-analysis/core";

interface RouteAnalysisPropertiesPanelProps {
  selectedLeg: number | null;
  selectedCourseId: string | null;
  selectedRoute: number | null;
  onLegSelect: (leg: number | null) => void;
  onCourseSelect: (courseId: string | null) => void;
  onRouteSelect: (route: number | null) => void;
  showBackgroundMap: boolean;
  onShowBackgroundMapChange: (show: boolean) => void;
  isMapMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
  showEdges: boolean;
  onShowEdgesChange: (show: boolean) => void;
  showDecisionPoints: boolean;
  onShowDecisionPointsChange: (show: boolean) => void;
  showBranchingPoints: boolean;
  onShowBranchingPointsChange: (show: boolean) => void;
  mapScale: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  playReset: number;
  followPlayback: boolean;
  onFollowPlaybackChange: (follow: boolean) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (autoAdvance: boolean) => void;
  onTogglePlay: () => void;
  onStopPlay: () => void;
  playbackCurrentTime?: number;
  playbackTotalTime?: number;
  onPlaybackTimeChange?: (time: number) => void;
  onExportMap: () => void;
  onExportPdf: () => void;
  onExportAllLegs: () => void;
  onExportVideo: () => void;
  onExportRequest?: (format: "png" | "pdf", scope: "current-route" | "current-leg" | "all-legs") => void;
  isMapExporting?: boolean;
  mapExportProgress?: number;
  onCancelMapExport?: () => void;
  viewMode?: "map" | "3d";
  onViewModeChange?: (mode: "map" | "3d") => void;
  findAllRoutes: boolean;
  onFindAllRoutesChange: (value: boolean) => void;
  hideUpperLevels?: boolean;
  onHideUpperLevelsChange?: (hide: boolean) => void;
  routeError?: string | null;
  onFrameAll?: () => void;
  onAnalysisRoutesChange?: (routes: Record<number, RouteInfo[]>) => void;
  loadedExampleFile?: string | null;
}

export default function RouteAnalysisPropertiesPanel({
  selectedLeg,
  selectedCourseId,
  selectedRoute,
  onLegSelect,
  onCourseSelect,
  onRouteSelect,
  showBackgroundMap,
  onShowBackgroundMapChange,
  isMapMuted = false,
  onMuteChange,
  showEdges,
  onShowEdgesChange,
  showDecisionPoints,
  onShowDecisionPointsChange,
  showBranchingPoints,
  onShowBranchingPointsChange,
  mapScale,
  isPlaying,
  playbackSpeed,
  onPlaybackSpeedChange,
  playReset,
  followPlayback,
  onFollowPlaybackChange,
  autoAdvance,
  onAutoAdvanceChange,
  onTogglePlay,
  onStopPlay,
  playbackCurrentTime = 0,
  playbackTotalTime = 0,
  onPlaybackTimeChange,
  onExportMap,
  onExportPdf,
  onExportAllLegs,
  onExportVideo,
  onExportRequest,
  isMapExporting = false,
  mapExportProgress = 0,
  onCancelMapExport,
  viewMode = "map",
  onViewModeChange,
  findAllRoutes,
  onFindAllRoutesChange,
  hideUpperLevels = false,
  onHideUpperLevelsChange,
  routeError,
  onFrameAll,
  onAnalysisRoutesChange,
  loadedExampleFile,
}: RouteAnalysisPropertiesPanelProps) {
  const { selectedEvent, updateEventData, runningSpeed, routeAnalysisK, routeEnumerationAlgorithm } = useAppData();
  // Metadata for the "Show all routes" algorithm picked in Settings → Analysis
  const enumerationAlgorithmInfo = getRouteEnumerationAlgorithmInfo(routeEnumerationAlgorithm);

  // Use runningSpeed from context, default to 3 m/s (approx 5:33 min/km) if not set
  const speed = runningSpeed > 0 ? runningSpeed : 3;

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showBatchAnalysis, setShowBatchAnalysis] = useState(false);
  const [showTrainingExportDialog, setShowTrainingExportDialog] = useState(false);
  const [showMapExportDialog, setShowMapExportDialog] = useState(false);
  const [showReportExportDialog, setShowReportExportDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareCopyStatus, setShareCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  // findAllRoutes state moved to parent

  // Get current scoring model
  const currentScoringModel = useMemo(() => {
    return ScoringModelRegistry.getModelOrDefault(selectedEvent?.difficultyScoringModel);
  }, [selectedEvent?.difficultyScoringModel]);

  // Available courses for selected event
  const courses = useMemo(() => {
    return selectedEvent?.raceCourses?.[0]?.courses || [];
  }, [selectedEvent]);

  // Class assignments for courses
  const classAssignments = useMemo(() => {
    return selectedEvent?.raceCourses?.[0]?.classAssignments || [];
  }, [selectedEvent]);

  // Helper to get assigned class names for a course
  const getAssignedClasses = (courseName: string) => {
    return classAssignments
      .filter((a) => a.courseName === courseName)
      .map((a) => a.className)
      .join(", ");
  };

  const selectedCourse = useMemo(() => {
    return courses.find((c) => c.id === selectedCourseId);
  }, [courses, selectedCourseId]);

  // Create RouteAnalyzer instance (shared setup: floor polygons, map scale, scoring model)
  const routeAnalyzer = useEventRouteAnalyzer(selectedEvent, { courseId: selectedCourseId, scoringModel: currentScoringModel });

  // State for async route analysis
  const [analysisState, setAnalysisState] = useState<{
    isLoading: boolean;
    progress: number;
    legs: Leg[];
    routes: Record<number, RouteInfo[]>;
  }>({
    isLoading: false,
    progress: 0,
    legs: [],
    routes: {},
  });

  // Effect to perform analysis
  useEffect(() => {
    if (!selectedCourse || !selectedEvent || !routeAnalyzer) {
      setAnalysisState({ isLoading: false, progress: 0, legs: [], routes: {} });
      return;
    }

    let isCancelled = false;

    const analyze = async () => {
      setAnalysisState((prev) => ({ ...prev, isLoading: true, progress: 0, legs: [], routes: {} }));

      try {
        const generator = analyzeCourseLegsGenerator(
          selectedCourse,
          selectedEvent,
          routeAnalyzer,
          findAllRoutes,
          routeAnalysisK,
          routeEnumerationAlgorithm,
        );

        for await (const update of generator) {
          if (isCancelled) break;

          setAnalysisState({
            isLoading: update.progress < 100,
            progress: update.progress,
            legs: update.legs,
            routes: update.routes,
          });
          onAnalysisRoutesChange?.(update.routes);
        }
      } catch (error) {
        console.error("Error during course analysis:", error);
        setAnalysisState({ isLoading: false, progress: 0, legs: [], routes: {} });
        onAnalysisRoutesChange?.({});
      }
    };

    analyze();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedCourse,
    selectedEvent,
    routeAnalyzer,
    findAllRoutes,
    routeAnalysisK,
    routeEnumerationAlgorithm,
    onAnalysisRoutesChange,
  ]);

  const legs = analysisState.legs;

  // Overall course difficulty
  const overallCourseDifficulty = useMemo(
    () => getCourseDifficulty(legs, currentScoringModel),
    [legs, currentScoringModel],
  );

  // Average course difficulty
  const averageCourseDifficulty = useMemo(() => {
    return currentScoringModel.getCourseAverageDifficulty(legs);
  }, [legs, currentScoringModel]);

  // Helper to get alternative routes for a leg
  // Uses cached routes from analysisState
  const getAlternativeRoutes = useCallback((leg: Leg): RouteInfo[] => {
    return analysisState.routes[leg.id] || [];
  }, [analysisState.routes]);

  // Calculate current playback duration
  const currentDuration = useMemo(() => {
    if (selectedLeg === null) {
      return 0;
    }

    // Find leg object
    const leg = legs.find((l) => l.id === selectedLeg);
    if (!leg) return 0;

    const alternatives = getAlternativeRoutes(leg);
    if (alternatives.length === 0) return 0;

    // If a specific route is selected, use that route's duration
    if (selectedRoute !== null) {
      const route = alternatives[selectedRoute];
      if (route) {
        return route.distance / speed;
      }
    }

    // Otherwise (if showing all routes for leg), use the longest route's duration
    // This ensures the timer runs until the last runner finishes
    const maxDist = Math.max(...alternatives.map((r) => r.distance));
    return maxDist / speed;
  }, [selectedLeg, selectedRoute, legs, speed, getAlternativeRoutes]);

  const sanitizeNamePart = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "-").trim();
  const getExportDateString = () => {
    const base = selectedEvent?.startTime?.date ?? Date.now();
    return new Date(base).toISOString().split("T")[0];
  };
  const buildCourseExportFilename = (extension: string, kind: "report" | "training") => {
    const eventDate = getExportDateString();
    const eventName = sanitizeNamePart(selectedEvent?.name || "event");
    const courseName = sanitizeNamePart(selectedCourse?.name || "course");
    const suffixMap = {
      report: " - course analysis",
      training: " - training",
    } as const;
    const suffix = suffixMap[kind];
    return `${eventDate} ${eventName} ${courseName}${suffix}.${extension}`;
  };


  // HTML export using separated CourseAnalysisReport builder
  const exportAsHTML = () => {
    if (!selectedCourse || !selectedEvent) return;
    const html = buildCourseReportHTML(
      selectedEvent,
      selectedCourse,
      legs,
      getAlternativeRoutes,
      currentScoringModel,
      runningSpeed,
    );
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildCourseExportFilename("html", "report");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export: GPX
  const exportGpx = async () => {
    if (!selectedCourse || !selectedEvent || !routeAnalyzer) return;

    // Determine what to export
    let routesToExport: RouteInfo[] = [];

    if (selectedLeg !== null) {
      // Export selected leg
      const leg = legs.find((l) => l.id === selectedLeg);
      if (leg) {
        const alts = getAlternativeRoutes(leg);
        if (alts.length > 0) {
          // If a specific route is selected, export that one. Otherwise default to best.
          if (selectedRoute !== null && alts[selectedRoute]) {
            routesToExport = [alts[selectedRoute]];
          } else {
            routesToExport = [alts[0]];
          }
        }
      }
    } else {
      // Export whole course, best route for each leg
      routesToExport = legs
        .map((leg) => {
          const alts = getAlternativeRoutes(leg);
          return alts[0]; // Best route
        })
        .filter((r) => !!r);
    }

    if (routesToExport.length === 0) return;

    // Dynamically import the generator
    const { generateGpx } = await import("@indoor-o-route-analysis/core");

    const nodes = selectedEvent.raceCourses?.[0]?.vertices || [];
    const edges = selectedEvent.raceCourses?.[0]?.edges || [];

    // Start time
    const startTime = selectedEvent.startTime?.date ? new Date(selectedEvent.startTime.date) : new Date();

    const map = selectedEvent.raceCourses?.[0]?.maps?.[0];
    const mapReference = (map?.latitude !== undefined && map?.longitude !== undefined) 
        ? { latitude: map.latitude, longitude: map.longitude }
        : undefined;

    const gpxString = generateGpx(routesToExport, nodes, edges, mapScale, speed, startTime, mapReference);

    const blob = new Blob([gpxString], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildCourseExportFilename("gpx", "training").replace(" - training", "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const wasMapExporting = useRef(false);
  useEffect(() => {
    if (wasMapExporting.current && !isMapExporting) {
        setShowMapExportDialog(false);
    }
    wasMapExporting.current = isMapExporting;
  }, [isMapExporting]);

  const renderToolbar = () => (
    <div className="flex items-center justify-between px-2 border-b border-border bg-card h-8">
      {/* Left side buttons */}
      <div className="flex items-center gap-1">
        {/* 3D View Toggle */}
        {onViewModeChange && (
          <Button
            variant={viewMode === "3d" ? "active" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => onViewModeChange(viewMode === "map" ? "3d" : "map")}
            title={viewMode === "map" ? "Switch to 3D view" : "Switch to map view"}
          >
            <Box className="h-4 w-4" />
          </Button>
        )}
        {viewMode === "3d" && onFrameAll && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFrameAll} title="Frame all geometry">
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant={showEdges ? "active" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onShowEdgesChange(!showEdges)}
          title={showEdges ? "Hide the graph edges from the map view." : "Show all graph edges on the map."}
        >
          <Waypoints className="h-4 w-4" />
        </Button>
        <Button
          variant={showBranchingPoints ? "active" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onShowBranchingPointsChange(!showBranchingPoints)}
          title={showBranchingPoints ? "Hide branching points" : "Show branching points"}
          disabled={selectedRoute === null}
        >
          <Split className="h-4 w-4" />
        </Button>
        <Button
          variant={showDecisionPoints ? "active" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onShowDecisionPointsChange(!showDecisionPoints)}
          title={showDecisionPoints ? "Hide decision points" : "Show decision points"}
          disabled={selectedRoute === null}
        >
          <Brain className="h-4 w-4" />
        </Button>
        <MapVisibilityToggle
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={onShowBackgroundMapChange}
          isMapMuted={isMapMuted}
          onMuteChange={onMuteChange}
        />
        <Button
          variant={findAllRoutes ? "active" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onFindAllRoutesChange(!findAllRoutes)}
          title={`Show all routes (including minor variations) — algorithm: ${enumerationAlgorithmInfo.label}. Change it in Settings → Analysis.`}
        >
          <Tractor className="h-4 w-4" />
        </Button>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-1">
        {loadedExampleFile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              const courseName = selectedEvent?.raceCourses?.[0]?.courses?.find(c => c.id === selectedCourseId)?.name;
              const currentUrl = new URL(window.location.href);
              const shareUrl = new URL(window.location.href);

              if (currentUrl.protocol === "http:" || currentUrl.protocol === "https:") {
                shareUrl.pathname = "/route-analysis";
              } else {
                // Custom/file protocols may not support direct path routing; use screen query fallback.
                shareUrl.searchParams.set("screen", "route-analysis");
              }

              shareUrl.searchParams.set("load-example", loadedExampleFile);
              if (courseName) {
                shareUrl.searchParams.set("course", courseName);
              } else {
                shareUrl.searchParams.delete("course");
              }

              setShareLink(shareUrl.toString());
              setShareCopyStatus("idle");
              setShowShareDialog(true);
            }}
            title="Share link to this example"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowInfoDialog(true)}
          title="Show guide"
        >
          <Info className="h-4 w-4" />
        </Button>
        {/* Hamburger menu for exports */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowExportMenu(!showExportMenu)}
            title="Export options"
          >
            <Menu className="h-4 w-4" />
          </Button>
          {showExportMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <div className="py-1">
                <button
                  onClick={() => {
                    setShowTrainingExportDialog(true);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Export for training app...
                </button>
                <button
                  onClick={() => {
                    setShowMapExportDialog(true);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Export map...
                </button>
                <button
                  onClick={() => {
                     onExportVideo();
                     setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Export video...
                </button>
                <button
                  onClick={() => {
                    setShowReportExportDialog(true);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Export report...
                </button>
                <button
                  onClick={() => {
                    exportGpx();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Export track (gpx)
                </button>
              </div>
            </div>
          )}
        </div>

        <ShareLinkDialog
          isOpen={showShareDialog}
          shareLink={shareLink}
          copyStatus={shareCopyStatus}
          onClose={() => setShowShareDialog(false)}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(shareLink);
              setShareCopyStatus("copied");
            } catch {
              setShareCopyStatus("failed");
            }
          }}
          onOpenLink={() => {
            const opened = window.open(shareLink, "_blank", "noopener,noreferrer");
            if (opened) {
              opened.opener = null;
            }
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="w-[25rem] border-l border-border bg-card flex flex-col h-full">
      {renderToolbar()}

      {/* Error Message */}
      {routeError && (
        <div className="bg-destructive/10 text-destructive text-xs p-2 border-b border-destructive/20 flex items-start gap-1">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{routeError}</span>
        </div>
      )}

      {/* Playback Controls */}
      {selectedCourse && legs.length > 0 && (
        <PlaybackControls
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          playReset={playReset}
          followPlayback={followPlayback}
          onTogglePlay={onTogglePlay}
          onStopPlay={onStopPlay}
          onPlaybackSpeedChange={onPlaybackSpeedChange}
          onFollowPlaybackChange={onFollowPlaybackChange}
          autoAdvance={autoAdvance}
          onAutoAdvanceChange={onAutoAdvanceChange}
          disabled={selectedLeg === null && selectedRoute === null}
          duration={currentDuration}
          currentTime={playbackCurrentTime}
          totalTime={playbackTotalTime}
          onTimeChange={onPlaybackTimeChange}
          show3DControls={viewMode === "3d"}
          hideUpperLevels={hideUpperLevels}
          onHideUpperLevelsChange={onHideUpperLevelsChange}
        />
      )}

      {/* Course Selector - Fixed below playback */}
      <div className="border-b border-border bg-card">
        <Select
          value={selectedCourseId && courses.some(c => c.id === selectedCourseId) ? selectedCourseId : ""}
          onValueChange={(value) => {
            onCourseSelect(value || null);
            onLegSelect(null);
          }}
          disabled={courses.length === 0}
        >
          <SelectTrigger className="w-full border-none rounded-none focus:ring-0 focus:ring-offset-0 h-10 px-3" aria-label="Course">
            <SelectValue placeholder="Select a course to analyze" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((course) => {
              const assignedClasses = getAssignedClasses(course.name);
              return (
                <SelectItem key={course.id} value={course.id}>
                  <span>{course.name || "Untitled Course"}</span>
                  {assignedClasses && (
                    <span className="ml-2 text-muted-foreground">{assignedClasses}</span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {/* Analysis progress */}
        {analysisState.isLoading && (
          <div className="px-3 pb-2 pt-1">
            <div className="mt-1 text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground">
                  Analyzing (k={routeAnalysisK}
                  {findAllRoutes ? `, all routes: ${enumerationAlgorithmInfo.label}` : ""})...
                </span>
                <span className="font-mono">{analysisState.progress}%</span>
              </div>
              <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${analysisState.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Properties Section - Scrollable */}
      <div className="flex-1 overflow-auto p-6 pt-4">
        {selectedCourse && legs.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-1">
              {legs.map((leg) => {
                const isSelected = selectedLeg === leg.id;
                // Find the highest difficulty among all legs
                const maxDifficulty = Math.max(...legs.map((l) => l.difficulty));
                const isHighestDifficulty = leg.difficulty === maxDifficulty && maxDifficulty > 0;
                // Calculate alternative routes for this leg if selected
                const alternativeRoutes = isSelected ? getAlternativeRoutes(leg) : [];

                // Sort routes by distance
                const sortedRoutes = [...alternativeRoutes].sort((a, b) => a.distance - b.distance);

                // Determine labels
                const allControls = selectedEvent?.raceCourses?.[0]?.controls || [];
                const filteredCourseControls = getActualCourseControls(selectedCourse?.controls ?? [], allControls);
                const courseLabels = getCourseControlLabels(filteredCourseControls, allControls);

                const fromLabel = courseLabels[leg.id] ?? "?";
                const toLabel = courseLabels[leg.id + 1] ?? "?";

                // Analysis for easiest route
                const routes = analysisState.routes[leg.id] || [];
                const easiestRoute = routes.reduce(
                  (min, r) => (r.difficulty !== undefined && r.difficulty < (min.difficulty || 999) ? r : min),
                  routes[0]
                );
                const showEasiest =
                  easiestRoute &&
                  leg.difficulty !== undefined &&
                  Math.round(easiestRoute.difficulty) < Math.round(leg.difficulty);
                // Trap: the shortest route is harder than a longer one
                const trapRoute = findTrapEasierRoute(leg.difficulty, routes);

                return (
                  <div key={leg.id}>
                    <button
                      onClick={() => onLegSelect(isSelected ? null : leg.id)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium flex items-center gap-1">
                          <LegName from={fromLabel} to={toLabel} isSelected={isSelected} />
                          {isHighestDifficulty && (
                            <span className="text-yellow-500" title="Svåraste sträckan">
                              ⭐
                            </span>
                          )}
                          {trapRoute && (
                            <span
                              className="text-amber-400"
                              title={`Trap: the easiest route (${trapRoute.distance.toFixed(0)} m, D${Math.round(trapRoute.difficulty!)}) may be chosen, although a more difficult route that is shorter (${leg.shortestDistance.toFixed(0)} m, D${Math.round(leg.difficulty)}) exists`}
                            >
                              <Rat className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </span>
                        <span className="text-xs opacity-75 space-x-2 flex">
                          <span>{leg.shortestDistance > 0 ? `${leg.shortestDistance.toFixed(0)} m` : "—"}</span>
                          {leg.shortestDistance > 0 && (
                            <>
                              <span>•</span>
                              <span>
                                {(() => {
                                  const sec = Math.round(leg.shortestDistance / speed);
                                  const m = Math.floor(sec / 60);
                                  const s = sec % 60;
                                  return `${m}:${s.toString().padStart(2, "0")}`;
                                })()}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span title="Difficulty of shortest route">
                            <DifficultyTag difficulty={leg.difficulty} size="sm" scoringModel={currentScoringModel} />
                          </span>
                          {showEasiest && (
                            <>
                              <span title="Difficulty of easiest route">
                                <DifficultyTag
                                  difficulty={easiestRoute.difficulty!}
                                  size="sm"
                                  scoringModel={currentScoringModel}
                                  isEasiest
                                />
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Alternative routes - shown when leg is selected */}
                    {isSelected && sortedRoutes.length > 0 && (
                      <div className="ml-3 mt-1 space-y-1 border-l-2 border-muted pl-2">
                        {sortedRoutes.map((route, idx) => {
                          // Find original index for selection matching
                          const originalIdx = alternativeRoutes.findIndex(
                            (r) => r.path.join(",") === route.path.join(","),
                          );
                          const isRouteSelected = selectedRoute === originalIdx;
                          // Get route labels (concatenated edge labels, no separators)
                          const routeLabels = route.description.replace(/,\s*/g, "") || "-";
                          
                          // Check if this is the easiest route
                          const isEasiestRoute = 
                            easiestRoute && 
                            route.difficulty !== undefined && 
                            Math.abs(route.difficulty - easiestRoute.difficulty!) < 0.1;

                          return (
                            <button
                              key={idx}
                              onClick={() => onRouteSelect(isRouteSelected ? null : originalIdx)}
                              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                                isRouteSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-accent hover:text-accent-foreground"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                                  style={{ backgroundColor: ROUTE_COLORS[originalIdx % ROUTE_COLORS.length] }}
                                />
                                <div className="flex-1">
                                  <div className="font-medium flex justify-between items-start">
                                    <span>
                                      Route {idx + 1}: {routeLabels}
                                    </span>
                                    <span className="text-xs opacity-75">
                                      {route.distance.toFixed(0)} m •{" "}
                                      {route.totalClimb !== undefined ? `${route.totalClimb.toFixed(0)} m \u2197 \u2022 ` : ""}
                                      {(() => {
                                        const sec = Math.round(route.distance / speed);
                                        const m = Math.floor(sec / 60);
                                        const s = sec % 60;
                                        return `${m}:${s.toString().padStart(2, "0")}`;
                                      })()}
                                    </span>
                                  </div>
                                  <div className="font-mono text-xs space-x-2 opacity-75">
                                    {(() => {
                                      return (
                                        <span title="Route difficulty">
                                          <DifficultyTag
                                            difficulty={route.difficulty}
                                            size="sm"
                                            scoringModel={currentScoringModel}
                                            isEasiest={isEasiestRoute && showEasiest}
                                          />
                                        </span>
                                      );
                                    })()}
                                    <span>•</span>
                                    <span title="Number of branching points (nodes where the runner has more than one outgoing direction)">
                                      <Split className="h-3 w-3 inline mr-0.5" />
                                      {route.branchingPointNodeIds.length}
                                    </span>
                                    <span>•</span>
                                    <span title="Number of decision points (meaningful junctions; dead-ends shorter than 50 m are excluded)">
                                      <Brain className="h-3 w-3 inline mr-0.5" />
                                      {route.decisionPoints}
                                    </span>
                                    <span>•</span>
                                    <span title="Number of stairs">
                                      <ArrowUpDown className="h-3 w-3 inline mr-0.5" />
                                      {route.ignoreLengthEdges}
                                    </span>
                                    <span>•</span>
                                    <span title="Repetition ratio (percentage of route length visited in shortest route of previous legs)">
                                      <Repeat className="h-3 w-3 inline mr-0.5" />
                                      {route.repetitionRatio !== undefined 
                                        ? `${Math.round(route.repetitionRatio * 100)}%` 
                                        : "0%"}
                                    </span>
                                  </div>
                                </div>
                                {/* Per-route play controls removed; global controls are above the list */}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Total course length summary */}
            {(() => {
              const totalDistance = legs.reduce((sum, l) => sum + (l.shortestDistance || 0), 0);
              const totalClimb = legs.reduce((sum, l) => sum + (l.totalClimb || 0), 0);
              const sec = Math.round(totalDistance / speed);
              const m = Math.floor(sec / 60);
              const s = sec % 60;
              const timeStr = `${m}:${s.toString().padStart(2, "0")}`;
              const _diffCategory = getDifficultyCategory(overallCourseDifficulty, currentScoringModel);
              
              // Calculate max difficulty of the easiest routes for each leg
              let maxEasiestDifficulty = 0;
              legs.forEach((leg) => {
                  const routes = analysisState.routes[leg.id] || [];
                  if (routes.length > 0) {
                      const easiest = routes.reduce((min, r) => (r.difficulty || 999) < (min.difficulty || 999) ? r : min, routes[0]);
                      const diff = easiest.difficulty || 0;
                      if (diff > maxEasiestDifficulty) {
                          maxEasiestDifficulty = diff;
                      }
                  }
              });

              return (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between px-3 py-2 rounded bg-muted/30 text-sm">
                    <span className="font-medium" title="Total course length using the shortest route for each leg">Total length</span>
                    <div className="text-right">
                        <div className="text-xs opacity-75 flex items-center justify-end gap-2">
                          {totalDistance.toFixed(0)} m
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1 rounded bg-muted/20 text-sm">
                    <span className="font-medium text-xs">Estimated running time</span>
                    <span className="text-xs opacity-75 flex items-center gap-2">
                            {timeStr}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1 rounded bg-muted/20 text-sm">
                    <span className="font-medium text-xs">Total climb</span>
                    <span className="text-xs opacity-75 flex items-center gap-2">
                            {totalClimb.toFixed(0)} m
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1 rounded bg-muted/20 text-sm">
                    <span className="font-medium text-xs">Max difficulty</span>
                    <span className="text-xs opacity-75 flex items-center gap-2">
                      <DifficultyTag difficulty={overallCourseDifficulty} size="sm" scoringModel={currentScoringModel} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1 rounded bg-muted/20 text-sm">
                    <span className="font-medium text-xs">Max difficulty (easiest routes)</span>
                    <span className="text-xs opacity-75 flex items-center gap-2">
                      <DifficultyTag difficulty={maxEasiestDifficulty} size="sm" scoringModel={currentScoringModel} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1 rounded bg-muted/20 text-sm">
                    <span className="font-medium text-xs">Average difficulty</span>
                    <span className="text-xs opacity-75 flex items-center gap-2">
                      <DifficultyTag difficulty={averageCourseDifficulty} size="sm" scoringModel={currentScoringModel} />
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {selectedCourse && legs.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">No controls in course</div>
        )}



        {/* Difficulty Bar Chart & Histogram removed from UI as requested, only in report */}
        {selectedCourse && legs.length > 0 && false && (
          <div className="mt-8 pt-6 border-t border-border">
            <div className="bg-muted/30 rounded-lg p-4">
              {(() => {
                const maxLegDifficulty = Math.max(...legs.map((l) => l.difficulty), 1);
                // Add buffer to match report style and ensure top label fit
                const maxDifficulty = Math.max(maxLegDifficulty * 1.1, 1);
                const barWidth = Math.max(40, Math.floor(240 / legs.length));
                const chartHeight = 120;
                const topPadding = 20; // Space for difficulty labels
                const availableHeight = chartHeight - topPadding;
                const chartWidth = legs.length * barWidth + 20;

                const categoryBoundaries = [
                  { limit: 20, color: DIFFICULTY_CATEGORIES[0].color, label: DIFFICULTY_CATEGORIES[0].label },
                  { limit: 40, color: DIFFICULTY_CATEGORIES[1].color, label: DIFFICULTY_CATEGORIES[1].label },
                  { limit: 60, color: DIFFICULTY_CATEGORIES[2].color, label: DIFFICULTY_CATEGORIES[2].label },
                  { limit: 80, color: DIFFICULTY_CATEGORIES[3].color, label: DIFFICULTY_CATEGORIES[3].label },
                  { limit: 9999, color: DIFFICULTY_CATEGORIES[4].color, label: DIFFICULTY_CATEGORIES[4].label },
                ];

                return (
                  <div className="overflow-x-auto">
                    <svg width={chartWidth} height={chartHeight + 40} className="mx-auto">
                      {/* Background Bands */}
                      {categoryBoundaries.map((cat, idx) => {
                        const prevLimit = idx === 0 ? 0 : categoryBoundaries[idx - 1].limit;
                        if (prevLimit >= maxDifficulty) return null;

                        const currentLimit = Math.min(cat.limit, maxDifficulty);
                        const topPixel = chartHeight - (currentLimit / maxDifficulty) * availableHeight;
                        const bottomPixel = chartHeight - (prevLimit / maxDifficulty) * availableHeight;
                        const height = bottomPixel - topPixel;

                        // Only draw if height is positive
                         if (height <= 0) return null;

                        return (
                          <rect
                            key={cat.label}
                            x={5}
                            y={topPixel}
                            width={chartWidth - 10}
                            height={height}
                            fill={cat.color}
                            opacity={CHART_BACKGROUND_OPACITY}
                          />
                        );
                      })}
                      
                      {/* Bars */}
                      {legs.map((leg, idx) => {
                        const barHeight = (leg.difficulty / maxDifficulty) * availableHeight;
                        const x = idx * barWidth + 10;
                        const y = chartHeight - barHeight;
                        const roundedDifficulty = Math.round(leg.difficulty);
                        const chartLabel = leg.label.replace(/\s*[\u2192]\s*/g, "-");

                        return (
                          <g key={leg.id}>
                            {/* Bar */}
                            <rect
                              x={x}
                              y={y}
                              width={barWidth - 10}
                              height={barHeight}
                              fill={selectedLeg === leg.id ? "#1B5E20" : "#388E3C"}
                              className="transition-all cursor-pointer hover:brightness-110"
                              onClick={() => onLegSelect(selectedLeg === leg.id ? null : leg.id)}
                            />
                            {/* Difficulty value on top */}
                            <text
                              x={x + (barWidth - 10) / 2}
                              y={y - 5}
                              textAnchor="middle"
                              fontSize="11"
                              fill={selectedLeg === leg.id ? "#1B5E20" : "#388E3C"}
                              className="font-medium"
                            >
                              {roundedDifficulty}
                            </text>
                            {/* Leg label at bottom */}
                            <text
                              x={x + (barWidth - 10) / 2}
                              y={chartHeight + 15}
                              textAnchor="middle"
                              fontSize="10"
                              fill="currentColor"
                              className="opacity-75"
                            >
                              {chartLabel}
                            </text>
                          </g>
                        );
                      })}
                      {/* Baseline */}
                      <line
                        x1={5}
                        y1={chartHeight}
                        x2={chartWidth - 5}
                        y2={chartHeight}
                        stroke="currentColor"
                        strokeWidth="1"
                        opacity="0.3"
                      />
                    </svg>
                    
                  </div>
                );
              })()}
            </div>

            {/* Difficulty Category Histogram */}
            <div className="mt-4 bg-muted/30 rounded-lg p-4">
              {(() => {
                // Count legs per difficulty category
                const categoryCounts: Record<string, number> = {
                  White: 0,
                  Yellow: 0,
                  Orange: 0,
                  Purple: 0,
                  Black: 0,
                };

                legs.forEach((leg) => {
                  const category = getDifficultyCategory(leg.difficulty, currentScoringModel);
                  categoryCounts[category.label] = (categoryCounts[category.label] || 0) + 1;
                });

                const maxCount = Math.max(...Object.values(categoryCounts), 1);
                const barHeight = 30;
                const chartHeight = DIFFICULTY_CATEGORIES.length * (barHeight + 8) + 20;
                const maxBarWidth = 200;

                return (
                  <div>
                    <div className="text-xs font-medium mb-3 text-center opacity-75">Legs per Difficulty Category</div>
                    <svg width="100%" height={chartHeight} className="mx-auto">
                      {DIFFICULTY_CATEGORIES.map((cat, idx) => {
                        const count = categoryCounts[cat.label] || 0;
                        const barWidth = (count / maxCount) * maxBarWidth;
                        const y = idx * (barHeight + 8);

                        return (
                          <g key={cat.label}>
                            {/* Category label */}
                            <text
                              x={5}
                              y={y + barHeight / 2 + 4}
                              fontSize="11"
                              fill="currentColor"
                              className="font-medium"
                            >
                              {cat.label}
                            </text>
                            {/* Bar */}
                            <rect
                              x={70}
                              y={y}
                              width={barWidth}
                              height={barHeight}
                              fill={cat.color}
                              stroke={cat.label === "White" ? "#ccc" : "none"}
                              strokeWidth={cat.label === "White" ? 1 : 0}
                              rx={2}
                            />
                            {/* Count label */}
                            <text
                              x={75 + barWidth}
                              y={y + barHeight / 2 + 4}
                              fontSize="11"
                              fill="currentColor"
                              className="font-medium"
                            >
                              {count > 0 ? ` ${count}` : ""}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="border-t border-border bg-card px-2 py-2 space-y-1">
        {(() => {
          const modelTooltip = [
            currentScoringModel.description,
            currentScoringModel.scalingFactor !== undefined
              ? `Normalization: ×(100/${Math.round(100 / currentScoringModel.scalingFactor)})`
              : null,
            currentScoringModel.referenceCourse
              ? `Reference: ${currentScoringModel.referenceCourse}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");

          const selectedRouteFormula = (() => {
            if (selectedLeg === null) return null;
            const leg = legs.find((l) => l.id === selectedLeg);
            if (!leg) return null;
            const alternatives = getAlternativeRoutes(leg);
            const route = selectedRoute !== null ? alternatives[selectedRoute] : alternatives[0];
            return route?.difficultyFormula ?? null;
          })();

          return (
            <>
              <div className="flex items-center gap-2" title={modelTooltip}>
                <ScoringModelSelect
                  value={currentScoringModel.getFullId()}
                  onValueChange={(value) => {
                    if (selectedEvent) {
                      updateEventData(selectedEvent.id, {
                        difficultyScoringModel: value,
                      });
                    }
                  }}
                  className="w-full h-8 text-xs"
                />
              </div>
              {selectedRouteFormula && (
                <div className="text-xs font-mono text-muted-foreground px-1">
                  {selectedRouteFormula}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Info Dialog */}
      <RouteAnalysisInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />

      {selectedEvent && (
        <>
          <TrainingExportDialog
            isOpen={showTrainingExportDialog}
            onClose={() => setShowTrainingExportDialog(false)}
            courses={courses}
            selectedCourseId={selectedCourseId}
            event={selectedEvent}
            scoringModel={currentScoringModel}
            runningSpeed={speed}
          />
          <AllCoursesAnalysisDialog
            isOpen={showBatchAnalysis}
            onClose={() => setShowBatchAnalysis(false)}
            event={selectedEvent}
            initialScoringModelId={currentScoringModel.getFullId()}
            runningSpeed={speed}
          />
          <ReportExportDialog
            isOpen={showReportExportDialog}
            onClose={() => setShowReportExportDialog(false)}
            onExport={(format, scope) => {
              setShowReportExportDialog(false);
              if (scope === "all-courses") {
                setShowBatchAnalysis(true);
              } else {
                if (format === "html") {
                  exportAsHTML();
                } else {
                  if (onExportPdf) onExportPdf();
                }
              }
            }}
            courseName={selectedCourse?.name}
            scoringModelName={currentScoringModel.name}
          />
          <MapExportDialog 
            isOpen={showMapExportDialog}
            onClose={() => setShowMapExportDialog(false)}
            onExport={(format, scope) => {
                if (onExportRequest) {
                    onExportRequest(format, scope);
                } else {
                    if (scope === 'all-legs') onExportAllLegs();
                    else if (format === 'png') onExportMap();
                    else onExportPdf();
                }
            }}
            onCancelExport={onCancelMapExport}
            isExporting={isMapExporting}
            progress={mapExportProgress}
            courseName={selectedCourse?.name}
            legName={selectedLeg !== null ? legs.find(l => l.id === selectedLeg)?.label : null}
            routeName={selectedLeg !== null && selectedRoute !== null ? `Route ${selectedRoute + 1}` : null}
            hasSelectedRoute={selectedRoute !== null}
            hasSelectedLeg={selectedLeg !== null}
          />
        </>
      )}
    </div>
  );
}