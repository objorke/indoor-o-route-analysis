import { describe, it, expect } from "vitest";
import { DIRECTION_POINT_KINDS } from "./models/directions";
import {
  DIRECTION_SYMBOLS,
  chevronPolygon,
  oneWayArrowLinePitch,
  ONE_WAY_ARROW_LINE,
  ONE_WAY_LARGE_ARROW,
  DIRECTION_POINT_DRAWINGS,
  directionSymbolScale,
  oneWayArrowPlacements,
  polylineLength,
  translateDirectionFeature,
  rotateDirectionFeature,
  minDirectionPoints,
  moveDirectionVertex,
  insertDirectionVertex,
  removeDirectionVertex,
  nearestSegment,
} from "./direction-symbols";

describe("direction symbol definitions", () => {
  it("uses the specified widths", () => {
    expect(DIRECTION_SYMBOLS.uncrossable.lineWidth).toBe(0.7);
    expect(DIRECTION_SYMBOLS["oob-boundary"].lineWidth).toBe(1.0);
    expect(DIRECTION_SYMBOLS["oob-area-boundary"].lineWidth).toBe(0.4);
    expect(DIRECTION_SYMBOLS["oob-area"].lineWidth).toBe(0.2);
    expect(DIRECTION_SYMBOLS.uncrossable.color).not.toBe(DIRECTION_SYMBOLS["oob-boundary"].color); // 903 vs 54
  });
});

describe("one-way arrows", () => {
  const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  it("measures polylines", () => {
    expect(polylineLength(path)).toBe(20);
    expect(polylineLength([{ x: 1, y: 1 }])).toBe(0);
  });
  it("places a single arrow at the middle, pointing along the path", () => {
    const [a] = oneWayArrowPlacements(path, "single");
    expect(a.p).toEqual({ x: 10, y: 0 });
    expect(a.angle).toBeCloseTo(0);
  });
  it("places a line of evenly spaced arrows, following corners", () => {
    const arrows = oneWayArrowPlacements(path, "line", 5);
    expect(arrows).toHaveLength(4);
    expect(arrows[0].p.x).toBeCloseTo(2.5);
    expect(arrows[3].p.y).toBeCloseTo(7.5);
    expect(arrows[3].angle).toBeCloseTo(Math.PI / 2);
  });
  it("short paths still get one arrow; empty paths none", () => {
    expect(oneWayArrowPlacements([{ x: 0, y: 0 }, { x: 1, y: 0 }], "line", 5)).toHaveLength(1);
    expect(oneWayArrowPlacements([{ x: 0, y: 0 }], "line")).toEqual([]);
  });
});

describe("one-way chevrons (ISInOM 1771)", () => {
  const box = (ps: { x: number; y: number }[]) => ({
    w: Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)),
    h: Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)),
  });
  it("1771.2 line of arrows: 1.84 mm high, 0.55 mm thick along the line, arms at 55°, 0.6 mm gaps", () => {
    const [tip, outer, back, inner] = chevronPolygon({ x: 0, y: 0 }, 0, ONE_WAY_ARROW_LINE);
    expect(box(chevronPolygon({ x: 0, y: 0 }, 0, ONE_WAY_ARROW_LINE)).h).toBeCloseTo(1.84);
    expect(outer.x - back.x).toBeCloseTo(0.55); // arm thickness along the line
    expect(tip.x - inner.x).toBeCloseTo(0.55);
    expect((Math.atan2(Math.abs(outer.y - tip.y), tip.x - outer.x) * 180) / Math.PI).toBeCloseTo(55);
    expect(oneWayArrowLinePitch()).toBeCloseTo(1.15);
  });
  it("1771.1 one large arrow: 3.7 mm high, 1.1 mm thick", () => {
    const [, outer, back] = chevronPolygon({ x: 0, y: 0 }, 0, ONE_WAY_LARGE_ARROW);
    expect(box(chevronPolygon({ x: 0, y: 0 }, 0, ONE_WAY_LARGE_ARROW)).h).toBeCloseTo(3.7);
    expect(outer.x - back.x).toBeCloseTo(1.1);
  });
  it("points in the direction of travel, centred on the placement, and scales", () => {
    const ps = chevronPolygon({ x: 5, y: 5 }, Math.PI / 2, ONE_WAY_ARROW_LINE, 2);
    expect(ps[0].x).toBeCloseTo(5); // tip on the line, ahead (down)
    expect(ps[0].y).toBeGreaterThan(5);
    const ys = ps.map((p) => p.y);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(5);
    expect(box(ps).w).toBeCloseTo(1.84 * 2);
  });
  it("a line of arrows is spaced at the pitch", () => {
    const pitch = oneWayArrowLinePitch();
    const chevrons = oneWayArrowPlacements([{ x: 0, y: 0 }, { x: 10 * pitch, y: 0 }], "line");
    expect(chevrons).toHaveLength(10);
    expect(chevrons[1].p.x - chevrons[0].p.x).toBeCloseTo(pitch);
  });
});

