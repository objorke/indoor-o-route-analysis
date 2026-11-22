"use client"

import { useEffect, useMemo, useState, useRef } from "react";
import { useAppData } from "@indoor-o-route-analysis/ui"
import { getCourseControlLabels } from "@indoor-o-route-analysis/core";
import { Button } from "@indoor-o-route-analysis/ui"
import { Input, NumericInput } from "@indoor-o-route-analysis/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui"
import { Progress } from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { Trash2, Plus, ArrowUp, ArrowDown, Info, Palette, Lightbulb, Link, AlertCircle, Target, Pencil, Check, X, Loader2, Triangle } from "lucide-react";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import CourseSettingInfoDialog from "./info-dialog";
import { GenerateCourseDialog } from "./generate-course-dialog";
import { NextControlsList } from "./next-controls-list";
import { isControlIdUnique, updateControlIdInControls, updateControlIdInCourses, updateControlIdInGraph } from "@indoor-o-route-analysis/core";
import type { Control, CourseControl } from "@indoor-o-route-analysis/core";
import { nextMapExchange, MAP_EXCHANGE_LABELS, removeControl, updateRaceCourse, type RaceCourseData } from "@indoor-o-route-analysis/core";
import { notify } from "@indoor-o-route-analysis/ui";

// Global keydown listener removed to avoid conflict with control code editing
// If level shortcuts are needed, they should be re-implemented with a non-conflicting modifier (e.g. Alt+Number)

interface PropertiesPanelProps {
  selectedCourseId?: string | null;
  onSelectedCourseChange?: (courseId: string | null) => void;
  onAddControlToCourse?: (controlCode: string) => void;
  selectedControlId?: string | null;
  onSelectedControlChange?: (controlId: string | null) => void;
  onNavigate?: (point: { x: number; y: number }) => void;
  properties?: Control | null;
  onPropertiesChange?: (properties: Partial<Control>) => void;
  showBackgroundMap?: boolean;
  onShowBackgroundMapChange?: (show: boolean) => void;
  isMapMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
  showDifficultyColors?: boolean;
  onShowDifficultyColorsChange?: (show: boolean) => void;
  /** Progress of the running difficulty-color calculation, or null when idle. */
  difficultyProgress?: { done: number; total: number } | null;
  autoAddToCourse?: boolean;
  onAutoAddToCourseChange?: (autoAdd: boolean) => void;
}

