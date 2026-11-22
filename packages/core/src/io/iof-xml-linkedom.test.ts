import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { parseEventFromJSON } from "./json-io";
import { exportEventToIOFXML, parseEventFromIOFXML } from "./xml-io";

// The CLIs parse IOF XML with linkedom's DOMParser, which differs from browsers/jsdom:
// getElementsByTagName("*") is empty for XML documents and localName keeps the prefix.
const require = createRequire(path.resolve(__dirname, "../../../../apps/analyse-cli/package.json"));
let linkedomDOMParser: unknown;
try {
  linkedomDOMParser = require("linkedom").DOMParser;
} catch {
  linkedomDOMParser = undefined;
}

const EXAMPLE = path.resolve(__dirname, "../../../../test-data/events/2026-03-08-Fossum-inne-o.json");

describe.skipIf(!linkedomDOMParser)("IOF XML import with linkedom (CLI DOMParser)", () => {
  let previous: unknown;
  beforeAll(() => {
    previous = (globalThis as { DOMParser?: unknown }).DOMParser;
    (globalThis as { DOMParser?: unknown }).DOMParser = linkedomDOMParser;
  });
  afterAll(() => {
    (globalThis as { DOMParser?: unknown }).DOMParser = previous;
  });

  it("round-trips courses, controls, graph and map exchange", () => {
    const event = parseEventFromJSON(fs.readFileSync(EXAMPLE, "utf8"));
    const rc = event.raceCourses![0];
    rc.courses![0].controls[1] = { ...rc.courses![0].controls[1], mapExchange: "flip" };
    const back = parseEventFromIOFXML(exportEventToIOFXML(event));
    const brc = back.raceCourses![0];
    expect(back.name).toBe(event.name);
    expect(brc.courses?.length).toBe(rc.courses?.length);
    expect(brc.controls?.length).toBe(rc.controls?.length);
    expect(brc.vertices?.length).toBe(rc.vertices?.length);
    expect(brc.edges?.length).toBe(rc.edges?.length);
    expect(brc.courses?.[0].controls[1].mapExchange).toBe("flip");
  });
});
