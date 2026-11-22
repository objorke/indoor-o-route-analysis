/**
 * Builds the condensed cluster graph (see graph-clusters.ts and
 * articles/graph-based-indoor-o-analysis.tex, "Cluster condensation") as a
 * Mermaid flowchart: one node per cluster, one directed edge per
 * traversable direction of each edge between clusters (stair or one-way passage) - matching the
 * article's model exactly (a two-way stair is two separate directed
 * edges, not one bidirectional line).
 */

import type { Edge } from "./models/graph";

export interface ClusterGraphEdge {
  from: string;
  to: string;
  label: string;
  oneWay: boolean;
}

/** Directed cluster-to-cluster edges for the whole graph, one per traversable direction of each labeled edge. */
export function computeClusterGraphEdges(edges: Edge[], clusterOf: Record<string, string>): ClusterGraphEdge[] {
  const result: ClusterGraphEdge[] = [];
  for (const edge of edges) {
    const fromCluster = clusterOf[edge.from];
    const toCluster = clusterOf[edge.to];
    if (fromCluster === undefined || toCluster === undefined) continue;
    if (fromCluster === toCluster) continue; // inside one cluster, not a cluster-graph edge

    result.push({ from: fromCluster, to: toCluster, label: edge.label ?? "", oneWay: !!edge.oneWay });
    if (!edge.oneWay) {
      result.push({ from: toCluster, to: fromCluster, label: edge.reverseLabel || edge.label, oneWay: false });
    }
  }
  return result;
}

/** Renders the cluster graph as Mermaid `graph TD` syntax, with clusters relabeled C1, C2, ... for readability. */
export function clusterGraphToMermaid(clusters: string[], edges: ClusterGraphEdge[]): string {
  const displayName = new Map(clusters.map((cluster, i) => [cluster, `C${i + 1}`]));
  const nameOf = (cluster: string) => displayName.get(cluster) ?? cluster;

  const lines = ["graph TD"];
  for (const cluster of clusters) {
    const name = nameOf(cluster);
    lines.push(`    ${name}["${name}"]`);
  }
  for (const edge of edges) {
    const arrow = edge.label ? `-->|${edge.label}|` : "-->";
    lines.push(`    ${nameOf(edge.from)} ${arrow} ${nameOf(edge.to)}`);
  }
  return lines.join("\n");
}
