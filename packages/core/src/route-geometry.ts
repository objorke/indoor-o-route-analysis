/**
 * Pure distance/climb/polygon-lookup geometry helpers, extracted from
 * RouteAnalyzer (see planning/04-route-analyzer-decomposition.md step 5).
 * These take an explicit context instead of touching instance state, so
 * they're testable without instantiating a full analyzer.
 */

import type { Control } from "./models/control";
import { edgeLengthOverride, type Edge, type Node } from "./models/graph";
import type { Polygon } from "./models/polygon";
import { findPolygonForPoint } from "./polygon-utils";
import { getCoordinates, straightLineDistanceMeters } from "./utils/geometry";
import type { PathResult } from "./route-search";

/**
 * Computes an edge's traversal distance in meters: the hand-set edge length
 * when there is one, otherwise 0 for ignoreLength edges or the straight-line
 * distance between the ends; then any penalty.
 */
export function calculateEdgeDistanceMeters(
  edge: Edge | undefined,
  fromNode: Node | Control | null,
  toNode: Node | Control | null,
  mapScale: number,
  penalties?: Map<string, number>,
): number {
  if (!fromNode || !toNode) {
    return Number.POSITIVE_INFINITY;
  }

  let distanceMeters = 0;

  const override = edgeLengthOverride(edge);
  if (override !== undefined) {
    distanceMeters = override;
  } else if (!edge?.ignoreLength) {
    // ignoreLength edges have no geometric distance contribution (e.g., map-segment transitions/stairs handled elsewhere)
    distanceMeters = straightLineDistanceMeters(getCoordinates(fromNode), getCoordinates(toNode), mapScale);
  }

  // Apply penalty if exists
  if (penalties && edge) {
    const penalty = penalties.get(`${edge.from}:${edge.to}`);
    if (penalty) {
      distanceMeters *= penalty;
    }
  }

  return distanceMeters;
}

export interface PathDistanceContext {
  resolveNode(id: string): Node | Control | null;
  findEdge(fromId: string, toId: string): Edge | undefined;
  mapScale: number;
}

/** Total distance of a path in meters, assuming direct edges exist between consecutive nodes. */
export function calculatePathDistance(path: string[], ctx: PathDistanceContext): number {
  let total = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const fromNode = ctx.resolveNode(path[i]);
    const toNode = ctx.resolveNode(path[i + 1]);
    const edge = ctx.findEdge(path[i], path[i + 1]);

    total += calculateEdgeDistanceMeters(edge, fromNode, toNode, ctx.mapScale);
  }

  return total;
}

/**
 * Total distance of a route through the graph by finding the shortest path
 * between consecutive waypoint nodes. Different from `calculatePathDistance`,
 * which assumes direct edges exist between consecutive nodes.
 */
export function calculatePathDistanceThroughGraph(
  waypoints: string[],
  findShortestPathBetween: (fromId: string, toId: string) => PathResult | null,
): number {
  if (waypoints.length < 2) {
    return 0;
  }

  let totalDistance = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const result = findShortestPathBetween(waypoints[i], waypoints[i + 1]);

    if (result === null) {
      // No path exists between these waypoints — invalid route.
      return Number.POSITIVE_INFINITY;
    }

    totalDistance += result.distance;
  }

  return totalDistance;
}

/** Straight-line (Euclidean) distance between two controls, in meters. */
export function calculateStraightLineDistance(c1: Control, c2: Control, mapScale: number): number {
  return straightLineDistanceMeters(getCoordinates(c1), getCoordinates(c2), mapScale);
}

export interface RouteDistanceContext {
  controlNodeMap: Map<string, string>;
  mapScale: number;
  findShortestPathBetween(fromId: string, toId: string): PathResult | null;
}

/** Shortest route distance between two controls; falls back to straight-line distance if no path exists. */
export function calculateRouteDistance(fromControl: Control, toControl: Control, ctx: RouteDistanceContext): number {
  const fromNodeId = ctx.controlNodeMap.get(fromControl.id);
  const toNodeId = ctx.controlNodeMap.get(toControl.id);

  if (!fromNodeId || !toNodeId) {
    return calculateStraightLineDistance(fromControl, toControl, ctx.mapScale);
  }

  const result = ctx.findShortestPathBetween(fromNodeId, toNodeId);
  return result?.distance ?? calculateStraightLineDistance(fromControl, toControl, ctx.mapScale);
}

/** Total length of a course by summing leg distances. */
export function calculateCourseLength(controls: Control[], ctx: RouteDistanceContext): number {
  let total = 0;

  for (let i = 0; i < controls.length - 1; i++) {
    total += calculateRouteDistance(controls[i], controls[i + 1], ctx);
  }

  return total;
}

/** Looks up the polygon (floor/room) containing a node or control's position, if any. */
export function getPolygonForNodeOrControl(nodeOrControl: Node | Control, polygons: Polygon[]): Polygon | undefined {
  if (polygons.length === 0) return undefined;
  const point = {
    x: (nodeOrControl as any).x ?? (nodeOrControl as any).mapPosition?.x,
    y: (nodeOrControl as any).y ?? (nodeOrControl as any).mapPosition?.y,
  };
  if (point.x === undefined || point.y === undefined) return undefined;
  return findPolygonForPoint(point, polygons);
}

/** Builds an array of polygons for each node in a path (indices match the path array). */
export function buildPathPolygons(
  path: string[],
  resolveNode: (id: string) => Node | Control | null,
  polygons: Polygon[],
): (Polygon | undefined)[] {
  return path.map((nodeId) => {
    const node = resolveNode(nodeId);
    return node ? getPolygonForNodeOrControl(node, polygons) : undefined;
  });
}

/**
 * Total climb for a path, based on elevation differences when nodes are on
 * different levels (descents don't subtract — only upward transitions count).
 */
export function calculatePathClimb(path: string[], pathPolygons: (Polygon | undefined)[]): number {
  let totalClimb = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const fromPolygon = pathPolygons[i];
    const toPolygon = pathPolygons[i + 1];

    const fromElevation = fromPolygon?.elevation ?? (fromPolygon?.level ?? 0) * 3;
    const toElevation = toPolygon?.elevation ?? (toPolygon?.level ?? 0) * 3;

    if (toElevation > fromElevation) {
      totalClimb += toElevation - fromElevation;
    }
  }
  return totalClimb;
}
