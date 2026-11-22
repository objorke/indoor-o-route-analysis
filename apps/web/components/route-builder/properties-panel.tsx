"use client"

import { useState } from "react";
import {
  Plus,
  Copy,
  Trash2,
  Info,
  ArrowLeft,
  Menu,
  Crosshair,
  Box,
  Maximize2,
  Network,
} from "lucide-react";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import { PlaybackControls } from "@/components/shared/playback-controls";
import RouteBuilderInfoDialog from "./info-dialog";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import type { CustomRoute } from "@indoor-o-route-analysis/core";
import { getEventScoringModel } from "@indoor-o-route-analysis/core";
import type { Edge } from "@indoor-o-route-analysis/core";
import { LegName } from "@/components/leg-name";
import { DifficultyTag } from "@/components/route-analysis/difficulty-tag";

function TimeInput({ seconds, onChange }: { seconds: number; onChange: (val: number) => void }) {
  const formatSeconds = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    // Round seconds to 1 decimal place to avoid long floats
    const roundedSeconds = Math.round(secs * 10) / 10;
    const secondsStr = roundedSeconds < 10 ? `0${roundedSeconds}` : `${roundedSeconds}`;
    return `${minutes}:${secondsStr}`;
  };

  const formattedSeconds = formatSeconds(seconds);
  const [value, setValue] = useState(formattedSeconds);
  const [prevSeconds, setPrevSeconds] = useState(seconds);

  // Sync value when seconds prop changes (replacing useEffect with sync pattern)
  if (seconds !== prevSeconds) {
    setPrevSeconds(seconds);
    setValue(formattedSeconds);
  }

  const parseSeconds = (input: string) => {
    const parts = input.split(":");
    if (parts.length === 2) {
      const m = parseFloat(parts[0]) || 0;
      const s = parseFloat(parts[1]) || 0;
      return m * 60 + s;
    } else {
      return parseFloat(input) || 0;
    }
  };

  const handleBlur = () => {
    const newSeconds = parseSeconds(value);
    onChange(newSeconds);
  };

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      placeholder="m:ss"
      className="h-8 text-sm"
    />
  );
}

interface RouteBuilderPropertiesPanelProps {
  edges: Edge[];
  selectedLegRouteDescription: string;
  showBackgroundMap: boolean;
  onShowBackgroundMapChange: (show: boolean) => void;
  isMapMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
  selectedRoute: CustomRoute | null;
  onSelectRoute: (route: CustomRoute | null) => void;
  selectedLegIndex: number | null;
  onSelectLeg: (index: number | null) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onNavigateToNode?: (nodeId: string) => void;
  onNodeTimeChange: (nodeId: string, time: number) => void;
  onDeleteTimingPoint: (nodeId: string) => void;
  onRouteChange: (route: CustomRoute) => void;
  onUpdateCourse: (route: CustomRoute) => void;
  onNewRoute: () => void;
  onDuplicateRoute: (route: CustomRoute) => void;
  onDeleteRoute: (routeId: string) => void;
  onExportGpx: (route: CustomRoute) => void;
  onExportVideo?: () => void;
  legAnalysis: Array<{
    legName: string;
    from: string;
    to: string;
    routeLength: number;
    routeLengthDiff: number;
    routeTime: number;
    routeTimeDiff: number;
    difficulty: number;
  }>;
  totals: {
    totalLength: number;
    totalLengthDiff: number;
    totalTime: number;
    totalTimeDiff: number;
  };
  // Playback props
  isPlaying?: boolean;
  playbackSpeed?: number;
  playReset?: number;
  followPlayback?: boolean;
  onTogglePlay?: () => void;
  onStopPlay?: () => void;
  onPlaybackSpeedChange?: (speed: number) => void;
  onFollowPlaybackChange?: (follow: boolean) => void;
  playbackDuration?: number;
  // View mode props
  viewMode?: "map" | "3d";
  onViewModeChange?: (mode: "map" | "3d") => void;
  showEdges?: boolean;
  onShowEdgesChange?: (show: boolean) => void;
  hideUpperLevels?: boolean;
  onHideUpperLevelsChange?: (hide: boolean) => void;
  onFrameAll?: () => void;
}

