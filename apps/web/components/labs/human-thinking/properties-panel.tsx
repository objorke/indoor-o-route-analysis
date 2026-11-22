"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { ScrollArea } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import {
  createEventRouteAnalyzer,
  getActualCourseControls,
  getCourseControlLabels,
  getCoordinates,
  traceToFrames,
  traceToExplanation,
  analyzeThinkingEffort,
  buildHumanRouteOverlay,
  buildHumanRouteLabelResolver,
  buildHumanRouteExportBundle,
  humanRouteExportToJson,
  humanRouteExportToMarkdown,
  type HumanRouteResult,
  type HumanRouteFrame,
  type HumanRouteOverlayModel,
  type HumanRouteLabelResolver,
} from "@indoor-o-route-analysis/core";
import { Play, Pause, SkipBack, SkipForward, Download, Search, Footprints, Undo2, CheckCircle2 } from "lucide-react";
import { downloadFile } from "@/components/shared";

export interface HumanRouteOverlayState {
  overlay: HumanRouteOverlayModel;
  clusterOf: Record<string, string>;
}

interface HumanThinkingPanelProps {
  onRouteSelect: (route: { path: string[], distance: number, fromLabel?: string, toLabel?: string, forwardSegmentCount?: number } | null) => void;
  onOverlayChange?: (overlay: HumanRouteOverlayState | null) => void;
}

interface LegOption {
  key: string;
  label: string;
  fromControlId: string;
  toControlId: string;
  fromLabel: string;
  toLabel: string;
}

/** Icon shown in front of each explanation-log message, keyed by what the frame represents. */
function frameLogIcon(frame: HumanRouteFrame | undefined) {
  if (!frame) return null;
  switch (frame.kind) {
    case "same-floor-check":
      return Search;
    case "same-floor":
    case "closure":
      return CheckCircle2;
    case "exploration":
      return frame.side === "backtracking" ? Undo2 : Footprints;
    default:
      return null;
  }
}

/**
 * "Human thinking" lab: simulates how a runner plans a leg (not how they run
 * it) — same-floor glance, bidirectional stair search, first-meeting-wins —
 * and lets you step through the exploration with a first-person explanation
 * log and a thinking-effort summary. See planning/07 and planning/08 and the
 * companion article, docs/article/human-route-finding.tex.
 */