export default function CourseSettingPropertiesPanel({
  selectedCourseId: externalSelectedCourseId,
  onSelectedCourseChange,
  onAddControlToCourse,
  selectedControlId: externalSelectedControlId,
  onSelectedControlChange,
  onNavigate,
  properties: propProperties,
  onPropertiesChange: propOnPropertiesChange,
  showBackgroundMap = true,
  onShowBackgroundMapChange,
  isMapMuted = false,
  onMuteChange,
  showDifficultyColors = false,
  onShowDifficultyColorsChange,
  difficultyProgress = null,
  autoAddToCourse = false,
  onAutoAddToCourseChange,
}: PropertiesPanelProps) {
  const {
    selectedEvent,
    selectedCourseId: contextSelectedCourseId,
    setSelectedCourseId: contextSetSelectedCourseId,
    selectedControlId: contextSelectedControlId,
    setSelectedControlId: contextSetSelectedControlId,
    updateEvent,
  } = useAppData();

  /** Apply `fn` to the first race course of the latest event (never a render-time copy). */
  const updateLatestRaceCourse = (fn: (rc: RaceCourseData) => RaceCourseData, label?: string) =>
    selectedEvent ? updateEvent(selectedEvent.id, (e) => updateRaceCourse(e, fn), undefined, { label }) : Promise.resolve();
  /** Update one control by id in the latest event. */
  const updateControl = (id: string, fn: (c: Control) => Control, label = "Edit control") =>
    updateLatestRaceCourse((rc) => ({ ...rc, controls: (rc.controls ?? []).map((c) => (c.id === id ? fn(c) : c)) }), label);


  // Use external course ID if provided, otherwise use context
  const selectedCourseId = externalSelectedCourseId ?? contextSelectedCourseId;
  const setSelectedCourseId = onSelectedCourseChange ?? contextSetSelectedCourseId;

  // Use external control ID if provided, otherwise use context
  const selectedControlId = externalSelectedControlId ?? contextSelectedControlId;
  const setSelectedControlId = onSelectedControlChange ?? contextSetSelectedControlId;

  // Access the first race course
  const raceCourse = selectedEvent?.raceCourses?.[0];

  const selectedControl = useMemo(() => {
    return raceCourse?.controls?.find((c) => c.id === selectedControlId) ?? null;
  }, [raceCourse, selectedControlId]);

  const properties = useMemo(() => {
    if (propProperties) return propProperties;
    return selectedControl ? selectedControl : null;
  }, [propProperties, selectedControl]);

  const onPropertiesChange = useMemo(() => {
    if (propOnPropertiesChange) return propOnPropertiesChange;
    return async (newProps: Partial<Control>) => {
      if (!selectedControlId || !selectedEvent || !raceCourse) return;

      await updateControl(selectedControlId, (c) => ({ ...c, ...newProps }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateControl is recreated each render but only closes over selectedEvent/updateEvent
  }, [propOnPropertiesChange, selectedControlId, selectedEvent, raceCourse, updateEvent]);

  const [editingCodeIndex, setEditingCodeIndex] = useState<number | null>(null);
  const [editingCodeValue, setEditingCodeValue] = useState("");
  const [tempControlId, setTempControlId] = useState<string>(""); // Local state for control ID editing
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Sync tempControlId with selectedControl
  useEffect(() => {
    if (selectedControl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local edit state from prop
      setTempControlId(selectedControl.id);
    }
  }, [selectedControl]);

  const commitControlIdChange = async () => {
    if (!selectedControl || !raceCourse || !selectedEvent) return;
    if (tempControlId === selectedControl.id) return; // No change

    if (!isControlIdUnique(tempControlId, raceCourse.controls || [], selectedControl.id)) {
      // Simple alert for now, can be improved
      notify("Control Code must be unique.");
      setTempControlId(selectedControl.id); // Revert
      return;
    }

    const oldId = selectedControl.id;
    const newId = tempControlId;
    await updateLatestRaceCourse((rc) => {
      const graph = updateControlIdInGraph(rc.vertices || [], rc.edges || [], oldId, newId);
      return {
        ...rc,
        controls: updateControlIdInControls(rc.controls || [], oldId, newId),
        courses: updateControlIdInCourses(rc.courses || [], oldId, newId),
        vertices: graph.nodes,
        edges: graph.edges,
      };
    }, "Rename control");
    setSelectedControlId(newId);
  };

  // Listen for key presses to set control code when a control is selected
  useEffect(() => {
    if (!selectedControlId || !properties || properties.type !== "control") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Only handle if not in an input/textarea/select
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const key = e.key.toUpperCase();
      // Logic for numbers, S (Start), F (Finish)
      if ((key >= "0" && key <= "9") || key === "S" || key === "F") {
        e.preventDefault();

        // Update property
        if (onPropertiesChange) {
          onPropertiesChange({ ...properties, id: key });
        }

        // Focus input
        setTimeout(() => {
          codeInputRef.current?.focus();
        }, 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedControlId, properties, onPropertiesChange]);

  const currentCourses = useMemo(() => {
    return [...(raceCourse?.courses ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [raceCourse]);

  const currentCourse = useMemo(() => {
    return currentCourses.find((c) => c.id === selectedCourseId) ?? null;
  }, [currentCourses, selectedCourseId]);

  const controls = useMemo(() => raceCourse?.controls ?? [], [raceCourse?.controls]);

  const courseControlIds = useMemo(() => {
    return currentCourse?.controls?.map((c) => c.controlId) ?? [];
  }, [currentCourse]);

  const courseControls = useMemo(() => {
    return courseControlIds
      .map((id) => {
        if (!id) return null;
        const found = controls.find((c) => c.id === id);
        return found || ({ id, type: 'control', mapPosition: { x: 0, y: 0 } } as Control);
      })
      .filter((c): c is Control => Boolean(c));
  }, [controls, courseControlIds]);

  const courseControlLabels = useMemo(() => {
    return getCourseControlLabels(currentCourse?.controls ?? [], controls);
  }, [currentCourse?.controls, controls]);

  const suggestionProps = useMemo(() => {
    if (!currentCourse?.controls || currentCourse.controls.length === 0) return null;

    const lastCourseControl = currentCourse.controls[currentCourse.controls.length - 1];
    if (!lastCourseControl.controlId) return null;

    const excludeIds = currentCourse.controls.map((c) => c.controlId).filter((id): id is string => !!id);

    return {
      lastControlId: lastCourseControl.controlId,
      excludeControlIds: excludeIds,
    };
  }, [currentCourse]);

  // Validate selected course when event changes
  useEffect(() => {
    if (!currentCourses.some((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(currentCourses[0]?.id ?? null);
    }
  }, [currentCourses, selectedCourseId, setSelectedCourseId]);

  /** Replace the selected course's control entries (keeps per-entry fields like mapText/mapExchange). */
  const updateCourseControls = async (entries: CourseControl[]) => {
    if (!selectedEvent || !selectedCourseId || !raceCourse) return;

    const courseId = selectedCourseId;
    await updateLatestRaceCourse((rc) => ({
      ...rc,
      courses: (rc.courses ?? []).map((c) => (c.id === courseId ? { ...c, controls: entries } : c)),
    }), "Edit course");
  };

  const courseEntries = useMemo(() => currentCourse?.controls ?? [], [currentCourse]);

  const setCourseControlCode = (idx: number, code: string) => {
    const entries = [...courseEntries];
    entries[idx] = { ...entries[idx], controlId: code };
    updateCourseControls(entries);
  };

  const swapCourseControls = (a: number, b: number) => {
    const entries = [...courseEntries];
    [entries[a], entries[b]] = [entries[b], entries[a]];
    updateCourseControls(entries);
  };

  const removeCourseControl = (idx: number) => {
    updateCourseControls(courseEntries.filter((_, i) => i !== idx));
  };

  /** Cycle the map exchange at a course entry: none → map change → map flip → none. */
  const cycleMapExchange = (idx: number) => {
    const entries = [...courseEntries];
    const next = nextMapExchange(entries[idx]?.mapExchange);
    const { mapExchange: _old, ...rest } = entries[idx];
    entries[idx] = next ? { ...rest, mapExchange: next } : rest;
    updateCourseControls(entries);
  };

  /** Map exchange is only meaningful on ordinary controls that are not the last in the course. */
  const canHaveMapExchange = (idx: number) => {
    const ctrl = controls.find((c) => c.id === courseEntries[idx]?.controlId);
    return (ctrl?.type ?? "control") === "control" && idx < courseEntries.length - 1;
  };

  // Shortcut: M cycles the map exchange at the selected control (first occurrence in the course).
  useEffect(() => {
    if (!selectedControlId || !selectedCourseId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (e.key.toUpperCase() !== "M") return;
      const idx = courseEntries.findIndex((cc) => cc.controlId === selectedControlId);
      if (idx < 0 || !canHaveMapExchange(idx)) return;
      e.preventDefault();
      cycleMapExchange(idx);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const [isEditingCourseName, setIsEditingCourseName] = useState(false);
  const [courseNameInput, setCourseNameInput] = useState("");

  // Sync input with selected course name
  useEffect(() => {
    if (currentCourse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local edit state from derived data
      setCourseNameInput(currentCourse.name);
    }
  }, [currentCourse]);

  const handleSaveCourseName = async () => {
    if (!selectedEvent || !selectedCourseId || !raceCourse) return;
    
    const courseId = selectedCourseId;
    const name = courseNameInput;
    await updateLatestRaceCourse((rc) => ({
      ...rc,
      courses: (rc.courses ?? []).map((c) => (c.id === courseId ? { ...c, name } : c)),
    }), "Rename course");
    setIsEditingCourseName(false);
  };

  const _handleUpdate = (updates: Partial<Control>) => {
    if (onPropertiesChange) {
      onPropertiesChange({ ...properties, ...updates });
    }
  };

  const handleCreateNewCourse = async () => {
    if (!selectedEvent || !raceCourse) return;

    const newCourseId = crypto.randomUUID();
    const firstMapId = raceCourse.maps?.[0]?.id || "";
    const newCourse = {
      id: newCourseId,
      name: `Course ${(raceCourse.courses?.length || 0) + 1}`,
      controls: [],
      mapId: firstMapId,
      extensions: {
        numberOfCompetitors: 0,
      }
    };

    await updateLatestRaceCourse((rc) => ({ ...rc, courses: [...(rc.courses ?? []), newCourse] }), "New course");
    setSelectedCourseId(newCourseId);
  };

  const renderDifficultyProgress = () => {
    if (!difficultyProgress) return null;
    const pct = difficultyProgress.total > 0 ? Math.round((difficultyProgress.done / difficultyProgress.total) * 100) : 0;
    return (
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border bg-card text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        <span className="whitespace-nowrap">Coloring by difficulty</span>
        <Progress value={pct} className="h-1 flex-1" />
        <span className="font-mono tabular-nums">{difficultyProgress.done}/{difficultyProgress.total}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          title="Stop calculating and hide difficulty colors"
          onClick={() => onShowDifficultyColorsChange?.(false)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  const renderToolbar = () => {
    return (
    <>
    <div className="flex items-center justify-between px-2 border-b border-border bg-card h-8">
      <div className="flex items-center gap-1">
        <MapVisibilityToggle
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={onShowBackgroundMapChange}
          isMapMuted={isMapMuted}
          onMuteChange={onMuteChange}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showDifficultyColors ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onShowDifficultyColorsChange?.(!showDifficultyColors)}
                disabled={!selectedCourseId}
              >
                {difficultyProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {difficultyProgress
                ? "Calculating difficulties… click to stop and hide the coloring."
                : showDifficultyColors
                ? "Hide the difficulty-based coloring of available controls."
                : "Color available controls based on the difficulty of the leg to reach them."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showSuggestions ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowSuggestions(!showSuggestions)}
                disabled={!selectedCourseId || !showBackgroundMap}
              >
                <Lightbulb className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showSuggestions 
                ? "Hide the suggested next controls panel." 
                : "Show a list of suggested controls for the next leg based on difficulty and distance."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoAddToCourse ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onAutoAddToCourseChange?.(!autoAddToCourse)}
                disabled={!selectedCourseId}
              >
                <Link className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {autoAddToCourse 
                ? "Disable automatic addition of clicked controls to the current course." 
                : "Automatically add clicked or newly created controls to the current course."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {(() => {
          // Map exchange (change/flip) for the selected control in the current course
          const mxIdx = selectedControlId ? courseEntries.findIndex((cc) => cc.controlId === selectedControlId) : -1;
          const mxEnabled = mxIdx >= 0 && canHaveMapExchange(mxIdx);
          const mx = mxEnabled ? courseEntries[mxIdx]?.mapExchange : undefined;
          const nextMx = nextMapExchange(mx);
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant={mx ? "active" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => cycleMapExchange(mxIdx)}
                      disabled={!mxEnabled}
                    >
                      <Triangle className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {mxEnabled
                    ? `Map exchange at control ${selectedControlId}: ${mx ? MAP_EXCHANGE_LABELS[mx].toLowerCase() : "none"}. Click to set ${nextMx ? MAP_EXCHANGE_LABELS[nextMx].toLowerCase() : "none"} (M).`
                    : "Map exchange (change/flip): select a control in the current course (not the start, finish or last control) (M)."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
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
            <TooltipContent>Open the information guide for course setting features.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Hamburger menu */}
      </div>
    </div>
    {renderDifficultyProgress()}
    </>
  );
  };

  const renderCourseSelector = () => {
    if (isEditingCourseName) {
      return (
        <div className="w-full flex items-center p-1 gap-1 border-b border-border">
          <Input
            value={courseNameInput}
            onChange={(e) => setCourseNameInput(e.target.value)}
            className="h-8 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCourseName();
              if (e.key === "Escape") setIsEditingCourseName(false);
            }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveCourseName}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsEditingCourseName(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="w-full flex items-center border-b border-border">
        <div className="flex-1 min-w-0">
          <Select
            value={selectedCourseId ?? ""}
            onValueChange={(value) => setSelectedCourseId(value || null)}
            disabled={currentCourses.length === 0}
          >
            <SelectTrigger className="w-full rounded-none border-none h-10 px-4 focus:ring-0 shadow-none">
              <SelectValue placeholder="Select course" />
            </SelectTrigger>
            <SelectContent>
              {currentCourses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.name || "Untitled Course"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 border-l border-border rounded-none"
          onClick={() => setIsEditingCourseName(true)}
          disabled={!selectedCourseId}
          title="Rename course"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 border-l border-border rounded-none"
          onClick={handleCreateNewCourse}
          title="Create new course"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <GenerateCourseDialog onCourseGenerated={(id) => setSelectedCourseId(id)} />
      </div>
    );
  };

  if (!properties || ["control", "start", "finish"].includes(properties.type)) {
    return (
      <div className="w-80 border-l border-border bg-card flex flex-col h-full">
        {renderToolbar()}
        {/* Main content area - flex container */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Course Properties Section - Scrollable, fills available space */}
          <div className="flex-1 overflow-auto">
            {renderCourseSelector()}

            {selectedCourseId && selectedEvent ? (
              <>
                <div className="mb-4">
                  <div>
                    <div className="border-b border-border border-opacity-60 bg-background shadow-sm overflow-hidden flex flex-col h-full">
                      {(() => {
                        return (
                          <div className="overflow-y-auto flex-1">
                            {courseControls.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                No controls in course
                              </div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead className="bg-muted bg-opacity-50 sticky top-0">
                                  <tr>
                                    <th className="text-left px-2 py-1 font-medium text-muted-foreground w-12">#</th>
                                    <th className="text-left px-2 py-1 font-medium text-muted-foreground w-16">Code</th>
                                    <th className="text-center px-2 py-1 font-medium text-muted-foreground w-12">
                                      {/* Level/Floor removed */}
                                    </th>
                                    <th className="text-right px-2 py-1 font-medium text-muted-foreground w-16">
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {courseControls.map((control, idx) => {
                                    const controlLabel = courseControlLabels[idx] ?? "";
                                    const isMissing = !controls.find((c) => c.id === control.id);

                                    return (
                                      <tr
                                        key={`${control?.id}-${idx}`}
                                        className={`border-t border-border border-opacity-60 cursor-pointer ${
                                          selectedControlId === control.id ? "bg-muted bg-opacity-70" : "hover:bg-muted hover:bg-opacity-30"
                                        }`}
                                        onClick={() => setSelectedControlId(control.id)}
                                      >
                                        <td className="px-2 py-1 text-center">{controlLabel}</td>
                                        <td className="px-2 py-1 font-mono">
                                          {editingCodeIndex === idx ? (
                                            <input
                                              type="text"
                                              value={editingCodeValue}
                                              onChange={(e) => setEditingCodeValue(e.target.value)}
                                              onClick={(e) => e.stopPropagation()}
                                              onBlur={() => {
                                                setCourseControlCode(idx, editingCodeValue);
                                                setEditingCodeIndex(null);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  setCourseControlCode(idx, editingCodeValue);
                                                  setEditingCodeIndex(null);
                                                } else if (e.key === "Escape") {
                                                  setEditingCodeIndex(null);
                                                } else if (e.key === "Delete" || e.key === "Backspace") {
                                                  e.preventDefault();
                                                }
                                              }}
                                              autoFocus
                                              className="w-full px-1 py-0 bg-background border border-primary rounded text-xs"
                                            />
                                          ) : (
                                            <div className="flex items-center gap-0.5">
                                              <span
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingCodeIndex(idx);
                                                  setEditingCodeValue(control?.id ?? "");
                                                }}
                                                className={`cursor-pointer hover:underline ${isMissing ? "text-red-500" : ""}`}
                                              >
                                                {control?.id}
                                              </span>
                                              {courseEntries[idx]?.mapExchange && (
                                                <span
                                                  className="ml-1 px-1 rounded bg-primary/20 text-primary text-[9px] font-sans uppercase"
                                                  title={MAP_EXCHANGE_LABELS[courseEntries[idx].mapExchange!]}
                                                >
                                                  {courseEntries[idx].mapExchange}
                                                </span>
                                              )}
                                              {isMissing && (
                                                <div title="Control not found in event" className="ml-1">
                                                  <AlertCircle className="w-3 h-3 text-red-500" />
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                          {/* Level display removed */}
                                        </td>
                                        <td className="px-2 py-1 text-right space-x-1 flex justify-end">
                                          {canHaveMapExchange(idx) && (() => {
                                            const mx = courseEntries[idx]?.mapExchange;
                                            const nextMx = nextMapExchange(mx);
                                            return (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  cycleMapExchange(idx);
                                                }}
                                                className={`p-0.5 hover:bg-muted rounded ${mx ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                                title={`Map exchange: ${mx ? MAP_EXCHANGE_LABELS[mx] : "none"}. Click to set ${nextMx ? MAP_EXCHANGE_LABELS[nextMx].toLowerCase() : "none"} (M)`}
                                              >
                                                <Triangle className="w-3 h-3" />
                                              </button>
                                            );
                                          })()}
                                          {idx > 0 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                swapCourseControls(idx, idx - 1);
                                              }}
                                              className="p-0.5 hover:bg-muted rounded"
                                              title="Move up"
                                            >
                                              <ArrowUp className="w-3 h-3" />
                                            </button>
                                          )}
                                          {idx < courseControls.length - 1 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                swapCourseControls(idx, idx + 1);
                                              }}
                                              className="p-0.5 hover:bg-muted rounded"
                                              title="Move down"
                                            >
                                              <ArrowDown className="w-3 h-3" />
                                            </button>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeCourseControl(idx);
                                            }}
                                            className="p-0.5 hover:bg-destructive hover:bg-opacity-10 hover:text-destructive rounded"
                                            title="Remove from course"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {showSuggestions && suggestionProps && (
                  <NextControlsList
                    event={selectedEvent}
                    courseId={selectedCourseId}
                    lastControlId={suggestionProps.lastControlId}
                    excludeControlIds={suggestionProps.excludeControlIds}
                    onNavigateTo={(id) => setSelectedControlId(id)}
                    onAddToCourse={(code) => onAddControlToCourse?.(code)}
                  />
                )}
              </>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-4">{"Select event and course"}</div>
            )}
          </div>
        </div>

        {/* Selected Control Properties Section */}
        {selectedControl && (
          <div className="border-t border-border p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{"Selected Control"}</h3>
              {onNavigate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onNavigate(selectedControl.mapPosition)}
                  title="Navigate to control"
                >
                  <Target className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  ref={codeInputRef}
                  title="Control Code"
                  type="text"
                  value={tempControlId}
                  onChange={(e) => setTempControlId(e.target.value)}
                  onBlur={commitControlIdChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  className="flex-1 font-mono text-sm"
                  maxLength={10}
                  placeholder="Code"
                />
                <Select
                  value={selectedControl.type}
                  onValueChange={(value) => {
                    void updateControl(selectedControl.id, (c) => ({ ...c, type: value as Control["type"] }));
                  }}
                >
                  <SelectTrigger className="w-24 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start">Start</SelectItem>
                    <SelectItem value="control">Control</SelectItem>
                    <SelectItem value="finish">Finish</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumericInput
                  title="X coordinate (mm)"
                  aria-label="X coordinate (mm)"
                  decimals={2}
                  value={selectedControl.mapPosition.x}
                  onCommit={(v) =>
                    void updateControl(selectedControl.id, (c) => ({ ...c, mapPosition: { ...c.mapPosition, x: v } }))
                  }
                  className="text-sm"
                  placeholder="X (mm)"
                />
                <NumericInput
                  title="Y coordinate (mm)"
                  aria-label="Y coordinate (mm)"
                  decimals={2}
                  value={selectedControl.mapPosition.y}
                  onCommit={(v) =>
                    void updateControl(selectedControl.id, (c) => ({ ...c, mapPosition: { ...c.mapPosition, y: v } }))
                  }
                  className="text-sm"
                  placeholder="Y (mm)"
                />
              </div>

              {/* Level removed from manual editing */}
              
              <div className="flex gap-2">
                {onAddControlToCourse && selectedCourseId && (
                  <Button
                    title="Add this control to the current course"
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => onAddControlToCourse(selectedControl.id)}
                  >
                    Add to course
                  </Button>
                )}
                <Button
                  title="Delete control"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    const id = selectedControl.id;
                    void updateLatestRaceCourse((rc) => removeControl(rc, id), "Delete control");
                    setSelectedControlId(null);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Info Dialog */}
        <CourseSettingInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      {renderToolbar()}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a control to view properties
      </div>
    </div>
  );
}