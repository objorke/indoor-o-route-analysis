import { describe, it, expect } from "vitest";
import type { RaceCourseData } from "./models/event";
import { getCoursesUsingControl, removeControl } from "./control-operations";

const rc = (): RaceCourseData => ({
  controls: [
    { id: "S1", type: "start", mapPosition: { x: 0, y: 0 } },
    { id: "31", type: "control", mapPosition: { x: 10, y: 0 } },
    { id: "32", type: "control", mapPosition: { x: 20, y: 0 } },
  ],
  courses: [
    { id: "a", name: "A", mapId: "", controls: [{ controlId: "S1" }, { controlId: "31" }, { controlId: "32" }] },
    { id: "b", name: "B", mapId: "", controls: [{ controlId: "S1" }, { controlId: "32" }] },
    { id: "c", name: "C", mapId: "", controls: [{ controlId: "31" }, { controlId: "31", mapText: "again" }] },
  ],
  edges: [
    { from: "S1", to: "31" },
    { from: "31", to: "32" },
    { from: "S1", to: "n1" },
  ],
  vertices: [{ id: "n1", x: 1, y: 1 }],
}) as unknown as RaceCourseData;

describe("removeControl", () => {
  it("removes the control, its course entries and its edges", () => {
    const result = removeControl(rc(), "31");
    expect(result.controls?.map((c) => c.id)).toEqual(["S1", "32"]);
    expect(result.courses?.map((c) => c.controls.map((cc) => cc.controlId))).toEqual([["S1", "32"], ["S1", "32"], []]);
    expect(result.edges).toEqual([{ from: "S1", to: "n1" }]);
    expect(result.vertices).toEqual([{ id: "n1", x: 1, y: 1 }]);
  });

  it("keeps unaffected courses by reference and does not mutate the input", () => {
    const input = rc();
    const result = removeControl(input, "31");
    expect(result.courses?.[1]).toBe(input.courses?.[1]);
    expect(input.controls).toHaveLength(3);
    expect(input.edges).toHaveLength(3);
  });

  it("is a no-op for an unknown id and tolerates missing lists", () => {
    const result = removeControl(rc(), "99");
    expect(result.controls).toHaveLength(3);
    expect(removeControl({}, "31")).toEqual({ controls: undefined, courses: undefined });
  });
});

describe("getCoursesUsingControl", () => {
  it("lists each course once", () => {
    expect(getCoursesUsingControl(rc().courses!, "31").map((c) => c.name)).toEqual(["A", "C"]);
  });
});
