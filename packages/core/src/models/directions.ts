import type { MapPosition } from "./map";

/**
 * Course directions drawn by the course planner on top of the venue map
 * (ISInOM, indoor orienteering map norm). Positions are IOF MapPosition, like
 * controls. Symbol sizes are printed-map millimetres (see DIRECTION_SYMBOLS).
 */
export type DirectionLineKind = "uncrossable" | "oob-boundary" | "oob-area-boundary";
/** Point symbols (position + rotation): ISInOM 1772, 1773, 1774 and 1720. */
export const DIRECTION_POINT_KINDS = ["compulsory-crossing", "compulsory-switch", "compulsory-one-way-switch", "map-flip-point"] as const;
export type DirectionPointKind = (typeof DIRECTION_POINT_KINDS)[number];

/** True for a point symbol kind (also for unvalidated strings, e.g. while importing). */
export const isDirectionPointKind = (kind: string): kind is DirectionPointKind =>
  (DIRECTION_POINT_KINDS as readonly string[]).includes(kind);

export interface DirectionLine {
  id: string;
  kind: DirectionLineKind;
  /** Polyline vertices. */
  points: MapPosition[];
  /** Join the last point to the first. */
  closed?: boolean;
}

export interface DirectionArea {
  id: string;
  kind: "oob-area";
  /** Polygon outline (implicitly closed). */
  points: MapPosition[];
  /** Also draw the out-of-bounds area boundary line around it. Default true. */
  outline?: boolean;
}

export interface DirectionOneWay {
  id: string;
  kind: "one-way";
  /** Direction of travel: from the first point to the last. */
  points: MapPosition[];
  /** A single arrow at the middle, or a line of arrows along the whole path. */
  style: "single" | "line";
}

export interface DirectionPoint {
  id: string;
  kind: DirectionPointKind;
  position: MapPosition;
  /** Degrees, clockwise on the map. For a crossing: 0 = passage runs left–right. */
  rotation: number;
}

export type DirectionFeature = DirectionLine | DirectionArea | DirectionOneWay | DirectionPoint;
export type DirectionKind = DirectionFeature["kind"];

export const isDirectionPoint = (f: DirectionFeature): f is DirectionPoint => isDirectionPointKind(f.kind);

/** All direction symbol kinds. */
export const DIRECTION_KINDS: readonly DirectionKind[] = [
  "uncrossable",
  "oob-boundary",
  "oob-area-boundary",
  "oob-area",
  "one-way",
  ...DIRECTION_POINT_KINDS,
];
