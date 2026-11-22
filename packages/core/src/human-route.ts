/**
 * Simulates how a human plans a route, as opposed to the optimal search
 * (route-search.ts) or the exhaustive route enumeration. See
 * docs/article/human-route-finding.tex and
 * planning/07-human-route-simulation.md for the cognitive model this
 * implements.
 *
 * Strategy: check whether the leg is solvable on the current floor first
 * (a human glances at the map, not searching for stairs); otherwise plan
 * bidirectionally — alternating between "which stairs can I reach from
 * here?" (tracking, from the start) and "which stairs would drop me at the
 * target?" (backtracking, from the destination) — committing to the first
 * meeting point found rather than comparing alternatives. Deterministic,
 * not optimal: that's the point.
 *
 * Extracted from RouteAnalyzer.findHumanRouteBetweenControls so the search
 * is testable standalone and produces a step-by-step trace usable for
 * narration and effort analysis (Labs "Human thinking" view).
 */

import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";
import { BinaryHeap } from "./utils/binary-heap";
import { computeSameFloorClusters } from "./graph-clusters";
import { straightLineDistanceMeters } from "./utils/geometry";
import { edgeKey } from "./utils/graph-utils";

/**
 * Label the search gives an unlabeled one-way passage (a one-way door or
 * corridor). Such a passage separates two floor regions just like a stair
 * does, so it is a planning step in its own right, but it has no label on
 * the map. Shown as-is in label sequences and map badges; the narration
 * spells it out (see human-route-explanation.ts).
 */
export const ONE_WAY_PASSAGE_LABEL = "→";

/** Which side of the bidirectional search a trace step belongs to. */
export type HumanRouteSide = "tracking" | "backtracking";

/**
 * Cognitive parameters for the human route model (planning/07-human-route-simulation.md
 * step 3). Optional and unset by default: every field's absence reproduces
 * today's fixed behavior exactly, so existing callers and tests are
 * unaffected. Exists to let the ordering heuristic be validated against real
 * legs and, eventually, fitted per runner class (see the plan's step 5).
 */
export interface HumanModelParams {
  /**
   * Blends the two candidate-ordering factors into one ascending score
   * (lower wins) instead of the default lexicographic rule. When omitted,
   * candidates are ordered by nearest same-floor corridor distance first,
   * with straight-line distance to the target used only to break an exact
   * tie — the original "nearest stair, then goal-direction" heuristic.
   */
  orderingWeights?: { nearness: number; goalDirection: number };
}

/** One candidate stair considered from a cluster, in exploration-preference order. */
export interface HumanRouteCandidate {
  label: string;
  toCluster: string;
  distanceMeters: number;
  /** The node this candidate arrives at, for overlay badge placement. Absent only in hand-built fixtures. */
  toNode?: string;
  /**
   * The real same-floor node sequence covering this candidate's corridor
   * walk (current position <-> the stair's near-side entry/exit) - for
   * drawing an actual path rather than a straight line. One end of this
   * path is always the step's own position (see HumanRouteFrame.atNode);
   * the stair crossing itself (to `toNode`, on the far side) is not
   * included since no same-floor path exists across it. Absent only in
   * hand-built fixtures.
   */
  path?: string[];
}

/** An untried alternative sitting on a side's frontier stack - a fallback the human would need to keep in mind. */
export interface HumanRoutePendingBranch {
  cluster: string;
  /** The stair label that would lead here, absent for the start/target seed entry. */
  label?: string;
}

/**
 * What a human would have to hold in short-term memory at a given point in
 * the search: the stair sequence committed so far on each side (how they
 * got to where they currently stand), and the untried alternatives still
 * sitting on each side's frontier (what they'd fall back to if the current
 * line doesn't pan out). Derived from state the algorithm already tracks
 * (parent chains, frontier stacks) - not a new model.
 *
 * `forwardChain` reads start -> current tracking position; `backwardChain`
 * reads target -> current backtracking position (each anchored at its own
 * end, growing toward wherever that side currently stands - not the
 * meeting-oriented order `HumanRouteSearchResult.backwardLabels` uses).
 */
