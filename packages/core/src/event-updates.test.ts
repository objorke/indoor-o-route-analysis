import { describe, it, expect } from "vitest";
import type { EventData } from "./models/event";
import type { MapData } from "./models/map";
import { mergeRaceCourse, setPrimaryMap, updatePrimaryMap, updateRaceCourse } from "./event-updates";

const map = (id: string, scale = 1000): MapData => ({
  id,
  scale,
  image: { url: `${id}.pdf`, width: 100, height: 50 },
  mapPositionTopLeft: { x: 0, y: 0 },
  layout: "horizontal",
});

const event = (over: Partial<EventData> = {}): EventData =>
  ({
    id: "e1",
    name: "Test",
    startTime: { date: "2026-01-01" },
    raceCourses: [
      {
        controls: [{ id: "31", type: "control", mapPosition: { x: 1, y: 2 } }],
        courses: [],
        maps: [map("m1")],
      },
      { controls: [], courses: [], maps: [] },
    ],
    ...over,
  }) as EventData;

describe("updateRaceCourse", () => {
  it("replaces only the first race course and keeps the others", () => {
    const e = event();
    const next = updateRaceCourse(e, (rc) => ({ ...rc, controls: [] }));
    expect(next.raceCourses?.[0].controls).toEqual([]);
    expect(next.raceCourses?.[1]).toBe(e.raceCourses?.[1]);
    expect(e.raceCourses?.[0].controls).toHaveLength(1); // not mutated
  });

  it("creates the race course when missing", () => {
    const next = updateRaceCourse(event({ raceCourses: undefined }), (rc) => ({ ...rc, controls: [] }));
    expect(next.raceCourses).toEqual([{ courses: [], controls: [], maps: [] }]);
  });

  it("returns the same event when the updater changes nothing", () => {
    const e = event();
    expect(updateRaceCourse(e, (rc) => rc)).toBe(e);
  });
});

describe("mergeRaceCourse", () => {
  it("merges against the latest state, so two partial updates both survive", () => {
    // Simulates two edits to different fields before a re-render
    const latest = mergeRaceCourse(mergeRaceCourse(event(), { controls: [] }), { maps: [map("m2")] });
    expect(latest.raceCourses?.[0].controls).toEqual([]);
    expect(latest.raceCourses?.[0].maps?.[0].id).toBe("m2");
  });
});

describe("updatePrimaryMap / setPrimaryMap", () => {
  it("updates the first map", () => {
    const next = updatePrimaryMap(event(), (m) => ({ ...m, scale: 500 }));
    expect(next.raceCourses?.[0].maps?.[0].scale).toBe(500);
  });

  it("is a no-op without a map", () => {
    const e = event({ raceCourses: [{ controls: [], courses: [], maps: [] }] });
    expect(updatePrimaryMap(e, (m) => ({ ...m, scale: 1 }))).toBe(e);
  });

  it("setPrimaryMap replaces or adds", () => {
    expect(setPrimaryMap(event(), map("m9")).raceCourses?.[0].maps?.map((m) => m.id)).toEqual(["m9"]);
    const added = setPrimaryMap(event({ raceCourses: undefined }), map("m9"));
    expect(added.raceCourses?.[0].maps?.map((m) => m.id)).toEqual(["m9"]);
  });
});
