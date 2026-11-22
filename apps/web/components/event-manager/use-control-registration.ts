import { useEffect, useState, type MutableRefObject } from "react";
import { notify } from "@indoor-o-route-analysis/ui";
import {
  getDocumentDimensions,
  registrationFromMarks,
  type Control,
  type MapData,
  type MapPosition,
  type MapTransformCorners,
} from "@indoor-o-route-analysis/core";
import { eventPosToMultiPagePixels } from "@/components/map-viewer";

export type MarkId = 1 | 2;

/** Marks closer than this fraction of the document diagonal trigger the "far apart" advice. */
export const CLOSE_MARKS_FRACTION = 0.3;

interface Options {
  map: MapData | undefined;
  controls: Control[];
  /** Page whose transform is being edited (manual per-page mode), else undefined. */
  pageIndex: number | undefined;
  /** Latest pixels-per-mm of the map viewer (marks are stored in canvas mm). */
  pixelsPerMMRef: MutableRefObject<number>;
  applyTransform: (corners: MapTransformCorners, label?: string) => Promise<void>;
}

/** The two controls that are farthest apart (MapPosition), for the default selection. */
export function farthestControlPair(controls: Control[]): [Control, Control] | null {
  let best: [Control, Control] | null = null;
  let bestDist = -1;
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i].mapPosition;
      const b = controls[j].mapPosition;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > bestDist) {
        bestDist = d;
        best = [controls[i], controls[j]];
      }
    }
  }
  return best;
}

/**
 * State and behaviour of the Map tab's "Update coordinate transform" tool:
 * each chosen control gets a mark where the control is drawn now. Click on the
 * map where the control really is (or drag its mark, or nudge it with the arrow
 * keys), then the same for the second control. Apply computes the transform
 * (core `registrationFromMarks`, same scale in X and Y) and saves it.
 * Marks are kept in canvas mm, the same space as the viewer's mouse positions.
 */
