import type { Control } from "../models/control";
import { edgeLengthOverride, type Edge, type Node } from "../models/graph";
import type { Polygon } from "../models/polygon";
import { findPolygonForPoint } from "../polygon-utils";
import { findDeadEndEdgeIds, edgeKey } from "../utils/graph-utils";

/**
 * Minimum branch distance in meters for a branch to count as a meaningful
 * decision point.  Branches shorter than this (dead-ends or quick loops back
 * to the analysed path) are ignored.
 */
export const MIN_BRANCH_DISTANCE_M = 50;

/**
 * Base interface for difficulty scoring models
 */
export interface DifficultyCategory {
  name: string;
  label: string;
  color: string;
  textColor: string;
}

/**
 * Context information for route difficulty calculation
 * Contains the full event data structure and the calculated route
 */
export interface RouteContext {
  controls: Control[];
  nodes: Node[];
  edges: Edge[];
  path: string[]; // Array of node/control IDs along the route
  mapScale: number; // Map scale for distance calculations
  polygons?: Polygon[]; // Optional polygons for level change detection

  // --- Optional pre-built lookup maps for O(1) access ---
  /** Maps "fromId:toId" → Edge (both directions for bidirectional edges) */
  edgeLookup?: Map<string, Edge>;
  /** Maps nodeId → all edges connected to that node */
  nodeEdges?: Map<string, Edge[]>;
  /** Maps node/control ID → the Node or Control object */
  nodeControlMap?: Map<string, Node | Control>;
}

/**
 * Find an edge between two nodes using the edgeLookup map if available,
 * falling back to linear scan.
 */
export function findEdgeFast(context: RouteContext, fromId: string, toId: string): Edge | undefined {
  if (context.edgeLookup) {
    return context.edgeLookup.get(`${fromId}:${toId}`) ?? context.edgeLookup.get(`${toId}:${fromId}`);
  }
  return context.edges.find(
    (e) => (e.from === fromId && e.to === toId) || (!e.oneWay && e.from === toId && e.to === fromId),
  );
}

/**
 * Get all edges connected to a node using the nodeEdges map if available,
 * falling back to linear filter.
 */
export function getNodeEdges(context: RouteContext, nodeId: string): Edge[] {
  if (context.nodeEdges) {
    return context.nodeEdges.get(nodeId) || [];
  }
  return context.edges.filter((e) => e.from === nodeId || e.to === nodeId);
}

/**
 * Find a node or control position by ID using the nodeControlMap if available.
 */
export function findNodePosition(context: RouteContext, id: string): { x: number; y: number } | undefined {
  if (context.nodeControlMap) {
    const entry = context.nodeControlMap.get(id);
    if (!entry) return undefined;
    if ('x' in entry) return { x: entry.x, y: entry.y };
    if ('mapPosition' in entry) return { x: entry.mapPosition.x, y: entry.mapPosition.y };
    return undefined;
  }
  const node = context.nodes.find((n) => n.id === id);
  if (node) return { x: node.x, y: node.y };
  const control = context.controls.find((c) => c.id === id);
  if (control?.mapPosition) return { x: control.mapPosition.x, y: control.mapPosition.y };
  return undefined;
}

/**
 * Check if an edge represents a level change by comparing the levels of its endpoints.
 * The level is determined by finding the polygon that contains each node.
 * 
 * @param edge - The edge to check
 * @param nodes - All nodes in the graph
 * @param controls - All controls in the graph
 * @param polygons - Polygons defining level areas
 * @param nodeControlMap - Optional pre-built lookup map for O(1) node position access
 * @returns true if the edge connects nodes on different levels
 */
