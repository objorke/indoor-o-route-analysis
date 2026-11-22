import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { exportEventToIOFXML, parseEventFromIOFXML } from "./xml-io";
import { parseEventFromJSON } from "./json-io";
import { analyzeCourseLegs } from "../course-analysis";
import { createEventRouteAnalyzer } from "../event-route-analyzer";
import type { EventData } from "../models/event";

const EXAMPLE = path.resolve(__dirname, "../../../../test-data/events/2026-03-08-Fossum-inne-o.json");

describe("IOF XML x:Polygons extension", () => {
  it("round-trips polygons with level, elevation, origin and holes", () => {
    const event: EventData = {
      id: "e",
      name: "Polygons",
      startTime: { date: "2026-11-07" },
      country: "",
      raceCourses: [
        {
          controls: [],
          courses: [],
          maps: [],
          polygons: [
            {
              id: "floor-1",
              level: 1,
              elevation: 3.5,
              origin: { x: 10, y: -2.5 },
              points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
              holes: [[{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]],
            },
            { id: "a&b", level: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
          ],
        },
      ],
    };
    const back = parseEventFromIOFXML(exportEventToIOFXML(event));
    expect(back.raceCourses?.[0].polygons).toEqual(event.raceCourses?.[0].polygons);
  });

  it("omits the extension when there are no polygons, and ignores malformed ones", () => {
    const event = parseEventFromJSON(fs.readFileSync(EXAMPLE, "utf8"));
    const noPoly: EventData = { ...event, raceCourses: [{ ...event.raceCourses![0], polygons: [] }] };
    expect(exportEventToIOFXML(noPoly)).not.toContain("x:Polygons");

    const xml = exportEventToIOFXML(event).replace(
      "<x:Polygons>",
      '<x:Polygons>\n      <x:Polygon id="bad" level="x"><x:Points>1,2 3,4</x:Points></x:Polygon>',
    );
    const back = parseEventFromIOFXML(xml);
    expect(back.raceCourses?.[0].polygons?.map((p) => p.id)).toEqual(event.raceCourses?.[0].polygons?.map((p) => p.id));
  });

  it("an XML round trip keeps the course analysis identical (stairs need the polygons)", () => {
    const event = parseEventFromJSON(fs.readFileSync(EXAMPLE, "utf8"));
    const partial = parseEventFromIOFXML(exportEventToIOFXML(event));
    const back = { ...event, raceCourses: partial.raceCourses } as EventData;
    const course = event.raceCourses![0].courses!.find((c) => c.name === "Lett") ?? event.raceCourses![0].courses![0];
    const summary = (e: EventData) =>
      analyzeCourseLegs(course, e, createEventRouteAnalyzer(e)).legs.map((l) => JSON.stringify(l));
    expect(summary(back)).toEqual(summary(event));
  }, 60_000);
});
