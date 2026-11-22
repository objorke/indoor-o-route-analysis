"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { getDifficultyCategory, analyzeNextLegs, getEventScoringModel } from "@indoor-o-route-analysis/core"
import { useEventRouteAnalyzer } from "@indoor-o-route-analysis/ui"
import type { EventData } from "@indoor-o-route-analysis/core"
import { DifficultyTag } from "@/components/route-analysis/difficulty-tag"
import type { DifficultyCategory } from "@indoor-o-route-analysis/core"
import { Button } from "@indoor-o-route-analysis/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui"
import { Toggle } from "@indoor-o-route-analysis/ui"
import { Progress } from "@indoor-o-route-analysis/ui";
import { Target, Plus, X, Loader2, Square, RotateCw } from "lucide-react"

interface NextControlsListProps {
  /** Event to analyse; the route analyzer is set up from it like in every other view. */
  event: EventData
  courseId: string | null
  lastControlId: string
  excludeControlIds: string[]
  onNavigateTo: (controlId: string) => void
  onAddToCourse: (controlCode: string) => void
}

interface AnalyzedControl {
  controlId: string;
  distance: number;
  difficulty: number;
  difficultyCategory: DifficultyCategory;
}

const LENGTH_FILTERS = [
  { id: 'all', label: 'All Lengths' },
  { id: 'short', label: 'Short (<50m)' },
  { id: 'medium', label: 'Medium (50-150m)' },
  { id: 'long', label: 'Long (>150m)' },
] as const

const DIFFICULTY_LEVELS = [
  { id: 'white', label: 'W', color: '#FFFFFF', borderColor: '#e5e5e5' },
  { id: 'yellow', label: 'Y', color: '#FFFF00', borderColor: '#e5e5e5' },
  { id: 'orange', label: 'O', color: '#FF8800', borderColor: 'transparent' },
  { id: 'purple', label: 'P', color: '#8B008B', borderColor: 'transparent' },
  { id: 'black', label: 'B', color: '#000000', borderColor: 'transparent' },
]

