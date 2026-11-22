import { describe, it, expect } from "vitest";
import { computeClusteredGraph } from "./graph-clusters";
import { computeClusterGraphEdges, clusterGraphToMermaid } from "./graph-cluster-diagram";
import type { Edge } from "./models/graph";

// Matches the article's Figure "Cluster condensation": two floor clusters
// linked by two independent two-way stairs A and B.
const edges: Edge[] = [
  { from: "n1", to: "n2", label: "" },
  { from: "n2", to: "n3", label: "" },
  { from: "n4", to: "n5", label: "" },
  { from: "n2", to: "n4", label: "A", reverseLabel: "A" },
  { from: "n3", to: "n5", label: "B", reverseLabel: "B" },
];

describe("computeClusterGraphEdges", () => {
  it("emits both directions of a two-way stair as separate directed edges", () => {
    const { clusterOf } = computeClusteredGraph(edges);
    const clusterEdges = computeClusterGraphEdges(edges, clusterOf);
    const labels = clusterEdges.map((e) => e.label).sort();
    expect(labels).toEqual(["A", "A", "B", "B"]);
    expect(clusterEdges.every((e) => !e.oneWay)).toBe(true);
  });

  it("emits only one direction for a one-way passage", () => {
    const oneWayEdges: Edge[] = [
      { from: "n1", to: "n2", label: "" },
      { from: "n3", to: "n4", label: "" },
      { from: "n2", to: "n3", label: "X", oneWay: true },
    ];
    const { clusterOf } = computeClusteredGraph(oneWayEdges);
    const clusterEdges = computeClusterGraphEdges(oneWayEdges, clusterOf);
    expect(clusterEdges).toHaveLength(1);
    expect(clusterEdges[0].label).toBe("X");
    expect(clusterEdges[0].oneWay).toBe(true);
  });

  it("excludes unlabeled edges - they are collapsed into clusters, not shown as edges", () => {
    const { clusterOf } = computeClusteredGraph(edges);
    const clusterEdges = computeClusterGraphEdges(edges, clusterOf);
    // Only the two labeled stairs should produce edges (x2 for two-way = 4 total).
    expect(clusterEdges).toHaveLength(4);
  });
});

describe("computeClusterGraphEdges between floor clusters", () => {
  it("includes unlabeled edges that cross clusters (one-way and cross-floor), omits intra-cluster ones", () => {
    const edges: Edge[] = [
      { from: "A", to: "B", label: "" },
      { from: "B", to: "C", label: "" },
      { from: "A", to: "D", label: "", oneWay: true },
    ];
    const levelOf = (id: string) => ({ A: 0, B: 0, C: 1, D: 0 })[id];
    const { clusterOf } = computeClusteredGraph(edges, levelOf);
    const clusterEdges = computeClusterGraphEdges(edges, clusterOf);
    expect(clusterEdges).toHaveLength(3); // B-C both ways + A->D
    expect(clusterEdges.filter((e) => e.oneWay)).toHaveLength(1);
  });
});

describe("clusterGraphToMermaid", () => {
  it("renders one node line per cluster and one directed edge line per traversable direction", () => {
    const { clusterOf, clusters } = computeClusteredGraph(edges);
    const clusterEdges = computeClusterGraphEdges(edges, clusterOf);
    const mermaid = clusterGraphToMermaid(clusters, clusterEdges);

    expect(mermaid).toMatch(/^graph TD/);
    expect(clusters).toHaveLength(2);
    expect(mermaid).toContain('C1["C1"]');
    expect(mermaid).toContain('C2["C2"]');
    // Both A and B connect C1 and C2 in both directions.
    expect(mermaid.match(/-->\|A\|/g)).toHaveLength(2);
    expect(mermaid.match(/-->\|B\|/g)).toHaveLength(2);
  });

  it("relabels raw cluster ids to readable C1, C2, ... names", () => {
    const mermaid = clusterGraphToMermaid(["node-42", "node-99"], [
      { from: "node-42", to: "node-99", label: "Z", oneWay: true },
    ]);
    expect(mermaid).toContain("C1 -->|Z| C2");
    expect(mermaid).not.toContain("node-42");
    expect(mermaid).not.toContain("node-99");
  });

  it("is deterministic for the same input", () => {
    const { clusterOf, clusters } = computeClusteredGraph(edges);
    const clusterEdges = computeClusterGraphEdges(edges, clusterOf);
    expect(clusterGraphToMermaid(clusters, clusterEdges)).toBe(clusterGraphToMermaid(clusters, clusterEdges));
  });
});