export function useControlRegistration({ map, controls, pageIndex, pixelsPerMMRef, applyTransform }: Options) {
  const [active, setActive] = useState(false);
  const [id1, setId1State] = useState("");
  const [id2, setId2State] = useState("");
  const [mark1, setMark1] = useState<MapPosition | null>(null);
  const [mark2, setMark2] = useState<MapPosition | null>(null);
  /** The control that the next click on the map places (null: clicks only pan). */
  const [placing, setPlacing] = useState<MarkId | null>(null);
  const [draggingMark, setDraggingMark] = useState<MarkId | null>(null);
  const [selectedMark, setSelectedMark] = useState<MarkId | null>(null);
  const [residual, setResidual] = useState<number | null>(null);
  /** Marks the user has placed or moved since the control was chosen. */
  const [moved, setMoved] = useState<Record<MarkId, boolean>>({ 1: false, 2: false });

  /** Canvas-mm position where a control is drawn with the current transform. */
  const controlMark = (controlId: string): MapPosition | null => {
    const ctrl = controls.find((c) => c.id === controlId);
    const ppm = pixelsPerMMRef.current;
    if (!map || !ctrl || !(ppm > 0)) return null;
    const px = eventPosToMultiPagePixels(ctrl.mapPosition, map, ppm);
    return { x: px.x / ppm, y: px.y / ppm };
  };

  // Arrow keys nudge the selected mark (1 mm, Shift = 0.1 mm)
  useEffect(() => {
    if (!active || !selectedMark) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack Alt/Cmd+arrow (browser back/forward) or Ctrl+arrow
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 0.1 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = delta[e.key];
      if (!d) return;
      e.preventDefault();
      const setter = selectedMark === 1 ? setMark1 : setMark2;
      setter((prev) => (prev ? { x: prev.x + d[0], y: prev.y + d[1] } : prev));
      setMoved((m) => ({ ...m, [selectedMark]: true }));
      setResidual(null); // the shown error is for the previous marks
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, selectedMark]);

  /** Choose the control for a slot: its mark starts on the control, and the next click places it. */
  const setId = (n: MarkId, id: string) => {
    if (n === 1) {
      setId1State(id);
      setMark1(controlMark(id));
    } else {
      setId2State(id);
      setMark2(controlMark(id));
    }
    setMoved((m) => ({ ...m, [n]: false }));
    setResidual(null);
    setSelectedMark(null);
    setPlacing(n);
  };

  /** Open the tool, pre-selecting the two candidate controls farthest apart. */
  const start = (candidates: Control[] = controls) => {
    const pair = farthestControlPair(candidates.length >= 2 ? candidates : controls);
    const first = pair?.[0].id ?? controls[0]?.id ?? "";
    const second = pair?.[1].id ?? "";
    setActive(true);
    setId1State(first);
    setId2State(second);
    setMark1(first ? controlMark(first) : null);
    setMark2(second ? controlMark(second) : null);
    setMoved({ 1: false, 2: false });
    setResidual(null);
    setSelectedMark(null);
    setPlacing(1);
  };

  const reset = () => {
    setActive(false);
    setMark1(null);
    setMark2(null);
    setPlacing(null);
    setDraggingMark(null);
    setSelectedMark(null);
    setResidual(null);
    setMoved({ 1: false, 2: false });
  };

  const canApply = !!mark1 && !!mark2 && !!id1 && !!id2 && id1 !== id2;

  /** Compute the transform from the two marks and save it. */
  const apply = async () => {
    if (!map || !mark1 || !mark2) return;
    const c1 = controls.find((c) => c.id === id1);
    const c2 = controls.find((c) => c.id === id2);
    if (!c1 || !c2 || c1 === c2) return;
    const result = registrationFromMarks(
      map,
      pageIndex,
      [
        { event: c1.mapPosition, canvasMark: mark1 },
        { event: c2.mapPosition, canvasMark: mark2 },
      ],
      true, // same scale in X and Y
    );
    if (!result) {
      setResidual(null);
      notify("The two marks are on top of each other. Place the controls far apart.");
      return;
    }
    setResidual(result.maxError);
    setPlacing(null);
    await applyTransform({ tl: result.topLeft, br: result.bottomRight }, "Update transform");
  };

  /** Mouse down at a canvas-mm point: starts dragging the nearest mark within `hitRadius`. Returns true if a mark was hit. */
  const pointerDown = (point: MapPosition, hitRadius: number): boolean => {
    const d1 = mark1 ? Math.hypot(point.x - mark1.x, point.y - mark1.y) : Infinity;
    const d2 = mark2 ? Math.hypot(point.x - mark2.x, point.y - mark2.y) : Infinity;
    const hit: MarkId | null = d1 <= hitRadius && d1 <= d2 ? 1 : d2 <= hitRadius ? 2 : null;
    if (hit) {
      setSelectedMark(hit);
      setDraggingMark(hit);
    }
    return hit !== null;
  };

  const pointerMove = (point: MapPosition) => {
    if (!draggingMark) return;
    if (draggingMark === 1) setMark1(point);
    else setMark2(point);
    if (!moved[draggingMark]) setMoved((m) => ({ ...m, [draggingMark]: true }));
    setResidual(null);
  };

  /** Returns true when a mark drag ended. */
  const pointerUp = (): boolean => {
    if (!draggingMark) return false;
    setDraggingMark(null);
    return true;
  };

  /**
   * A click (not a pan) on the map: places the control being placed, then moves
   * on to the other control if it has no mark yet. Returns true if a mark was placed.
   */
  const click = (point: MapPosition): boolean => {
    if (!placing) return false;
    const id = placing === 1 ? id1 : id2;
    if (!id) return false;
    if (placing === 1) setMark1(point);
    else setMark2(point);
    setSelectedMark(placing);
    setMoved((m) => ({ ...m, [placing]: true }));
    setResidual(null);
    // Move on to the other control unless the user already placed it
    const other: MarkId = placing === 1 ? 2 : 1;
    const otherId = other === 1 ? id1 : id2;
    setPlacing(!moved[other] && otherId ? other : null);
    return true;
  };

  /** True when both marks are placed closer than CLOSE_MARKS_FRACTION of the document diagonal. */
  const marksClose = (() => {
    if (!map || !mark1 || !mark2) return false;
    const dims = getDocumentDimensions(map);
    const diag = Math.hypot(dims.width, dims.height);
    return diag > 0 && Math.hypot(mark1.x - mark2.x, mark1.y - mark2.y) < CLOSE_MARKS_FRACTION * diag;
  })();

  return {
    active,
    id1,
    id2,
    setId,
    mark1,
    mark2,
    moved,
    canApply,
    apply,
    placing,
    setPlacing,
    draggingMark,
    selectedMark,
    residual,
    marksClose,
    start,
    reset,
    pointerDown,
    pointerMove,
    pointerUp,
    click,
  };
}
