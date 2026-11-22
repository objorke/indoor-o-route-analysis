import type { DirectionKind } from "@indoor-o-route-analysis/core";

export type DirectionTool = "select" | DirectionKind;

export interface DirectionToolDef {
  id: DirectionTool;
  /** Tool name, e.g. "Uncrossable border". */
  label: string;
  /** ISInOM symbol code, e.g. "1775" (none for Select). */
  code?: string;
  /** Single-letter shortcut (case-insensitive). */
  shortcut: string;
  /** How the tool is used; shown in the map hint and the info dialog. */
  hint: string;
  /** What gets drawn: a polyline, a polygon, or a point symbol. */
  geometry: "none" | "line" | "area" | "point";
}

const LINE_HINT = "Click to add points, Enter or double-click to finish, Backspace removes the last point, Esc cancels";

/** Single source for the toolbar, shortcuts, map hint and info dialog. */
export const DIRECTION_TOOLS: DirectionToolDef[] = [
  { id: "select", label: "Select", shortcut: "V", geometry: "none", hint: "Click a symbol to select it; drag to move it. Drag a point handle to move the point, double-click it to delete it, double-click the line to add one. Delete removes the symbol, R / Shift+R rotates a point symbol, Esc deselects" },
  { id: "uncrossable", label: "Uncrossable border", code: "1775", shortcut: "U", geometry: "line", hint: LINE_HINT },
  { id: "oob-boundary", label: "Out-of-bounds boundary", code: "708", shortcut: "B", geometry: "line", hint: LINE_HINT },
  { id: "oob-area", label: "Out-of-bounds area", code: "709", shortcut: "A", geometry: "area", hint: "Click to add corners, Enter or double-click to close the area, Esc cancels" },
  { id: "oob-area-boundary", label: "Out-of-bounds area boundary", code: "709.4", shortcut: "L", geometry: "line", hint: LINE_HINT },
  { id: "one-way", label: "One-way passage", code: "1771.1 / 1771.2", shortcut: "W", geometry: "line", hint: `Draw in the direction of travel. ${LINE_HINT}` },
  { id: "compulsory-crossing", label: "Compulsory crossing", code: "1772", shortcut: "C", geometry: "point", hint: "Click to place; R / Shift+R rotates the selected symbol by 15°" },
  { id: "compulsory-switch", label: "Compulsory diagonal switch", code: "1773", shortcut: "D", geometry: "point", hint: "Click to place; R / Shift+R rotates the selected symbol by 15°" },
  { id: "compulsory-one-way-switch", label: "Compulsory diagonal one-way switch", code: "1774", shortcut: "O", geometry: "point", hint: "Click to place; R / Shift+R rotates the selected symbol by 15° (the arrows show the direction of travel)" },
  { id: "map-flip-point", label: "Map flip point", code: "1720", shortcut: "F", geometry: "point", hint: "Click to place where the runner turns the map over" },
];

export const getDirectionTool = (id: DirectionTool) => DIRECTION_TOOLS.find((t) => t.id === id) ?? DIRECTION_TOOLS[0];