export interface HumanRouteMemorySnapshot {
  forwardChain: string[];
  backwardChain: string[];
  /**
   * Node-level waypoints for the forward chain: start node, then each
   * stair's entry/exit node pair in walking order, ending at wherever this
   * side currently stands. For map rendering as a (straight-segment)
   * polyline - does not include the same-floor corridor path between
   * waypoints, only the stair-crossing points.
   */
  forwardPath: string[];
  /** Same as `forwardPath`, anchored at the target node instead of the start. */
  backwardPath: string[];
  forwardPending: HumanRoutePendingBranch[];
  backwardPending: HumanRoutePendingBranch[];
}

/** One "glance": from a floor region, which stairs are reachable, in the order a human would consider them. */
export interface HumanRouteTraceStep {
  order: number;
  side: HumanRouteSide;
  cluster: string;
  candidates: HumanRouteCandidate[];
  /** Absent only in hand-built fixtures that don't exercise the real search. */
  memory?: HumanRouteMemorySnapshot;
  /** The specific node the human is standing at when considering these candidates (may differ from `cluster`, which is a Union-Find representative, not a position). */
  atNode?: string;
}

/** A point where the two search sides discovered a shared floor region. */
export interface HumanRouteMeetingAttempt {
  order: number;
  cluster: string;
  accepted: boolean;
  reason?: "stair-reuse" | "stitch-failed";
  /** Full node-level waypoints for the tracking side's final route, start -> meeting (accepted meetings only). */
  forwardPath?: string[];
  /** Full node-level waypoints for the backtracking side's final route, meeting -> target (accepted meetings only). */
  backwardPath?: string[];
}

export interface HumanRouteTrace {
  /** True if the same-floor short-circuit solved the leg (no stair search happened). */
  sameFloorSolved: boolean;
  steps: HumanRouteTraceStep[];
  meetingAttempts: HumanRouteMeetingAttempt[];
}

export interface HumanRouteSearchResult {
  /** Stitched node path from `fromNodeId` to `toNodeId` (graph nodes only, no controls). */
  path: string[];
  sameFloor: boolean;
  /** Labels committed by the tracking (forward) side, start -> meeting. */
  forwardLabels: string[];
  /** Labels committed by the backtracking (backward) side, meeting -> target, already in walking order. */
  backwardLabels: string[];
  trace: HumanRouteTrace;
  /**
   * nodeId -> same-floor cluster representative id, for every node touched
   * by an edge in this leg's graph. Lets a renderer tint cluster regions
   * without recomputing Union-Find. Only present when the same-floor
   * short-circuit did not solve the leg (i.e. the cluster search ran).
   */
  clusterOf?: Record<string, string>;
}

export interface HumanRouteSearchHooks {
  onNodeSettled?(nodeId: string, distance: number): void;
  onEdgeEvaluated?(fromNodeId: string, toNodeId: string, relaxed: boolean, distance: number): void;
}

export interface HumanRouteGraphContext {
  edges: Edge[];
  resolveNode(id: string): Node | Control | null;
  /** Real-world distance for an unlabeled edge in its traversal direction (no penalties). */
  edgeDistanceMeters(edge: Edge, from: Node | Control, to: Node | Control): number;
  getCoordinates(item: Node | Control): { x: number; y: number };
  mapScale: number;
  hooks?: HumanRouteSearchHooks;
  params?: HumanModelParams;
}

/**
 * Finds the route a human would plan between two graph nodes, or `null` if
 * none exists.
 */
