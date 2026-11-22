/**
 * Same-floor clustering shared by the human-route search, the alternative-
 * path enumerator, and the Labs "Clustered Graph" visualization. A cluster
 * is a set of nodes on one floor reachable from each other via two-way
 * edges - edges between floors and one-way edges are cluster-graph seams, not
 * intra-cluster connections (see computeSameFloorClusters).
 */

import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";
import type { Polygon } from "./models/polygon";
import { findPolygonForPoint } from "./polygon-utils";
import { UnionFind } from "./utils/union-find";

/** Floor number of a node/control id, or undefined when unknown (outside every floor polygon). */
export type LevelOf = (nodeId: string) => number | undefined;

/** Resolves each node's/control's floor from the floor polygons it lies in (cached per id). */
export function createLevelLookup({
  nodes,
  controls,
  polygons,
}: {
  nodes: Node[];
  controls: Control[];
  polygons: Polygon[];
}): LevelOf {
  const position = new Map<string, { x: number; y: number }>();
  for (const n of nodes) position.set(n.id, { x: n.x, y: n.y });
  for (const c of controls) if (c.mapPosition) position.set(c.id, { x: c.mapPosition.x, y: c.mapPosition.y });
  const levels = new Map<string, number | undefined>();
  return (id) => {
    if (!levels.has(id)) {
      const p = position.get(id);
      levels.set(id, p && polygons.length > 0 ? findPolygonForPoint(p, polygons)?.level : undefined);
    }
    return levels.get(id);
  };
}

/**
 * Builds the Union-Find structure grouping nodes into same-floor clusters.
 *
 * With `levelOf`, floors decide: two nodes are merged only by a two-way edge
 * whose ends are on the same floor (labels and one-way-ness aside, one-way
 * edges never merge). Nodes on different floors never share a cluster. An end
 * with an unknown floor only merges with another unknown-floor end.
 * Without `levelOf`, falls back to the label rule: unlabeled two-way edges merge.
 */
export function computeSameFloorClusters(edges: Edge[], levelOf?: LevelOf): UnionFind {
  const uf = new UnionFind();
  for (const edge of edges) {
    if (edge.oneWay) continue;
    if (levelOf ? levelOf(edge.from) === levelOf(edge.to) : !edge.label) {
      uf.union(edge.from, edge.to);
    }
  }
  return uf;
}

export interface ClusteredGraph {
  /** nodeId -> cluster representative id, for every node touched by an edge. */
  clusterOf: Record<string, string>;
  /** Unique cluster ids, in first-seen order (deterministic for a given edge list). */
  clusters: string[];
}

/** Clusters every node in the graph (not just one leg's local context). */
export function computeClusteredGraph(edges: Edge[], levelOf?: LevelOf): ClusteredGraph {
  const uf = computeSameFloorClusters(edges, levelOf);
  const clusterOf: Record<string, string> = {};
  const clusters: string[] = [];
  const seen = new Set<string>();

  const record = (nodeId: string) => {
    const cluster = uf.find(nodeId);
    clusterOf[nodeId] = cluster;
    if (!seen.has(cluster)) {
      seen.add(cluster);
      clusters.push(cluster);
    }
  };

  for (const edge of edges) {
    record(edge.from);
    record(edge.to);
  }

  return { clusterOf, clusters };
}

/**
 * Deterministic, maximally-distinct color per cluster using golden-angle hue
 * spacing (each successive hue is ~137.5° from the last, so adjacent cluster
 * indices never land on similar colors, regardless of how many clusters
 * there are).
 */
export function assignClusterColors(clusters: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  clusters.forEach((cluster, i) => {
    const hue = (i * 137.508) % 360;
    colors[cluster] = `hsl(${hue.toFixed(1)}, 65%, 55%)`;
  });
  return colors;
}
