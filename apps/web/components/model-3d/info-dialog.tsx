"use client"

import { X, Maximize2, CheckCircle, Info, Menu, Download, Target, Box, Trash2 } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { MODEL_3D_TOOLS } from "./tools";

interface Model3DInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Model3DInfoDialog({
  isOpen,
  onClose,
}: Model3DInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Box className="h-5 w-5" />3D Model Editor Guide</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-muted-foreground">

            <div>
              <p className="font-medium text-foreground mb-1">Introduction</p>
              <p>
                The 3D Model Editor allows you to create a three-dimensional representation of your venue
                by defining floor polygons for each level. This visualization helps competitors understand
                the vertical layout of multi-story venues and can be used for course previews, training materials,
                or promotional content. Each polygon represents a floor area that will be textured with the
                corresponding section of your map.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Tools</p>
              <ul className="space-y-1.5 ml-2">
                {MODEL_3D_TOOLS.map((t) => (
                  <li key={t.id}>
                    <t.icon className={iconClass} />
                    <strong>{t.label}</strong> (<kbd>{t.shortcut}</kbd>) &mdash; {t.description}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><Maximize2 className={iconClass} /><strong>Frame all</strong> &mdash; Reset the 3D camera to frame all geometry in the scene.</li>
                <li><CheckCircle className={iconClass} /><strong>Verify</strong> &mdash; Check that all controls and graph nodes are inside polygon boundaries. Lists any issues found.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
                <li><Menu className={iconClass} /><strong>Menu</strong> &mdash; Export options:
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Download className={iconClass} /><strong>Export 3D model</strong> &mdash; Export the 3D model for use in other applications</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">In-Panel Actions</p>
              <ul className="space-y-1.5 ml-2">
                <li><Target className={iconClass} /><strong>Navigate</strong> &mdash; Center the map on a specific polygon or verification finding.</li>
                <li><Trash2 className={iconClass} /><strong>Delete floor</strong> &mdash; In the floor list, delete a floor (its polygon) after confirming. Undo with <kbd>Ctrl/Cmd+Z</kbd>.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Ensure your map has separate pages or areas for each floor level</li>
                <li>Navigate to the first floor on your map</li>
                <li>Choose the <strong>Polygon</strong> tool (<kbd>P</kbd>) and click to draw a polygon around the floor boundary, press Enter to complete</li>
                <li>Set the level number in the properties panel</li>
                <li>Repeat for each floor level in your venue</li>
                <li>Align floors with the <strong>Set origin by reference to other level</strong> tool (<kbd>R</kbd>), matching e.g. stairwell corners</li>
                <li>Adjust origin points if textures appear offset</li>
                <li>Use the 3D view to verify the model looks correct from different angles</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Creating Polygons</p>
              <p>
                With the <strong>Polygon</strong> tool, click on the map to start drawing a polygon. Continue clicking to add points.
                Press <strong>Enter</strong> to close and finish the polygon.
                Press <strong>Escape</strong> to cancel drawing.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Editing Polygons</p>
              <p>
                Click on a polygon to select it (any tool). Points, edges and the origin can be edited with the <strong>Polygon</strong> tool; the <strong>Select</strong> tool only selects.
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>Move Points:</strong> Drag any blue vertex point.</li>
                  <li><strong>Add Points:</strong> Click on the edge of a selected polygon to split it and add a new point.</li>
                  <li><strong>Delete:</strong> With the Polygon tool, select a point and press Delete/Backspace to remove it, or select the polygon (click inside) and press Delete to remove the whole polygon.</li>
                  <li><strong>Fine Tuning:</strong> Use Arrow keys to nudge selected points. Hold Shift for larger steps.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Origin Points &amp; Alignment</p>
              <p>
                Every polygon has an <strong>Origin Point</strong> (marked with a crosshair halo). This point acts as the (0,0) coordinate for that level/floor in the 3D model.
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>Move Origin:</strong> Drag the origin point to shift how the floor texture is projected in 3D.</li>
                  <li><strong>Align Levels:</strong> With the <strong>Set origin by reference to other level</strong> tool, press on a point inside a polygon and drag to the same physical point (like a stairwell corner) in a polygon on another level. The first polygon&apos;s origin is updated so the two points line up in 3D.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">3D Visualization</p>
              <p>
                The 3D view on the right shows your polygons as textured geometry.
                Use the mouse to rotate (left-click drag), pan (right-click drag), and zoom (scroll wheel).
                Click <Maximize2 className={iconClass} />&quot;Frame All&quot; to center the view on all polygons.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
