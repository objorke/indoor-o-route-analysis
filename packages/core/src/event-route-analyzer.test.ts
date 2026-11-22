import { describe, it, expect } from "vitest";
import {
  createEventRouteAnalyzer,
  getEventMapScale,
  getEventScoringModel,
  DEFAULT_MAP_SCALE,
} from "./event-route-analyzer";
import { ScoringModelRegistry } from "./scoring-models/registry";
import type { EventData } from "./models/event";
import type { Polygon } from "./models/polygon";

/**
 * Two floors joined by a stair edge: S (floor 0) → n1 (floor 0) → n2 (floor 1) → C (floor 1).
 * Floor 0 is x < 50, floor 1 is x >= 50.
 */
function makeEvent(overrides: { scale?: number; withPolygons?: boolean; maps?: unknown[] } = {}): EventData {
  const polygons: Polygon[] = overrides.withPolygons === false ? [] : ([
    { id: "p0", level: 0, elevation: 0, points: [{ x: 0, y: -10 }, { x: 49, y: -10 }, { x: 49, y: 10 }, { x: 0, y: 10 }] },
    { id: "p1", level: 1, elevation: 3, points: [{ x: 50, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 10 }, { x: 50, y: 10 }] },
  ] as unknown as Polygon[]);
  return {
    id: "e",
    name: "test",
    startTime: { date: "2026-11-07" },
    raceCourses: [
      {
        controls: [
          { id: "S", type: "start", mapPosition: { x: 10, y: 0 } },
          { id: "C", type: "control", mapPosition: { x: 90, y: 0 } },
        ],
        vertices: [
          { id: "n1", x: 40, y: 0 },
          { id: "n2", x: 60, y: 0 },
        ],
        edges: [
          { from: "S", to: "n1", label: "", type: "edge" },
          { from: "n1", to: "n2", label: "", type: "stairs" },
          { from: "n2", to: "C", label: "", type: "edge" },
        ],
        courses: [],
        polygons,
        maps: overrides.maps ?? (overrides.scale === undefined ? [] : [{ id: "m", scale: overrides.scale, image: {} }]),
      },
    ],
  } as unknown as EventData;
}

describe("getEventMapScale", () => {
  it("uses the map scale when set", () => {
    expect(getEventMapScale(makeEvent({ scale: 500 }))).toBe(500);
  });

  it("falls back to the default when there is no map or no valid scale", () => {
    expect(getEventMapScale(makeEvent())).toBe(DEFAULT_MAP_SCALE);
    expect(getEventMapScale(makeEvent({ scale: 0 }))).toBe(DEFAULT_MAP_SCALE);
    expect(getEventMapScale(null)).toBe(DEFAULT_MAP_SCALE);
  });

  it("uses the course's own map when the course has one", () => {
    const event = makeEvent({ maps: [{ id: "a", scale: 1000, image: {} }, { id: "b", scale: 400, image: {} }] });
    event.raceCourses![0].courses = [{ id: "c1", name: "A", controls: [], mapId: "b" }];
    expect(getEventMapScale(event, "c1")).toBe(400);
    expect(getEventMapScale(event)).toBe(1000);
  });
});

describe("getEventScoringModel", () => {
  it("prefers an explicit registered model, then the event's model, then the default", () => {
    const def = ScoringModelRegistry.getDefaultModel();
    expect(getEventScoringModel(makeEvent())).toBe(def);
    expect(getEventScoringModel(makeEvent(), def.getFullId())).toBe(def);
    expect(getEventScoringModel(makeEvent(), "does-not-exist@9")).toBe(def);
  });
});

describe("createEventRouteAnalyzer", () => {
  it("includes floor polygons, so stairs count towards difficulty", () => {
    const withPolygons = createEventRouteAnalyzer(makeEvent({ scale: 1000 }));
    const withoutPolygons = createEventRouteAnalyzer(makeEvent({ scale: 1000, withPolygons: false }));
    const a = withPolygons.findAlternativePathsBetweenControls("S", "C", 1)[0];
    const b = withoutPolygons.findAlternativePathsBetweenControls("S", "C", 1)[0];
    expect(a.distance).toBeCloseTo(b.distance);
    expect(a.difficulty).toBeGreaterThan(b.difficulty);
  });

  it("uses the map scale for distances", () => {
    const at1000 = createEventRouteAnalyzer(makeEvent({ scale: 1000 })).findAlternativePathsBetweenControls("S", "C", 1)[0];
    const at500 = createEventRouteAnalyzer(makeEvent({ scale: 500 })).findAlternativePathsBetweenControls("S", "C", 1)[0];
    expect(at1000.distance).toBeCloseTo(at500.distance * 2);
  });

  it("accepts replacement edges", () => {
    const analyzer = createEventRouteAnalyzer(makeEvent({ scale: 1000 }), {
      edges: [{ from: "S", to: "C", label: "", type: "edge" } as never],
    });
    const route = analyzer.findAlternativePathsBetweenControls("S", "C", 1)[0];
    expect(route.path).not.toContain("n1");
    expect(route.path).not.toContain("n2");
  });
});
