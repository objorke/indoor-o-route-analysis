import { describe, it, expect } from "vitest";
import { exportEventToIOFXML } from "./xml-io";
import { IOFXmlImporter } from "./iof-xml-importer";
import type { EventData } from "../models/event";
import { nextMapExchange } from "../models/course";

function makeEvent(): EventData {
  return {
    id: "e1",
    name: "Map exchange test",
    startTime: { date: "2026-11-07" },
    raceCourses: [
      {
        controls: [
          { id: "S1", type: "start", mapPosition: { x: 0, y: 0 } },
          { id: "31", type: "control", mapPosition: { x: 10, y: 10 } },
          { id: "32", type: "control", mapPosition: { x: 20, y: 20 } },
          { id: "F1", type: "finish", mapPosition: { x: 30, y: 30 } },
        ],
        courses: [
          {
            id: "c1",
            name: "A",
            mapId: "",
            controls: [
              { controlId: "S1", type: "start" },
              { controlId: "31", type: "control", mapExchange: "change" },
              { controlId: "32", type: "control", mapExchange: "flip", mapText: "2<" },
              { controlId: "F1", type: "finish" },
            ],
          },
        ],
        maps: [],
      },
    ],
  } as unknown as EventData;
}

describe("IOF XML map exchange extension", () => {
  it("exports map exchange as a CourseControl extension after MapText", () => {
    const xml = exportEventToIOFXML(makeEvent());
    expect(xml).toContain(`<x:MapExchange type="change" />`);
    expect(xml).toContain(`<x:MapExchange type="flip" />`);
    // Extensions must be the last child of CourseControl (IOF XSD sequence)
    expect(xml).toMatch(/<MapText>2&lt;<\/MapText>\s*<Extensions>\s*<x:MapExchange type="flip" \/>\s*<\/Extensions>\s*<\/CourseControl>/);
    // Controls without a map exchange get no Extensions element
    expect(xml.match(/<Extensions>/g)?.length).toBe(2);
  });

  it("round-trips map exchange through export and import", () => {
    const xml = exportEventToIOFXML(makeEvent());
    const parsed = new IOFXmlImporter().parse(xml);
    const ccs = parsed.raceCourses?.[0]?.courses?.[0]?.controls ?? [];
    expect(ccs.map((c) => c.mapExchange)).toEqual([undefined, "change", "flip", undefined]);
    expect(ccs[2].mapText).toBe("2<");
  });

  it("ignores unknown map exchange types on import", () => {
    const xml = exportEventToIOFXML(makeEvent()).replace(`type="flip"`, `type="teleport"`);
    const parsed = new IOFXmlImporter().parse(xml);
    const ccs = parsed.raceCourses?.[0]?.courses?.[0]?.controls ?? [];
    expect(ccs[2].mapExchange).toBeUndefined();
    expect("mapExchange" in ccs[0]).toBe(false);
  });
});

describe("nextMapExchange", () => {
  it("cycles none → change → flip → none", () => {
    expect(nextMapExchange(undefined)).toBe("change");
    expect(nextMapExchange("change")).toBe("flip");
    expect(nextMapExchange("flip")).toBeUndefined();
  });
});