export function findHumanRoute(
  fromNodeId: string,
  toNodeId: string,
  ctx: HumanRouteGraphContext,
): HumanRouteSearchResult | null {
  const { edges, resolveNode, edgeDistanceMeters, getCoordinates, mapScale, hooks, params } = ctx;
  const orderingWeights = params?.orderingWeights;

  interface UnlabeledEdge { to: string; weight: number; }
  const unlabeledAdj = new Map<string, UnlabeledEdge[]>();

  for (const edge of edges) {
    if (edge.label && edge.label !== "") continue;

    const fromNode = resolveNode(edge.from);
    const toNode = resolveNode(edge.to);
    const weight = (fromNode && toNode) ? edgeDistanceMeters(edge, fromNode, toNode) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(weight)) continue;

    if (!unlabeledAdj.has(edge.from)) unlabeledAdj.set(edge.from, []);
    unlabeledAdj.get(edge.from)!.push({ to: edge.to, weight });

    if (!edge.oneWay) {
      if (!unlabeledAdj.has(edge.to)) unlabeledAdj.set(edge.to, []);
      unlabeledAdj.get(edge.to)!.push({ to: edge.from, weight });
    }
  }

  interface UnlabeledResult { path: string[]; distance: number; }
  const unlabeledCache = new Map<string, UnlabeledResult | null>();
  const findUnlabeled = (from: string, to: string): UnlabeledResult | null => {
    if (from === to) return { path: [from], distance: 0 };
    const cacheKey = `${from}:${to}`;
    const cached = unlabeledCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const heap = new BinaryHeap<[number, string]>((a, b) => a[0] - b[0]);
    heap.push([0, from]);

    while (heap.size > 0) {
      const [d, current] = heap.pop()!;
      if (visited.has(current)) continue;

      if (current === to) {
        const path: string[] = [];
        let n: string | undefined = to;
        while (n !== undefined) {
          path.unshift(n);
          n = prev.get(n);
        }
        const result = { path, distance: d };
        unlabeledCache.set(cacheKey, result);
        return result;
      }

      visited.add(current);
      hooks?.onNodeSettled?.(current, d);
      for (const { to: neighbor, weight } of (unlabeledAdj.get(current) || [])) {
        if (visited.has(neighbor)) continue;
        const nd = d + weight;
        const relaxed = nd < (dist.get(neighbor) ?? Infinity);
        if (relaxed) {
          dist.set(neighbor, nd);
          prev.set(neighbor, current);
          heap.push([nd, neighbor]);
        }
        hooks?.onEdgeEvaluated?.(current, neighbor, relaxed, nd);
      }
    }

    unlabeledCache.set(cacheKey, null);
    return null;
  };

  // Human short-circuit: if the leg is solvable on the same floor network,
  // take it immediately without evaluating stair alternatives.
  const sameFloor = findUnlabeled(fromNodeId, toNodeId);
  if (sameFloor) {
    return {
      path: sameFloor.path,
      sameFloor: true,
      forwardLabels: [],
      backwardLabels: [],
      trace: { sameFloorSolved: true, steps: [], meetingAttempts: [] },
    };
  }

  const uf = computeSameFloorClusters(edges);

  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.from);
    allNodeIds.add(edge.to);
  }
  const clusterOf: Record<string, string> = {};
  for (const id of allNodeIds) clusterOf[id] = uf.find(id);

  interface ClusterEdge {
    fromCluster: string;
    toCluster: string;
    fromNode: string;
    toNode: string;
    label: string;
    edgeId: string;
  }

  const outAdj = new Map<string, ClusterEdge[]>();
  const inAdj = new Map<string, ClusterEdge[]>();

  const addClusterEdge = (edge: ClusterEdge): void => {
    if (!outAdj.has(edge.fromCluster)) outAdj.set(edge.fromCluster, []);
    outAdj.get(edge.fromCluster)!.push(edge);
    if (!inAdj.has(edge.toCluster)) inAdj.set(edge.toCluster, []);
    inAdj.get(edge.toCluster)!.push(edge);
  };

  for (const edge of edges) {
    const hasLabel = !!edge.label && edge.label !== "";
    // An unlabeled one-way passage is a seam between floor regions too (see
    // graph-clusters.ts): without it as a cluster edge, a leg that needs
    // both a one-way passage and a stair has no plan at all.
    if (!hasLabel && !edge.oneWay) continue;

    const fromCluster = uf.find(edge.from);
    const toCluster = uf.find(edge.to);
    // Both ends in one region: crossing it never opens a new region.
    if (fromCluster === toCluster) continue;
    const label = hasLabel ? edge.label : ONE_WAY_PASSAGE_LABEL;

    addClusterEdge({ fromCluster, toCluster, fromNode: edge.from, toNode: edge.to, label, edgeId: edgeKey(edge) });

    if (!edge.oneWay) {
      addClusterEdge({
        fromCluster: toCluster,
        toCluster: fromCluster,
        fromNode: edge.to,
        toNode: edge.from,
        label: edge.reverseLabel || label,
        edgeId: edgeKey(edge),
      });
    }
  }

  const fromCluster = uf.find(fromNodeId);
  const toCluster = uf.find(toNodeId);

  type SearchSide = "forward" | "backward";
  interface FrontierEntry { cluster: string; node: string; viaLabel?: string; }
  interface ParentState { prevCluster: string; edge: ClusterEdge; }

  const forwardStack: FrontierEntry[] = [{ cluster: fromCluster, node: fromNodeId }];
  const backwardStack: FrontierEntry[] = [{ cluster: toCluster, node: toNodeId }];

  const forwardVisited = new Set<string>([fromCluster]);
  const backwardVisited = new Set<string>([toCluster]);
  const forwardParent = new Map<string, ParentState>();
  const backwardParent = new Map<string, ParentState>();

  // Where each side currently stands - the "line of thought" a human is
  // actively following on that side, used to derive the committed chain and
  // path in the memory snapshot below.
  let forwardActiveCluster = fromCluster;
  let backwardActiveCluster = toCluster;
  let forwardActiveNode = fromNodeId;
  let backwardActiveNode = toNodeId;

  const committedChain = (cluster: string, parentMap: Map<string, ParentState>, root: string): string[] => {
    const labels: string[] = [];
    let c = cluster;
    while (c !== root) {
      const p = parentMap.get(c);
      if (!p) break;
      labels.unshift(p.edge.label);
      c = p.prevCluster;
    }
    return labels;
  };

  // Node-level waypoints for the committed chain: start/target node, each
  // stair's entry/exit node pair in walking order, ending at wherever this
  // side currently stands. An approximation for map rendering - it does not
  // include the same-floor corridor path between waypoints, just the
  // stair-crossing points, so a rendered polyline draws straight segments
  // rather than following corridors within a floor.
  const committedPath = (
    activeNode: string,
    activeCluster: string,
    parentMap: Map<string, ParentState>,
    root: string,
    rootNodeId: string,
  ): string[] => {
    const waypoints: string[] = [];
    let c = activeCluster;
    while (c !== root) {
      const p = parentMap.get(c);
      if (!p) break;
      waypoints.unshift(p.edge.fromNode, p.edge.toNode);
      c = p.prevCluster;
    }
    waypoints.unshift(rootNodeId);
    waypoints.push(activeNode);
    return waypoints;
  };

  const snapshotMemory = (): HumanRouteMemorySnapshot => ({
    forwardChain: committedChain(forwardActiveCluster, forwardParent, fromCluster),
    backwardChain: committedChain(backwardActiveCluster, backwardParent, toCluster),
    forwardPath: committedPath(forwardActiveNode, forwardActiveCluster, forwardParent, fromCluster, fromNodeId),
    backwardPath: committedPath(backwardActiveNode, backwardActiveCluster, backwardParent, toCluster, toNodeId),
    forwardPending: forwardStack.map((e) => ({ cluster: e.cluster, label: e.viaLabel })),
    backwardPending: backwardStack.map((e) => ({ cluster: e.cluster, label: e.viaLabel })),
  });

  const traceSteps: HumanRouteTraceStep[] = [];
  const meetingAttempts: HumanRouteMeetingAttempt[] = [];
  let traceOrder = 0;

  // "Goal direction": how far a candidate leaves this side from where it is
  // heading. Tracking heads for the target; backtracking works from the
  // target toward the start, so its goal is the start.
  const straightLineToGoal = (nodeId: string, side: SearchSide): number => {
    const node = resolveNode(nodeId);
    const goal = resolveNode(side === "forward" ? toNodeId : fromNodeId);
    if (!node || !goal) return Number.POSITIVE_INFINITY;
    return straightLineDistanceMeters(getCoordinates(node), getCoordinates(goal), mapScale);
  };

  const buildRouteFromMeeting = (
    meetingCluster: string,
  ): { path: string[]; forwardLabels: string[]; backwardLabels: string[] } | undefined => {
    const forwardEdges: ClusterEdge[] = [];
    {
      const reverse: ClusterEdge[] = [];
      let c = meetingCluster;
      while (c !== fromCluster) {
        const p = forwardParent.get(c);
        if (!p) return undefined;
        reverse.push(p.edge);
        c = p.prevCluster;
      }
      for (let i = reverse.length - 1; i >= 0; i--) {
        forwardEdges.push(reverse[i]);
      }
    }

    const backwardEdges: ClusterEdge[] = [];
    {
      let c = meetingCluster;
      while (c !== toCluster) {
        const p = backwardParent.get(c);
        if (!p) return undefined;
        backwardEdges.push(p.edge);
        c = p.prevCluster;
      }
    }

    const forwardEdgeIds = new Set(forwardEdges.map((e) => e.edgeId));
    for (const edge of backwardEdges) {
      if (forwardEdgeIds.has(edge.edgeId)) {
        meetingAttempts.push({ order: traceOrder++, cluster: meetingCluster, accepted: false, reason: "stair-reuse" });
        return undefined;
      }
    }

    const stitched: string[] = [fromNodeId];
    let cursor = fromNodeId;

    for (const edge of [...forwardEdges, ...backwardEdges]) {
      const seg = findUnlabeled(cursor, edge.fromNode);
      if (!seg) {
        meetingAttempts.push({ order: traceOrder++, cluster: meetingCluster, accepted: false, reason: "stitch-failed" });
        return undefined;
      }
      stitched.push(...seg.path.slice(1));
      stitched.push(edge.toNode);
      cursor = edge.toNode;
    }

    const endSeg = findUnlabeled(cursor, toNodeId);
    if (!endSeg) {
      meetingAttempts.push({ order: traceOrder++, cluster: meetingCluster, accepted: false, reason: "stitch-failed" });
      return undefined;
    }
    stitched.push(...endSeg.path.slice(1));

    const forwardPath = [fromNodeId, ...forwardEdges.flatMap((e) => [e.fromNode, e.toNode])];
    const backwardPath = [...backwardEdges.flatMap((e) => [e.fromNode, e.toNode]), toNodeId];
    meetingAttempts.push({ order: traceOrder++, cluster: meetingCluster, accepted: true, forwardPath, backwardPath });

    return {
      path: stitched,
      forwardLabels: forwardEdges.map((e) => e.label),
      backwardLabels: backwardEdges.map((e) => e.label),
    };
  };

  const tryExpand = (
    side: SearchSide,
  ): { path: string[]; forwardLabels: string[]; backwardLabels: string[] } | undefined => {
    const stack = side === "forward" ? forwardStack : backwardStack;
    const visited = side === "forward" ? forwardVisited : backwardVisited;
    const otherVisited = side === "forward" ? backwardVisited : forwardVisited;
    const parentMap = side === "forward" ? forwardParent : backwardParent;

    const current = stack.pop();
    if (!current) return undefined;
    hooks?.onNodeSettled?.(current.node, 0);
    if (side === "forward") {
      forwardActiveCluster = current.cluster;
      forwardActiveNode = current.node;
    } else {
      backwardActiveCluster = current.cluster;
      backwardActiveNode = current.node;
    }

    const candidatesRaw = side === "forward"
      ? (outAdj.get(current.cluster) || []).map((edge) => ({
          edge,
          nextCluster: edge.toCluster,
          nextNode: edge.toNode,
          reachable: findUnlabeled(current.node, edge.fromNode),
        }))
      : (inAdj.get(current.cluster) || []).map((edge) => ({
          edge,
          nextCluster: edge.fromCluster,
          nextNode: edge.fromNode,
          reachable: findUnlabeled(edge.toNode, current.node),
        }));

    const candidates = candidatesRaw
      .filter((candidate) => !!candidate.reachable && !visited.has(candidate.nextCluster))
      .sort((a, b) => {
        if (orderingWeights) {
          const scoreA = orderingWeights.nearness * a.reachable!.distance + orderingWeights.goalDirection * straightLineToGoal(a.nextNode, side);
          const scoreB = orderingWeights.nearness * b.reachable!.distance + orderingWeights.goalDirection * straightLineToGoal(b.nextNode, side);
          return scoreA - scoreB;
        }
        const byDistance = (a.reachable!.distance - b.reachable!.distance);
        if (byDistance !== 0) return byDistance;
        return straightLineToGoal(a.nextNode, side) - straightLineToGoal(b.nextNode, side);
      });

    if (candidates.length > 0) {
      traceSteps.push({
        order: traceOrder++,
        side: side === "forward" ? "tracking" : "backtracking",
        cluster: current.cluster,
        candidates: candidates.map((c) => ({
          label: c.edge.label,
          toCluster: c.nextCluster,
          distanceMeters: c.reachable!.distance,
          toNode: c.nextNode,
          path: c.reachable!.path,
        })),
        memory: snapshotMemory(),
        atNode: current.node,
      });
    }

    // Several candidates can lead to the same region (two stairs between
    // the same pair of floors). The region is opened once, through the
    // preferred one; the others stay visible in the trace as considered.
    const opened: typeof candidates = [];
    for (const candidate of candidates) {
      if (visited.has(candidate.nextCluster)) continue;
      hooks?.onEdgeEvaluated?.(candidate.edge.fromNode, candidate.edge.toNode, true, candidate.reachable!.distance);
      visited.add(candidate.nextCluster);
      parentMap.set(candidate.nextCluster, { prevCluster: current.cluster, edge: candidate.edge });
      opened.push(candidate);
    }

    // Pushed in reverse so the preferred candidate is on top of the stack,
    // i.e. the line of thought followed next.
    for (let i = opened.length - 1; i >= 0; i--) {
      const candidate = opened[i];
      stack.push({ cluster: candidate.nextCluster, node: candidate.nextNode, viaLabel: candidate.edge.label });
    }

    // Does one of them land where the other side has already been? Checked
    // in preference order, so the plan closes through the candidate the
    // human would look at first.
    for (const candidate of opened) {
      if (otherVisited.has(candidate.nextCluster)) {
        const route = buildRouteFromMeeting(candidate.nextCluster);
        if (route) return route;
      }
    }

    return undefined;
  };

  let nextSide: SearchSide = "forward";
  while (forwardStack.length > 0 || backwardStack.length > 0) {
    if (nextSide === "forward" && forwardStack.length === 0) {
      nextSide = "backward";
      continue;
    }
    if (nextSide === "backward" && backwardStack.length === 0) {
      nextSide = "forward";
      continue;
    }

    const found = tryExpand(nextSide);
    if (found) {
      return {
        path: found.path,
        sameFloor: false,
        forwardLabels: found.forwardLabels,
        backwardLabels: found.backwardLabels,
        trace: { sameFloorSolved: false, steps: traceSteps, meetingAttempts },
        clusterOf,
      };
    }

    nextSide = nextSide === "forward" ? "backward" : "forward";
  }

  return null;
}
