import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";
import type { MapData } from "./models/map";
import type { Polygon } from "./models/polygon";
import { createLevelLookup } from "./graph-clusters";
import { edgeKey } from "./utils/graph-utils";

/** A problem found by the Graph view's "Verify graph". */
export type GraphFinding = {
  type: "disconnected" | "overlap" | "self-loop" | "invalid-edge" | "out-of-bounds" | "unlabeled-level-change";
  message: string;
  elementId?: string;
  elementType?: "node" | "edge" | "control";
};

/** Items closer than this (MapPosition units) count as overlapping. */
export const OVERLAP_DISTANCE = 0.1;
/** Controls closer than this are joined by "Connect overlapping controls". */
export const CONNECT_OVERLAPPING_CONTROLS_DISTANCE = 2.0;

/** Axis-aligned box (MapPosition) of the mapped area, the union of all pages in manual per-page mode. */
function mapBounds(map: MapData): { minX: number; maxX: number; minY: number; maxY: number } {
  const boxes =
    map.pageTransformMode === "manual" && map.pageTransforms?.length
      ? map.pageTransforms.map((pt) => [pt.topLeft, pt.bottomRight])
      : map.mapPositionTopLeft && map.mapPositionBottomRight
        ? [[map.mapPositionTopLeft, map.mapPositionBottomRight]]
        : [[{ x: 0, y: 0 }, { x: map.image?.width || 0, y: map.image?.height || 0 }]];
  const xs = boxes.flatMap(([a, b]) => [a.x, b.x]);
  const ys = boxes.flatMap(([a, b]) => [a.y, b.y]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Readable name of a node or control, e.g. "Control 31", "Start S1", "Node 1004". */
function describeItem(item: { id: string; type: "node" | "control"; controlType?: Control["type"] }): string {
  if (item.type === "node") return `Node ${item.id}`;
  const kind = item.controlType === "start" ? "Start" : item.controlType === "finish" ? "Finish" : "Control";
  return `${kind} ${item.id}`;
}

/**
 * Message for an item outside the map, with its position and the map's range, e.g.
 * "Control 31 is outside the map area: x -12.0, y 40.0 (map x 0.0 to 297.0, y 0.0 to 420.0)".
 */
function outOfBoundsMessage(item: { id: string; x: number; y: number; type: "node" | "control"; controlType?: Control["type"] }, map: MapData): string {
  const b = mapBounds(map);
  const f = (v: number) => v.toFixed(1);
  return `${describeItem(item)} is outside the map area: x ${f(item.x)}, y ${f(item.y)} (map x ${f(b.minX)} to ${f(b.maxX)}, y ${f(b.minY)} to ${f(b.maxY)})`;
}

/**
 * Whether a MapPosition lies inside the mapped area: any page's box in manual
 * per-page mode, otherwise the global top-left/bottom-right box (or the image
 * size when no transform is set).
 */
export function isInMapBounds(map: MapData, x: number, y: number): boolean {
  const inside = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y);
  if (map.pageTransformMode === "manual" && map.pageTransforms?.length) {
    return map.pageTransforms.some((pt) => inside(pt.topLeft, pt.bottomRight));
  }
  if (map.mapPositionTopLeft && map.mapPositionBottomRight) {
    return inside(map.mapPositionTopLeft, map.mapPositionBottomRight);
  }
  return inside({ x: 0, y: 0 }, { x: map.image?.width || 0, y: map.image?.height || 0 });
}

/** An edge without a label whose two ends lie on different floors. */
export interface UnlabeledLevelChange {
  edge: Edge;
  fromLevel: number;
  toLevel: number;
}

/**
 * Edges without a label that connect two different floors. The route
 * algorithms treat every unlabeled two-way edge as an ordinary corridor, so
 * such an edge merges two floors into one same-floor region (see
 * graph-clusters.ts) and hides a level change from route names. A level
 * change must be a labeled edge (a stair). Ends outside every floor polygon
 * are ignored, since their floor is unknown.
 */
export function findUnlabeledLevelChanges({
  nodes,
  edges,
  controls,
  polygons,
}: {
  nodes: Node[];
  edges: Edge[];
  controls: Control[];
  polygons: Polygon[];
}): UnlabeledLevelChange[] {
  if (polygons.length === 0) return [];
  const levelOf = createLevelLookup({ nodes, controls, polygons });

  const result: UnlabeledLevelChange[] = [];
  for (const edge of edges) {
    if (edge.label) continue;
    const fromLevel = levelOf(edge.from);
    const toLevel = levelOf(edge.to);
    if (fromLevel === undefined || toLevel === undefined || fromLevel === toLevel) continue;
    result.push({ edge, fromLevel, toLevel });
  }
  return result;
}

/**
 * Checks the route graph: overlapping nodes/controls, self-loops, edges to
 * missing nodes, nodes/controls outside the map, and (when floor polygons
 * are given) unlabeled edges that connect two floors.
 */
export function verifyGraph({
  nodes,
  edges,
  controls,
  map,
  polygons,
}: {
  nodes: Node[];
  edges: Edge[];
  controls: Control[];
  map?: MapData;
  polygons?: Polygon[];
}): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const items = [
    ...nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, type: "node" as const })),
    ...controls.map((c) => ({ id: c.id, x: c.mapPosition.x, y: c.mapPosition.y, type: "control" as const, controlType: c.type })),
  ];

  // Overlaps (each pair reported once, on the first item)
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < OVERLAP_DISTANCE) {
        findings.push({ type: "overlap", message: `Overlaps with ${b.type} ${b.id}`, elementId: a.id, elementType: a.type });
      }
    }
  }

  // Edges
  const ids = new Set(items.map((i) => i.id));
  for (const edge of edges) {
    const key = edgeKey(edge);
    if (edge.from === edge.to) {
      findings.push({ type: "self-loop", message: "Edge connects node to itself", elementId: key, elementType: "edge" });
    }
    if (!ids.has(edge.from)) {
      findings.push({ type: "invalid-edge", message: `Start node ${edge.from} missing`, elementId: key, elementType: "edge" });
    }
    if (!ids.has(edge.to)) {
      findings.push({ type: "invalid-edge", message: `End node ${edge.to} missing`, elementId: key, elementType: "edge" });
    }
  }

  // Level changes without a label
  for (const { edge, fromLevel, toLevel } of findUnlabeledLevelChanges({ nodes, edges, controls, polygons: polygons ?? [] })) {
    findings.push({
      type: "unlabeled-level-change",
      message: `Unlabeled edge ${edge.from} - ${edge.to} connects floor ${fromLevel} and floor ${toLevel}. Label it as a stair, or delete it`,
      elementId: edgeKey(edge),
      elementType: "edge",
    });
  }

  // Outside the map
  if (map) {
    for (const item of items) {
      if (!isInMapBounds(map, item.x, item.y)) {
        findings.push({ type: "out-of-bounds", message: outOfBoundsMessage(item, map), elementId: item.id, elementType: item.type });
      }
    }
  }
  return findings;
}

