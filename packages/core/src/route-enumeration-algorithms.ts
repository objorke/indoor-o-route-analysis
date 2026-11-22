/**
 * Registry of the algorithms available for "Show all routes" (Route Analysis).
 *
 * The web app persists the user's choice (Settings → Analysis → Find all routes
 * algorithm) and passes it down to `RouteAnalyzer.findAllAlternativePathsBetweenControls`,
 * which dispatches here. Keeping the ids, labels and descriptions in core means
 * the UI, the CLI tools and the docs all name the algorithms identically.
 *
 * See docs/algorithms/route-enumeration-algorithms.md for the comparison.
 */

import type { RouteEnumerationContext, RouteEnumerationResult } from "./route-enumeration";
import { findAllAlternativePaths } from "./route-enumeration";
import { findAllPathsBasic } from "./route-enumeration-basic";

/**
 * - `cluster-astar` — the original algorithm: Union-Find clustering + best-first
 *   (A*) enumeration of distinct stair-label sequences.
 * - `dfs` / `bfs` — basic exhaustive traversal of the raw graph, enumerating
 *   simple paths (see route-enumeration-basic.ts).
 * - `penalty` — iterative penalised Dijkstra (the same k-shortest search used
 *   when "Show all routes" is off), run with a larger k. Fast, approximate.
 */
export type RouteEnumerationAlgorithm = "cluster-astar" | "dfs" | "bfs" | "penalty";

export const DEFAULT_ROUTE_ENUMERATION_ALGORITHM: RouteEnumerationAlgorithm = "cluster-astar";

export interface RouteEnumerationAlgorithmInfo {
  id: RouteEnumerationAlgorithm;
  /** Short name for menus and selectors. */
  label: string;
  /** One-line summary of the approach, shown under the selector. */
  description: string;
  /** Longer note for info dialogs and docs: what it is good and bad at. */
  detail: string;
}

export const ROUTE_ENUMERATION_ALGORITHMS: readonly RouteEnumerationAlgorithmInfo[] = [
  {
    id: "cluster-astar",
    label: "Cluster A* (default)",
    description: "Distinct stair sequences, shortest first",
    detail:
      "Condenses same-floor regions into clusters, then enumerates every distinct stair-label sequence best-first (A*). Exhaustive over route choices, one representative per stair sequence.",
  },
  {
    id: "dfs",
    label: "Basic DFS",
    description: "All simple paths, depth-first",
    detail:
      "Plain depth-first traversal of the raw graph, enumerating every path that never revisits a node. Shows corridor variations the clustered algorithm collapses, but is exponential — bounded by a search budget, so results can be incomplete on large graphs.",
  },
  {
    id: "bfs",
    label: "Basic BFS",
    description: "All simple paths, breadth-first",
    detail:
      "Same exhaustive simple-path enumeration as Basic DFS, but explored in hop-count order: short-hop routes surface first, at the cost of much higher memory use.",
  },
  {
    id: "penalty",
    label: "Penalised Dijkstra",
    description: "Fast approximation, k-shortest",
    detail:
      "Repeats Dijkstra while penalising the edges of routes already found (stairs penalised hardest). Fast and scales well, but it is a heuristic sampler: it does not guarantee that every alternative is found.",
  },
] as const;

const ALGORITHM_IDS = new Set<string>(ROUTE_ENUMERATION_ALGORITHMS.map((a) => a.id));

/** Type guard for values coming from persisted settings, CLI flags or URLs. */
export function isRouteEnumerationAlgorithm(value: unknown): value is RouteEnumerationAlgorithm {
  return typeof value === "string" && ALGORITHM_IDS.has(value);
}

/** Look up an algorithm's metadata, falling back to the default for unknown ids. */
export function getRouteEnumerationAlgorithmInfo(
  algorithm: RouteEnumerationAlgorithm,
): RouteEnumerationAlgorithmInfo {
  return (
    ROUTE_ENUMERATION_ALGORITHMS.find((a) => a.id === algorithm) ??
    ROUTE_ENUMERATION_ALGORITHMS.find((a) => a.id === DEFAULT_ROUTE_ENUMERATION_ALGORITHM)!
  );
}

/**
 * Run one of the context-based enumeration algorithms.
 *
 * `penalty` is NOT handled here: it needs RouteAnalyzer's own penalised
 * Dijkstra, so `RouteAnalyzer.findAllAlternativePathsBetweenControls`
 * intercepts it before calling this. Passing it here falls back to the default.
 */
export function enumerateRoutes(
  algorithm: RouteEnumerationAlgorithm,
  fromNodeId: string,
  toNodeId: string,
  ctx: RouteEnumerationContext,
  maxResults: number = 1000,
  distanceCutoff?: { ratio?: number; absoluteMeters?: number },
): RouteEnumerationResult {
  switch (algorithm) {
    case "dfs":
    case "bfs":
      return findAllPathsBasic(fromNodeId, toNodeId, ctx, algorithm, { maxResults, distanceCutoff });
    default:
      return findAllAlternativePaths(fromNodeId, toNodeId, ctx, maxResults, distanceCutoff);
  }
}