export default function HumanThinkingPanel({ onRouteSelect, onOverlayChange }: HumanThinkingPanelProps) {
  const { selectedEvent, selectedCourseId, setSelectedCourseId } = useAppData();

  const courses = useMemo(() => selectedEvent?.raceCourses?.[0]?.courses || [], [selectedEvent]);
  const allControls = selectedEvent?.raceCourses?.[0]?.controls || [];

  const legOptions: LegOption[] = useMemo(() => {
    const course = courses.find((c) => c.id === selectedCourseId) ?? courses[0];
    if (!course) return [];
    const actual = getActualCourseControls(course.controls, allControls);
    const labels = getCourseControlLabels(actual, allControls);
    const legs: LegOption[] = [];
    for (let i = 0; i < actual.length - 1; i++) {
      legs.push({
        key: `${actual[i].controlId}-${actual[i + 1].controlId}-${i}`,
        label: `${labels[i]} → ${labels[i + 1]}`,
        fromControlId: actual[i].controlId,
        toControlId: actual[i + 1].controlId,
        fromLabel: labels[i],
        toLabel: labels[i + 1],
      });
    }
    return legs;
  }, [courses, selectedCourseId, allControls]);

  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  const selectedLeg = legOptions.find((l) => l.key === selectedLegKey) ?? legOptions[0] ?? null;

  const [result, setResult] = useState<HumanRouteResult | null>(null);
  const [shortestDistance, setShortestDistance] = useState<number | undefined>(undefined);
  const [labelResolver, setLabelResolver] = useState<HumanRouteLabelResolver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const explanationListRef = useRef<HTMLDivElement>(null);

  const frames: HumanRouteFrame[] = useMemo(() => (result ? traceToFrames(result) : []), [result]);
  const explanation = useMemo(
    () => (result ? traceToExplanation(result, labelResolver ?? undefined) : []),
    [result, labelResolver],
  );
  const effort = useMemo(
    () => (result ? analyzeThinkingEffort(result, shortestDistance) : null),
    [result, shortestDistance],
  );

  const runSimulation = useCallback(() => {
    if (!selectedEvent || !selectedLeg) return;
    const raceCourse = selectedEvent.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const nodes = raceCourse?.vertices || [];
    const edges = raceCourse?.edges || [];

    if (edges.length === 0) {
      setError("No graph edges found. Please create a graph in the Graph view first.");
      return;
    }

    const analyzer = createEventRouteAnalyzer(selectedEvent);
    const fromControl = controls.find((c) => c.id === selectedLeg.fromControlId);
    const toControl = controls.find((c) => c.id === selectedLeg.toControlId);

    const humanResult = analyzer.findHumanRouteWithTrace(selectedLeg.fromControlId, selectedLeg.toControlId);
    if (!humanResult) {
      setError("No route found for this leg.");
      setResult(null);
      onRouteSelect(null);
      return;
    }

    setError(null);
    setResult(humanResult);
    setStepIndex(0);
    setIsPlaying(false);
    onRouteSelect({
      path: humanResult.route.path,
      distance: humanResult.route.distance,
      fromLabel: selectedLeg.fromLabel,
      toLabel: selectedLeg.toLabel,
      // Segments before this index are the tracking side's own corridor
      // stretches (one per forward stair crossing, see labs/map-viewer.tsx's
      // ignoreLength-based segment split); the rest belong to backtracking.
      forwardSegmentCount: humanResult.sameFloor ? undefined : humanResult.forwardLabels.length,
    });

    const fromNodeId = analyzer.getNodeIdForControl(selectedLeg.fromControlId);
    const toNodeId = analyzer.getNodeIdForControl(selectedLeg.toControlId);
    setLabelResolver(
      fromNodeId && toNodeId
        ? buildHumanRouteLabelResolver({
            clusterOf: humanResult.clusterOf ?? {},
            fromNodeId,
            fromLabel: selectedLeg.fromLabel,
            toNodeId,
            toLabel: selectedLeg.toLabel,
            resolveNode: (id) => controls.find((c) => c.id === id) ?? nodes.find((n) => n.id === id) ?? null,
            getCoordinates,
            polygons: raceCourse?.polygons || [],
          })
        : null,
    );

    if (fromControl && toControl) {
      const shortest = analyzer.calculateRouteDistance(fromControl, toControl);
      setShortestDistance(Number.isFinite(shortest) ? shortest : undefined);
    } else {
      setShortestDistance(undefined);
    }
  }, [selectedEvent, selectedLeg, onRouteSelect]);

  // Runs automatically whenever the selected leg changes — the simulation
  // is fast enough that a manual "Simulate Thinking" trigger just added a click.
  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  // Auto-play through frames
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    if (stepIndex >= frames.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStepIndex((i) => Math.min(i + 1, frames.length - 1)), 1200 / playbackSpeed);
    return () => clearTimeout(timer);
  }, [isPlaying, stepIndex, frames.length, playbackSpeed]);

  // Auto-scroll the explanation log to the current step
  useEffect(() => {
    const container = explanationListRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(`[data-step-index="${stepIndex}"]`);
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [stepIndex]);

  // Playback shortcuts: space = play/pause, arrows = step. Matches the
  // tooltips below, so keep both in sync if this changes.
  useEffect(() => {
    if (frames.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // Don't hijack modifier combos (e.g. Cmd+Left/Right for browser back/forward).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (frames.length > 1) setIsPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setStepIndex((i) => Math.min(frames.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [frames.length]);

  const handleExport = (format: "json" | "markdown") => {
    if (!result || !selectedLeg) return;
    const bundle = buildHumanRouteExportBundle(
      selectedLeg.fromControlId,
      selectedLeg.toControlId,
      result,
      shortestDistance,
      { fromLabel: selectedLeg.fromLabel, toLabel: selectedLeg.toLabel },
      labelResolver ?? undefined,
    );
    const sanitize = (label: string) => label.replace(/[^a-zA-Z0-9]+/g, "");
    const base = `human-route-${sanitize(selectedLeg.fromLabel)}-${sanitize(selectedLeg.toLabel)}`;
    if (format === "json") {
      downloadFile(humanRouteExportToJson(bundle), `${base}.json`, "application/json");
    } else {
      downloadFile(humanRouteExportToMarkdown(bundle), `${base}.md`, "text/markdown");
    }
  };

  const currentFrame = frames[stepIndex];

  // Live map overlay for the current playback step: the current tracking/
  // backtracking routes, ranked candidate badges, and the meeting marker.
  // Only meaningful for multi-floor legs (result.clusterOf is absent for
  // the same-floor short-circuit).
  useEffect(() => {
    if (currentFrame && result?.clusterOf) {
      onOverlayChange?.({ overlay: buildHumanRouteOverlay(currentFrame), clusterOf: result.clusterOf });
    } else {
      onOverlayChange?.(null);
    }
  }, [currentFrame, result, onOverlayChange]);

  // Clear the overlay when this lab unmounts (switching to another lab).
  useEffect(() => () => onOverlayChange?.(null), [onOverlayChange]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border space-y-3">
        {courses.length > 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Course</label>
            <Select value={selectedCourseId ?? courses[0]?.id ?? ""} onValueChange={setSelectedCourseId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Select value={selectedLeg?.key ?? ""} onValueChange={setSelectedLegKey} disabled={legOptions.length === 0}>
            <SelectTrigger><SelectValue placeholder="Select a leg" /></SelectTrigger>
            <SelectContent>
              {legOptions.map((leg) => <SelectItem key={leg.key} value={leg.key}>{leg.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {result && effort && (
        <>
          {/* Playback controls */}
          <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              title="Previous step (←)"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setIsPlaying((p) => !p)}
              disabled={frames.length <= 1}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setStepIndex((i) => Math.min(frames.length - 1, i + 1))}
              disabled={stepIndex >= frames.length - 1}
              title="Next step (→)"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground ml-1">
              Step {stepIndex + 1} / {frames.length}
            </span>
            <div className="flex-1" />
            <Select value={String(playbackSpeed)} onValueChange={(v) => setPlaybackSpeed(Number(v))}>
              <SelectTrigger className="h-7 border-none bg-transparent hover:bg-accent focus:ring-0 gap-1 px-2 w-auto min-w-10 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {[0.5, 1, 2, 4].map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{s}x</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Explanation log */}
          <ScrollArea className="flex-1 w-full" ref={explanationListRef}>
            <div className="p-3 space-y-2">
              {explanation.map((message) => {
                const Icon = frameLogIcon(frames[message.frameIndex]);
                return (
                  <button
                    key={message.frameIndex}
                    data-step-index={message.frameIndex}
                    onClick={() => setStepIndex(message.frameIndex)}
                    className={`flex items-start gap-2 w-full text-left text-sm rounded-lg px-3 py-2 transition-colors ${
                      message.frameIndex === stepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {Icon && <Icon className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{message.text}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {currentFrame?.kind === "closure" && currentFrame.planLabels && currentFrame.planLabels.length > 0 && (
            <div className="px-3 py-2 border-t border-border text-sm font-mono tracking-wide text-center">
              {currentFrame.planLabels.join(" · ")}
            </div>
          )}

          {/* Short-term memory: what the human must hold in mind right now —
              not a total (see Thinking effort below), so kept visually separate. */}
          {currentFrame?.memory && (
            <div className="p-3 border-t border-border text-xs space-y-2">
              <div className="font-medium text-sm mb-1">Short-term memory</div>
              <div>
                <div className="text-muted-foreground">Tracking, from start</div>
                <div className="font-mono">{currentFrame.memory.forwardChain.join(" · ") || "—"}</div>
                {currentFrame.memory.forwardPending.length > 0 && (
                  <div className="text-muted-foreground mt-0.5">
                    Still to try: {currentFrame.memory.forwardPending.map((p) => p.label ?? "start").join(", ")}
                  </div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground">Backtracking, from control</div>
                <div className="font-mono">{currentFrame.memory.backwardChain.join(" · ") || "—"}</div>
                {currentFrame.memory.backwardPending.length > 0 && (
                  <div className="text-muted-foreground mt-0.5">
                    Still to try: {currentFrame.memory.backwardPending.map((p) => p.label ?? "control").join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Thinking-effort summary */}
          <div className="p-3 border-t border-border text-xs space-y-1">
            <div className="font-medium text-sm mb-1">Thinking effort</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
              <span>Same floor</span><span className="text-right">{effort.sameFloor ? "yes" : "no"}</span>
              <span>Mental steps</span><span className="text-right">{effort.mentalSteps}</span>
              <span>Candidates evaluated</span><span className="text-right">{effort.candidatesEvaluated}</span>
              <span>Rejected meetings</span><span className="text-right">{effort.rejectedMeetings}</span>
              <span>Plan depth</span><span className="text-right">{effort.planDepth}</span>
              <span>Peak memory load</span><span className="text-right">{effort.memoryLoad.peak}</span>
              {effort.humanOptimalGap !== undefined && (
                <>
                  <span>Human / optimal length</span>
                  <span className="text-right">{effort.humanOptimalGap.toFixed(2)}×</span>
                </>
              )}
              <span className="font-medium text-foreground">Cognitive effort score</span>
              <span className="text-right font-medium text-foreground">{effort.cognitiveEffortScore.toFixed(1)}</span>
            </div>
          </div>

          {/* Export */}
          <div className="p-3 border-t border-border flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => handleExport("json")}>
              <Download className="w-3.5 h-3.5" /> JSON
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => handleExport("markdown")}>
              <Download className="w-3.5 h-3.5" /> Markdown
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
