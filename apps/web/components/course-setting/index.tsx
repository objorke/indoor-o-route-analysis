"use client"

import { useCallback, useEffect, useState, useRef } from "react";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getDifficultyCategory, analyzeNextLegs, createEventRouteAnalyzer, getEventScoringModel } from "@indoor-o-route-analysis/core";
import { getActiveMap, mergeRaceCourse, removeControl, updateRaceCourse as updateRaceCourseOf, type RaceCourseData } from "@indoor-o-route-analysis/core";
import CourseSettingMapViewer, { type CourseSettingMapViewerHandle } from "./map-viewer";
import CourseSettingPropertiesPanel from "./properties-panel";

export default function CourseSetting() {
  const {
    selectedEvent,
    selectedCourseId,
    setSelectedCourseId,
    selectedControlId,
    setSelectedControlId,
    updateEvent,
  } = useAppData();

  const mapViewerRef = useRef<CourseSettingMapViewerHandle>(null);

  const handleNavigate = (point: { x: number; y: number }) => {
    mapViewerRef.current?.flyTo(point);
  };

  const [showBackgroundMap, setShowBackgroundMap] = useState(true);
  const [isMapMuted, setIsMapMuted] = useState(false);
  const [showDifficultyColors, setShowDifficultyColors] = useState(false);
  const [controlColors, setControlColors] = useState<Map<string, string>>(new Map());
  const [autoAddToCourse, setAutoAddToCourse] = useState(false);

  // Access the first race course
  const raceCourse = selectedEvent?.raceCourses?.[0];
  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId ?? undefined);

  // Calculate difficulty colors for available controls.
  // Progress is shown in the properties panel; turning the toggle off (or any
  // input change) aborts the running calculation via the effect cleanup.
  const [difficultyProgress, setDifficultyProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const reset = () => {
      setControlColors(new Map());
      setDifficultyProgress(null);
    };
    if (!showDifficultyColors || !selectedEvent || !selectedCourseId || !raceCourse) {
      setTimeout(reset, 0);
      return;
    }

    const course = raceCourse.courses?.find((c) => c.id === selectedCourseId);
    const lastControlId = course?.controls?.[course.controls.length - 1]?.controlId;
    const eventControls = raceCourse.controls ?? [];
    if (!course || !lastControlId || !eventControls.some((c) => c.id === lastControlId)) {
      setTimeout(reset, 0);
      return;
    }

    // Exclude controls already in the course
    const courseControlIds = new Set(course.controls.map((c) => c.controlId).filter((id): id is string => !!id));
    const candidateIds = eventControls
      .filter((c) => !courseControlIds.has(c.id) && c.id !== lastControlId)
      .map((c) => c.id);

    const scoringModel = getEventScoringModel(selectedEvent);
    const analyzer = createEventRouteAnalyzer(selectedEvent, { courseId: selectedCourseId });

    const abort = new AbortController();
    setTimeout(() => {
      if (!abort.signal.aborted) setDifficultyProgress({ done: 0, total: candidateIds.length });
    }, 0);

    analyzeNextLegs(analyzer, lastControlId, candidateIds, {
      signal: abort.signal,
      onProgress: (p) => {
        if (!abort.signal.aborted) setDifficultyProgress(p);
      },
    }).then(({ results, aborted }) => {
      if (aborted) return;
      const colors = new Map<string, string>();
      for (const r of results) colors.set(r.controlId, getDifficultyCategory(r.difficulty, scoringModel).color);
      setControlColors(colors);
      setDifficultyProgress(null);
    });

    return () => {
      abort.abort();
      setTimeout(() => setDifficultyProgress(null), 0);
    };
  }, [
    showDifficultyColors,
    selectedEvent,
    selectedCourseId,
    raceCourse, // Depend on raceCourse object
    activeMap?.scale,
  ]);

  /**
   * Update the first race course of the latest event: either merge fields, or
   * apply a function to it. `label` names the undo step.
   */
  const updateRaceCourse = useCallback(
    async (updates: Partial<RaceCourseData> | ((rc: RaceCourseData) => RaceCourseData), label?: string) => {
      if (!selectedEvent) return;
      await updateEvent(
        selectedEvent.id,
        (e) => (typeof updates === "function" ? updateRaceCourseOf(e, updates) : mergeRaceCourse(e, updates)),
        undefined,
        { label },
      );
    },
    [selectedEvent, updateEvent],
  );

  const handleAddControlToCourse = useCallback(
    async (controlId: string) => {
      if (!selectedCourseId || !raceCourse) return;

      // Find the control by ID
      const control = (raceCourse.controls ?? []).find((c) => c.id === controlId);
      if (!control) return;

      // Append control ID to the current course
      const courseId = selectedCourseId;
      await updateRaceCourse(
        (rc) => ({
          ...rc,
          courses: (rc.courses ?? []).map((c) =>
            c.id === courseId ? { ...c, controls: [...(c.controls ?? []), { controlId: control.id }] } : c,
          ),
        }),
        "Add control to course",
      );
    },
    [selectedCourseId, raceCourse, updateRaceCourse],
  );

  const handleMoveControl = useCallback(
    async (delta: { x: number; y: number }) => {
      if (!raceCourse || !selectedControlId) return;

      const control = raceCourse.controls?.find((c) => c.id === selectedControlId);
      if (!control) return;

      const id = selectedControlId;
      // Arrow-key nudges within the coalescing window merge into one undo step
      await updateRaceCourse(
        (rc) => ({
          ...rc,
          controls: (rc.controls ?? []).map((c) =>
            c.id === id
              ? { ...c, mapPosition: { ...c.mapPosition, x: c.mapPosition.x + delta.x, y: c.mapPosition.y + delta.y } }
              : c,
          ),
        }),
        "Move control",
      );
    },
    [selectedControlId, raceCourse, updateRaceCourse],
  );

  const handleDeleteSelectedControl = useCallback(async () => {
    if (!raceCourse || !selectedControlId) return;
    // Shared helper: removes the control, its course entries and its graph edges
    const id = selectedControlId;
    await updateRaceCourse((rc) => removeControl(rc, id), "Delete control");
    setSelectedControlId(null);
  }, [selectedControlId, raceCourse, setSelectedControlId, updateRaceCourse]);

  useEffect(() => {
    const isFormElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      const editable = target.getAttribute("contenteditable");
      return tag === "INPUT" || tag === "TEXTAREA" || editable === "true";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFormElement(event.target)) return;

      if (event.key === "Escape" && selectedControlId) {
        event.preventDefault();
        setSelectedControlId(null);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedControlId) {
        event.preventDefault();
        handleDeleteSelectedControl();
        return;
      }


      if (event.metaKey || event.ctrlKey) {
        // Ctrl/Cmd+S: Set control type to Start
        if (event.key.toLowerCase() === "s" && selectedControlId) {
          event.preventDefault();
          const id = selectedControlId;
          updateRaceCourse(
            (rc) => ({ ...rc, controls: (rc.controls ?? []).map((c) => (c.id === id ? { ...c, type: "start" as const } : c)) }),
            "Set control type",
          );
          return;
        }

        // Ctrl/Cmd+F: Set control type to Finish
        if (event.key.toLowerCase() === "f" && selectedControlId) {
          event.preventDefault();
          const id = selectedControlId;
          updateRaceCourse(
            (rc) => ({ ...rc, controls: (rc.controls ?? []).map((c) => (c.id === id ? { ...c, type: "finish" as const } : c)) }),
            "Set control type",
          );
          return;
        }

        return;
      }

      if (event.key.toLowerCase() === "a" && selectedControlId) {
        event.preventDefault();
        const control = raceCourse?.controls?.find((c) => c.id === selectedControlId);
        if (control) {
          handleAddControlToCourse(control.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleAddControlToCourse,
    handleDeleteSelectedControl,
    handleMoveControl,
    selectedControlId,
    raceCourse,
    updateRaceCourse,
    setSelectedControlId,
  ]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main View */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        <CourseSettingMapViewer
          ref={mapViewerRef}
          map={activeMap}
          selectedControlId={selectedControlId}
          onControlSelected={setSelectedControlId}
          onMoveControl={handleMoveControl}
          showBackgroundMap={showBackgroundMap}
          backgroundOpacity={isMapMuted ? 0.3 : 1}
          controlColors={controlColors}
          autoAddToCourse={autoAddToCourse}
        />

        {/* Properties Panel */}
        <CourseSettingPropertiesPanel
          selectedCourseId={selectedCourseId}
          onSelectedCourseChange={setSelectedCourseId}
          onAddControlToCourse={handleAddControlToCourse}
          selectedControlId={selectedControlId}
          onSelectedControlChange={setSelectedControlId}
          onNavigate={handleNavigate}
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={setShowBackgroundMap}
          isMapMuted={isMapMuted}
          onMuteChange={setIsMapMuted}
          showDifficultyColors={showDifficultyColors}
          onShowDifficultyColorsChange={setShowDifficultyColors}
          difficultyProgress={difficultyProgress}
          autoAddToCourse={autoAddToCourse}
          onAutoAddToCourseChange={setAutoAddToCourse}
        />
      </div>
    </div>
  );
}
