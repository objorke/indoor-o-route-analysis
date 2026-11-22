import { describe, it, expect, vi } from "vitest";
import { processImportedJSON } from "./process-import";

const eventWithMap = (encodedData?: string) => ({
  id: "e1",
  name: "Test",
  startTime: { date: "2026-01-01" },
  raceCourses: [
    {
      controls: [],
      courses: [],
      maps: [{ id: "m1", scale: 1000, image: { url: "map.pdf", ...(encodedData ? { encodedData } : {}) }, mapPositionTopLeft: { x: 0, y: 0 }, layout: "horizontal" }],
    },
  ],
});

describe("processImportedJSON", () => {
  it("decodes an embedded map and doesn't call the lookup", async () => {
    const lookup = vi.fn();
    const { event, pdfData } = await processImportedJSON(eventWithMap("QUJD"), lookup);
    expect(new Uint8Array(pdfData!)).toEqual(new Uint8Array([65, 66, 67]));
    expect(event.raceCourses?.[0].maps?.[0].saveEncoded).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("uses the injected lookup for a map stored earlier and gives the copy a new map id", async () => {
    const stored = new Uint8Array([1, 2, 3]).buffer;
    const lookup = vi.fn(async (id: string) => (id === "m1" ? stored : undefined));
    const { event, pdfData } = await processImportedJSON(eventWithMap(), lookup);
    expect(lookup).toHaveBeenCalledWith("m1");
    expect(pdfData).toBe(stored);
    expect(event.raceCourses?.[0].maps?.[0].id).not.toBe("m1");
  });

  it("works without storage (Node): no lookup, no PDF", async () => {
    const { event, pdfData } = await processImportedJSON(eventWithMap());
    expect(pdfData).toBeUndefined();
    expect(event.raceCourses?.[0].maps?.[0].id).toBe("m1");
  });

  it("a failing lookup doesn't fail the import", async () => {
    const { pdfData } = await processImportedJSON(eventWithMap(), async () => {
      throw new Error("IndexedDB unavailable");
    });
    expect(pdfData).toBeUndefined();
  });
});
