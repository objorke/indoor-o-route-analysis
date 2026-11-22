
import { createEventRouteAnalyzer } from "@indoor-o-route-analysis/core";
import type { EventData } from "@indoor-o-route-analysis/core";
import type { Node } from "@indoor-o-route-analysis/core";
import type { Edge } from "@indoor-o-route-analysis/core";
import type { Control } from "@indoor-o-route-analysis/core";
import { getActualCourseControls } from "@indoor-o-route-analysis/core";
import { edgeKey } from "@indoor-o-route-analysis/core";

export interface EdgeTraffic {
  edgeId: string;
  forward: number;
  backward: number;
  total: number;
  collision: number;
  courseIds: Set<string>;
}

export interface NodeTraffic {
  nodeId: string;
  count: number;
  courseIds: Set<string>;
}

export async function* calculateEventTrafficGenerator(
  event: EventData,
  nodes: Node[],
  edges: Edge[],
  controls: Control[],
  targetCourseId: string | null = null,
): AsyncGenerator<{ progress: number; edgeTraffic: Map<string, EdgeTraffic>; nodeTraffic: Map<string, NodeTraffic> }> {
  // Initialize result maps
  const edgeTraffic = new Map<string, EdgeTraffic>();
  edges.forEach((e) => {
    edgeTraffic.set(edgeKey(e), {
      edgeId: edgeKey(e),
      forward: 0,
      backward: 0,
      total: 0,
      collision: 0,
      courseIds: new Set<string>(),
    });
  });

  const nodeTraffic = new Map<string, NodeTraffic>();
  nodes.forEach((n) => {
    nodeTraffic.set(n.id, { nodeId: n.id, count: 0, courseIds: new Set<string>() });
  });
  controls.forEach((c) => {
    if (!nodeTraffic.has(c.id)) {
      nodeTraffic.set(c.id, { nodeId: c.id, count: 0, courseIds: new Set<string>() });
    }
  });

  // Setup analyzer
  // Same analyzer setup as every other view (floor polygons affect which
  // alternative routes are found, so traffic must use them too)
  const analyzer = createEventRouteAnalyzer(event, { courseId: targetCourseId });

  // Build edge lookup for efficient access
  const edgeLookup = new Map<string, Edge>();
  edges.forEach((e) => {
    edgeLookup.set(`${e.from}:${e.to}`, e);
    if (!e.oneWay) {
      edgeLookup.set(`${e.to}:${e.from}`, e);
    }
  });

  const courses = event.raceCourses?.[0]?.courses;

  if (!courses) {
    yield { progress: 100, edgeTraffic, nodeTraffic };
    return;
  }

  const activeCourses = courses.filter(
    (c) =>
      (c.numberOfCompetitors || 0) > 0 &&
      c.controls &&
      c.controls.length >= 2 &&
      (!targetCourseId || c.name === targetCourseId || c.id === targetCourseId),
  );
  let processedLegs = 0;
  const totalLegs = activeCourses.reduce((acc, c) => acc + (getActualCourseControls(c.controls, controls).length - 1), 0);

  if (totalLegs === 0) {
    yield { progress: 100, edgeTraffic, nodeTraffic };
    return;
  }

  // Iterate through courses and process legs
  for (const course of activeCourses) {
    const runners = course.numberOfCompetitors || 0;

    // Process legs (skip intermediate start controls)
    const filteredControls = getActualCourseControls(course.controls, controls);
    for (let i = 0; i < filteredControls.length - 1; i++) {
      const fromControlRef = filteredControls[i];
      const toControlRef = filteredControls[i + 1];

      // Find path
      const result = analyzer.dijkstra(fromControlRef.controlId, toControlRef.controlId);

      if (result && result.path) {
        const path = result.path;

        // Update nodes
        for (const nodeId of path) {
          const nodeStat = nodeTraffic.get(nodeId);
          if (nodeStat) {
            nodeStat.count += runners;
            nodeStat.courseIds.add(course.name);
          }
        }

        // Update edges
        for (let j = 0; j < path.length - 1; j++) {
          const u = path[j];
          const v = path[j + 1];
          const lookupKey = `${u}:${v}`;
          const edge = edgeLookup.get(lookupKey);

          if (edge) {
            const stat = edgeTraffic.get(edgeKey(edge));
            if (stat) {
              if (edge.from === u && edge.to === v) {
                stat.forward += runners;
              } else {
                stat.backward += runners;
              }
              stat.total += runners;
              stat.collision = Math.min(stat.forward, stat.backward);
              stat.courseIds.add(course.name);
            }
          }
        }
      }

      processedLegs++;

      // Yield progress periodically to update UI
      if (processedLegs % 5 === 0 || processedLegs === totalLegs) {
        yield {
          progress: Math.round((processedLegs / totalLegs) * 100),
          edgeTraffic: new Map(edgeTraffic),
          nodeTraffic: new Map(nodeTraffic),
        };

        // Yield to main thread
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
}