export function NextControlsList({ 
  event,
  courseId,
  lastControlId, 
  excludeControlIds, 
  onNavigateTo, 
  onAddToCourse 
}: NextControlsListProps) {
  const [analyzedControls, setAnalyzedControls] = useState<AnalyzedControl[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0);
  
  // Filters
  const [lengthFilter, setLengthFilter] = useState<string>('all')
  const [difficultyFilters, setDifficultyFilters] = useState<string[]>([])

  const raceCourse = event.raceCourses?.[0]
  const controls = useMemo(() => raceCourse?.controls ?? [], [raceCourse?.controls])
  const scoringModel = getEventScoringModel(event)
  const analyzer = useEventRouteAnalyzer(event, { courseId, scoringModel })

  // Bumped by the Restart button to re-run the analysis after a stop.
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const [stopped, setStopped] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!lastControlId || !analyzer) return;

    // Clear previous results when starting new calculation
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset state before async calculation
    setAnalyzedControls([]);
    setStopped(null);

    const lastControl = (controls ?? []).find((c) => c.id === lastControlId);
    if (!lastControl) {
      setIsLoading(false);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setIsLoading(true);
    setProgress(0);

    const candidateIds = (controls ?? [])
      .filter((c) => !excludeControlIds.includes(c.id) && c.id !== lastControlId)
      .map((c) => c.id);

    // Accumulate results locally and keep the list sorted while it grows
    const currentResults: AnalyzedControl[] = [];
    let lastProgress = { done: 0, total: candidateIds.length };

    analyzeNextLegs(analyzer, lastControlId, candidateIds, {
      signal: abort.signal,
      onResult: (r) => {
        currentResults.push({ ...r, difficultyCategory: getDifficultyCategory(r.difficulty, scoringModel) });
      },
      onProgress: (p) => {
        lastProgress = p;
        if (abort.signal.aborted) return;
        currentResults.sort((a, b) => a.distance - b.distance);
        setAnalyzedControls([...currentResults]);
        setProgress(p.total > 0 ? Math.round((p.done / p.total) * 100) : 100);
      },
    }).then(({ aborted }) => {
      if (abortRef.current !== abort) return; // superseded by a newer run
      setIsLoading(false);
      if (aborted) setStopped(lastProgress);
    });

    return () => {
      abort.abort();
      if (abortRef.current === abort) abortRef.current = null;
    };
  }, [analyzer, controls, lastControlId, excludeControlIds, scoringModel, runId])

  /** Stop the running analysis, keeping the partial results. */
  const stopAnalysis = () => abortRef.current?.abort();

  // Esc stops a running analysis (ignored while typing in a form field)
  useEffect(() => {
    if (!isLoading) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading]);

  const filteredControls = useMemo(() => {
    return analyzedControls.filter(control => {
      // Length filter
      if (lengthFilter === 'short' && control.distance > 50) return false;
      if (lengthFilter === 'medium' && (control.distance <= 50 || control.distance > 150)) return false;
      if (lengthFilter === 'long' && control.distance <= 150) return false;

      // Difficulty filter
      if (difficultyFilters.length > 0) {
        if (!difficultyFilters.includes(control.difficultyCategory.name)) return false;
      }

      return true;
    });
  }, [analyzedControls, lengthFilter, difficultyFilters]);

  const toggleDifficultyFilter = (levelId: string) => {
    setDifficultyFilters(prev => 
      prev.includes(levelId) 
        ? prev.filter(id => id !== levelId)
        : [...prev, levelId]
    )
  }

  // if (analyzedControls.length === 0) return <div className="text-xs text-muted-foreground p-2 text-center">No accessible controls found</div>

  return (
    <div className="mt-4 flex flex-col min-h-0 bg-card">
      <div className="flex items-center justify-between mb-2 px-4">
        <h3 className="text-sm font-semibold">Next Leg Suggestions</h3>
        {(lengthFilter !== "all" || difficultyFilters.length > 0) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => {
              setLengthFilter("all");
              setDifficultyFilters([]);
            }}
            title="Clear filters"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="px-4 mb-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="flex-1">Analysing legs…</span>
              <span className="font-mono tabular-nums">{progress}%</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={stopAnalysis}
                title="Stop the analysis (Esc). Results found so far are kept."
              >
                <Square className="h-3 w-3" />
              </Button>
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        </div>
      )}
      {!isLoading && stopped && (
        <div className="px-4 mb-2 text-xs text-muted-foreground flex items-center gap-2">
          <span className="flex-1">
            Stopped after {stopped.done} of {stopped.total} controls
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setRunId((n) => n + 1)}
            title="Restart the analysis"
          >
            <RotateCw className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="space-y-2 mb-2 px-4">
        {/* Length Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground w-12 font-semibold">Length</span>
          <Select value={lengthFilter} onValueChange={setLengthFilter}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LENGTH_FILTERS.map((f) => (
                <SelectItem key={f.id} value={f.id} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Difficulty Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground w-12 font-semibold">Diff</span>
          <div className="flex gap-1 flex-1">
            {DIFFICULTY_LEVELS.map((level) => {
              const isSelected = difficultyFilters.includes(level.id);
              // Determine text color based on background luminance for better contrast
              // Simple heuristic: Black and Purple need white text, others black
              const textColor = ["black", "purple"].includes(level.id) ? "white" : "black";

              return (
                <Toggle
                  key={level.id}
                  size="sm"
                  pressed={isSelected}
                  onPressedChange={() => toggleDifficultyFilter(level.id)}
                  className={`h-6 w-6 p-0 border transition-all ${isSelected ? "ring-2 ring-primary ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                  style={{
                    backgroundColor: level.color,
                    borderColor: level.borderColor,
                    color: textColor,
                  }}
                  title={`Filter ${level.id}`}
                >
                  <span className="text-[10px] font-bold">{level.label}</span>
                </Toggle>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-y-auto border-y border-border min-h-[100px] max-h-[300px]">
        {filteredControls.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 text-center">
            {analyzedControls.length === 0
              ? isLoading
                ? "Analysing…"
                : "No available controls"
              : "No controls match filters"}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Code</th>
                <th className="px-2 py-1 text-right font-medium">Dist</th>
                <th className="px-2 py-1 text-center font-medium">Diff</th>
                <th className="px-2 py-1 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredControls.map((control) => {
                const _diffCat = control.difficultyCategory;
                return (
                  <tr
                    key={control.controlId}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => onNavigateTo(control.controlId)}
                  >
                    <td className="px-2 py-1 font-mono">{control.controlId}</td>
                    <td className="px-2 py-1 text-right">{Math.round(control.distance)} m</td>
                    <td className="px-2 py-1 text-center">
                      <DifficultyTag difficulty={control.difficulty} size="sm" scoringModel={scoringModel} />
                    </td>
                    <td className="px-2 py-1 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Navigate to control"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateTo(control.controlId);
                        }}
                      >
                        <Target className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-primary"
                        title="Add to course"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCourse(control.controlId);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
