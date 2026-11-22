import { MousePointer2, Pentagon, Anchor, type LucideIcon } from "lucide-react";

/** Interaction tools of the 3D model editor's map view. */
export type Model3DTool = "select" | "polygon" | "origin-ref";

export interface Model3DToolDef {
  id: Model3DTool;
  icon: LucideIcon;
  label: string;
  /** Single-letter keyboard shortcut (case-insensitive). */
  shortcut: string;
  /** Tooltip / info-dialog description. */
  description: string;
  /** Hint shown on the map while the tool is active. */
  hint: string;
}

/** Single source for the toolbar, keyboard shortcuts, map hint and info dialog. */
export const MODEL_3D_TOOLS: Model3DToolDef[] = [
  {
    id: "select",
    icon: MousePointer2,
    label: "Select",
    shortcut: "V",
    description: "Select polygons only. Click inside a polygon to select it; drag to pan.",
    hint: "Click a polygon to select it",
  },
  {
    id: "polygon",
    icon: Pentagon,
    label: "Polygon",
    shortcut: "P",
    description:
      "Add and edit polygons. Click to add points and press Enter to finish. With a polygon selected: drag points or the origin, click an edge to add a point.",
    hint: "Click to add points, Enter to finish, Esc to cancel",
  },
  {
    id: "origin-ref",
    icon: Anchor,
    label: "Set origin by reference to other level",
    shortcut: "R",
    description:
      "Click a point inside a polygon, then drag to the same physical point (e.g. a stairwell corner) in a polygon on another level. The first polygon's origin is updated so the two points line up in 3D.",
    hint: "Press inside a polygon, drag to the matching point in another polygon, release",
  },
];

export function getModel3DTool(id: Model3DTool): Model3DToolDef {
  return MODEL_3D_TOOLS.find((t) => t.id === id) ?? MODEL_3D_TOOLS[0];
}