/** Result of connectOverlapping: the new edge list and what changed. */
export interface ConnectOverlappingResult {
  edges: Edge[];
  /** Pairs that had no edge and got a new zero-length edge. */
  added: number;
  /** Extra edges removed so each overlapping pair has exactly one. */
  removed: number;
  /** Kept edges that were made zero-length ("ignore length"). */
  updated: number;
}

/**
 * Makes sure every pair of overlapping controls/nodes (within `distance`
 * MapPosition units of each other, on the same floor) is joined by exactly
 * one zero-length ("ignore length") edge: adds it when missing, removes extra
 * edges between the pair (in either direction), and turns the kept edge into
 * a zero-length edge. An edge that already ignores length is preferred, and
 * the kept edge keeps its label and direction. Pairs on different floors
 * (by the floor polygons) are left alone.
 */
export function connectOverlapping({
  controls,
  nodes,
  edges,
  polygons = [],
  distance = CONNECT_OVERLAPPING_CONTROLS_DISTANCE,
}: {
  controls: Control[];
  nodes: Node[];
  edges: Edge[];
  polygons?: Polygon[];
  distance?: number;
}): ConnectOverlappingResult {
  const items = [
    ...controls.map((c) => ({ id: c.id, x: c.mapPosition.x, y: c.mapPosition.y })),
    ...nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
  ];
  const levelOf = createLevelLookup({ nodes, controls, polygons });
  const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

  // Overlapping pairs, each once
  const pairs = new Map<string, [string, string]>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.id === b.id || Math.hypot(a.x - b.x, a.y - b.y) > distance) continue;
      const la = levelOf(a.id);
      const lb = levelOf(b.id);
      if (la !== undefined && lb !== undefined && la !== lb) continue;
      pairs.set(pairKey(a.id, b.id), [a.id, b.id]);
    }
  }

  let removed = 0;
  let updated = 0;
  const kept = new Set<string>();
  // Edges of overlapping pairs: prefer one that already ignores length; drop the others
  const preferred = new Map<string, Edge>();
  for (const e of edges) {
    const key = pairKey(e.from, e.to);
    if (!pairs.has(key)) continue;
    const current = preferred.get(key);
    if (!current || (!current.ignoreLength && e.ignoreLength)) preferred.set(key, e);
  }
  const out: Edge[] = [];
  for (const e of edges) {
    const key = pairKey(e.from, e.to);
    if (!pairs.has(key)) {
      out.push(e);
      continue;
    }
    if (preferred.get(key) !== e || kept.has(key)) {
      removed++;
      continue;
    }
    kept.add(key);
    if (e.ignoreLength) out.push(e);
    else {
      updated++;
      out.push({ ...e, ignoreLength: true });
    }
  }
  let added = 0;
  for (const [key, [a, b]] of pairs) {
    if (kept.has(key)) continue;
    out.push({ from: a, to: b, label: "", ignoreLength: true });
    added++;
  }
  return { edges: out, added, removed, updated };
}
