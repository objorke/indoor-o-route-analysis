"use client"

import { useState, useCallback } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import type { Control, GenerationProgress } from "@indoor-o-route-analysis/core";
import { updateRaceCourse } from "@indoor-o-route-analysis/core";
import { notify } from "@indoor-o-route-analysis/ui";

export interface GenerateParams {
  numControls: number;
  difficultyLevel: "white" | "yellow" | "orange" | "purple" | "black";
  targetLength: number;
  mode: "existing" | "create";
}

interface GenerateCourseDialogProps {
  onCourseGenerated?: (courseId: string) => void;
}

type GenerationProgressWithTime = GenerationProgress & { elapsedTime: number };

export function GenerateCourseDialog({ onCourseGenerated }: GenerateCourseDialogProps) {
  const { selectedEvent, updateEvent } = useAppData();

  const [showDialog, setShowDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressWithTime | null>(null);
  const [generateParams, setGenerateParams] = useState<GenerateParams>({
    numControls: 10,
    difficultyLevel: "orange",
    targetLength: 2000,
    mode: "existing",
  });

  const raceCourse = selectedEvent?.raceCourses?.[0];

  const generateCourse = useCallback(async () => {
    if (!selectedEvent || !raceCourse) return;

    setIsGenerating(true);
    const startTime = Date.now();
    setShowDialog(false);

    const { CourseGenerator } = await import("@indoor-o-route-analysis/core");

    const controls = raceCourse.controls || [];
    const generator = CourseGenerator.forEvent(selectedEvent);

    const result = await generator.generate(generateParams, (progress: GenerationProgress) => {
      const elapsedTime = Date.now() - startTime;
      setGenerationProgress({
        ...progress,
        elapsedTime,
      });
    });

    setIsGenerating(false);
    setGenerationProgress(null);

    if (!result) {
      const startControl = controls.find((c: Control) => c.type === "start");
      const finishControl = controls.find((c: Control) => c.type === "finish");

      if (!startControl || !finishControl) {
        notify("Please define start and finish controls before generating a course.");
      } else {
        notify(`Not enough controls. Need at least ${generateParams.numControls} intermediate controls.`);
      }
      return;
    }

    // Create the course with the controls
    const courseControls = result.controls.map((control: Control, idx: number) => ({
      controlId: control.id,
      type:
        idx === 0
          ? ("start" as const)
          : idx === result.controls.length - 1
            ? ("finish" as const)
            : ("control" as const),
    }));

    const difficultyStr = result.difficulty > 0 ? ` D${result.difficulty}` : "";
    const currentCourses = raceCourse.courses ?? [];
    const newCourseId = crypto.randomUUID();

    const newCourse = {
      id: newCourseId,
      name: `Generated ${currentCourses.length + 1} (${Math.round(result.length)}m${difficultyStr})`,
      controls: courseControls,
      mapId: raceCourse.maps?.[0]?.id || "",
    };

    // Generation can take a while: append to the latest courses, not the ones from when it started
    await updateEvent(selectedEvent.id, (e) =>
      updateRaceCourse(e, (rc) => ({ ...rc, courses: [...(rc.courses ?? []), newCourse] })),
    );
    onCourseGenerated?.(newCourseId);
  }, [selectedEvent, raceCourse, generateParams, updateEvent, onCourseGenerated]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0 border-l border-border rounded-none"
        onClick={() => setShowDialog(true)}
        title="Generate course (experimental)"
      >
        <Wand2 className="h-4 w-4" />
      </Button>

      {/* Generate Course Dialog */}
      {showDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md">
            <h2 className="text-lg font-semibold mb-4">Generate Course</h2>

            <div className="space-y-4 mb-6">
              {/* Number of Controls */}
              <div>
                <Label htmlFor="num-controls" className="text-sm font-medium">
                  Number of Controls: {generateParams.numControls}
                </Label>
                <input
                  id="num-controls"
                  type="range"
                  min="3"
                  max={Math.max(
                    20,
                    (raceCourse?.controls || []).length,
                    (raceCourse?.vertices || []).length,
                  )}
                  value={generateParams.numControls}
                  onChange={(e) => setGenerateParams({ ...generateParams, numControls: parseInt(e.target.value) })}
                  className="w-full mt-2"
                />
              </div>

              {/* Difficulty Level */}
              <div>
                <Label htmlFor="difficulty-level" className="text-sm font-medium">
                  Difficulty Level
                </Label>
                <Select
                  value={generateParams.difficultyLevel}
                  onValueChange={(val) =>
                    setGenerateParams({
                      ...generateParams,
                      difficultyLevel: val as "white" | "yellow" | "orange" | "purple" | "black",
                    })
                  }
                >
                  <SelectTrigger id="difficulty-level" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">White - Easiest</SelectItem>
                    <SelectItem value="yellow">Yellow - Easy</SelectItem>
                    <SelectItem value="orange">Orange - Medium</SelectItem>
                    <SelectItem value="purple">Purple - Hard</SelectItem>
                    <SelectItem value="black">Black - Most Difficult</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {generateParams.difficultyLevel === "white" && "Same level or few obvious level chances."}
                  {generateParams.difficultyLevel === "yellow" && "One level change per control, few route choices."}
                  {generateParams.difficultyLevel === "orange" && "Max 3 stairs per control, multiple route choices."}
                  {generateParams.difficultyLevel === "purple" && "Similar to black but shorter legs."}
                  {generateParams.difficultyLevel === "black" && "Many complex stair changes and one-ways."}
                </p>
              </div>

              {/* Target Course Length */}
              <div>
                <Label htmlFor="target-length" className="text-sm font-medium">
                  Target Course Length: {generateParams.targetLength} m
                </Label>
                <input
                  id="target-length"
                  type="range"
                  min="500"
                  max="10000"
                  step="100"
                  value={generateParams.targetLength}
                  onChange={(e) => setGenerateParams({ ...generateParams, targetLength: parseInt(e.target.value) })}
                  className="w-full mt-2"
                />
              </div>

              {/* Mode Selection */}
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="text-sm font-medium">Control Source</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="mode-existing"
                    name="mode"
                    value="existing"
                    checked={generateParams.mode === "existing"}
                    onChange={(e) =>
                      setGenerateParams({ ...generateParams, mode: e.target.value as "existing" | "create" })
                    }
                  />
                  <Label htmlFor="mode-existing" className="text-sm font-normal cursor-pointer">
                    Use existing controls only
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="mode-create"
                    name="mode"
                    value="create"
                    checked={generateParams.mode === "create"}
                    onChange={(e) =>
                      setGenerateParams({ ...generateParams, mode: e.target.value as "existing" | "create" })
                    }
                  />
                  <Label htmlFor="mode-create" className="text-sm font-normal cursor-pointer">
                    Convert graph nodes to controls
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={generateCourse}>Generate</Button>
            </div>
          </div>
        </div>
      )}

      {/* Generation Progress */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-background border border-border rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">Generating Course...</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Iteration</span>
                  <span>
                    {generationProgress?.iteration ?? 0}/{generationProgress?.totalIterations ?? 300}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(
                        ((generationProgress?.iteration ?? 0) / (generationProgress?.totalIterations ?? 300)) *
                        100
                      ).toFixed(1)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Difficulty:</span>
                <span className="text-sm font-medium capitalize">{generateParams.difficultyLevel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Elapsed:</span>
                <span className="text-sm font-medium">
                  {((generationProgress?.elapsedTime ?? 0) / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Best Score:</span>
                <span className="text-sm font-medium">{(generationProgress?.bestScore ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
