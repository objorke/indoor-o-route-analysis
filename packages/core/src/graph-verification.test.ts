import { describe, it, expect } from "vitest";
import type { Control } from "./models/control";
import type { MapData } from "./models/map";
import type { Polygon } from "./models/polygon";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connectOverlapping, findUnlabeledLevelChanges, isInMapBounds, verifyGraph } from "./graph-verification";
import { computeClusteredGraph } from "./graph-clusters";
import { findPolygonForPoint } from "./polygon-utils";
import { parseEventFromJSON } from "./io/json-io";

const control = (id: string, x: number, y: number): Control => ({ id, type: "control", mapPosition: { x, y } }) as Control;
const map = (over: Partial<MapData> = {}): MapData => ({
  scale: 1000,
  image: { width: 100, height: 50 },
  mapPositionTopLeft: { x: 0, y: 0 },
  mapPositionBottomRight: { x: 100, y: 50 },
  layout: "horizontal",
  ...over,
});

describe("verifyGraph", () => {
  it("finds no problems in a clean graph", () => {
    expect(
      verifyGraph({
        nodes: [{ id: "n1", x: 10, y: 10 }],
        edges: [{ from: "n1", to: "31", label: "" }],
        controls: [control("31", 20, 20)],
        map: map(),
      }),
    ).toEqual([]);
  });

  it("reports overlaps once per pair", () => {
    const f = verifyGraph({ nodes: [{ id: "n1", x: 10, y: 10 }], edges: [], controls: [control("31", 10.05, 10)] });
    expect(f).toEqual([{ type: "overlap", message: "Overlaps with control 31", elementId: "n1", elementType: "node" }]);
  });

  it("reports self-loops and edges to missing nodes", () => {
    const f = verifyGraph({
      nodes: [{ id: "n1", x: 1, y: 1 }],
      edges: [
        { from: "n1", to: "n1", label: "" },
        { from: "n1", to: "ghost", label: "" },
      ],
      controls: [],
    });
    expect(f.map((x) => x.type)).toEqual(["self-loop", "invalid-edge"]);
    expect(f[1].message).toBe("End node ghost missing");
  });

  it("reports items outside the map, also for Y-up and manual per-page maps", () => {
    expect(verifyGraph({ nodes: [{ id: "n1", x: 150, y: 10 }], edges: [], controls: [], map: map() })[0].type).toBe("out-of-bounds");
    // Messages name the item, its type and position, and the map's range
    const [node] = verifyGraph({ nodes: [{ id: "n1", x: 150, y: 10 }], edges: [], controls: [], map: map() });
    expect(node.message).toMatch(/^Node n1 is outside the map area: x 150\.0, y 10\.0 \(map x 0\.0 to 100\.0, y 0\.0 to 50\.0\)$/);
    const controls = [
      { id: "S1", type: "start" as const, mapPosition: { x: -5, y: 10 } },
      { id: "31", type: "control" as const, mapPosition: { x: 10, y: 99 } },
      { id: "F1", type: "finish" as const, mapPosition: { x: 10, y: -1 } },
    ];
    const msgs = verifyGraph({ nodes: [], edges: [], controls: controls as never, map: map() }).map((x) => x.message);
    expect(msgs.map((m) => m.split(" is ")[0])).toEqual(["Start S1", "Control 31", "Finish F1"]);
    const yUp = map({ mapPositionTopLeft: { x: 0, y: 50 }, mapPositionBottomRight: { x: 100, y: 0 } });
    expect(isInMapBounds(yUp, 10, 40)).toBe(true);
    const manual = map({
      pageTransformMode: "manual",
      pageTransforms: [
        { topLeft: { x: 0, y: 0 }, bottomRight: { x: 10, y: 10 } },
        { topLeft: { x: 100, y: 0 }, bottomRight: { x: 110, y: 10 } },
      ],
    });
    expect(isInMapBounds(manual, 105, 5)).toBe(true);
    expect(isInMapBounds(manual, 50, 5)).toBe(false);
    expect(isInMapBounds(map({ mapPositionBottomRight: undefined }), 99, 49)).toBe(true); // falls back to image size
  });
});

