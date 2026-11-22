import { describe, it, expect } from "vitest";
import { computeSameFloorClusters, computeClusteredGraph, assignClusterColors } from "./graph-clusters";
import type { Edge } from "./models/graph";

describe("computeSameFloorClusters", () => {
  it("unions nodes connected by a bidirectional unlabeled edge", () => {
    const edges: Edge[] = [{ from: "A", to: "B", label: "" }];
    const uf = computeSameFloorClusters(edges);
    expect(uf.find("A")).toBe(uf.find("B"));
  });

  it("does not union nodes connected by a labeled (stair) edge", () => {
    const edges: Edge[] = [{ from: "A", to: "B", label: "1" }];
    const uf = computeSameFloorClusters(edges);
    expect(uf.find("A")).not.toBe(uf.find("B"));
  });

  it("does not union nodes connected by a one-way unlabeled edge", () => {
    const edges: Edge[] = [{ from: "A", to: "B", label: "", oneWay: true }];
    const uf = computeSameFloorClusters(edges);
    expect(uf.find("A")).not.toBe(uf.find("B"));
  });
});

describe("computeSameFloorClusters with floors", () => {
  const floors: Record<string, number> = { A: 0, B: 0, C: 1, D: 1 };
  const levelOf = (id: string) => floors[id];

  it("merges two-way edges on the same floor, regardless of label or zero length", () => {
    const edges: Edge[] = [
      { from: "A", to: "B", label: "7", ignoreLength: true },
      { from: "C", to: "D", label: "" },
    ];
    const uf = computeSameFloorClusters(edges, levelOf);
    expect(uf.find("A")).toBe(uf.find("B"));
    expect(uf.find("C")).toBe(uf.find("D"));
  });

  it("never merges nodes on different floors, even via an unlabeled two-way edge", () => {
    const uf = computeSameFloorClusters([{ from: "B", to: "C", label: "" }], levelOf);
    expect(uf.find("B")).not.toBe(uf.find("C"));
  });

  it("does not merge across a one-way edge on the same floor", () => {
    const uf = computeSameFloorClusters([{ from: "A", to: "B", label: "", oneWay: true }], levelOf);
    expect(uf.find("A")).not.toBe(uf.find("B"));
  });

  it("does not merge a known floor with an unknown one", () => {
    const uf = computeSameFloorClusters([{ from: "A", to: "X", label: "" }], levelOf);
    expect(uf.find("A")).not.toBe(uf.find("X"));
  });
});

describe("computeClusteredGraph", () => {
  it("groups a same-floor chain into one cluster and keeps stair-separated floors apart", () => {
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "B", to: "C", label: "" },
      { from: "A", to: "B", label: "1", reverseLabel: "1" },
    ];
    const { clusterOf, clusters } = computeClusteredGraph(edges);
    expect(clusterOf.S).toBe(clusterOf.A);
    expect(clusterOf.B).toBe(clusterOf.C);
    expect(clusterOf.A).not.toBe(clusterOf.B);
    expect(clusters).toHaveLength(2);
  });

  it("includes every node touched by any edge, not just one leg's nodes", () => {
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "X", to: "Y", label: "" },
    ];
    const { clusterOf } = computeClusteredGraph(edges);
    expect(Object.keys(clusterOf).sort()).toEqual(["A", "S", "X", "Y"]);
  });

  it("is deterministic across repeated calls on the same edge list", () => {
    const edges: Edge[] = [
      { from: "S", to: "A", label: "" },
      { from: "B", to: "C", label: "" },
      { from: "A", to: "B", label: "1" },
    ];
    const a = computeClusteredGraph(edges);
    const b = computeClusteredGraph(edges);
    expect(a).toEqual(b);
  });
});

describe("assignClusterColors", () => {
  it("assigns a distinct color to each cluster", () => {
    const colors = assignClusterColors(["c1", "c2", "c3"]);
    const values = Object.values(colors);
    expect(new Set(values).size).toBe(3);
  });

  it("is deterministic for the same cluster list", () => {
    const a = assignClusterColors(["c1", "c2"]);
    const b = assignClusterColors(["c1", "c2"]);
    expect(a).toEqual(b);
  });

  it("returns an empty map for no clusters", () => {
    expect(assignClusterColors([])).toEqual({});
  });
});