describe("crossing and switch symbols", () => {
  const extent = (kind: keyof typeof DIRECTION_POINT_DRAWINGS, paints = ["round", "sharp"]) => {
    const nums = DIRECTION_POINT_DRAWINGS[kind]
      .filter((p) => paints.includes(p.paint))
      .flatMap((p) => p.d.match(/-?\d*\.?\d+/g)!.map(Number));
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  it("compulsory crossing (1772): 2.03 mm square on the line centres, centred on the position", () => {
    const e = extent("compulsory-crossing");
    expect(e.maxX - e.minX).toBeCloseTo(2.03, 1);
    expect(e.maxY - e.minY).toBeCloseTo(2.03, 1);
    expect((e.maxX + e.minX) / 2).toBeCloseTo(0, 2);
  });
  it("compulsory diagonal one-way switch (1774): 2.8 mm wide, about 1.72 mm high", () => {
    const e = extent("compulsory-one-way-switch");
    expect(e.maxX - e.minX).toBeCloseTo(2.8, 2);
    expect(e.maxY - e.minY).toBeCloseTo(1.72, 1);
  });
  it("every point kind has a drawing", () => {
    for (const kind of DIRECTION_POINT_KINDS) expect(DIRECTION_POINT_DRAWINGS[kind].length).toBeGreaterThan(0);
  });
  it("compulsory diagonal switch (1773): 2.8 mm wide, about 2.2 mm high, with filled loop parts", () => {
    const e = extent("compulsory-switch");
    expect(e.maxX - e.minX).toBeCloseTo(2.8, 2);
    expect(e.maxY - e.minY).toBeGreaterThan(2.1);
    expect(e.maxY - e.minY).toBeLessThan(2.3);
    expect((e.maxY + e.minY) / 2).toBeCloseTo(0, 2);
    expect(DIRECTION_POINT_DRAWINGS["compulsory-switch"].some((p) => p.paint === "fill")).toBe(true);
  });
});

describe("directions editing helpers", () => {
  it("translates lines and point symbols", () => {
    expect(translateDirectionFeature({ id: "l", kind: "uncrossable", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, 2, 3).points).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 4 },
    ]);
    expect(translateDirectionFeature({ id: "c", kind: "compulsory-crossing", position: { x: 1, y: 1 }, rotation: 0 }, -1, 1).position).toEqual({ x: 0, y: 2 });
  });
  it("rotates point symbols and wraps to [0, 360)", () => {
    const c = { id: "c", kind: "compulsory-switch" as const, position: { x: 0, y: 0 }, rotation: 350 };
    expect(rotateDirectionFeature(c, 15).rotation).toBe(5);
    expect(rotateDirectionFeature(c, -360).rotation).toBe(350);
    const line = { id: "l", kind: "uncrossable" as const, points: [] };
    expect(rotateDirectionFeature(line, 15)).toBe(line);
  });
  it("knows the minimum number of points", () => {
    expect(minDirectionPoints("oob-area")).toBe(3);
    expect(minDirectionPoints("one-way")).toBe(2);
    expect(minDirectionPoints("compulsory-crossing")).toBe(1);
  });
});

describe("directions vertex editing", () => {
  const line = { id: "l", kind: "uncrossable" as const, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  const area = { id: "a", kind: "oob-area" as const, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };

  it("moves, inserts and removes vertices", () => {
    expect(moveDirectionVertex(line, 1, { x: 5, y: 5 }).points[1]).toEqual({ x: 5, y: 5 });
    expect(insertDirectionVertex(line, 0, { x: 5, y: 0 }).points.map((p) => p.x)).toEqual([0, 5, 10, 10]);
    expect(removeDirectionVertex(line, 1).points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  });

  it("keeps the minimum number of points, and ignores point symbols", () => {
    expect(removeDirectionVertex(area, 0)).toBe(area); // an area needs 3 corners
    const twoPoint = removeDirectionVertex(line, 0);
    expect(removeDirectionVertex(twoPoint, 0)).toBe(twoPoint);
    const crossing = { id: "c", kind: "compulsory-crossing" as const, position: { x: 0, y: 0 }, rotation: 0 };
    expect(moveDirectionVertex(crossing, 0, { x: 1, y: 1 })).toBe(crossing);
    expect(moveDirectionVertex(line, 7, { x: 1, y: 1 })).toBe(line);
  });

  it("finds the nearest segment, including the closing one", () => {
    expect(nearestSegment(line.points, { x: 4, y: 1 })).toEqual({ index: 0, point: { x: 4, y: 0 }, distance: 1 });
    expect(nearestSegment(line.points, { x: 8, y: 6 })?.index).toBe(1);
    const closing = nearestSegment(area.points, { x: 3, y: 4 }, true)!;
    expect(closing.index).toBe(2); // segment (10,10) → (0,0)
    expect(nearestSegment([{ x: 0, y: 0 }], { x: 1, y: 1 })).toBeNull();
  });
});

describe("ISInOM 3.1 symbol scale", () => {
  it("is 1 at the 1:700 base scale and at smaller scales (never reduced)", () => {
    expect(directionSymbolScale(700)).toBe(1);
    expect(directionSymbolScale(1000)).toBe(1);
    expect(directionSymbolScale(1500)).toBe(1);
  });
  it("enlarges proportionally at larger scales", () => {
    expect(directionSymbolScale(350)).toBe(2);
    expect(directionSymbolScale(500)).toBeCloseTo(1.4);
  });
  it("falls back to 1 for a missing or invalid scale", () => {
    expect(directionSymbolScale(undefined)).toBe(1);
    expect(directionSymbolScale(0)).toBe(1);
    expect(directionSymbolScale(-5)).toBe(1);
  });
});
