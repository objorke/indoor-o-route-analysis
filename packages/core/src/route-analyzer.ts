import type { Control } from "./models/control";
import type { Edge, Node } from "./models/graph";
import type { Polygon } from "./models/polygon";
import type { RouteAnalyzerVisualizer } from "./route-analyzer-visualizer";
import { type ScoringModel, ScoringModelRegistry } from "./scoring-models";
import {
  findDeadEndEdgeIds,
  countOneWayEdgesInPath as countOneWayEdgesInPathUtil,
  countIgnoreLengthEdgesInPath as countIgnoreLengthEdgesInPathUtil,
  countAlternativeEdgesInPath as countAlternativeEdgesInPathUtil,
} from "./utils/graph-utils";
import { getCoordinates } from "./utils/geometry";
import { findShortestPath, type PathResult } from "./route-search";
import {
  calculateEdgeDistanceMeters as calculateEdgeDistanceMetersUtil,
  calculatePathDistance as calculatePathDistanceUtil,
  calculatePathDistanceThroughGraph as calculatePathDistanceThroughGraphUtil,
  calculateStraightLineDistance as calculateStraightLineDistanceUtil,
  calculateRouteDistance as calculateRouteDistanceUtil,
  calculateCourseLength as calculateCourseLengthUtil,
  getPolygonForNodeOrControl as getPolygonForNodeOrControlUtil,
  buildPathPolygons as buildPathPolygonsUtil,
  calculatePathClimb as calculatePathClimbUtil,
} from "./route-geometry";
import {
  getRouteLabels as getRouteLabelsUtil,
  getRouteDescription as getRouteDescriptionUtil,
  getStairSequence as getStairSequenceUtil,
} from "./route-labels";
import { analyzeRoute as analyzeRouteUtil } from "./route-decision-analysis";
import {
  DEFAULT_ROUTE_ENUMERATION_ALGORITHM,
  enumerateRoutes,
  type RouteEnumerationAlgorithm,
} from "./route-enumeration-algorithms";
import {
  findHumanRoute,
  type HumanRouteSide,
  type HumanRouteCandidate,
  type HumanRouteTraceStep,
  type HumanRouteMeetingAttempt,
  type HumanRouteMemorySnapshot,
  type HumanRoutePendingBranch,
  type HumanModelParams,
} from "./human-route";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Complete information about a route between two controls.
 * Includes distance, path, difficulty metrics, and level validation.
 */
export interface RouteInfo {
  /** Total distance in meters */
  distance: number;
  /** Ordered list of node/control IDs forming the path */
  path: string[];
  /** Polygon for each node/control in the path (indices match path array) */
  pathPolygons: (Polygon | undefined)[];
  /** Number of junctions where route choice is required */
  decisionPoints: number;
  /** Node IDs that are decision points along the route */
  decisionPointNodeIds: string[];
  /** Node IDs that are branching points along the route (nodes with more connected edges than the path requires) */
  branchingPointNodeIds: string[];
  /** Number of edges not taken at decision points */
  alternativeEdges: number;
  /** Number of one-way edges traversed */
  oneWayEdges: number;
  /** Number of ignoreLength edges traversed (stairs) */
  ignoreLengthEdges: number;
  /** Human-readable description built from edge labels */
  description: string;
  /** Array of edge labels encountered on the route */
  labels: string[];
  /** Calculated difficulty score */
  difficulty: number;
  /** Human-readable formula showing how difficulty was calculated */
  difficultyFormula?: string;
  /** Total climb in meters */
  totalClimb?: number;
  /** Ratio of route length that repeats edges from shortest routes of previous legs (0-1) */
  repetitionRatio?: number;
}

// Re-export for consumers building on the trace (Labs "Human thinking" view).
export type {
  HumanRouteSide,
  HumanRouteCandidate,
  HumanRouteTraceStep,
  HumanRouteMeetingAttempt,
  HumanRouteMemorySnapshot,
  HumanRoutePendingBranch,
};

/**
 * The route a human would plan between two controls, plus how they got
 * there — see human-route.ts and planning/07-human-route-simulation.md.
 */
export interface HumanRouteResult {
  route: RouteInfo;
  /** True if solved by the same-floor short-circuit (no stair search happened). */
  sameFloor: boolean;
  /** Labels committed by the tracking (forward) side, start -> meeting. */
  forwardLabels: string[];
  /** Labels committed by the backtracking (backward) side, meeting -> target. */
  backwardLabels: string[];
  /** Ordered "glances" — one per floor region considered, with candidate stairs in preference order. */
  explorationTrace: HumanRouteTraceStep[];
  /** Floor regions where the two search sides met, accepted or rejected and why. */
  meetingAttempts: HumanRouteMeetingAttempt[];
  /** nodeId -> same-floor cluster id, for overlay rendering. Absent when solved by the same-floor short-circuit. */
  clusterOf?: Record<string, string>;
}

/**
 * Breakdown of difficulty factors for a leg.
 */
export interface LegDifficulty {
  /** Difficulty contribution from one-way edges */
  oneWay: number;
  /** Difficulty contribution from alternative route choices */
  alternativeEdges: number;
  /** Difficulty contribution from stairs (ignoreLength edges) */
  stairs: number;
  /** Sum of all difficulty factors */
  total: number;
}