export function isLevelChangeEdge(
  edge: Edge,
  nodes: Node[],
  controls: Control[],
  polygons: Polygon[],
  nodeControlMap?: Map<string, Node | Control>,
): boolean {
  if (!polygons || polygons.length === 0) return false;

  const findNodeOrControl = (id: string): { x: number; y: number } | undefined => {
    if (nodeControlMap) {
      const entry = nodeControlMap.get(id);
      if (!entry) return undefined;
      if ('x' in entry) return { x: (entry as Node).x, y: (entry as Node).y };
      if ('mapPosition' in entry) return { x: (entry as Control).mapPosition.x, y: (entry as Control).mapPosition.y };
      return undefined;
    }
    const node = nodes.find((n) => n.id === id);
    if (node) return { x: node.x, y: node.y };
    const control = controls.find((c) => c.id === id);
    if (control?.mapPosition) return { x: control.mapPosition.x, y: control.mapPosition.y };
    return undefined;
  };

  const fromPos = findNodeOrControl(edge.from);
  const toPos = findNodeOrControl(edge.to);
  if (!fromPos || !toPos) return false;

  const fromPolygon = findPolygonForPoint(fromPos, polygons);
  const toPolygon = findPolygonForPoint(toPos, polygons);

  const fromLevel = fromPolygon?.level ?? 0;
  const toLevel = toPolygon?.level ?? 0;

  return fromLevel !== toLevel;
}

/**
 * Get the set of dead-end edge IDs that should be excluded from
 * decision-point / exit counting. Dead-end paths do not present
 * meaningful route choices and should not contribute to difficulty.
 *
 * Edges that are on the analysis path are always kept (even if they
 * are structurally dead-end), because the runner must traverse them.
 *
 * @returns Set of edge IDs to exclude from exit counting
 */
export function getInactiveEdgeIds(context: RouteContext): Set<string> {
  const nodeIds = [
    ...context.nodes.map((n) => n.id),
    ...context.controls.map((c) => c.id),
  ];
  const deadEndEdgeIds = findDeadEndEdgeIds(context.edges, nodeIds);
  if (deadEndEdgeIds.size === 0) return deadEndEdgeIds;

  // Remove path edges from the dead-end set — they are always active
  for (let i = 0; i < context.path.length - 1; i++) {
    const fromId = context.path[i];
    const toId = context.path[i + 1];
    const edge = context.edges.find(
      (e) =>
        (e.from === fromId && e.to === toId) ||
        (!e.oneWay && e.from === toId && e.to === fromId),
    );
    if (edge) deadEndEdgeIds.delete(edgeKey(edge));
  }

  return deadEndEdgeIds;
}

// ---------------------------------------------------------------------------
// Shared Decision Point Analysis
// ---------------------------------------------------------------------------

/**
 * Result of decision point analysis along a route.
 */
export interface DecisionPointAnalysis {
  /** Number of decision points along the route */
  count: number;
  /** Node IDs that are decision points */
  nodeIds: string[];
}

/**
 * Check whether a branch starting from a node via a given edge reaches
 * at least {@link MIN_BRANCH_DISTANCE_M} before it dead-ends or rejoins
 * the analysed path.
 *
 * Uses BFS to explore the off-path sub-graph reachable through that edge.
 */
export function isBranchSignificant(
  startNodeId: string,
  firstEdge: Edge,
  pathNodeSet: Set<string>,
  context: RouteContext,
): boolean {
  const MM_TO_METERS = 0.001;
  const targetNodeId = firstEdge.from === startNodeId ? firstEdge.to : firstEdge.from;

  const startPos = findNodePosition(context, startNodeId);
  const targetPos = findNodePosition(context, targetNodeId);
  if (!startPos || !targetPos) return false;

  let firstDist = edgeLengthOverride(firstEdge) ?? 0;
  if (edgeLengthOverride(firstEdge) === undefined && !firstEdge.ignoreLength) {
    firstDist = Math.hypot(targetPos.x - startPos.x, targetPos.y - startPos.y) * context.mapScale * MM_TO_METERS;
  }

  if (firstDist >= MIN_BRANCH_DISTANCE_M) return true;

  // Target is already on the analysed path – short loop-back
  if (pathNodeSet.has(targetNodeId)) {
    return firstDist >= MIN_BRANCH_DISTANCE_M;
  }

  // BFS into the off-path sub-graph
  const visited = new Set<string>([startNodeId, targetNodeId]);
  const queue: Array<{ nodeId: string; distance: number }> = [
    { nodeId: targetNodeId, distance: firstDist },
  ];

  while (queue.length > 0) {
    const { nodeId, distance } = queue.shift()!;

    const edges = getNodeEdges(context, nodeId).filter(
      (e) => e.from === nodeId || (!e.oneWay && e.to === nodeId),
    );

    for (const edge of edges) {
      const nextId = edge.from === nodeId ? edge.to : edge.from;
      if (visited.has(nextId)) continue;

      const fromPos = findNodePosition(context, nodeId);
      const toPos = findNodePosition(context, nextId);
      if (!fromPos || !toPos) continue;

      let edgeDist = edgeLengthOverride(edge) ?? 0;
      if (edgeLengthOverride(edge) === undefined && !edge.ignoreLength) {
        edgeDist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y) * context.mapScale * MM_TO_METERS;
      }

      const newDist = distance + edgeDist;

      if (newDist >= MIN_BRANCH_DISTANCE_M) return true;

      // Reached a path node but distance still below threshold — not significant
      if (pathNodeSet.has(nextId)) continue;

      visited.add(nextId);
      queue.push({ nodeId: nextId, distance: newDist });
    }
  }

  return false;
}

