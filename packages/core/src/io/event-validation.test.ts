import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertValidEventStructure, findEventStructureErrors } from "./event-validation";
import { parseEventFromJSON } from "./json-io";

const EXAMPLES_DIR = path.resolve(__dirname, "../../../../test-data/events");
const exampleFiles = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((f) => f.endsWith(".json") && f !== "index.json");

const minimal = () => ({
  id: "e1",
  name: "Test",
  startTime: { date: "2026-01-01" },
  raceCourses: [
    {
      controls: [{ id: "31", type: "control", mapPosition: { x: 1, y: 2 } }],
      courses: [{ id: "c1", name: "A", mapId: "", controls: [{ controlId: "31" }] }],
      vertices: [{ id: "n1", x: 0, y: 0 }],
      edges: [{ from: "31", to: "n1", label: "" }],
      polygons: [{ id: "p1", level: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
      maps: [{ id: "m1", scale: 1000, image: { url: "map.pdf" } }],
    },
  ],
});

describe("findEventStructureErrors", () => {
  it.each(exampleFiles)("accepts the real example file %s", (file) => {
    const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8");
    expect(() => parseEventFromJSON(text)).not.toThrow();
  });

  it("accepts a minimal valid event and one without race courses", () => {
    expect(findEventStructureErrors(minimal())).toEqual([]);
    expect(findEventStructureErrors({ id: "e", name: "x" })).toEqual([]);
  });

  it("rejects non-objects", () => {
    expect(findEventStructureErrors(null)).toHaveLength(1);
    expect(findEventStructureErrors([1, 2])).toHaveLength(1);
    expect(findEventStructureErrors("event")).toHaveLength(1);
  });

  it.each([
    ["controls not an array", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0] as Record<string, unknown>).controls = "x"), /controls must be an array/],
    ["control without position", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0].controls[0] as Record<string, unknown>).mapPosition = { x: "1" }), /mapPosition must have numeric x and y/],
    ["NaN vertex", (e: ReturnType<typeof minimal>) => (e.raceCourses[0].vertices[0].x = Number.NaN), /vertices\[0\]/],
    ["negative edge length", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0].edges[0] as Record<string, unknown>).length = -2), /edges\[0\]\.length must be a non-negative number/],
    ["edge without to", (e: ReturnType<typeof minimal>) => delete (e.raceCourses[0].edges[0] as Record<string, unknown>).to, /edges\[0\] must have string from and to/],
    ["course control without id", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0].courses[0].controls[0] as Record<string, unknown>).controlId = 31), /controlId must be a string/],
    ["polygon without points", (e: ReturnType<typeof minimal>) => delete (e.raceCourses[0].polygons[0] as Record<string, unknown>).points, /points is missing/],
    ["encodedData not a string", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0].maps[0].image as Record<string, unknown>).encodedData = 42), /encodedData must be a string/],
    ["unknown directions kind", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0] as Record<string, unknown>).directions = [{ id: "o", kind: "graffiti", points: [] }]), /directions\[0\]\.kind is not a known/],
    ["directions point without rotation", (e: ReturnType<typeof minimal>) => ((e.raceCourses[0] as Record<string, unknown>).directions = [{ id: "o", kind: "compulsory-crossing", position: { x: 1, y: 1 } }]), /rotation must be a number/],
    ["eventImageUrl not a string", (e: ReturnType<typeof minimal>) => ((e as Record<string, unknown>).eventImageUrl = { evil: true }), /eventImageUrl must be a string/],
  ])("reports %s", (_name, mutate, pattern) => {
    const e = minimal();
    mutate(e);
    const errors = findEventStructureErrors(e);
    expect(errors.join("\n")).toMatch(pattern);
  });

  it("caps the number of errors", () => {
    const e = minimal();
    e.raceCourses[0].vertices = Array.from({ length: 100 }, () => ({ id: "v", x: Number.NaN, y: 0 }));
    expect(findEventStructureErrors(e)).toHaveLength(20);
  });
});

describe("assertValidEventStructure / parseEventFromJSON", () => {
  it("throws a readable summary", () => {
    const e = minimal();
    (e.raceCourses[0] as Record<string, unknown>).edges = {};
    expect(() => assertValidEventStructure(e)).toThrow(/^Invalid event file: raceCourses\[0\]\.edges must be an array$/);
    expect(() => parseEventFromJSON(JSON.stringify(e))).toThrow(/Invalid event file/);
  });
});
