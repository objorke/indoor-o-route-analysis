/**
 * Basic, graph-literal route enumeration: plain DFS / BFS over the raw node
 * graph, enumerating *simple* paths (no node visited twice) between two nodes.
 *
 * This is the deliberately naive counterpart to the clustered A* enumeration in
 * route-enumeration.ts:
 *
 * | | route-enumeration.ts (default) | this module (basic) |
 * |-|-|-|
 * | graph | same-floor regions condensed with Union-Find | raw node graph |
 * | unit of a "route" | one distinct visible stair-label sequence | one distinct node path |
 * | guidance | A* with an admissible remaining-distance heuristic | none (DFS depth-first / BFS by hop count) |
 * | result | the shortest representative per label sequence | every simple path found within budget |
 *
 * Because the number of simple paths in a dense indoor graph grows
 * combinatorially, the search is bounded on three axes (`maxExpansions`,
 * `maxPathNodes`, `maxResults`) and keeps only the `maxResults` *shortest*
 * paths found (a bounded max-heap), rather than the first ones stumbled upon.
 * The current worst kept distance also acts as a branch-and-bound prune. When
 * any bound bites, `truncated` is set so the caller can warn.
 *
 * Trade-offs vs. the default algorithm:
 * - (+) no clustering assumptions — shows genuinely every corridor variation,
 *   including ones sharing a stair sequence, which the default collapses.
 * - (+) trivial to reason about and to verify against by hand on small graphs.
 * - (−) exponential: needs the budgets above on anything but small graphs, so
 *   results may be incomplete where the default enumeration is exhaustive.
 * - (−) returns many near-identical variations of the same route choice.
 */

import type { Edge } from "./models/graph";
import type { RouteInfo } from "./route-analyzer";
import type { RouteEnumerationContext, RouteEnumerationResult } from "./route-enumeration";
import { BinaryHeap } from "./utils/binary-heap";

/** Traversal order used by the basic enumerator. */
export type BasicEnumerationStrategy = "dfs" | "bfs";

export interface BasicRouteEnumerationOptions {
  /** Maximum number of routes to return — the shortest ones found (default 1000). */
  maxResults?: number;
  /** Maximum number of nodes in a path, endpoints included (default 150). */
  maxPathNodes?: number;
  /** Search budget: expansions (DFS stack steps / BFS dequeues) before giving up (default 200 000). */
  maxExpansions?: number;
  /** BFS only: cap on queued partial paths, to bound memory (default 200 000). */
  maxQueued?: number;
  /** Optional: prune partial paths longer than ratio*shortest or shortest+absoluteMeters. */
  distanceCutoff?: { ratio?: number; absoluteMeters?: number };
}

const DEFAULTS = {
  maxResults: 1000,
  maxPathNodes: 150,
  maxExpansions: 200_000,
  maxQueued: 200_000,
};

interface AdjacencyEntry {
  to: string;
  weight: number;
}

/** Build a plain directed adjacency list (both directions for two-way edges). */
function buildAdjacency(edges: Edge[], ctx: RouteEnumerationContext): Map<string, AdjacencyEntry[]> {
  const adj = new Map<string, AdjacencyEntry[]>();
  const add = (from: string, to: string, weight: number) => {
    const list = adj.get(from);
    if (list) list.push({ to, weight });
    else adj.set(from, [{ to, weight }]);
  };

  for (const edge of edges) {
    const fromNode = ctx.resolveNode(edge.from);
    const toNode = ctx.resolveNode(edge.to);
    const weight = fromNode && toNode ? ctx.edgeDistanceMeters(edge, fromNode, toNode) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(weight)) continue;
    add(edge.from, edge.to, weight);
    if (!edge.oneWay) add(edge.to, edge.from, weight);
  }

  // Cheapest neighbour first: keeps DFS from diving down absurd detours before
  // it has any good bound to prune against.
  for (const list of adj.values()) list.sort((a, b) => a.weight - b.weight);

  return adj;
}

/** Plain Dijkstra over the adjacency list; only used to resolve a distance cutoff. */
function shortestDistance(adj: Map<string, AdjacencyEntry[]>, from: string, to: string): number {
  if (from === to) return 0;
  const dist = new Map<string, number>([[from, 0]]);
  const visited = new Set<string>();
  const heap = new BinaryHeap<[number, string]>((a, b) => a[0] - b[0]);
  heap.push([0, from]);

  while (heap.size > 0) {
    const [d, current] = heap.pop()!;
    if (current === to) return d;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const { to: neighbor, weight } of adj.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      const next = d + weight;
      if (next < (dist.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        dist.set(neighbor, next);
        heap.push([next, neighbor]);
      }
    }
  }
  return Number.POSITIVE_INFINITY;
}

interface Candidate {
  path: string[];
  distance: number;
}

/**
 * Enumerate simple paths between two nodes with a plain DFS or BFS, keeping the
 * shortest `maxResults` found within the search budget.
 *
 * @param strategy - `"dfs"` (depth-first, low memory) or `"bfs"` (breadth-first,
 * shortest hop counts first, higher memory).
 */
