import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DirectionFeature } from "@indoor-o-route-analysis/core";
import { renderDirections } from "./directions-renderer";

function dom(features: DirectionFeature[], selectedId?: string, mapScale = 700) {
  const markup = renderToStaticMarkup(
    <svg>{renderDirections({ features, toPx: (p) => ({ x: p.x * 10, y: p.y * 10 }), pixelsPerMM: 4, mapScale, selectedId })}</svg>,
  );
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

const line = (kind: "uncrossable" | "oob-boundary" | "oob-area-boundary"): DirectionFeature => ({
  id: kind,
  kind,
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
});

describe("renderDirections", () => {
  it("renders nothing without features", () => {
    expect(dom([]).querySelector('[data-testid="directions"]')).toBeNull();
  });

  it("draws lines with the symbol width in pixels (mm × px/mm)", () => {
    const d = dom([line("uncrossable"), line("oob-boundary"), line("oob-area-boundary")]);
    const width = (id: string) =>
      d.querySelector(`[data-direction-id="${id}"] polyline:not([stroke="transparent"])`)!.getAttribute("stroke-width");
    expect(width("uncrossable")).toBe(String(0.7 * 4));
    // ISInOM 1775: colour 903, butt ends and bevelled corners
    const unc = d.querySelector('[data-direction-id="uncrossable"] [stroke="#9C1881"]');
    expect(unc?.getAttribute("stroke-linecap")).toBe("butt");
    expect(unc?.getAttribute("stroke-linejoin")).toBe("bevel");
    expect(width("oob-boundary")).toBe("4");
    expect(width("oob-area-boundary")).toBe(String(0.4 * 4));
  });

  it("fills out-of-bounds areas with the hatch pattern and an outline", () => {
    const d = dom([{ id: "a", kind: "oob-area", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }]);
    const polys = d.querySelectorAll('[data-direction-id="a"] polygon');
    expect(polys[0].getAttribute("fill")).toMatch(/^url\(#op-oob-hatch\)$/);
    expect(polys[1].getAttribute("stroke-width")).toBe(String(0.4 * 4));
    expect(d.querySelector("pattern#op-oob-hatch")?.getAttribute("patternTransform")).toBe("rotate(45)");
  });

  it("draws one-way arrows and point symbols", () => {
    const d = dom([
      { id: "w", kind: "one-way", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], style: "line" },
      { id: "c", kind: "compulsory-crossing", position: { x: 5, y: 5 }, rotation: 0 },
      { id: "s", kind: "compulsory-switch", position: { x: 8, y: 8 }, rotation: 45 },
    ]);
    // Line of arrows (1771.2): filled orange chevrons, 6 corners each
    const chevrons = [...d.querySelectorAll('[data-direction-id="w"] polygon[fill="#E97C1D"]')];
    expect(chevrons.length).toBeGreaterThan(10);
    expect(chevrons[0].getAttribute("points")?.split(" ")).toHaveLength(6);
    // Point symbols (ISInOM 1772 / 1773): the traced drawing in mm, scaled to pixels and rotated
    const crossing = d.querySelector('[data-direction-id="c"] g[transform]');
    expect(crossing?.getAttribute("transform")).toBe("translate(50 50) rotate(0) scale(4)");
    expect(crossing?.querySelectorAll('path[stroke="#E97C1D"]')).toHaveLength(1);
    const sw = d.querySelector('[data-direction-id="s"] g[transform]');
    expect(sw?.getAttribute("transform")).toMatch(/rotate\(45\)/);
    expect(sw?.querySelectorAll('path[fill="#E97C1D"]').length).toBe(1); // filled loop parts
    expect(sw?.querySelectorAll('path[stroke="#E97C1D"]').length).toBe(2); // round and sharp strokes
  });

  it("adds a selection halo only to the selected feature", () => {
    const d = dom([line("uncrossable"), line("oob-boundary")], "oob-boundary");
    expect(d.querySelectorAll('[data-direction-id="oob-boundary"] [stroke="#c084fc"]')).toHaveLength(1);
    expect(d.querySelectorAll('[data-direction-id="uncrossable"] [stroke="#c084fc"]')).toHaveLength(0);
  });

  it("scales symbols with the map scale as in ISInOM 3.1: enlarged above 1:700, never reduced", () => {
    const width = (mapScale: number) =>
      dom([line("uncrossable")], undefined, mapScale).querySelector('[stroke="#9C1881"]')?.getAttribute("stroke-width");
    const crossingScale = (mapScale: number) =>
      dom([{ id: "c", kind: "compulsory-crossing", position: { x: 5, y: 5 }, rotation: 0 }], undefined, mapScale)
        .querySelector('[data-direction-id="c"] g[transform]')
        ?.getAttribute("transform");
    expect(width(700)).toBe(String(0.7 * 4)); // base scale: printed size
    expect(Number(width(350))).toBeCloseTo(0.7 * 4 * 2); // 1:350 → 200 %
    expect(width(1500)).toBe(String(0.7 * 4)); // smaller scale: not reduced
    expect(crossingScale(350)).toMatch(/scale\(8\)$/);
    expect(crossingScale(1000)).toMatch(/scale\(4\)$/);
    // Positions are not scaled, only symbol sizes
    expect(crossingScale(350)).toMatch(/^translate\(50 50\)/);
  });
});