describe("connectOverlapping", () => {
  const zero = (from: string, to: string) => ({ from, to, label: "", ignoreLength: true });
  it("adds one zero-length edge between overlapping controls and nodes that aren't connected", () => {
    const controls = [control("31", 0, 0), control("33", 50, 50)];
    const nodes = [{ id: "n1", x: 0.5, y: 0 }, { id: "n2", x: 80, y: 80 }];
    const r = connectOverlapping({ controls, nodes, edges: [] });
    expect(r.edges).toEqual([zero("31", "n1")]);
    expect([r.added, r.removed, r.updated]).toEqual([1, 0, 0]);
  });
  it("does not add an edge when the pair is already joined by a zero-length edge (either direction)", () => {
    const r = connectOverlapping({ controls: [control("31", 0, 0), control("32", 1, 1)], nodes: [], edges: [zero("32", "31")] });
    expect(r.edges).toEqual([zero("32", "31")]);
    expect([r.added, r.removed, r.updated]).toEqual([0, 0, 0]);
  });
  it("keeps exactly one edge: removes duplicates, preferring a zero-length one", () => {
    const edges = [
      { from: "31", to: "32", label: "" },
      zero("32", "31"),
      { from: "31", to: "32", label: "A" },
      { from: "32", to: "40", label: "" }, // not an overlapping pair: untouched
    ];
    const r = connectOverlapping({ controls: [control("31", 0, 0), control("32", 1, 1), control("40", 30, 30)], nodes: [], edges });
    expect(r.edges).toEqual([zero("32", "31"), { from: "32", to: "40", label: "" }]);
    expect([r.added, r.removed, r.updated]).toEqual([0, 2, 0]);
  });
  it("makes a kept edge zero-length, keeping its label", () => {
    const r = connectOverlapping({ controls: [control("31", 0, 0)], nodes: [{ id: "n1", x: 0, y: 0 }], edges: [{ from: "n1", to: "31", label: "1" }] });
    expect(r.edges).toEqual([{ from: "n1", to: "31", label: "1", ignoreLength: true }]);
    expect(r.updated).toBe(1);
  });
  it("is idempotent", () => {
    const controls = [control("31", 0, 0), control("32", 1, 1)];
    const nodes = [{ id: "n1", x: 0.5, y: 0.5 }];
    const first = connectOverlapping({ controls, nodes, edges: [{ from: "31", to: "32", label: "" }, { from: "32", to: "31", label: "" }] });
    const second = connectOverlapping({ controls, nodes, edges: first.edges });
    expect(second.edges).toEqual(first.edges);
    expect([second.added, second.removed, second.updated]).toEqual([0, 0, 0]);
    expect(first.edges).toHaveLength(3); // 31-32, 31-n1, 32-n1
  });
  it("leaves overlapping items on different floors alone", () => {
    const square = (level: number, x0: number) => ({
      id: `f${level}`,
      level,
      points: [{ x: x0, y: 0 }, { x: x0 + 10, y: 0 }, { x: x0 + 10, y: 10 }, { x: x0, y: 10 }],
    });
    // Floors touch at x = 10: a node just left and one just right are close, but on different floors
    const r = connectOverlapping({ controls: [], nodes: [{ id: "a", x: 9.5, y: 5 }, { id: "b", x: 10.5, y: 5 }], edges: [], polygons: [square(1, 0), square(2, 10)] });
    expect(r.edges).toEqual([]);
  });
  it("does nothing for fewer than two items", () => {
    expect(connectOverlapping({ controls: [control("31", 0, 0)], nodes: [], edges: [] }).edges).toEqual([]);
  });
});

describe("findUnlabeledLevelChanges", () => {
  const floor = (id: string, level: number, y0: number): Polygon => ({
    id,
    level,
    points: [{ x: 0, y: y0 }, { x: 100, y: y0 }, { x: 100, y: y0 + 40 }, { x: 0, y: y0 + 40 }],
  });
  const polygons = [floor("f1", 1, 0), floor("f2", 2, 50)];
  const nodes = [{ id: "a", x: 10, y: 10 }, { id: "b", x: 20, y: 10 }, { id: "c", x: 10, y: 60 }, { id: "out", x: 500, y: 500 }];
  const controls = [control("31", 30, 60)];

  it("reports an unlabeled edge between two floors, also when it ends at a control", () => {
    const edges = [
      { from: "a", to: "c", label: "" },
      { from: "b", to: "31", label: "", ignoreLength: true },
    ];
    const found = findUnlabeledLevelChanges({ nodes, edges, controls, polygons });
    expect(found.map((f) => [f.edge.from, f.edge.to, f.fromLevel, f.toLevel])).toEqual([
      ["a", "c", 1, 2],
      ["b", "31", 1, 2],
    ]);
  });

  it("accepts labeled stairs, same-floor corridors and ends outside every floor", () => {
    const edges = [
      { from: "a", to: "c", label: "A", reverseLabel: "a" },
      { from: "a", to: "b", label: "" },
      { from: "a", to: "out", label: "" },
    ];
    expect(findUnlabeledLevelChanges({ nodes, edges, controls, polygons })).toEqual([]);
  });

  it("reports nothing when the event has no floor polygons", () => {
    expect(findUnlabeledLevelChanges({ nodes, edges: [{ from: "a", to: "c", label: "" }], controls, polygons: [] })).toEqual([]);
  });

  it("is listed by verifyGraph as a finding on the edge", () => {
    const f = verifyGraph({ nodes, edges: [{ from: "a", to: "c", label: "" }], controls, polygons });
    expect(f).toEqual([
      {
        type: "unlabeled-level-change",
        message: "Unlabeled edge a - c connects floor 1 and floor 2. Label it as a stair, or delete it",
        elementId: "a|c",
        elementType: "edge",
      },
    ]);
  });

  it("finds none in the Oslomesterskapet example, so no cluster spans two floors (regression)", () => {
    const file = join(__dirname, "../../../test-data/events/2026-03-14-Oslomesterskapet.json");
    const raceCourse = parseEventFromJSON(readFileSync(file, "utf-8")).raceCourses![0];
    const args = { nodes: raceCourse.vertices ?? [], edges: raceCourse.edges ?? [], controls: raceCourse.controls, polygons: raceCourse.polygons ?? [] };
    expect(findUnlabeledLevelChanges(args)).toEqual([]);

    // Every cluster's nodes are on one floor.
    const { clusterOf } = computeClusteredGraph(args.edges);
    const position = new Map<string, { x: number; y: number }>();
    for (const n of args.nodes) position.set(n.id, n);
    for (const c of args.controls) position.set(c.id, c.mapPosition);
    const levelsByCluster = new Map<string, Set<number>>();
    for (const [id, cluster] of Object.entries(clusterOf)) {
      const p = position.get(id);
      const level = p ? findPolygonForPoint(p, args.polygons)?.level : undefined;
      if (level === undefined) continue;
      if (!levelsByCluster.has(cluster)) levelsByCluster.set(cluster, new Set());
      levelsByCluster.get(cluster)!.add(level);
    }
    expect([...levelsByCluster.values()].filter((levels) => levels.size > 1)).toEqual([]);
  });
});
