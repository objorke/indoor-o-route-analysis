import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { JSDOM } from "jsdom";
import { loadEventFile } from "./load-event-file";
import { eventFileFormat } from "../io/parse-event-file";
import { exportEventToIOFXML } from "../io/xml-io";

const EXAMPLE = path.resolve(__dirname, "../../../../test-data/events/2026-03-08-Fossum-inne-o.json");

describe("loadEventFile", () => {
  beforeAll(() => {
    // The CLIs install a DOMParser polyfill the same way
    (globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM("").window.DOMParser;
  });

  it("detects formats", () => {
    expect(eventFileFormat("a/b/Event.JSON")).toBe("json");
    expect(eventFileFormat("x.xml")).toBe("xml");
    expect(eventFileFormat("x.csv")).toBeNull();
  });

  it("loads a real JSON example", () => {
    const event = loadEventFile(EXAMPLE);
    expect(event.name).toMatch(/Fossum/);
    expect(event.raceCourses?.[0].controls?.length).toBeGreaterThan(0);
  });

  it("loads IOF XML exported from the same event (round trip)", () => {
    const json = loadEventFile(EXAMPLE);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-event-"));
    const xmlPath = path.join(dir, "event.xml");
    fs.writeFileSync(xmlPath, exportEventToIOFXML(json));
    const fromXml = loadEventFile(xmlPath);
    expect(fromXml.raceCourses?.[0].courses?.length).toBe(json.raceCourses?.[0].courses?.length);
    expect(fromXml.raceCourses?.[0].controls?.length).toBe(json.raceCourses?.[0].controls?.length);
  });

  it("reports missing files and unsupported formats", () => {
    expect(() => loadEventFile("/no/such/file.json")).toThrow(/File not found/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-event-"));
    const csv = path.join(dir, "x.csv");
    fs.writeFileSync(csv, "a,b");
    expect(() => loadEventFile(csv)).toThrow(/Unsupported file format: \.csv/);
  });

  it("rejects malformed JSON files with a readable error", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-event-"));
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify({ id: "x", name: "y", raceCourses: [{ controls: "oops" }] }));
    expect(() => loadEventFile(bad)).toThrow(/Invalid event file: raceCourses\[0\]\.controls must be an array/);
  });
});
