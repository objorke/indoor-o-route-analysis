// IOF course model

export const DEFAULT_NUMBER_OF_COMPETITORS = 10;

/**
 * Map exchange at a course control.
 * - "change": the competitor takes a new map at this control.
 * - "flip": the competitor turns the map over (the next part is on the back).
 * Both are drawn as the control circle plus a start triangle (ISOM course
 * symbols) — the triangle marks where the next map part starts. IOF XML 3.0 has
 * no dedicated element for this, so it is exported as a CourseControl extension.
 */
export type MapExchangeType = "change" | "flip";

/** Display names for map exchange types. */
export const MAP_EXCHANGE_LABELS: Record<MapExchangeType, string> = {
  change: "Map change",
  flip: "Map flip",
};

/** Cycle order used by the UI: none → change → flip → none. */
export function nextMapExchange(current: MapExchangeType | undefined): MapExchangeType | undefined {
  if (!current) return "change";
  if (current === "change") return "flip";
  return undefined;
}

export interface CourseControl {
  controlId: string; // The ID of the Control entity
  mapText?: string;
  type?: "start" | "control" | "finish";
  /** Map exchange (change or flip) at this control. Extension to the IOF course model. */
  mapExchange?: MapExchangeType;
}

export interface Course {
  id: string;
  name: string;
  controls: CourseControl[];
  mapId: string;
  // Extensions to the IOF course model
  numberOfCompetitors?: number;
  /** Target difficulty category for this course (e.g. "white", "yellow", "orange", "purple", "black") */
  targetDifficulty?: string;
}