// ============================================================================
// RouteAnalyzer Class
// ============================================================================

/**
 * RouteAnalyzer provides graph-based route analysis for indoor orienteering.
 *
 * Key capabilities:
 * - Find shortest paths between controls using Dijkstra's algorithm
 * - Find alternative routes with unique stair sequences
 * - Calculate distances and difficulty scores
 * - Validate level changes through stair edges
 *
 * The analyzer builds an internal graph representation from nodes and edges,
 * mapping controls to their nearest graph nodes for pathfinding.
 *
 * @example
 * ```typescript
 * const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
 * const routes = analyzer.findAlternativePathsBetweenControls(fromId, toId, 6);
 * ```
 */
export class RouteAnalyzer {
  // ---------------------------------------------------------------------------
  // Private Fields
  // ---------------------------------------------------------------------------

  private readonly edges: Edge[];
  private readonly nodes: Node[];
  private readonly controls: Control[];
  private readonly mapScale: number;
  private readonly scoringModel: ScoringModel;
  private readonly polygons: Polygon[];

  /** Optional hooks for observing search progress (used by visualization tools). */
  private readonly visualizer?: RouteAnalyzerVisualizer;

  /**
   * Maps control IDs to their nearest node IDs.
   * Used to connect controls to the graph for pathfinding.
   */
  private readonly controlNodeMap: Map<string, string>;

  /**
   * Fast lookup map for edges by node pair.
   * Key format: "fromNodeId:toNodeId" (both directions stored for bidirectional edges)
   */
  private readonly edgeLookup: Map<string, Edge>;

  /**
   * Maps node/control IDs to their coordinate objects.
   * Provides O(1) lookup instead of array searches.
   */
  private readonly nodeControlMap: Map<string, Node | Control>;

  /**
   * Maps node IDs to all edges connected to that node.
   * Provides O(1) lookup for finding all edges at a node.
   */
  private readonly nodeEdges: Map<string, Edge[]>;

  /**
   * Lazily computed set of dead-end edge IDs.
   * Dead-end paths don't contribute to difficulty scoring.
   */
  private _deadEndEdgeIds: Set<string> | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Create a new RouteAnalyzer instance.
   *
   * @param controls - Array of control points on the course
   * @param nodes - Array of graph nodes representing intersections/waypoints
   * @param edges - Array of edges connecting nodes
   * @param mapScale - Map scale factor (e.g., 5000 for 1:5000 scale)
   * @param scoringModel - Optional custom scoring model for difficulty calculation
   * @param polygons - Optional array of polygons for elevation lookup
   */
  constructor(
    controls: Control[],
    nodes: Node[],
    edges: Edge[],
    mapScale: number,
    scoringModel?: ScoringModel,
    polygons: Polygon[] = [],
    visualizer?: RouteAnalyzerVisualizer
  ) {
    // Create local copies and merge controls into nodes
    this.controls = [...controls];
    this.polygons = polygons || [];
    this.visualizer = visualizer;

    // Initialize nodes map with provided nodes (copied)
    const nodeMap = new Map<string, Node>();
    nodes.forEach((node) => {
      nodeMap.set(node.id, { ...node });
    });

    // Add controls as nodes if they don't already exist
    controls.forEach((control) => {
      if (!nodeMap.has(control.id)) {
        nodeMap.set(control.id, {
          id: control.id,
          x: control.mapPosition?.x ?? 0,
          y: control.mapPosition?.y ?? 0,
        });
      }
    });

    this.nodes = Array.from(nodeMap.values());
    this.edges = edges.map((edge) => ({ ...edge }));

    this.mapScale = mapScale > 0 ? mapScale : 1;
    this.scoringModel = scoringModel ?? ScoringModelRegistry.getDefaultModel();

    // Build lookup maps for fast access
    this.nodeControlMap = this.buildNodeControlMap();
    this.edgeLookup = this.buildEdgeLookup();
    this.controlNodeMap = this.buildControlNodeMap();
    this.nodeEdges = this.buildNodeEdgesMap();
  }

  // ---------------------------------------------------------------------------
  // Initialization Methods (Private)
  // ---------------------------------------------------------------------------

  /**
   * Build a lookup map for nodes and controls by their ID.
   * Enables O(1) coordinate lookup instead of O(n) array search.
   */
  private buildNodeControlMap(): Map<string, Node | Control> {
    const map = new Map<string, Node | Control>();

    for (const node of this.nodes) {
      map.set(node.id, node);
    }
    for (const control of this.controls) {
      map.set(control.id, control);
    }

    return map;
  }

  /**
   * Build a lookup map for edges by node pair.
   * Stores both directions for bidirectional edges to enable O(1) edge lookup.
   *
   * Key format: "from:to"
   */
  private buildEdgeLookup(): Map<string, Edge> {
    const map = new Map<string, Edge>();

    for (const edge of this.edges) {
      // Store forward direction
      map.set(`${edge.from}:${edge.to}`, edge);

      // Store reverse direction for bidirectional edges
      if (!edge.oneWay) {
        map.set(`${edge.to}:${edge.from}`, edge);
      }
    }

    return map;
  }