export default function RouteBuilderPropertiesPanel({
  edges: _edges,
  selectedLegRouteDescription,
  showBackgroundMap,
  onShowBackgroundMapChange,
  isMapMuted = false,
  onMuteChange,
  selectedRoute,
  onSelectRoute,
  selectedLegIndex,
  onSelectLeg,
  selectedNodeId,
  onSelectNode,
  onNavigateToNode,
  onNodeTimeChange,
  onDeleteTimingPoint,
  onRouteChange,
  onUpdateCourse,
  onNewRoute,
  onDuplicateRoute,
  onDeleteRoute,
  onExportGpx,
  onExportVideo,
  legAnalysis,
  totals,
  // Playback
  isPlaying = false,
  playbackSpeed = 4,
  playReset = 0,
  followPlayback = true,
  onTogglePlay,
  onStopPlay,
  onPlaybackSpeedChange,
  onFollowPlaybackChange,
  playbackDuration = 0,
  // View mode
  viewMode = "map",
  onViewModeChange,
  showEdges = false,
  onShowEdgesChange,
  hideUpperLevels = false,
  onHideUpperLevelsChange,
  onFrameAll,
}: RouteBuilderPropertiesPanelProps) {
  const { selectedEvent } = useAppData();
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  const raceCourse = selectedEvent?.raceCourses?.[0];
  const routes = raceCourse?.customRoutes || [];
  const courses = raceCourse?.courses || [];

  const renderToolbar = () => {
    return (
    <div className="flex items-center justify-between px-2 border-b border-border bg-card h-8">
      <div className="flex items-center gap-1">
        {/* 3D View Toggle */}
        {onViewModeChange && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === "3d" ? "active" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onViewModeChange(viewMode === "map" ? "3d" : "map")}
                >
                  <Box className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{viewMode === "map" ? "Switch to 3D view" : "Switch to map view"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {viewMode === "3d" && onFrameAll && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFrameAll} title="Frame all geometry">
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
        <MapVisibilityToggle
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={onShowBackgroundMapChange}
          isMapMuted={isMapMuted}
          onMuteChange={onMuteChange}
        />
        {onShowEdgesChange && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showEdges ? "active" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onShowEdgesChange(!showEdges)}
                >
                  <Network className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showEdges ? "Hide graph nodes and edges" : "Show graph nodes and edges"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onNewRoute}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a new custom route to record your own path through the course.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowInfoDialog(true)}
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open the information guide for route builder features.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                   {selectedRoute && (
                     <DropdownMenuItem onClick={() => onUpdateCourse(selectedRoute)}>
                       Update legs (from course)
                     </DropdownMenuItem>
                   )}
                   {selectedRoute && (
                     <DropdownMenuItem onClick={() => onExportGpx(selectedRoute)}>
                       Export GPX
                     </DropdownMenuItem>
                   )}
                   {selectedRoute && onExportVideo && (
                     <DropdownMenuItem onClick={onExportVideo}>
                       Export video...
                     </DropdownMenuItem>
                   )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent>Open the menu for export options.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
  };

  const formatDistance = (meters: number) => {
    return meters >= 0 ? `${Math.round(meters)}m` : `-${Math.round(Math.abs(meters))}m`;
  };

  const formatTime = (seconds: number) => {
    // Input is now directly in seconds
    const minutes = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.floor(Math.abs(seconds) % 60);
    const sign = seconds < 0 ? "-" : "";
    return `${sign}${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const renderRoutesList = () => (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <div className="space-y-1">
        {routes.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">
            No routes yet. Click &quot;New Route&quot; to create one.
          </div>
        ) : (
          <div className="space-y-1">
            {routes.map((route) => (
              <div
                key={route.id}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-accent ${
                  selectedRoute?.id === route.id ? "bg-primary text-primary-foreground border-primary" : "border-border"
                }`}
                onClick={() => onSelectRoute(route)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{route.name}</div>
                  <div className={`text-xs truncate ${selectedRoute?.id === route.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {courses.find((c) => c.id === route.courseId)?.name || "Unknown course"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateRoute(route);
                  }}
                  title="Duplicate route"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRoute(route.id);
                  }}
                  title="Delete route"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderRouteProperties = () => {
    if (!selectedRoute) {
      return (
        <div className="text-xs text-muted-foreground p-2">
          Select a route to view its properties.
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        {/* Header Row: Back Button + Route Name */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onSelectRoute(null)}
            title="Back to routes"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1" title="Route Name">
            <Input
              value={selectedRoute.name}
              onChange={(e) => onRouteChange({ ...selectedRoute, name: e.target.value })}
              className="h-8 text-sm placeholder:text-muted-foreground"
              placeholder="Route Name"
            />
          </div>
          <div className="text-xs text-muted-foreground shrink-0">
            {courses.find((c) => c.id === selectedRoute.courseId)?.name || "Unknown course"}
          </div>
        </div>

        {/* Legs Table and Timing Points - each 50% of remaining height */}
        <div className="flex flex-col flex-1 min-h-0 gap-2">
          {/* Legs Table - 50% */}
          <div className="flex-1 min-h-0 flex flex-col border rounded">
            <div className="grid grid-cols-6 gap-1 p-2 bg-muted text-xs font-medium border-b">
              <div>Leg</div>
              <div className="text-right">Length</div>
              <div className="text-right" title="Difference from shortest route">vs best</div>
              <div className="text-right">Time</div>
              <div className="text-right" title="Difference from shortest route">vs best</div>
              <div className="text-right" title="Difficulty of shortest route">Diff</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {legAnalysis.map((leg, index) => (
                <div
                  key={index}
                  className={`grid grid-cols-6 gap-1 p-2 text-xs cursor-pointer hover:bg-accent ${
                    selectedLegIndex === index ? "bg-primary text-primary-foreground" : ""
                  }`}
                  onClick={() => onSelectLeg(index === selectedLegIndex ? null : index)}
                >
                  <div className="truncate" title={leg.legName}>
                    <LegName from={leg.from} to={leg.to} />
                  </div>
                  <div className="text-right">{formatDistance(leg.routeLength)}</div>
                  <div className={`text-right ${leg.routeLengthDiff > 0 ? "text-orange-500" : leg.routeLengthDiff < 0 ? "text-green-500" : ""}`}>
                    {leg.routeLengthDiff !== 0 ? (leg.routeLengthDiff > 0 ? "+" : "") + formatDistance(leg.routeLengthDiff) : "-"}
                  </div>
                  <div className="text-right">{formatTime(leg.routeTime)}</div>
                  <div className={`text-right ${leg.routeTimeDiff > 0 ? "text-orange-500" : leg.routeTimeDiff < 0 ? "text-green-500" : ""}`}>
                    {leg.routeTimeDiff !== 0 ? (leg.routeTimeDiff > 0 ? "+" : "") + formatTime(leg.routeTimeDiff) : "-"}
                  </div>
                  <div className="text-right">
                    <DifficultyTag difficulty={leg.difficulty} size="sm" scoringModel={getEventScoringModel(selectedEvent)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-1 p-2 bg-muted text-xs font-semibold border-t">
              <div>Total</div>
              <div className="text-right">{formatDistance(totals.totalLength)}</div>
              <div className={`text-right ${totals.totalLengthDiff > 0 ? "text-orange-500" : totals.totalLengthDiff < 0 ? "text-green-500" : ""}`}>
                {totals.totalLengthDiff !== 0 ? (totals.totalLengthDiff > 0 ? "+" : "") + formatDistance(totals.totalLengthDiff) : "-"}
              </div>
              <div className="text-right">{formatTime(totals.totalTime)}</div>
              <div className={`text-right ${totals.totalTimeDiff > 0 ? "text-orange-500" : totals.totalTimeDiff < 0 ? "text-green-500" : ""}`}>
                {totals.totalTimeDiff !== 0 ? (totals.totalTimeDiff > 0 ? "+" : "") + formatTime(totals.totalTimeDiff) : "-"}
              </div>
              <div></div>
            </div>
          </div>

          {/* Timing Points - 50% */}
          {selectedLegIndex !== null && selectedRoute && (() => {
            const leg = selectedRoute.legs[selectedLegIndex];
            const timingPoints = leg?.path.slice(1).filter(n => n.legTime !== undefined) || [];

            const legData = legAnalysis[selectedLegIndex];
            
            return (
              <div className="flex-1 min-h-0 flex flex-col border rounded">
                <div className="flex items-center gap-2 p-2 bg-muted text-xs font-medium border-b shrink-0">
                  <span className="shrink-0">{legData ? <LegName from={legData.from} to={legData.to} /> : ""}</span>
                  {selectedLegRouteDescription && (
                    <span className="text-muted-foreground truncate" title={selectedLegRouteDescription}>{selectedLegRouteDescription}</span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {timingPoints.map((node, index) => (
                    <div
                      key={node.nodeId}
                      className={`grid grid-cols-[40px_1fr_32px_32px] gap-1 p-1 text-xs items-center cursor-pointer hover:bg-accent ${
                        selectedNodeId === node.nodeId ? "bg-primary text-primary-foreground" : ""
                      }`}
                      onClick={() => onSelectNode(node.nodeId)}
                    >
                      <div className="text-center font-medium">{index + 1}</div>
                      <div>
                        <TimeInput
                          seconds={node.legTime ?? 0}
                          onChange={(val) => onNodeTimeChange(node.nodeId, val)}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTimingPoint(node.nodeId);
                        }}
                        title="Delete timing point"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToNode?.(node.nodeId);
                        }}
                        title="Navigate to timing point"
                      >
                        <Crosshair className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

      </div>
    );
  };

  return (
    <div className="flex flex-col w-96 border-l border-border bg-background">
      {renderToolbar()}
      {/* Playback Controls - shown when a route and leg are selected */}
      {selectedRoute && selectedLegIndex !== null && onTogglePlay && onStopPlay && onPlaybackSpeedChange && onFollowPlaybackChange && (
        <PlaybackControls
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          playReset={playReset}
          followPlayback={followPlayback}
          onTogglePlay={onTogglePlay}
          onStopPlay={onStopPlay}
          onPlaybackSpeedChange={onPlaybackSpeedChange}
          onFollowPlaybackChange={onFollowPlaybackChange}
          duration={playbackDuration}
          show3DControls={viewMode === "3d"}
          hideUpperLevels={hideUpperLevels}
          onHideUpperLevelsChange={onHideUpperLevelsChange}
        />
      )}
      {!selectedRoute ? (
        renderRoutesList()
      ) : (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col">
          {renderRouteProperties()}
        </div>
      )}
      <RouteBuilderInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