export function findAllPathsBasic(
  fromNodeId: string,
  toNodeId: string,
  ctx: RouteEnumerationContext,
  strategy: BasicEnumerationStrategy,
  options: BasicRouteEnumerationOptions = {},
): RouteEnumerationResult {
  const maxResults = Math.max(1, options.maxResults ?? DEFAULTS.maxResults);
  const maxPathNodes = Math.max(2, options.maxPathNodes ?? DEFAULTS.maxPathNodes);
  const maxExpansions = Math.max(1, options.maxExpansions ?? DEFAULTS.maxExpansions);
  const maxQueued = Math.max(1, options.maxQueued ?? DEFAULTS.maxQueued);
  const hooks = ctx.hooks;

  const adj = buildAdjacency(ctx.edges, ctx);

  // Resolve the optional distance cutoff against the true shortest distance.
  let cutoffDistance = Number.POSITIVE_INFINITY;
  if (options.distanceCutoff) {
    const { ratio, absoluteMeters } = options.distanceCutoff;
    const shortest = shortestDistance(adj, fromNodeId, toNodeId);
    if (Number.isFinite(shortest)) {
      const bounds: number[] = [];
      if (ratio !== undefined) bounds.push(ratio * shortest);
      if (absoluteMeters !== undefined) bounds.push(shortest + absoluteMeters);
      if (bounds.length > 0) cutoffDistance = Math.min(...bounds);
    }
  }

  // Bounded max-heap of the best (shortest) candidates found so far.
  const best = new BinaryHeap<Candidate>((a, b) => b.distance - a.distance);
  let dropped = false;
  let budgetExhausted = false;

  /** Upper bound a partial path must stay under to be worth extending. */
  const bound = (): number =>
    Math.min(cutoffDistance, best.size >= maxResults ? (best.peek()?.distance ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY);

  const record = (path: string[], distance: number) => {
    best.push({ path, distance });
    if (best.size > maxResults) {
      best.pop();
      dropped = true;
    }
  };

  let expansions = 0;

  if (strategy === "dfs") {
    // Explicit stack (no recursion): `path[i]` is the node of `stack[i]`.
    interface Frame {
      node: string;
      g: number;
      next: number;
    }
    const path: string[] = [fromNodeId];
    const onPath = new Set<string>([fromNodeId]);
    const stack: Frame[] = [{ node: fromNodeId, g: 0, next: 0 }];

    while (stack.length > 0) {
      if (expansions++ >= maxExpansions) {
        budgetExhausted = true;
        break;
      }
      const frame = stack[stack.length - 1];
      const neighbors = adj.get(frame.node) ?? [];

      if (frame.next >= neighbors.length) {
        hooks?.onNodeSettled?.(frame.node, frame.g);
        stack.pop();
        onPath.delete(frame.node);
        path.pop();
        continue;
      }

      const { to, weight } = neighbors[frame.next++];
      if (onPath.has(to)) continue;

      const g = frame.g + weight;
      const withinBound = g <= bound();
      hooks?.onEdgeEvaluated?.(frame.node, to, withinBound, g);
      if (!withinBound) continue;

      if (to === toNodeId) {
        record([...path, to], g);
        continue; // never walk on through the target
      }
      if (path.length + 1 >= maxPathNodes) continue;

      path.push(to);
      onPath.add(to);
      stack.push({ node: to, g, next: 0 });
    }
  } else {
    // BFS: partial paths in hop-count order. `cursor` avoids O(n) shift().
    const queue: Candidate[] = [{ path: [fromNodeId], distance: 0 }];
    let cursor = 0;

    while (cursor < queue.length) {
      if (expansions++ >= maxExpansions) {
        budgetExhausted = true;
        break;
      }
      const current = queue[cursor++];
      const last = current.path[current.path.length - 1];
      hooks?.onNodeSettled?.(last, current.distance);

      for (const { to, weight } of adj.get(last) ?? []) {
        if (current.path.includes(to)) continue;

        const g = current.distance + weight;
        const withinBound = g <= bound();
        hooks?.onEdgeEvaluated?.(last, to, withinBound, g);
        if (!withinBound) continue;

        const nextPath = [...current.path, to];
        if (to === toNodeId) {
          record(nextPath, g);
          continue;
        }
        if (nextPath.length >= maxPathNodes) continue;
        if (queue.length - cursor >= maxQueued) {
          budgetExhausted = true;
          break;
        }
        queue.push({ path: nextPath, distance: g });
      }
      if (budgetExhausted) break;
    }
  }

  // Drain the heap (worst first) and build the RouteInfos only for keepers —
  // buildRoute is expensive, so it never runs for discarded candidates.
  const candidates: Candidate[] = [];
  while (best.size > 0) candidates.push(best.pop()!);
  candidates.reverse();

  const routes: RouteInfo[] = candidates.map((candidate) => ctx.buildRoute(candidate.path));
  routes.sort((a, b) => a.distance - b.distance);
  routes.forEach((route, rank) => hooks?.onRouteFound?.(route, rank));

  return { routes, truncated: budgetExhausted || dropped };
}
