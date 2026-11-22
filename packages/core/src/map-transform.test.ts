import { describe, it, expect } from "vitest";
import type { MapData } from "./models/map";
import { getEventTransform } from "./models/event";
import {
  estimateBase64ByteLength,
  documentMmToMeters,
  mapScaleFromMeasurement,
  getPageCanvasOffset,
  registrationFromMarks,
  formatByteSize,
  formatMapFileInfo,
  getMapTransform,
  mmTransform,
  setMapTransform,
  transformScale,
} from "./map-transform";

const baseMap = (over: Partial<MapData> = {}): MapData => ({
  scale: 1000,
  image: { url: "map.pdf", width: 297, height: 210 },
  mapPositionTopLeft: { x: 0, y: 0 },
  layout: "horizontal",
  ...over,
});

describe("formatMapFileInfo", () => {
  it("formats size, pages and per-page mm dimensions", () => {
    expect(formatMapFileInfo(baseMap({ pageCount: 3 }), 2.4 * 1024 * 1024)).toBe("2.4 MB · 3 pages · 297 × 210 mm");
  });
  it("uses singular page and kB below 1 MB", () => {
    expect(formatMapFileInfo(baseMap(), 300 * 1024)).toBe("300 kB · 1 page · 297 × 210 mm");
  });
  it("falls back to the embedded base64 size", () => {
    const encoded = "A".repeat(4000); // 3000 bytes
    expect(formatMapFileInfo(baseMap({ image: { width: 100.4, height: 50.6, encodedData: encoded } }))).toBe(
      "3 kB · 1 page · 100 × 51 mm",
    );
  });
  it("omits unknown size and dimensions", () => {
    expect(formatMapFileInfo(baseMap({ image: { url: "x" } }))).toBe("1 page");
    expect(formatMapFileInfo(undefined)).toBe("");
  });
});

describe("byte helpers", () => {
  it("formatByteSize", () => {
    expect(formatByteSize(0)).toBe("0 kB");
    expect(formatByteSize(10)).toBe("1 kB");
    expect(formatByteSize(1024 * 1024)).toBe("1.0 MB");
  });
  it("estimateBase64ByteLength handles padding and data: URLs", () => {
    expect(estimateBase64ByteLength("QUJD")).toBe(3);
    expect(estimateBase64ByteLength("QUI=")).toBe(2);
    expect(estimateBase64ByteLength("data:application/pdf;base64,QQ==")).toBe(1);
  });
});

describe("getMapTransform / setMapTransform", () => {
  it("reads and writes the global transform", () => {
    const map = baseMap();
    expect(getMapTransform(map)).toEqual({ tl: { x: 0, y: 0 }, br: { x: 297, y: 210 } });
    const updated = setMapTransform(map, { tl: { x: 1, y: 2 }, br: { x: 3, y: 4 } });
    expect(updated.mapPositionTopLeft).toEqual({ x: 1, y: 2 });
    expect(updated.mapPositionBottomRight).toEqual({ x: 3, y: 4 });
    expect(map.mapPositionBottomRight).toBeUndefined(); // not mutated
  });

  it("writes one page in manual mode and fills missing pages with plain mm", () => {
    const map = baseMap({ pageCount: 3, pageTransformMode: "manual" });
    const updated = setMapTransform(map, { tl: { x: 10, y: 20 }, br: { x: 30, y: 40 } }, 1);
    expect(updated.pageTransforms).toEqual([
      { topLeft: { x: 0, y: 0 }, bottomRight: { x: 297, y: 210 } },
      { topLeft: { x: 10, y: 20 }, bottomRight: { x: 30, y: 40 } },
      { topLeft: { x: 0, y: 0 }, bottomRight: { x: 297, y: 210 } },
    ]);
    expect(getMapTransform(updated, 1)).toEqual({ tl: { x: 10, y: 20 }, br: { x: 30, y: 40 } });
    expect(updated.mapPositionTopLeft).toEqual({ x: 0, y: 0 }); // global untouched
  });

  it("keeps other pages' existing transforms", () => {
    const map = baseMap({
      pageCount: 2,
      pageTransformMode: "manual",
      pageTransforms: [{ topLeft: { x: 5, y: 5 }, bottomRight: { x: 6, y: 6 } }],
    });
    const updated = setMapTransform(map, { tl: { x: 1, y: 1 }, br: { x: 2, y: 2 } }, 1);
    expect(updated.pageTransforms?.[0]).toEqual({ topLeft: { x: 5, y: 5 }, bottomRight: { x: 6, y: 6 } });
  });
});

