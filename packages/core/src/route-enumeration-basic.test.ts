import { describe, it, expect } from "vitest";
import { findAllPathsBasic, type BasicEnumerationStrategy } from "./route-enumeration-basic";
import type { RouteEnumerationContext } from "./route-enumeration";
import type { Edge } from "./models/graph";
import { makeContext, node } from "./test-helpers/route-enumeration-context";

const strategies: BasicEnumerationStrategy[] = ["dfs", "bfs"];

/**
 * Fan graph: three parallel S→T corridors through A (~102 m), B (~148 m) and
 * C (~225 m). The first hop is deliberately *cheapest* on the longest corridor
 * (S→B is 40 m, S→A is 51 m), so discovery order differs from distance order —
 * which is what the truncation test below relies on.
 */
const fanNodes = [node("S", 0, 0), node("T", 100, 0), node("A", 50, 10), node("B", 0, 40), node("C", 0, 90)];
const fanEdges: Edge[] = [
  { from: "S", to: "A", label: "" },
  { from: "A", to: "T", label: "" },
  { from: "S", to: "B", label: "" },
  { from: "B", to: "T", label: "" },
  { from: "S", to: "C", label: "" },
  { from: "C", to: "T", label: "" },
];

describe.each(strategies)("findAllPathsBasic (%s)", (strategy) => {
  const run = (
    nodes: Parameters<typeof makeContext>[0],
    edges: Edge[],
    options?: Parameters<typeof findAllPathsBasic>[4],
    ctxOverride?: Partial<RouteEnumerationContext>,
  ) =>
    findAllPathsBasic("S", "T", { ...makeContext(nodes, edges), ...ctxOverride }, strategy, options);

  it("finds the only route when there is no alternative", () => {
    const nodes = [node("S", 0, 0), node("T", 10, 0)];
    const { routes, truncated } = run(nodes, [{ from: "S", to: "T", label: "" }]);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toEqual(["S", "T"]);
    expect(truncated).toBe(false);
  });

  it("enumerates every simple path, sorted shortest first", () => {
    const { routes, truncated } = run(fanNodes, fanEdges);
    expect(routes.map((r) => r.path)).toEqual([
      ["S", "A", "T"],
      ["S", "B", "T"],
      ["S", "C", "T"],
    ]);
    expect(routes[0].distance).toBeLessThanOrEqual(routes[1].distance);
    expect(truncated).toBe(false);
  });

  it("keeps the SHORTEST route when maxResults truncates, not the first found", () => {
    // S→B is the cheapest first hop, so both strategies reach T via B first,
    // but the route via A is shorter overall and must be the one kept.
    const { routes, truncated } = run(fanNodes, fanEdges, { maxResults: 1 });
    expect(routes.map((r) => r.path)).toEqual([["S", "A", "T"]]);
    expect(truncated).toBe(true);
  });

  it("distinguishes variations that share the same stair sequence", () => {
    // Two same-floor corridors (via A or via A2) both lead to stair "1".
    // The clustered default algorithm collapses these into one route;
    // the basic enumeration reports both.
    const nodes = [
      node("S", 0, 0), node("A", 5, 0), node("A2", 5, 40),
      node("B", 5, 100), node("T", 20, 100),
    ];
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "S", to: "A2", label: "" },
      { from: "A2", to: "A", label: "" },
      { from: "A", to: "B", label: "1", reverseLabel: "1", ignoreLength: true },
      { from: "B", to: "T", label: "" },
    ];
    const { routes } = run(nodes, edges);
    expect(routes.map((r) => r.path)).toEqual([
      ["S", "A", "B", "T"],
      ["S", "A2", "A", "B", "T"],
    ]);
    expect(routes.every((r) => r.labels.join(",") === "1")).toBe(true);
  });

  it("never revisits a node, so cycles do not produce infinite routes", () => {
    // Triangle loop S-A-B-S with a tail to T.
    const nodes = [node("S", 0, 0), node("A", 10, 0), node("B", 10, 10), node("T", 20, 0)];
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "A", to: "B", label: "" },
      { from: "B", to: "S", label: "" },
      { from: "A", to: "T", label: "" },
    ];
    const { routes } = run(nodes, edges);
    // Both simple paths, and no more: the S-A-B loop cannot be walked twice.
    expect(routes.map((r) => r.path)).toEqual([
      ["S", "A", "T"],
      ["S", "B", "A", "T"],
    ]);
  });

  it("respects one-way edges", () => {
    // The direct S→T corridor is one-way in the wrong direction (T→S only).
    const nodes = [node("S", 0, 0), node("A", 0, 20), node("T", 40, 0)];
    const edges: Edge[] = [
      { from: "T", to: "S", label: "", oneWay: true },
      { from: "S", to: "A", label: "" },
      { from: "A", to: "T", label: "" },
    ];
    const { routes } = run(nodes, edges);
    expect(routes.map((r) => r.path)).toEqual([["S", "A", "T"]]);
  });

  it("prunes routes beyond the distance cutoff", () => {
    // Shortest is S-A-T (~102 m); a cutoff of exactly the shortest excludes
    // the longer corridors via B and C.
    const { routes } = run(fanNodes, fanEdges, {
      distanceCutoff: { ratio: 1, absoluteMeters: 0 },
    });
    expect(routes.map((r) => r.path)).toEqual([["S", "A", "T"]]);
  });

  it("stops at maxPathNodes and reports truncation", () => {
    // Chain S-n1-n2-n3-T needs 5 nodes; allow only 3.
    const nodes = [node("S", 0, 0), node("n1", 10, 0), node("n2", 20, 0), node("n3", 30, 0), node("T", 40, 0)];
    const edges: Edge[] = [
      { from: "S", to: "n1", label: "" },
      { from: "n1", to: "n2", label: "" },
      { from: "n2", to: "n3", label: "" },
      { from: "n3", to: "T", label: "" },
    ];
    expect(run(nodes, edges, { maxPathNodes: 3 }).routes).toHaveLength(0);
    expect(run(nodes, edges).routes.map((r) => r.path)).toEqual([["S", "n1", "n2", "n3", "T"]]);
  });

  it("reports truncated when the expansion budget is exhausted", () => {
    const { truncated } = run(fanNodes, fanEdges, { maxExpansions: 1 });
    expect(truncated).toBe(true);
  });

  it("returns no routes when the target is unreachable", () => {
    const nodes = [node("S", 0, 0), node("A", 10, 0), node("T", 50, 0)];
    const { routes, truncated } = run(nodes, [{ from: "S", to: "A", label: "" }]);
    expect(routes).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("fires onRouteFound once per returned route, in rank order", () => {
    const found: Array<{ path: string[]; rank: number }> = [];
    const { routes } = run(fanNodes, fanEdges, undefined, {
      hooks: { onRouteFound: (route, rank) => found.push({ path: route.path, rank }) },
    });
    expect(found.map((f) => f.rank)).toEqual([0, 1, 2]);
    expect(found.map((f) => f.path)).toEqual(routes.map((r) => r.path));
  });

  it("only builds RouteInfo objects for the routes it returns", () => {
    let builds = 0;
    const base = makeContext(fanNodes, fanEdges);
    const { routes } = findAllPathsBasic(
      "S",
      "T",
      {
        ...base,
        buildRoute: (path) => {
          builds++;
          return base.buildRoute(path);
        },
      },
      strategy,
      { maxResults: 1 },
    );
    expect(routes).toHaveLength(1);
    expect(builds).toBe(1);
  });
});