/**
 * Analyze a route for branching points.
 *
 * A branching point is any node along the route where the number of outgoing
 * edges (edges that can be traversed forward, excluding the way back to the
 * previous node) is greater than 1 — i.e. the runner has at least two
 * choices of where to go next.
 *
 * One-way constraints are respected: only traversable edges are counted.
 * Dead-ends and short branches are NOT filtered out.
 *
 * This is the single source of truth used by the Alpha difficulty model and
 * the branching-point map markers.
 *
 * @param context - Route context containing the graph and path
 * @returns Branching point count and node IDs
 */
export function analyzeBranchingPoints(context: RouteContext): DecisionPointAnalysis {
  const nodeIds: string[] = [];

  for (let i = 0; i < context.path.length; i++) {
    const nodeId = context.path[i];
    const prevNodeId = i > 0 ? context.path[i - 1] : null;

    // Count reachable next-nodes (one-way constraints respected, backtrack excluded)
    const reachable = new Set<string>();
    for (const e of getNodeEdges(context, nodeId)) {
      const nextId = e.from === nodeId ? e.to : e.from;
      if (nextId === prevNodeId) continue;           // exclude going back
      if (e.from !== nodeId && e.oneWay) continue;   // can't traverse one-way in reverse
      reachable.add(nextId);
    }

    if (reachable.size > 1) {
      nodeIds.push(nodeId);
    }
  }

  return { count: nodeIds.length, nodeIds };
}

/**
 * Analyze a route for decision points.
 *
 * Decision points are nodes along the path where more than 2 significant
 * edges meet – i.e. junctions where the runner must choose a direction.
 *
 * The following edges are excluded from the count:
 * - Dead-end edges that are not on the route path
 * - Short branches (< {@link MIN_BRANCH_DISTANCE_M}) that dead-end or
 *   quickly loop back to the analysed path
 *
 * @param context - Route context containing the graph and path
 * @returns Decision point count and node IDs
 */