  /**
   * Build mapping from each control to its nearest graph node.
   * Since controls are now included in the graph as nodes, this simply
   * maps each control to itself.
   */
  private buildControlNodeMap(): Map<string, string> {
    const map = new Map<string, string>();

    for (const control of this.controls) {
      map.set(control.id, control.id);
    }

    return map;
  }

  /**
   * Build a lookup map from node/control IDs to all edges connected to that node.
   * Stores both endpoints of each edge.
   */
  private buildNodeEdgesMap(): Map<string, Edge[]> {
    const map = new Map<string, Edge[]>();
    for (const edge of this.edges) {
      if (!map.has(edge.from)) map.set(edge.from, []);
      map.get(edge.from)!.push(edge);
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)!.push(edge);
    }
    return map;
  }

  /**
   * Get the set of dead-end edge IDs (lazily computed).
   * Dead-end edges are on non-branching chains ending at leaf nodes.
   */
  private getDeadEndEdgeIds(): Set<string> {
    if (this._deadEndEdgeIds === null) {
      const nodeIds = this.nodes.map((n) => n.id);
      this._deadEndEdgeIds = findDeadEndEdgeIds(this.edges, nodeIds);
    }
    return this._deadEndEdgeIds;
  }

  // ---------------------------------------------------------------------------
  // Node/Edge Lookup Methods (Private)
  // ---------------------------------------------------------------------------

  /**
   * Find a node or control by its ID.
   * Uses the pre-built lookup map for O(1) access.
   *
   * @param id - The node or control ID to find
   * @returns The node/control object, or null if not found
   */
  private findNodeOrControl(id: string): Node | Control | null {
    return this.nodeControlMap.get(id) ?? null;
  }

  /**
   * Find an edge between two nodes.
   * Uses the pre-built lookup map for O(1) access.
   * Handles both directions for bidirectional edges.
   *
   * @param fromId - Source node ID
   * @param toId - Target node ID
   * @returns The edge object, or undefined if no edge exists
   */
  private findEdge(fromId: string, toId: string): Edge | undefined {
    return this.edgeLookup.get(`${fromId}:${toId}`);
  }

  // ---------------------------------------------------------------------------
  // Distance Calculation Methods
  // ---------------------------------------------------------------------------

  private calculateEdgeDistanceMeters(
    edge: Edge | undefined,
    fromNode: Node | Control | null,
    toNode: Node | Control | null,
    penalties?: Map<string, number>,
  ): number {
    return calculateEdgeDistanceMetersUtil(edge, fromNode, toNode, this.mapScale, penalties);
  }

  /**
   * Calculate the total distance of a path in meters.
   *
   * @param path - Array of node/control IDs forming the path
   * @returns Total distance in meters
   */
  calculatePathDistance(path: string[]): number {
    return calculatePathDistanceUtil(path, {
      resolveNode: (id) => this.findNodeOrControl(id),
      findEdge: (from, to) => this.findEdge(from, to),
      mapScale: this.mapScale,
    });
  }

  /**
   * Calculate the total distance of a route through the graph by finding the shortest path
   * between consecutive waypoint nodes. This is different from calculatePathDistance which
   * assumes direct edges exist between consecutive nodes.
   *
   * @param waypoints - Array of waypoint node/control IDs (e.g., [start, nodeA, nodeB, end])
   * @returns Total distance in meters along the shortest paths through the graph
   */
  calculatePathDistanceThroughGraph(waypoints: string[]): number {
    return calculatePathDistanceThroughGraphUtil(waypoints, (from, to) => this.dijkstra(from, to));
  }

  /**
   * Calculate the straight-line (Euclidean) distance between two controls.
   *
   * @param c1 - First control
   * @param c2 - Second control
   * @returns Distance in meters
   */
  calculateStraightLineDistance(c1: Control, c2: Control): number {
    return calculateStraightLineDistanceUtil(c1, c2, this.mapScale);
  }

  /**
   * Calculate the shortest route distance between two controls.
   * Falls back to straight-line distance if no path exists.
   *
   * @param fromControl - Starting control
   * @param toControl - Ending control
   * @returns Distance in meters
   */
  calculateRouteDistance(fromControl: Control, toControl: Control): number {
    return calculateRouteDistanceUtil(fromControl, toControl, {
      controlNodeMap: this.controlNodeMap,
      mapScale: this.mapScale,
      findShortestPathBetween: (from, to) => this.dijkstra(from, to),
    });
  }

  /**
   * Calculate the total length of a course by summing leg distances.
   *
   * @param controls - Ordered array of controls on the course
   * @returns Total course length in meters
   */
  calculateCourseLength(controls: Control[]): number {
    return calculateCourseLengthUtil(controls, {
      controlNodeMap: this.controlNodeMap,
      mapScale: this.mapScale,
      findShortestPathBetween: (from, to) => this.dijkstra(from, to),
    });
  }

  // ---------------------------------------------------------------------------
  // Shortest Path Algorithm (Dijkstra)
  // ---------------------------------------------------------------------------

  /**
   * Find the shortest path between two nodes using Dijkstra's algorithm.
   * See route-search.ts for the algorithm itself; this method builds the
   * weighted adjacency list from this analyzer's graph and adapts the
   * search's observation hooks to the visualizer.
   *
   * @param startNodeId - Starting node ID
   * @param endNodeId - Target node ID
   * @param penalties - Optional penalties to apply to edge costs
   * @returns PathResult with distance and path, or null if no path exists
   */
  dijkstra(startNodeId: string, endNodeId: string, penalties?: Map<string, number>): PathResult | null {
    return findShortestPath(startNodeId, endNodeId, {
      edges: this.edges,
      resolveNode: (id) => this.findNodeOrControl(id),
      edgeDistanceMeters: (edge, from, to) => this.calculateEdgeDistanceMeters(edge, from, to, penalties),
      hooks: {
        onNodeSettled: (nodeId, distance) => this.visualizer?.onNodeSettled?.({ algorithm: "dijkstra", nodeId, distance }),
        onEdgeEvaluated: (fromNodeId, toNodeId, relaxed, distance) =>
          this.visualizer?.onEdgeEvaluated?.({ algorithm: "dijkstra", fromNodeId, toNodeId, relaxed, distance }),
      },
    });
  }

  /**
   * Find the shortest path between two controls.
   * Uses the control-to-node mapping to connect controls to the graph.
   *
   * @param fromControl - Starting control
   * @param toControl - Target control
   * @returns PathResult with distance and path, or null if no path exists
   */
  findShortestPathBetweenControls(fromControl: Control, toControl: Control): PathResult | null {
    const fromNodeId = this.controlNodeMap.get(fromControl.id);
    const toNodeId = this.controlNodeMap.get(toControl.id);

    if (!fromNodeId || !toNodeId) {
      return null;
    }

    return this.dijkstra(fromNodeId, toNodeId);
  }

  // ---------------------------------------------------------------------------
  // Path Metrics Counting Methods
  // ---------------------------------------------------------------------------

  /**
   * Count the number of one-way edges in a path.
   * One-way edges add difficulty as runners must recognize the constraint.
   *
   * @param path - Array of node IDs forming the path
   * @returns Number of one-way edges traversed
   */
  countOneWayEdgesInPath(path: string[]): number {
    return countOneWayEdgesInPathUtil(path, (from, to) => this.findEdge(from, to));
  }

  /**
   * Count the number of ignoreLength edges (stairs) in a path.
   * These represent level changes in indoor orienteering.
   *
   * @param path - Array of node IDs forming the path
   * @returns Number of ignoreLength edges traversed
   */
  countIgnoreLengthEdgesInPath(path: string[]): number {
    return countIgnoreLengthEdgesInPathUtil(path, (from, to) => this.findEdge(from, to));
  }

  /**
   * Count alternative edges at junctions along a path.
   * Counts edges that branch off from the chosen route at each node.
   * Dead-end edges are excluded — they don't represent meaningful alternatives.
   *
   * @param path - Array of node IDs forming the path
   * @returns Total number of alternative edges (routes not taken)
   */
  countAlternativeEdgesInPath(path: string[]): number {
    return countAlternativeEdgesInPathUtil(path, this.nodeEdges, this.getDeadEndEdgeIds());
  }

  // ---------------------------------------------------------------------------
  // Difficulty Calculation Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the polygon for a node or control position.
   */
  private getPolygonForNodeOrControl(nodeOrControl: Node | Control): Polygon | undefined {
    return getPolygonForNodeOrControlUtil(nodeOrControl, this.polygons);
  }

  /**
   * Build an array of polygons for each node in a path.
   * Indices match the path array.
   */
  private buildPathPolygons(path: string[]): (Polygon | undefined)[] {
    return buildPathPolygonsUtil(path, (id) => this.findNodeOrControl(id), this.polygons);
  }

  /**
   * Calculate total climb for a path.
   * Based on elevation differences when nodes are on different levels.
   *
   * @param path - Array of node IDs forming the path
   * @param pathPolygons - Array of polygons for each node (indices match path)
   * @returns Total climb in meters
   */
  calculatePathClimb(path: string[], pathPolygons: (Polygon | undefined)[]): number {
    return calculatePathClimbUtil(path, pathPolygons);
  }

  /**
   * Calculate the difficulty score for a path using the configured scoring model.
   *
   * @param path - Array of node IDs forming the path
   * @returns Numeric difficulty score
   */
  /**
   * Build a RouteContext for the shared scoring/analysis functions.
   */
  private buildRouteContext(path: string[]) {
    return {
      controls: this.controls,
      nodes: this.nodes,
      edges: this.edges,
      path,
      mapScale: this.mapScale,
      polygons: this.polygons,
      edgeLookup: this.edgeLookup,
      nodeEdges: this.nodeEdges,
      nodeControlMap: this.nodeControlMap,
    };
  }

  calculatePathDifficulty(path: string[]): number {
    return this.scoringModel.calculateDifficulty(this.buildRouteContext(path));
  }

  /**
   * Calculate a detailed breakdown of difficulty factors for a path.
   *
   * @param path - Array of node IDs forming the path
   * @returns LegDifficulty with individual factor scores
   */
  calculateLegDifficulty(path: string[]): LegDifficulty {
    const oneWay = this.countOneWayEdgesInPath(path);
    const stairs = this.countIgnoreLengthEdgesInPath(path);
    const alternativeEdges = this.countAlternativeEdgesInPath(path);

    return {
      oneWay,
      alternativeEdges,
      stairs,
      total: oneWay + alternativeEdges + stairs,
    };
  }

  /**
   * Calculate the difficulty score for the leg between two controls.
   *
   * @param fromControl - Starting control
   * @param toControl - Ending control
   * @returns Difficulty score, or 0 if no path exists
   */
  calculateLegDifficultyBetweenControls(fromControl: Control, toControl: Control): number {
    return this.shortestRouteBetweenControls(fromControl, toControl)?.difficulty ?? 0;
  }

  /**
   * Find the shortest route between two controls — the same route shown at the
   * top of the UI's route list and used by every analysis tool.
   *
   * "Shortest" means shortest by geometric distance (the metric
   * {@link findAlternativePaths} sorts by), NOT the lowest-cost path returned
   * by {@link dijkstra} (which treats stairs as length-free and may therefore
   * pick a different path). This is the single source of truth for the route a
   * leg's difficulty is scored against, keeping core, the web app and the CLI
   * tools consistent.
   *
   * @returns The shortest route, or undefined if no route exists.
   */
  shortestRouteBetweenControls(fromControl: Control, toControl: Control): RouteInfo | undefined {
    // findAlternativePathsBetweenControls returns routes sorted by ascending distance.
    return this.findAlternativePathsBetweenControls(fromControl.id, toControl.id)[0];
  }

  /**
   * Calculate a detailed difficulty breakdown for the leg between two controls.
   *
   * @param fromControl - Starting control
   * @param toControl - Ending control
   * @returns LegDifficulty breakdown
   */
  calculateDetailedLegDifficultyBetweenControls(fromControl: Control, toControl: Control): LegDifficulty {
    const shortest = this.shortestRouteBetweenControls(fromControl, toControl);
    if (!shortest) {
      return { oneWay: 0, alternativeEdges: 0, stairs: 0, total: 0 };
    }

    return this.calculateLegDifficulty(shortest.path);
  }

  /**
   * Calculate the total difficulty for an entire course.
   *
   * @param controls - Ordered array of controls on the course
   * @returns Sum of all leg difficulties
   */
  calculateCourseDifficulty(controls: Control[]): number {
    let totalDifficulty = 0;

    for (let i = 0; i < controls.length - 1; i++) {
      totalDifficulty += this.calculateLegDifficultyBetweenControls(controls[i], controls[i + 1]);
    }

    return totalDifficulty;
  }

  // ---------------------------------------------------------------------------
  // Route Analysis Methods
  // ---------------------------------------------------------------------------

  /**
   * Analyze a route for decision points, branching points, and alternative edges.
   *
   * Decision points use {@link analyzeDecisionPoints}: nodes where the runner
   * faces a meaningful choice (dead-ends < 50 m and insignificant branches are
   * excluded). Branching points use {@link analyzeBranchingPoints}: every node
   * where the runner has more than one outgoing edge (no filtering). Both are
   * also used by the Alpha difficulty model via the same shared functions.
   *
   * @param path - Array of node IDs forming the path
   * @returns Object with decisionPoints, decisionPointNodeIds, branchingPointNodeIds, and alternativeEdges
   */
  analyzeRoute(path: string[]): { decisionPoints: number; decisionPointNodeIds: string[]; branchingPointNodeIds: string[]; alternativeEdges: number } {
    return analyzeRouteUtil({
      ...this.buildRouteContext(path),
      findEdge: (from, to) => this.findEdge(from, to),
      nodeEdges: this.nodeEdges,
      deadEndEdgeIds: this.getDeadEndEdgeIds(),
    });
  }

  // ---------------------------------------------------------------------------
  // Level Validation Methods
  // ---------------------------------------------------------------------------
  // Route Description Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the sequence of edge labels for a path.
   */
  getRouteLabels(path: string[]): string[] {
    return getRouteLabelsUtil(path, (from, to) => this.findEdge(from, to));
  }

  /**
   * Generate a human-readable description of a route from edge labels.
   *
   * @param path - Array of node IDs forming the path
   * @returns Comma-separated string of edge labels
   */
  getRouteDescription(path: string[]): string {
    return getRouteDescriptionUtil(path, (from, to) => this.findEdge(from, to));
  }

  /**
   * Get the sequence of stair labels for a path.
   * Used to identify routes with unique stair choices.
   *
   * @param path - Array of node IDs forming the path
   * @returns Comma-separated string of stair edge labels
   */
  getStairSequence(path: string[]): string {
    return getStairSequenceUtil(path, (from, to) => this.findEdge(from, to));
  }

  // ---------------------------------------------------------------------------
  // Alternative Path Finding (K-Shortest Paths)
  // ---------------------------------------------------------------------------

  /**
   * Find alternative paths between two nodes using an iterative penalty method.
   *
   * Algorithm:
   * 1. Find shortest path with current weights.
   * 2. If new valid route found, add to results.
   * 3. Penalize edges used in the found path (heavier penalty for stairs).
   * 4. Repeat until k paths found or limits reached.
   *
   * This method effectively finds routes that are topologically different,
   * especially prioritizing different stair sequences.
   *
   * @param startNodeId - Starting node ID
   * @param endNodeId - Target node ID
   * @param k - Maximum number of paths to return (default: 6)
   * @param fromControlId - Optional control ID for path visualization
   * @param toControlId - Optional control ID for path visualization
   * @param includeVariations - If true, returns all found paths including minor variations (same stair sequence)
   * @returns Array of RouteInfo objects, sorted by distance
   */
  findAlternativePaths(
    startNodeId: string,
    endNodeId: string,
    k: number = 6,
    fromControlId?: string,
    toControlId?: string,
  ): RouteInfo[] {
    const paths: RouteInfo[] = [];
    const uniquePathStrings = new Set<string>();
    const edgePenalties = new Map<string, number>();

    const MAX_ITERATIONS = 200;
    const effectiveK = Math.max(k, 50);

    // Iterative Penalty Method
    for (let i = 0; i < MAX_ITERATIONS && paths.length < effectiveK; i++) {
      const currentPath = this.dijkstra(startNodeId, endNodeId, edgePenalties);
      if (!currentPath) break;

      // Uniqueness check:
      // Create a string representation of the path (comma-separated node IDs).
      // This allows efficient checking if we have already found this exact sequence of nodes.
      const pathString = currentPath.path.join(",");
      const isNewPath = !uniquePathStrings.has(pathString);

      if (isNewPath) {
        uniquePathStrings.add(pathString);
        const pathWithControls = this.addControlsToPath(currentPath.path, fromControlId, toControlId);
        const routeInfo = this.buildRouteInfo(pathWithControls, fromControlId, toControlId);
        paths.push(routeInfo);
        this.visualizer?.onRouteFound?.({ algorithm: "dijkstra", route: routeInfo, rank: paths.length - 1 });
      }

      // Apply penalties to edges in this path to force exploration of other routes
      // We do this even if the path was duplicate, to push the algorithm out of the local minimum
      for (let j = 0; j < currentPath.path.length - 1; j++) {
        const u = currentPath.path[j];
        const v = currentPath.path[j + 1];
        const edge = this.findEdge(u, v);

        if (edge) {
          const key = `${edge.from}:${edge.to}`;
          const currentPenalty = edgePenalties.get(key) || 1.0;

          // Check if this is a level change edge by comparing polygon levels
          const fromNode = this.findNodeOrControl(u);
          const toNode = this.findNodeOrControl(v);
          const fromPolygon = fromNode ? this.getPolygonForNodeOrControl(fromNode) : undefined;
          const toPolygon = toNode ? this.getPolygonForNodeOrControl(toNode) : undefined;
          const isLevelChange = (fromPolygon?.level ?? 0) !== (toPolygon?.level ?? 0);

          // Stronger penalty for stairs (level change edges) to encourage finding different stair routes
          const factor = isLevelChange ? 5.0 : 1.2;
          edgePenalties.set(key, currentPenalty * factor);
        }
      }

      // If we found a new path, we might want to continue searching from the base graph?
      // No, in penalty method, we keep accumulating penalties to find the "next" best.
    }

    // Sort by actual distance (re-scored without penalties)
    return paths.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Add control IDs to the beginning and end of a path for visualization.
   */
  private addControlsToPath(path: string[], fromControlId?: string, toControlId?: string): string[] {
    if (fromControlId && toControlId) {
      return [fromControlId, ...path, toControlId];
    }
    return path;
  }

  /**
   * Build a complete RouteInfo object from a path.
   */
  private buildRouteInfo(path: string[], _fromControlId?: string, _toControlId?: string): RouteInfo {
    const distance = this.calculatePathDistance(path);
    const pathPolygons = this.buildPathPolygons(path);
    const analysis = this.analyzeRoute(path);
    const labels = this.getRouteLabels(path);
    const description = labels.join(", ");
    const oneWayEdges = this.countOneWayEdgesInPath(path);
    const ignoreLengthEdges = this.countIgnoreLengthEdgesInPath(path);
    const context = this.buildRouteContext(path);
    const difficulty = this.scoringModel.calculateDifficulty(context);
    const difficultyFormula = this.scoringModel.getBreakdownFormula(context);
    const totalClimb = this.calculatePathClimb(path, pathPolygons);

    return {
      distance,
      path,
      pathPolygons,
      decisionPoints: analysis.decisionPoints,
      decisionPointNodeIds: analysis.decisionPointNodeIds,
      branchingPointNodeIds: analysis.branchingPointNodeIds,
      alternativeEdges: analysis.alternativeEdges,
      oneWayEdges,
      ignoreLengthEdges,
      description,
      labels,
      difficulty,
      difficultyFormula,
      totalClimb,
    };
  }

  /**
   * Find alternative paths between two controls.
   *
   * This is the main entry point for finding route alternatives.
   * Handles both direct edges between controls and paths through the graph.
   *
   * @param fromControlId - Starting control ID
   * @param toControlId - Destination control ID
   * @param k - Maximum number of paths to return (default: 6)
   * @param includeVariations - If true, returns all found paths including minor variations (same stair sequence)
   * @returns Array of RouteInfo objects with unique stair sequences
   */
  findAlternativePathsBetweenControls(fromControlId: string, toControlId: string, k: number = 6): RouteInfo[] {
    // Check if there's a direct edge between controls
    const directEdge = this.edges.find(
      (e) =>
        (e.from === fromControlId && e.to === toControlId) ||
        (!e.oneWay && e.from === toControlId && e.to === fromControlId),
    );

    const fromNodeId = this.controlNodeMap.get(fromControlId);
    const toNodeId = this.controlNodeMap.get(toControlId);

    // Use direct edge if available, otherwise use mapped nodes
    const startId = directEdge ? fromControlId : fromNodeId || fromControlId;
    const endId = directEdge ? toControlId : toNodeId || toControlId;

    return this.findAlternativePaths(startId, endId, k, fromControlId, toControlId);
  }

  /**
   * Find ALL alternative paths between two controls that produce distinct label sequences.
   *
   * Uses a two-phase approach:
   * 1. Build a cluster graph where nodes connected by unlabeled edges are merged
   *    into clusters (Union-Find). Labeled (stair) edges become edges between clusters.
   * 2. Enumerate all distinct label sequences via DFS on the cluster graph.
   *    Each underlying labeled edge may be used at most once (in either direction),
   *    which naturally prevents loops while allowing cluster revisits via different stairs.
   * 3. For each unique sequence, stitch a concrete path using unlabeled-only BFS
   *    between waypoints.
   *
   * @param fromControlId - Starting control ID
   * @param toControlId - Destination control ID
   * @param maxResults - Maximum number of routes to return (default: 1000)
   * @param distanceCutoff - Optional, default off: prune routes beyond ratio*shortest or shortest+absoluteMeters
   * @param algorithm - Enumeration algorithm to use (default: the clustered A*
   * search described above). See route-enumeration-algorithms.ts for the
   * alternatives — the web app exposes this as Settings → Analysis → Find all
   * routes algorithm.
   * @returns Array of RouteInfo objects, sorted by distance (unique label
   * sequences for `cluster-astar`, distinct simple paths for `dfs`/`bfs`)
   * Note: if more than `maxResults` routes exist, only the `maxResults`
   * shortest are returned (longer ones are dropped) and a warning is logged.
   */
  findAllAlternativePathsBetweenControls(
    fromControlId: string,
    toControlId: string,
    maxResults: number = 1000,
    distanceCutoff?: { ratio?: number; absoluteMeters?: number },
    algorithm: RouteEnumerationAlgorithm = DEFAULT_ROUTE_ENUMERATION_ALGORITHM,
  ): RouteInfo[] {
    const fromNodeId = this.controlNodeMap.get(fromControlId);
    const toNodeId = this.controlNodeMap.get(toControlId);

    if (!fromNodeId || !toNodeId) return [];

    // The penalised-Dijkstra variant reuses the k-shortest search rather than
    // the enumeration context, so it is dispatched before the others.
    if (algorithm === "penalty") {
      return this.findAlternativePathsBetweenControls(fromControlId, toControlId, maxResults);
    }

    const { routes, truncated } = enumerateRoutes(algorithm, fromNodeId, toNodeId, {
      edges: this.edges,
      resolveNode: (id) => this.findNodeOrControl(id),
      edgeDistanceMeters: (edge, from, to) => this.calculateEdgeDistanceMeters(edge, from, to),
      findEdge: (from, to) => this.findEdge(from, to),
      getRouteLabels: (path) => this.getRouteLabels(path),
      buildRoute: (path) => this.buildRouteInfo(this.addControlsToPath(path, fromControlId, toControlId), fromControlId, toControlId),
      hooks: {
        onNodeSettled: (nodeId, distance) => this.visualizer?.onNodeSettled?.({ algorithm: "all-routes", nodeId, distance }),
        onEdgeEvaluated: (fromNodeId, toNodeId, relaxed, distance) =>
          this.visualizer?.onEdgeEvaluated?.({ algorithm: "all-routes", fromNodeId, toNodeId, relaxed, distance }),
        onRouteFound: (route, rank) => this.visualizer?.onRouteFound?.({ algorithm: "all-routes", route, rank }),
      },
    }, maxResults, distanceCutoff);

    if (truncated) {
      console.warn(
        `findAllAlternativePathsBetweenControls: "${algorithm}" hit its limits (maxResults ${maxResults}) ` +
        `for ${fromControlId}->${toControlId}; longer routes were not enumerated. ` +
        `Pass a higher maxResults for fuller enumeration.`,
      );
    }

    return routes;
  }

  /**
   * Find a single route between two controls using a human planning model.
   * See human-route.ts for the algorithm itself. Convenience wrapper around
   * `findHumanRouteWithTrace` for callers that only need the route.
   */
  findHumanRouteBetweenControls(fromControlId: string, toControlId: string): RouteInfo | undefined {
    return this.findHumanRouteWithTrace(fromControlId, toControlId)?.route;
  }

  /**
   * Find the route a human would plan between two controls, with the
   * step-by-step exploration trace (which floor regions were considered,
   * in what order, and how the plan closed) — see human-route.ts and
   * planning/07-human-route-simulation.md. `params` is optional and, when
   * omitted, reproduces the fixed default heuristic exactly.
   */
  findHumanRouteWithTrace(fromControlId: string, toControlId: string, params?: HumanModelParams): HumanRouteResult | undefined {
    const fromNodeId = this.controlNodeMap.get(fromControlId);
    const toNodeId = this.controlNodeMap.get(toControlId);
    if (!fromNodeId || !toNodeId) return undefined;

    const searchResult = findHumanRoute(fromNodeId, toNodeId, {
      edges: this.edges,
      resolveNode: (id) => this.findNodeOrControl(id),
      edgeDistanceMeters: (edge, from, to) => this.calculateEdgeDistanceMeters(edge, from, to),
      getCoordinates,
      mapScale: this.mapScale,
      hooks: {
        onNodeSettled: (nodeId, distance) => this.visualizer?.onNodeSettled?.({ algorithm: "human-route", nodeId, distance }),
        onEdgeEvaluated: (fromNodeId, toNodeId, relaxed, distance) =>
          this.visualizer?.onEdgeEvaluated?.({ algorithm: "human-route", fromNodeId, toNodeId, relaxed, distance }),
      },
      params,
    });

    if (!searchResult) return undefined;

    const pathWithControls = this.addControlsToPath(searchResult.path, fromControlId, toControlId);
    const routeInfo = this.buildRouteInfo(pathWithControls, fromControlId, toControlId);
    this.visualizer?.onRouteFound?.({ algorithm: "human-route", route: routeInfo, rank: 0 });

    return {
      route: routeInfo,
      sameFloor: searchResult.sameFloor,
      forwardLabels: searchResult.forwardLabels,
      backwardLabels: searchResult.backwardLabels,
      explorationTrace: searchResult.trace.steps,
      meetingAttempts: searchResult.trace.meetingAttempts,
      clusterOf: searchResult.clusterOf,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the graph node ID mapped to a control.
   *
   * @param controlId - The control ID
   * @returns The nearest node ID, or undefined if not mapped
   */
  getNodeIdForControl(controlId: string): string | undefined {
    return this.controlNodeMap.get(controlId);
  }


  /**
   * Get the set of edge keys visited by a route path.
   * Uses sorted node IDs "min:max" to identify edges regardless of direction.
   * 
   * @param path - The node IDs of the route
   * @returns Array of unique edge keys
   */
  /**
   * Calculate the Repetition Ratio for a route.
   * Percentage of route length that consists of edges visited in previous legs' shortest routes.
   * 
   * @param path - The node IDs of the route to analyze
   * @param previousRoutes - Array of paths (node IDs) from previous legs
   * @returns The ratio (0-1)
   */
  calculateRepetitionRatio(path: string[], previousRoutes: string[][]): number {
    if (!previousRoutes || previousRoutes.length === 0 || path.length < 2) {
      return 0;
    }

    let intersectionLength = 0;
    let totalLength = 0;

    // Create a set of visited edge keys for O(1) lookup
    // Key format: "u:v" where u < v to handle directionality
    const visitedEdges = new Set<string>();
    
    for (const routePath of previousRoutes) {
      if (routePath.length < 2) continue;
      for (let i = 0; i < routePath.length - 1; i++) {
        const u = routePath[i];
        const v = routePath[i+1];
        // Normalize key by sorting IDs to handle bidirectional matching
        // We use a custom separator that is unlikely to be in IDs
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        visitedEdges.add(key);
      }
    }

    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i];
        const v = path[i+1];
        const edge = this.findEdge(u, v); 
        
        if (edge) {
            const fromNode = this.findNodeOrControl(u);
            const toNode = this.findNodeOrControl(v);
            const dist = this.calculateEdgeDistanceMeters(edge, fromNode, toNode);

            totalLength += dist;
            
            const key = u < v ? `${u}|${v}` : `${v}|${u}`;
            if (visitedEdges.has(key)) {
                intersectionLength += dist;
            }
        }
    }
    
    return totalLength > 0 ? intersectionLength / totalLength : 0;
  }

  /**
   * Check if the graph has been populated with edges and nodes.
   *
   * @returns true if the graph has data for pathfinding
   */
  hasGraph(): boolean {
    return this.edges.length > 0 && this.nodes.length > 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new RouteAnalyzer instance.
 * Convenience function for creating analyzers without using 'new'.
 *
 * @param controls - Array of control points
 * @param nodes - Array of graph nodes
 * @param edges - Array of edges connecting nodes
 * @param mapScale - Map scale factor
 * @param polygons - Optional array of polygons for elevation lookup
 * @returns A new RouteAnalyzer instance
 */
export function createRouteAnalyzer(
  controls: Control[],
  nodes: Node[],
  edges: Edge[],
  mapScale: number,
  polygons: Polygon[] = [],
  visualizer?: RouteAnalyzerVisualizer
): RouteAnalyzer {
  return new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, polygons, visualizer);
}
