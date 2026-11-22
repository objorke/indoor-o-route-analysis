import { describe, it, expect } from "vitest";
import { exportEventToIOFXML, parseEventFromIOFXML } from "./xml-io";
import type { EventData } from "../models/event";
import type { DirectionFeature } from "../models/directions";

const directions: DirectionFeature[] = [
  { id: "u1", kind: "uncrossable", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: true },
  { id: "b1", kind: "oob-boundary", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
  { id: "l1", kind: "oob-area-boundary", points: [{ x: 3, y: 3 }, { x: 4, y: 4 }] },
  { id: "a1", kind: "oob-area", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], outline: false },
  { id: "a2", kind: "oob-area", points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }] },
  { id: "w1", kind: "one-way", points: [{ x: 0, y: 1 }, { x: 9, y: 1.5 }], style: "single" },
  { id: "c1", kind: "compulsory-crossing", position: { x: 7, y: 8 }, rotation: 45 },
  { id: "c2", kind: "compulsory-one-way-switch", position: { x: 9, y: 10 }, rotation: 90 },
  { id: "s&1", kind: "compulsory-switch", position: { x: -1.5, y: 2 }, rotation: 330 },
];

const event: EventData = {
  id: "e",
  name: "Directions",
  startTime: { date: "2026-11-07" },
  country: "",
  raceCourses: [{ controls: [], courses: [], maps: [], directions }],
};

describe("IOF XML edge length", () => {
  it("round-trips a hand-set edge length and omits it when not set", () => {
    const withEdges: EventData = {
      ...event,
      raceCourses: [
        {
          ...event.raceCourses![0],
          vertices: [{ id: "n1", x: 0, y: 0 }, { id: "n2", x: 5, y: 0 }],
          edges: [
            { from: "n1", to: "n2", label: "", length: 12.5 },
            { from: "n2", to: "n1", label: "B" },
          ],
        },
      ],
    };
    const xml = exportEventToIOFXML(withEdges);
    expect(xml).toContain('length="12.5"');
    const edges = parseEventFromIOFXML(xml).raceCourses?.[0].edges;
    expect(edges?.[0].length).toBe(12.5);
    expect(edges?.[1]).not.toHaveProperty("length");
  });
});

describe("IOF XML x:Directions extension", () => {
  it("round-trips every direction symbol kind", () => {
    const back = parseEventFromIOFXML(exportEventToIOFXML(event));
    expect(back.raceCourses?.[0].directions).toEqual(directions);
  });

  it("omits the extension without directions and skips malformed symbols", () => {
    const none = { ...event, raceCourses: [{ ...event.raceCourses![0], directions: [] }] };
    expect(exportEventToIOFXML(none)).not.toContain("x:Directions");
    const xml = exportEventToIOFXML(event).replace(
      "<x:Directions>",
      '<x:Directions>\n      <x:Symbol id="bad" kind="graffiti"><x:Points>0,0 1,1</x:Points></x:Symbol>\n      <x:Symbol id="short" kind="uncrossable"><x:Points>0,0</x:Points></x:Symbol>',
    );
    const ids = parseEventFromIOFXML(xml).raceCourses?.[0].directions?.map((f) => f.id);
    expect(ids).toEqual(directions.map((f) => f.id));
  });
});
