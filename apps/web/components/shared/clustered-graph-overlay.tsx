"use client";

import type { Edge } from "@indoor-o-route-analysis/core";
import { GRAPH_NODE_RADIUS, GRAPH_EDGE_THICKNESS, computeConvexHull } from "@indoor-o-route-analysis/core";
import type { PointPx } from "./graph-overlay";

const SEAM_COLOR = "#9ca3af";
const BLOB_MARGIN = 14; // px the hull is inflated outward, so the blob doesn't hug node centers
const BLOB_CORNER_RADIUS = 18; // px

/** Pushes each hull point outward from the polygon's centroid by `margin`. */
function inflateHull(hull: { x: number; y: number }[], margin: number): { x: number; y: number }[] {
  const centroid = hull.reduce((sum, p) => ({ x: sum.x + p.x / hull.length, y: sum.y + p.y / hull.length }), { x: 0, y: 0 });
  return hull.map((p) => {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * margin, y: p.y + (dy / len) * margin };
  });
}

/** Builds a rounded-corner SVG path through a closed polygon, using each vertex as a quadratic-Bezier control point. */
function roundedPolygonPath(points: { x: number; y: number }[], radius: number): string {
  const n = points.length;
  if (n < 3) return "";
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y) || 1;
    const lenNext = Math.hypot(toNext.x, toNext.y) || 1;
    const r = Math.min(radius, lenPrev / 2, lenNext / 2);
    const a = { x: curr.x + (toPrev.x / lenPrev) * r, y: curr.y + (toPrev.y / lenPrev) * r };
    const b = { x: curr.x + (toNext.x / lenNext) * r, y: curr.y + (toNext.y / lenNext) * r };
    parts.push(i === 0 ? `M ${a.x} ${a.y}` : `L ${a.x} ${a.y}`);
    parts.push(`Q ${curr.x} ${curr.y} ${b.x} ${b.y}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

interface ClusteredGraphOverlayProps {
  edges: Edge[];
  /** Graph nodes and controls in pixel space, merged (a control can itself be a graph node in this model). */
  nodes: PointPx[];
  /** nodeId -> cluster id, from computeClusteredGraph. */
  clusterOf: Record<string, string>;
  /** clusterId -> color, from assignClusterColors. */
  clusterColors: Record<string, string>;
}

/** A single midpoint chevron indicating an edge's traversal direction. */
function Chevron({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const size = 5;
  const tipX = midX + size * Math.cos(angle);
  const tipY = midY + size * Math.sin(angle);
  const base1X = midX + size * Math.cos(angle + (2 * Math.PI) / 3);
  const base1Y = midY + size * Math.sin(angle + (2 * Math.PI) / 3);
  const base2X = midX + size * Math.cos(angle - (2 * Math.PI) / 3);
  const base2Y = midY + size * Math.sin(angle - (2 * Math.PI) / 3);
  return (
    <g pointerEvents="none">
      <line x1={base1X} y1={base1Y} x2={tipX} y2={tipY} stroke={color} strokeWidth={2} />
      <line x1={base2X} y1={base2Y} x2={tipX} y2={tipY} stroke={color} strokeWidth={2} />
    </g>
  );
}

/**
 * Renders the Labs "Clustered Graph" visualization: a translucent rounded
 * "blob" behind each cluster's member nodes (so the floor region reads as
 * one visual area, not a scatter of dots), then every node and edge in its
 * real position (no abstraction into a cluster diagram) tinted by
 * same-floor cluster. Same-floor edges take their cluster's color;
 * edges between clusters (stairs, one-way passages) - the seams between clusters - are
 * drawn in a neutral dashed style regardless of which clusters they join.
 * One-way edges (of either kind) get a midpoint direction chevron. Must be
 * placed inside an <svg> or <g>, alongside GraphOverlay conventions.
 */
export function ClusteredGraphOverlay({ edges, nodes, clusterOf, clusterColors }: ClusteredGraphOverlayProps) {
  const posById = new Map(nodes.map((n) => [n.id, n]));

  const nodesByCluster = new Map<string, PointPx[]>();
  for (const node of nodes) {
    const cluster = clusterOf[node.id];
    if (!cluster) continue;
    if (!nodesByCluster.has(cluster)) nodesByCluster.set(cluster, []);
    nodesByCluster.get(cluster)!.push(node);
  }

  return (
    <g pointerEvents="none">
      {Array.from(nodesByCluster.entries()).map(([cluster, members]) => {
        const color = clusterColors[cluster];
        if (!color) return null;
        if (members.length === 1) {
          return (
            <circle
              key={`blob-${cluster}`}
              cx={members[0].x} cy={members[0].y}
              r={BLOB_MARGIN} fill={color} fillOpacity={0.15} stroke={color} strokeOpacity={0.4} strokeWidth={1.5}
            />
          );
        }
        if (members.length === 2) {
          const [a, b] = members;
          return (
            <line
              key={`blob-${cluster}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={color} strokeOpacity={0.15} strokeWidth={BLOB_MARGIN * 2} strokeLinecap="round"
            />
          );
        }
        const hull = computeConvexHull(members.map((m) => ({ x: m.x, y: m.y })));
        if (hull.length < 3) return null;
        const path = roundedPolygonPath(inflateHull(hull, BLOB_MARGIN), BLOB_CORNER_RADIUS);
        return (
          <path key={`blob-${cluster}`} d={path} fill={color} fillOpacity={0.15} stroke={color} strokeOpacity={0.4} strokeWidth={1.5} />
        );
      })}

      {edges.map((edge, i) => {
        const from = posById.get(edge.from);
        const to = posById.get(edge.to);
        if (!from || !to) return null;
        const isSeam = clusterOf[edge.from] !== clusterOf[edge.to];
        const color = isSeam ? SEAM_COLOR : (clusterColors[clusterOf[edge.from]] ?? SEAM_COLOR);
        return (
          <g key={`clustered-edge-${i}`}>
            <line
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={color}
              strokeWidth={GRAPH_EDGE_THICKNESS * (isSeam ? 1.4 : 1)}
              strokeDasharray={isSeam ? "5,3" : undefined}
              opacity={isSeam ? 0.9 : 0.55}
            />
            {edge.oneWay && <Chevron x1={from.x} y1={from.y} x2={to.x} y2={to.y} color={color} />}
          </g>
        );
      })}

      {nodes.map((node) => {
        const cluster = clusterOf[node.id];
        const color = cluster ? clusterColors[cluster] : undefined;
        if (!color) return null;
        return (
          <circle
            key={`clustered-node-${node.id}`}
            cx={node.x} cy={node.y}
            r={GRAPH_NODE_RADIUS}
            fill={color}
            stroke="white"
            strokeWidth={0.75}
            opacity={0.9}
          />
        );
      })}
    </g>
  );
}
