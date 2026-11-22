"use client"

import { useEffect, useMemo, useState } from "react";
import { Info, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Label,
  NumericInput,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useAppData,
} from "@indoor-o-route-analysis/ui";
import {
  DIRECTION_SYMBOLS,
  getActiveMap,
  isDirectionPoint,
  rotateDirectionFeature,
  translateDirectionFeature,
  moveDirectionVertex,
  removeDirectionVertex,
  insertDirectionVertex,
  updateRaceCourse,
  type DirectionFeature,
} from "@indoor-o-route-analysis/core";
import DirectionsMapViewer, { type NewDirectionFeature } from "./map-viewer";
import DirectionsInfoDialog from "./info-dialog";
import { DIRECTION_TOOLS, getDirectionTool, type DirectionTool } from "./tools";

import { ToolIcon } from "./direction-symbol-icon";
const ROTATE_STEP_DEG = 15;

function isFormElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

/** "Directions" view: draw ISInOM course direction symbols on the map. */
export default function DirectionsView() {
  const { selectedEvent, selectedCourseId, updateEvent } = useAppData();
  const [tool, setTool] = useState<DirectionTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [oneWayStyle, setOneWayStyle] = useState<"single" | "line">("line");
  const [showInfo, setShowInfo] = useState(false);

  const raceCourse = selectedEvent?.raceCourses?.[0];
  const features = useMemo(() => raceCourse?.directions ?? [], [raceCourse?.directions]);
  const controls = useMemo(() => raceCourse?.controls ?? [], [raceCourse?.controls]);
  const map = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const selected = features.find((f) => f.id === selectedId) ?? null;

  /** Apply `fn` to the directions of the latest event, as one labelled undo step. */
  const updateDirections = (fn: (fs: DirectionFeature[]) => DirectionFeature[], label: string) => {
    if (!selectedEvent) return;
    void updateEvent(
      selectedEvent.id,
      (e) => updateRaceCourse(e, (rc) => ({ ...rc, directions: fn(rc.directions ?? []) })),
      undefined,
      { label },
    );
  };
  const updateFeature = (id: string, fn: (f: DirectionFeature) => DirectionFeature, label: string) =>
    updateDirections((fs) => fs.map((f) => (f.id === id ? fn(f) : f)), label);

  const addFeature = (feature: NewDirectionFeature) => {
    const id = crypto.randomUUID();
    updateDirections((fs) => [...fs, { ...feature, id } as DirectionFeature], `Draw ${DIRECTION_SYMBOLS[feature.kind].label.toLowerCase()}`);
    setSelectedId(id);
  };
  const deleteFeature = (id: string) => {
    updateDirections((fs) => fs.filter((f) => f.id !== id), "Delete symbol");
    if (selectedId === id) setSelectedId(null);
  };

  // A selection that disappears (undo, delete) is cleared
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing selection with event data
    if (selectedId && !features.some((f) => f.id === selectedId)) setSelectedId(null);
  }, [features, selectedId]);

  // Shortcuts: tool letters, Delete, R / Shift+R
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isFormElement(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === "r" && selected && isDirectionPoint(selected)) {
        e.preventDefault();
        updateFeature(selected.id, (f) => rotateDirectionFeature(f, e.shiftKey ? -ROTATE_STEP_DEG : ROTATE_STEP_DEG), "Rotate symbol");
        return;
      }
      if (e.key === "Escape" && selected) {
        // Esc deselects (while drawing, the map also cancels the unfinished line/area)
        setSelectedId(null);
        return;
      }
      if ((e.key === "Delete" || (e.key === "Backspace" && tool === "select")) && selected) {
        e.preventDefault();
        deleteFeature(selected.id);
        return;
      }
      if (e.shiftKey) return;
      const match = DIRECTION_TOOLS.find((t) => t.shortcut.toLowerCase() === key);
      if (match) {
        e.preventDefault();
        setTool(match.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!selectedEvent) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Open an event to draw its directions.</div>;
  }
  if (!map) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Import a map in Event → Map first.
      </div>
    );
  }

  const toolDef = getDirectionTool(tool);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="relative flex-1 flex overflow-hidden min-w-0">
        <TooltipProvider>
          {/* Above the tool explanation (z-20), so the tooltips aren't hidden behind it */}
          <div className="absolute top-2 left-2 z-30 flex flex-col gap-1 rounded-md border border-border bg-card/95 p-1 shadow-sm">
            {DIRECTION_TOOLS.map((t) => (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={tool === t.id ? "active" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setTool(t.id)}
                    aria-label={t.label}
                    aria-pressed={tool === t.id}
                  >
                    <ToolIcon tool={t.id} className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span className="font-medium">{t.label}</span>
                  {t.code && <span className="text-muted-foreground"> &middot; ISInOM {t.code}</span>} ({t.shortcut})
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
        <div className="absolute top-2 left-12 z-20 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-sm pointer-events-none">
          <span className="font-medium">{toolDef.label}:</span> <span className="text-muted-foreground">{toolDef.hint}</span>
        </div>
        <DirectionsMapViewer
          map={map}
          controls={controls}
          features={features}
          tool={tool}
          oneWayStyle={oneWayStyle}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addFeature}
          onMove={(id, dx, dy) => updateFeature(id, (f) => translateDirectionFeature(f, dx, dy), "Move symbol")}
          onMoveVertex={(id, i, to) => updateFeature(id, (f) => moveDirectionVertex(f, i, to), "Move point")}
          onRemoveVertex={(id, i) => updateFeature(id, (f) => removeDirectionVertex(f, i), "Delete point")}
          onInsertVertex={(id, i, at) => updateFeature(id, (f) => insertDirectionVertex(f, i, at), "Add point")}
        />
      </div>

      {/* Properties panel */}
      <div className="w-64 border-l border-border bg-card flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-2 h-9 border-b border-border">
          <span className="text-sm font-medium">Directions</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowInfo(true)} aria-label="Directions guide" title="Directions guide">
            <Info className="h-4 w-4" />
          </Button>
        </div>

        {tool === "one-way" && (
          <div className="px-3 py-2 border-b border-border text-xs space-y-1">
            <div className="text-muted-foreground">One-way arrows</div>
            <div className="flex rounded-md border border-border overflow-hidden" role="radiogroup" aria-label="One-way style">
              {(["single", "line"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={oneWayStyle === s}
                  onClick={() => setOneWayStyle(s)}
                  className={`flex-1 px-2 py-1 ${oneWayStyle === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {s === "single" ? "Single arrow" : "Line of arrows"}
                </button>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="px-3 py-2 border-b border-border text-xs space-y-2" data-testid="directions-properties">
            <div className="font-medium text-sm">{DIRECTION_SYMBOLS[selected.kind].label}</div>
            {isDirectionPoint(selected) && (
              <div className="flex items-center gap-2">
                <Label htmlFor="directions-rotation" className="text-xs text-muted-foreground">Rotation (°)</Label>
                <NumericInput
                  id="directions-rotation"
                  className="h-7 w-20 text-xs"
                  value={selected.rotation}
                  decimals={1}
                  onCommit={(v) => updateFeature(selected.id, (f) => rotateDirectionFeature(f, v - selected.rotation), "Rotate symbol")}
                />
              </div>
            )}
            {selected.kind === "one-way" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="directions-arrow-line"
                  checked={selected.style === "line"}
                  onCheckedChange={(c) =>
                    updateFeature(selected.id, (f) => (f.kind === "one-way" ? { ...f, style: c === true ? "line" : "single" } : f), "Edit one-way passage")
                  }
                />
                <Label htmlFor="directions-arrow-line" className="text-xs font-normal">Line of arrows</Label>
              </div>
            )}
            {selected.kind === "oob-area" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="directions-outline"
                  checked={selected.outline !== false}
                  onCheckedChange={(c) =>
                    updateFeature(selected.id, (f) => (f.kind === "oob-area" ? { ...f, outline: c === true } : f), "Edit out-of-bounds area")
                  }
                />
                <Label htmlFor="directions-outline" className="text-xs font-normal">Boundary line (0.4 mm)</Label>
              </div>
            )}
            {(selected.kind === "uncrossable" || selected.kind === "oob-boundary" || selected.kind === "oob-area-boundary") && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="directions-closed"
                  checked={!!selected.closed}
                  onCheckedChange={(c) =>
                    updateFeature(selected.id, (f) => (f.kind === "uncrossable" || f.kind === "oob-boundary" || f.kind === "oob-area-boundary" ? { ...f, closed: c === true } : f), "Edit line")
                  }
                />
                <Label htmlFor="directions-closed" className="text-xs font-normal">Closed</Label>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto" data-testid="directions-list">
          {features.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No direction symbols yet. Pick a tool on the left of the map.</p>
          ) : (
            <ul className="text-xs">
              {features.map((f, i) => (
                <li
                  key={f.id}
                  className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/60 cursor-pointer ${f.id === selectedId ? "bg-primary/15" : "hover:bg-muted/40"}`}
                  onClick={() => setSelectedId(f.id)}
                >
                  <span className="inline-block h-1.5 w-4 rounded-sm shrink-0" style={{ backgroundColor: DIRECTION_SYMBOLS[f.kind].color }} />
                  <span className="flex-1 truncate">
                    {i + 1}. {DIRECTION_SYMBOLS[f.kind].label}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${DIRECTION_SYMBOLS[f.kind].label}`}
                    title="Delete (Delete)"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFeature(f.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <DirectionsInfoDialog isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </div>
  );
}
