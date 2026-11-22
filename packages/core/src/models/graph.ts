// Graph model (IOF extension)

import { MapPosition } from "./map";

export interface Node extends MapPosition {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  from: string;
  to: string;
  label: string;
  reverseLabel?: string;
  oneWay?: boolean;
  ignoreLength?: boolean; // "map-segment transition" in the UI/docs; renamed from teleport
  /**
   * Length in meters set by hand. Overrides the length calculated from the
   * end positions (and "ignore length"), e.g. for a corridor drawn shorter
   * than it is. Use edgeLengthOverride() to read it.
   */
  length?: number;
}

/** The edge's hand-set length in meters, or undefined when it uses the calculated length. */
export function edgeLengthOverride(edge: Pick<Edge, "length"> | undefined): number | undefined {
  const length = edge?.length;
  return typeof length === "number" && Number.isFinite(length) && length >= 0 ? length : undefined;
}