export function analyzeDecisionPoints(context: RouteContext): DecisionPointAnalysis {
  const pathNodeSet = new Set(context.path);
  const inactiveEdgeIds = getInactiveEdgeIds(context);

  // Build a set of path edge keys (these are always active even if dead-end)
  const pathEdgeIds = new Set<string>();
  for (let i = 0; i < context.path.length - 1; i++) {
    const edge = findEdgeFast(context, context.path[i], context.path[i + 1]);
    if (edge) pathEdgeIds.add(edgeKey(edge));
  }

  const nodeIds: string[] = [];

  for (let i = 0; i < context.path.length; i++) {
    const nodeId = context.path[i];
    const connectedEdges = getNodeEdges(context, nodeId);

    // Track which edges are part of the route at this node
    const routeEdgesAtNode = new Set<string>();

    if (i > 0) {
      const prevNodeId = context.path[i - 1];
      const hasEdgeFromPrev = connectedEdges.some(
        (e) => (e.from === prevNodeId && e.to === nodeId) || (!e.oneWay && e.from === nodeId && e.to === prevNodeId),
      );
      if (hasEdgeFromPrev) {
        routeEdgesAtNode.add(`${prevNodeId}-${nodeId}`);
      }
    }

    if (i < context.path.length - 1) {
      const nextNodeId = context.path[i + 1];
      const hasEdgeToNext = connectedEdges.some(
        (e) => (e.from === nodeId && e.to === nextNodeId) || (!e.oneWay && e.from === nextNodeId && e.to === nodeId),
      );
      if (hasEdgeToNext) {
        routeEdgesAtNode.add(`${nodeId}-${nextNodeId}`);
      }
    }

    // Count significant edges: edges that are part of the route
    // are always significant, other edges are only significant if they are
    // not dead-end AND their branch extends at least MIN_BRANCH_DISTANCE_M
    // before dead-ending or rejoining the route.
    let significantEdgesAtNode = 0;
    const significantCounted = new Set<string>();

    for (const edge of connectedEdges) {
      const dirEdgeKey = edge.oneWay || edge.from === nodeId ? `${edge.from}-${edge.to}` : `${edge.to}-${edge.from}`;
      if (significantCounted.has(dirEdgeKey)) continue;
      significantCounted.add(dirEdgeKey);

      const otherNodeId = edge.from === nodeId ? edge.to : edge.from;

      // Edges that are part of the route are always counted
      if (routeEdgesAtNode.has(`${nodeId}-${otherNodeId}`) || routeEdgesAtNode.has(`${otherNodeId}-${nodeId}`)) {
        significantEdgesAtNode++;
        continue;
      }

      // Dead-end edges don't contribute to difficulty
      if (inactiveEdgeIds.has(edgeKey(edge)) && !pathEdgeIds.has(edgeKey(edge))) continue;

      // For non-route, non-dead-end edges, check if the branch is significant (>= 50m)
      if (isBranchSignificant(nodeId, edge, pathNodeSet, context)) {
        significantEdgesAtNode++;
      }
    }

    // A decision point has more than 2 significant edges (not just a corridor)
    if (significantEdgesAtNode > 2) {
      nodeIds.push(nodeId);
    }
  }

  return { count: nodeIds.length, nodeIds };
}

/**
 * Abstract base class for difficulty scoring models
 */
export abstract class ScoringModel {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;

  /**
   * Optional: Scaling factor applied to normalize difficulty scores
   */
  readonly scalingFactor?: number;

  /**
   * Optional: Reference course used to calibrate the scaling factor
   */
  readonly referenceCourse?: string;

  /**
   * Calculate difficulty score for a route based on the full context
   * @param context - Contains event data (controls, nodes, edges), route path, and map scale
   */
  abstract calculateDifficulty(context: RouteContext): number;

  /**
   * Return a human-readable formula string showing how difficulty was calculated for a route.
   * Returns undefined if the model doesn't support breakdown display.
   */
  getBreakdownFormula(_context: RouteContext): string | undefined {
    return undefined;
  }

  /**
   * Get difficulty category for a given difficulty score
   */
  getDifficultyCategory(difficulty: number): DifficultyCategory {
    if (difficulty <= 20) {
      return {
        name: "white",
        label: "White",
        color: "#FFFFFF",
        textColor: "#000000",
      };
    } else if (difficulty <= 40) {
      return {
        name: "yellow",
        label: "Yellow",
        color: "#FFFF00",
        textColor: "#000000",
      };
    } else if (difficulty <= 60) {
      return {
        name: "orange",
        label: "Orange",
        color: "#FF8800",
        textColor: "#FFFFFF",
      };
    } else if (difficulty <= 80) {
      return {
        name: "purple",
        label: "Purple",
        color: "#8B008B",
        textColor: "#FFFFFF",
      };
    } else {
      return {
        name: "black",
        label: "Black",
        color: "#000000",
        textColor: "#FFFFFF",
      };
    }
  }

  /**
   * Calculate overall course difficulty from leg difficulties
   */
  getCourseDifficulty(legs: Array<{ difficulty: number }>): number {
    if (legs.length === 0) return 0;
    // Default: use maximum leg difficulty
    return Math.max(...legs.map((leg) => leg.difficulty));
  }

  /**
   * Calculate average course difficulty from leg difficulties
   */
  getCourseAverageDifficulty(legs: Array<{ difficulty: number }>): number {
    if (legs.length === 0) return 0;
    const sum = legs.reduce((acc, leg) => acc + leg.difficulty, 0);
    return sum / legs.length;
  }

  /**
   * Get full identifier (id + version)
   */
  getFullId(): string {
    return `${this.id}@${this.version}`;
  }
}