describe("mmTransform", () => {
  const dims = { width: 297, height: 210 };
  it("top-left origin equals document mm", () => {
    const corners = mmTransform(dims, "top-left");
    const map = setMapTransform(baseMap(), corners);
    const t = getEventTransform(map);
    expect(t.toEvent({ x: 12, y: 34 })).toEqual({ x: 12, y: 34 });
  });
  it("bottom-left origin is Y up and round-trips", () => {
    const corners = mmTransform(dims, "bottom-left");
    expect(corners).toEqual({ tl: { x: 0, y: 210 }, br: { x: 297, y: 0 } });
    const t = getEventTransform(setMapTransform(baseMap(), corners));
    const e = t.toEvent({ x: 12, y: 10 });
    expect(e.x).toBeCloseTo(12);
    expect(e.y).toBeCloseTo(200);
    const back = t.toMap(e);
    expect(back.x).toBeCloseTo(12);
    expect(back.y).toBeCloseTo(10);
  });
});

describe("transformScale", () => {
  it("reports signed per-axis scale and uniformity", () => {
    const dims = { width: 200, height: 100 };
    expect(transformScale({ tl: { x: 0, y: 100 }, br: { x: 200, y: 0 } }, dims)).toEqual({ sx: 1, sy: -1, uniform: true });
    expect(transformScale({ tl: { x: 0, y: 0 }, br: { x: 400, y: 100 } }, dims).uniform).toBe(false);
    expect(transformScale({ tl: { x: 0, y: 0 }, br: { x: 200.1, y: 100 } }, dims).uniform).toBe(true); // within 0.1 %
  });
});

describe("getPageCanvasOffset / registrationFromMarks", () => {
  const manual = (layout: MapData["layout"]): MapData =>
    baseMap({ layout, pageCount: 3, pageTransformMode: "manual", image: { width: 200, height: 100 } });

  it("offsets pages only in manual horizontal/vertical layouts", () => {
    expect(getPageCanvasOffset(manual("horizontal"), 2)).toEqual({ x: 400, y: 0 });
    expect(getPageCanvasOffset(manual("vertical"), 1)).toEqual({ x: 0, y: 100 });
    expect(getPageCanvasOffset(manual("pages"), 2)).toEqual({ x: 0, y: 0 });
    expect(getPageCanvasOffset(baseMap(), 2)).toEqual({ x: 0, y: 0 });
  });

  it("marks placed exactly on the controls reproduce the current transform", () => {
    const map = setMapTransform(baseMap(), { tl: { x: 100, y: 300 }, br: { x: 397, y: 90 } }); // Y up
    const t = getEventTransform(map);
    const e1 = { x: 150, y: 250 };
    const e2 = { x: 350, y: 120 };
    for (const uniform of [false, true]) {
      const r = registrationFromMarks(map, undefined, [
        { event: e1, canvasMark: t.toMap(e1) },
        { event: e2, canvasMark: t.toMap(e2) },
      ], uniform)!;
      if (!uniform) {
        expect(r.topLeft.x).toBeCloseTo(100);
        expect(r.bottomRight.y).toBeCloseTo(90);
      }
      expect(r.bottomRight.y).toBeLessThan(r.topLeft.y); // orientation kept
    }
  });

  it("subtracts the page offset in manual per-page mode", () => {
    const map = setMapTransform(manual("horizontal"), { tl: { x: 0, y: 0 }, br: { x: 200, y: 100 } }, 1);
    const e1 = { x: 20, y: 10 };
    const e2 = { x: 180, y: 90 };
    // Page 2 starts at canvas x = 200 mm; document mm = event coords here
    const r = registrationFromMarks(map, 1, [
      { event: e1, canvasMark: { x: 220, y: 10 } },
      { event: e2, canvasMark: { x: 380, y: 90 } },
    ], false)!;
    expect(r.topLeft.x).toBeCloseTo(0);
    expect(r.bottomRight.x).toBeCloseTo(200);
    expect(r.maxError).toBe(0);
  });
});

describe("scale measurement helpers", () => {
  it("converts document mm to metres", () => {
    expect(documentMmToMeters(10, 1000)).toBe(10);
    expect(documentMmToMeters(25, 400)).toBe(10);
  });
  it("derives 1:N from a known distance and rejects non-positive input", () => {
    expect(mapScaleFromMeasurement(25, 10)).toBe(400);
    expect(mapScaleFromMeasurement(33.3, 10)).toBe(300);
    expect(mapScaleFromMeasurement(0, 10)).toBeNull();
    expect(mapScaleFromMeasurement(10, 0)).toBeNull();
  });
});
