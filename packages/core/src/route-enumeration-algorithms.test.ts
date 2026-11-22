import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROUTE_ENUMERATION_ALGORITHM,
  ROUTE_ENUMERATION_ALGORITHMS,
  enumerateRoutes,
  getRouteEnumerationAlgorithmInfo,
  isRouteEnumerationAlgorithm,
  type RouteEnumerationAlgorithm,
} from "./route-enumeration-algorithms";
import type { Edge } from "./models/graph";
import { makeContext, node } from "./test-helpers/route-enumeration-context";

// Two floors joined by two stairs, plus a second same-floor corridor (S→A2→A)
// reaching stair "1". The clustered default reports one route per stair
// sequence ("1", "2"); the basic enumerations also report the corridor variant.
const nodes = [
  node("S", 0, 0), node("A", 5, 0), node("A2", 5, 40),
  node("B", 5, 100), node("T", 20, 100),
  node("A3", 50, 0), node("B3", 50, 100),
];
const edges: Edge[] = [
  { from: "S", to: "A", label: "" },
  { from: "S", to: "A2", label: "" },
  { from: "A2", to: "A", label: "" },
  { from: "S", to: "A3", label: "" },
  { from: "A", to: "B", label: "1", reverseLabel: "1", ignoreLength: true },
  { from: "A3", to: "B3", label: "2", reverseLabel: "2", ignoreLength: true },
  { from: "B", to: "T", label: "" },
  { from: "B3", to: "T", label: "" },
];

describe("route enumeration algorithm registry", () => {
  it("exposes the default algorithm in the list", () => {
    expect(ROUTE_ENUMERATION_ALGORITHMS.map((a) => a.id)).toContain(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
  });

  it("gives every algorithm a unique id, label and description", () => {
    const ids = ROUTE_ENUMERATION_ALGORITHMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const info of ROUTE_ENUMERATION_ALGORITHMS) {
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.detail.length).toBeGreaterThan(0);
    }
  });

  it("validates persisted values", () => {
    expect(isRouteEnumerationAlgorithm("dfs")).toBe(true);
    expect(isRouteEnumerationAlgorithm("bfs")).toBe(true);
    expect(isRouteEnumerationAlgorithm("cluster-astar")).toBe(true);
    expect(isRouteEnumerationAlgorithm("penalty")).toBe(true);
    expect(isRouteEnumerationAlgorithm("nope")).toBe(false);
    expect(isRouteEnumerationAlgorithm(undefined)).toBe(false);
    expect(isRouteEnumerationAlgorithm(3)).toBe(false);
  });

  it("falls back to the default for unknown ids when looking up metadata", () => {
    const info = getRouteEnumerationAlgorithmInfo("not-an-algorithm" as RouteEnumerationAlgorithm);
    expect(info.id).toBe(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
  });
});

describe("enumerateRoutes dispatch", () => {
  it("cluster-astar keeps one route per distinct stair sequence", () => {
    const { routes } = enumerateRoutes("cluster-astar", "S", "T", makeContext(nodes, edges));
    expect(routes.map((r) => r.labels.join(","))).toEqual(["1", "2"]);
  });

  it.each(["dfs", "bfs"] as const)("%s also reports same-stair corridor variations", (algorithm) => {
    const { routes } = enumerateRoutes(algorithm, "S", "T", makeContext(nodes, edges));
    expect(routes.map((r) => r.path)).toEqual([
      ["S", "A", "B", "T"],
      ["S", "A3", "B3", "T"],
      ["S", "A2", "A", "B", "T"],
    ]);
  });

  it("honours maxResults for every algorithm", () => {
    for (const { id } of ROUTE_ENUMERATION_ALGORITHMS) {
      if (id === "penalty") continue; // dispatched by RouteAnalyzer, not here
      const { routes } = enumerateRoutes(id, "S", "T", makeContext(nodes, edges), 1);
      expect(routes).toHaveLength(1);
    }
  });

  it("falls back to the default algorithm for 'penalty' (RouteAnalyzer handles it)", () => {
    const { routes } = enumerateRoutes("penalty", "S", "T", makeContext(nodes, edges));
    expect(routes.map((r) => r.labels.join(","))).toEqual(["1", "2"]);
  });
});
