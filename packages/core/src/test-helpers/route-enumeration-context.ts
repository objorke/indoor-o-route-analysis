/**
 * Shared test fixture: a minimal RouteEnumerationContext over a plain node/edge
 * graph, with Euclidean edge distances (no map-scale conversion) and a
 * buildRoute that derives distance and labels straight from the path.
 *
 * Used by the route enumeration tests (route-enumeration.test.ts and
 * route-enumeration-basic.test.ts) so both algorithms are exercised against
 * exactly the same graph semantics. Not exported from the package index — it
 * is test-only.
 */

import { edgeLengthOverride, type Edge, type Node } from "../models/graph";
import type { RouteInfo } from "../route-analyzer";
import type { RouteEnumerationContext } from "../route-enumeration";

export function node(id: string, x: number, y: number): Node {
  return { id, x, y };
}

export function stubRoute(path: string[], distance: number, labels: string[]): RouteInfo {
  return {
    distance,
    path,
    pathPolygons: path.map(() => undefined),
    decisionPoints: 0,
    decisionPointNodeIds: [],
    branchingPointNodeIds: [],
    alternativeEdges: 0,
    oneWayEdges: 0,
    ignoreLengthEdges: 0,
    description: labels.join(""),
    labels,
    difficulty: 0,
  };
}

export function makeContext(nodes: Node[], edges: Edge[]): RouteEnumerationContext {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const findEdge = (from: string, to: string) =>
    edges.find((e) => (e.from === from && e.to === to) || (!e.oneWay && e.from === to && e.to === from));

  const getRouteLabels = (path: string[]): string[] => {
    const labels: string[] = [];
    for (let i = 1; i < path.length; i++) {
      const edge = findEdge(path[i - 1], path[i]);
      if (edge?.label) labels.push(edge.from === path[i - 1] ? edge.label : (edge.reverseLabel || edge.label));
    }
    return labels;
  };

  const edgeDistanceMeters = (edge: Edge | undefined, from: Node | null, to: Node | null): number => {
    const override = edgeLengthOverride(edge);
    if (override !== undefined) return override;
    if (edge?.ignoreLength) return 0;
    if (!from || !to) return Number.POSITIVE_INFINITY;
    return Math.hypot(to.x - from.x, to.y - from.y);
  };

  return {
    edges,
    resolveNode: (id) => byId.get(id) ?? null,
    edgeDistanceMeters: (edge, from, to) =>
      edgeDistanceMeters(edge, from as Node | null, to as Node | null),
    findEdge,
    getRouteLabels,
    buildRoute: (path) => {
      let distance = 0;
      for (let i = 1; i < path.length; i++) {
        distance += edgeDistanceMeters(
          findEdge(path[i - 1], path[i]),
          byId.get(path[i - 1]) ?? null,
          byId.get(path[i]) ?? null,
        );
      }
      return stubRoute(path, distance, getRouteLabels(path));
    },
  };
}
