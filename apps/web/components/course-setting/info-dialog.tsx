"use client"

import { X, Palette, Lightbulb, Link, Info, Map as MapIcon, EyeOff, Plus, ArrowUp, ArrowDown, Trash2, Target, Pencil, Edit3, Wand2, Loader2, Square, RotateCw, Triangle } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface CourseSettingInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CourseSettingInfoDialog({
  isOpen,
  onClose,
}: CourseSettingInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Edit3 className="h-5 w-5" />Course Setting Guide</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-muted-foreground">

            <div>
              <p className="font-medium text-foreground mb-1">Introduction</p>
              <p>
                Course Setting is where you design and place controls for your orienteering courses.
                This view allows you to visually position controls on the map, define the sequence competitors
                will visit them, and configure control properties like codes and floor levels.
                The graph-based routing system will automatically calculate optimal routes between controls,
                helping you understand leg difficulty and route choice options.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><MapIcon className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through three states: full map &rarr; dimmed map &rarr; hidden map. Helps see controls and graph more clearly.</li>
                <li><Palette className={iconClass} /><strong>Difficulty colors</strong> &mdash; Color available control positions based on the difficulty of the leg from the previous control. Helps find controls that create interesting route choices. While the difficulties are being calculated the button shows a spinner (<Loader2 className={iconClass} />) and a progress bar appears below the toolbar; turn the button off (or click <X className={iconClass} /> on the progress bar) to abort.</li>
                <li><Lightbulb className={iconClass} /><strong>Suggestions</strong> &mdash; Show a panel of suggested next controls ranked by difficulty. Useful for quickly finding good control placements. The list fills in while the legs are analysed; click <Square className={iconClass} /> or press <kbd>Esc</kbd> to stop (results found so far are kept), and <RotateCw className={iconClass} /> to restart.</li>
                <li><Link className={iconClass} /><strong>Auto-add to course</strong> &mdash; When enabled, clicking an existing control or creating a new one automatically adds it to the current course sequence.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Generate Course (<Wand2 className={iconClass} />)</p>
              <p>
                The <Wand2 className={iconClass} /> button (next to the course selector) opens the course generator dialog.
                It automatically creates a course by searching for a control sequence that matches your target parameters:
              </p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 ml-2">
                <li><strong>Number of controls</strong> &mdash; How many controls the generated course should have</li>
                <li><strong>Target length</strong> &mdash; Desired total course length in meters</li>
                <li><strong>Difficulty level</strong> &mdash; Target difficulty for the generated legs</li>
              </ul>
              <p className="mt-2 text-xs italic text-amber-500">
                This feature is very experimental! The generation algorithm is a first version and may not always
                produce optimal or even feasible courses. Results can vary significantly depending on the graph
                structure and parameters chosen. Improvements are planned for future versions.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Course List Controls</p>
              <ul className="space-y-1.5 ml-2">
                <li><ArrowUp className={iconClass} /><ArrowDown className={iconClass} /><strong>Reorder</strong> &mdash; Move a control up or down in the course sequence.</li>
                <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove a control from the course.</li>
                <li><Triangle className={iconClass} /><strong>Map exchange</strong> &mdash; Use the <Triangle className={iconClass} /> button in each course-list row, or the one in the panel toolbar for the selected control, to cycle a control between none &rarr; <em>map change</em> (competitors take a new map) &rarr; <em>map flip</em> (competitors turn the map over). Shortcut: select the control and press <kbd>M</kbd>. A map exchange control is drawn as the control circle with a triangle inscribed in it, pointing to the next control. Only available on ordinary controls that are not last in the course. Exported to IOF XML 3.0 as a <code>CourseControl</code> extension (<code>&lt;x:MapExchange type=&quot;change|flip&quot;/&gt;</code>), since the standard has no dedicated element; other software will ignore it.</li>
                <li><Plus className={iconClass} /><strong>Add</strong> &mdash; Add a control to the course.</li>
                <li><Pencil className={iconClass} /><strong>Edit code</strong> &mdash; Double-click a control code to edit it inline.</li>
                <li><Target className={iconClass} /><strong>Navigate</strong> &mdash; Center the map on the selected control.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Create or select a course in the Event view</li>
                <li>Click on the map to place the Start control</li>
                <li>Continue clicking to place numbered controls in sequence</li>
                <li>Place the Finish control last</li>
                <li>Set control types (Start/Control/Finish) in the properties panel</li>
                <li>Assign control codes by double-clicking in the course list</li>
                <li>Set floor/level numbers manually or auto-calculate from graph or polygons</li>
                <li>Reorder controls by dragging in the list if needed</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Placing Controls</p>
              <p>Click on the map to place a new control at that location. The control will be added to the selected course.</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Moving Controls</p>
              <p>Hold Ctrl (or Cmd on Mac), click and drag a control to move it to a new position on the map.</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Selecting Controls</p>
              <p>Click on a control on the map or in the course list to select it and view/edit its properties.</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Setting Level/Floor Numbers</p>
              <p>
                Manually set the level in the properties panel, or use the menu options to auto-calculate:
              </p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>
                  <span className="font-medium">From graph:</span> Uses graph connections. Requires the level of at least one control (e.g. Start) to be defined.
                </li>
                <li>
                  <span className="font-medium">From polygons:</span> Uses defined floor polygons. Requires the level to be set correctly for each polygon.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Control Types</p>
              <p>
                Set control types (Start, Control, Finish) in the properties panel. Start and Finish controls are displayed differently on the map.
              </p>
              <p className="mt-1">
                Quick shortcuts: Select a control and press Ctrl+S (or Cmd+S on Mac) to set as Start, or Ctrl+F (or Cmd+F on Mac) to set as Finish.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
