"use client"

import { X, Menu, Plus, FolderOpen, Save, FileUp, FileDown, Settings, Trash2, Info, Copy, RefreshCw, Download, BookX, ImageDown, ImagePlus, Ruler, Calculator, Crosshair, Check, LocateFixed, Maximize2, ZoomIn, ZoomOut, Undo2, Redo2 } from "lucide-react";
import { MAP_TAB_HELP } from "./map-tab-help";
import { Button } from "@indoor-o-route-analysis/ui";

interface EventManagerInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EventManagerInfoDialog({
  isOpen,
  onClose,
}: EventManagerInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";
  const iconClassOnly = "h-3.5 w-3.5 inline-block align-text-bottom";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" />Event Guide</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-muted-foreground">

            {/* Introduction */}
            <div>
              <p className="font-medium text-foreground mb-1">Introduction</p>
              <p>
                The Event view is your central hub for organizing indoor orienteering competitions.
                It allows you to create and manage events, define courses with different difficulty levels,
                and assign courses to competition classes. All event data including maps, graphs, courses,
                and class assignments are stored together, making it easy to export and share complete event packages.
              </p>
            </div>

            {/* Workflows */}
            <div>
              <p className="font-medium text-foreground mb-2">Common Workflows</p>

              <div className="space-y-3 ml-1">
                {/* Flow 1 */}
                <div className="border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Flow 1: Analyse an existing course</p>
                  <p className="mb-1">If you already have a complete event file (JSON) with a map, graph and courses:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Open the event file via <Menu className={iconClassOnly} /> <strong>File &gt; Open</strong> (or load an example: it opens in Route Analysis with the first course, its first leg and that leg's first route selected; switch to <strong>Event</strong> to edit it)</li>
                    <li>Navigate to <strong>Route Analysis</strong> to see route choices, difficulty and leg details for each course</li>
                    <li>Navigate to <strong>Event Analysis</strong> to visualize traffic heatmaps and collision zones across all courses</li>
                  </ol>
                </div>

                {/* Flow 2 */}
                <div className="border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Flow 2: Import existing courses (IOF XML)</p>
                  <p className="mb-1">When you have courses in IOF XML format and want to build the graph for analysis:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Create a new event via <Menu className={iconClassOnly} /> <strong>File &gt; New</strong></li>
                    <li>Import your courses via <Menu className={iconClassOnly} /> <strong>File &gt; Import IOF XML</strong></li>
                    <li>Go to the <strong>Map</strong> tab, load your venue map (PDF)</li>
                    <li>Adjust the map transformation so that control coordinates match the map (use the <Crosshair className={iconClassOnly} /> Update coordinate transform tool)</li>
                    <li>Go to <strong>Floors</strong> and draw polygons for each floor level, remember to set the level number, elevation and origin point for each floor.</li>
                    <li>Go to <strong>Graph</strong> and build the routing graph:
                      <ul className="list-disc list-inside ml-4 space-y-0.5">
                        <li>Draw staircase nodes and edges first (mark as &quot;ignore length&quot;, and apply labels using the keyboard)</li>
                        <li>Then draw all corridor nodes and edges on each floor</li>
                      </ul>
                    </li>
                    <li>Run <strong>Route Analysis</strong> and <strong>Event Analysis</strong> to evaluate the courses</li>
                  </ol>
                </div>

                {/* Flow 3 */}
                <div className="border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Flow 3: Course setting from scratch</p>
                  <p className="mb-1">Create new courses from the ground up:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Create a new event via <Menu className={iconClassOnly} /> <strong>File &gt; New</strong></li>
                    <li>Go to the <strong>Map</strong> tab and load your venue map (PDF)</li>
                    <li>Open the <strong>Course Setting</strong> module to place controls and define courses</li>
                    <li>Go to <strong>Graph</strong> to create the full routing graph for your venue</li>
                    <li>Use <strong>Route Analysis</strong> to evaluate route choices and difficulty</li>
                    <li>Use <strong>Modify Graph</strong> to experiment with blocking passages or making them one-way (experimental!)</li>
                    <li>Iterate on your course design based on the analysis results</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div>
              <p className="font-medium text-foreground mb-1">Toolbar</p>
              <ul className="space-y-1.5 ml-2">
                <li><Undo2 className={iconClass} /><Redo2 className={iconClass} /><strong>Undo / Redo</strong> &mdash; In the File menu, which names the change. Undoes edits to the open event in every view: controls, courses, graph, polygons, map and transform. Shortcuts: <kbd>Ctrl/Cmd+Z</kbd> undo, <kbd>Ctrl/Cmd+Shift+Z</kbd> or <kbd>Ctrl+Y</kbd> redo (not while typing in a field, where the field&apos;s own undo applies). A drag counts as one step. Undoing back to the last save clears the unsaved-changes marker. History is kept in memory for the open event only (up to 100 steps) and is cleared when you open or close an event.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog</li>
              </ul>
            </div>

            {/* File Menu */}
            <div>
              <p className="font-medium text-foreground mb-1">File Menu (<Menu className={iconClassOnly} />)</p>
              <ul className="space-y-1.5 ml-2">
                <li><Plus className={iconClass} /><strong>New</strong> &mdash; Create a new empty event</li>
                <li><FolderOpen className={iconClass} /><strong>Open...</strong> &mdash; Open an event from a local JSON file</li>
                <li><strong>Examples</strong> &mdash; Load a sample event from the example repositories (configure in Settings → Examples)</li>
                <li><strong>Recent Files</strong> &mdash; Quickly re-open previously opened files</li>
                <li><Save className={iconClass} /><strong>Save</strong> &mdash; Save the current event to its file</li>
                <li><Save className={iconClass} /><strong>Save As...</strong> &mdash; Save the event to a new file</li>
                <li><FileUp className={iconClass} /><strong>Import IOF XML...</strong> &mdash; Import courses from IOF XML 3.0 format</li>
                <li><FileDown className={iconClass} /><strong>Export IOF XML...</strong> &mdash; Export courses in IOF XML 3.0 format</li>
                <li><Info className={iconClass} /><strong>About...</strong> &mdash; Go to the landing/about page</li>
                <li><Settings className={iconClass} /><strong>Settings...</strong> &mdash; Open application settings</li>
                <li><X className={iconClass} /><strong>Close</strong> &mdash; Close the current event</li>
              </ul>
            </div>

            {/* Tabs */}
            <div>
              <p className="font-medium text-foreground mb-1">Tabs</p>
              <ul className="space-y-2 ml-2">
                <li>
                  <p className="font-medium text-foreground">Event</p>
                  <p>Event metadata: title, date, event website, event image, event maps download site and country. It is informational only (for example used by the training app); the map is added in the Map tab.</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5 mt-1">
                    <li><strong>Event image</strong> &mdash; Enter an image address, or store the image inside the event file: <ImageDown className={iconClass} /> downloads the image at the entered address and embeds it (only works if the site allows it), <ImagePlus className={iconClass} /> embeds an image file from your computer. Images larger than 1024 px or 300 kB are downscaled (WebP). <X className={iconClass} /> removes an embedded image. An embedded image is also included in the training data export and IOF XML export. For privacy, an image address that came with an opened file is only loaded after you click <strong>Show image from …</strong>, since loading it lets that site see your IP address.</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Map</p>
                  <p>
                    With no map loaded, the tab shows only an <FolderOpen className={iconClass} /><strong>Import map…</strong> button
                    (or enter a URL). After import, the file name, size, page count and page size (mm) are shown, with
                    <strong> Replace…</strong> to load another PDF. Shortcut: <kbd>Ctrl/Cmd+O</kbd>.
                  </p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5 mt-1">
                    <li><strong>Save map encoded in event file</strong> &mdash; {MAP_TAB_HELP.saveEncoded} On by default for newly imported maps.</li>
                    <li><strong>Multi-page layout</strong> (multi-page PDFs only) &mdash; {MAP_TAB_HELP.layout}</li>
                    <li><strong>Multi-page transformation</strong> (multi-page PDFs only) &mdash; {MAP_TAB_HELP.pageTransform}</li>
                    <li>
                      <strong>Coordinate transform</strong> &mdash; MapPosition of the document&apos;s top-left and bottom-right
                      corners. Values are applied when you leave the field or press Enter (Esc reverts), so negative numbers can
                      be typed. The scale line shows units per mm on each axis and whether it is uniform.
                      <BookX className={iconClass} /><strong>Reset</strong> sets plain mm with origin top-left (Y down) or
                      bottom-left (Y up). Reset and the coordinate transform tool can be undone with <kbd>Ctrl/Cmd+Z</kbd>.
                    </li>
                  </ul>
                  <p className="mt-1">Map toolbar:</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Maximize2 className={iconClass} /><strong>Fit map to view</strong> &mdash; Shows the whole map. Shortcut: <kbd>0</kbd></li>
                    <li><ZoomIn className={iconClass} /><strong>Zoom in</strong> / <ZoomOut className={iconClass} /><strong>Zoom out</strong> &mdash; Zoom around the centre of the view. Shortcuts: <kbd>+</kbd> / <kbd>−</kbd> (around the mouse), or the mouse wheel. Drag the map to pan.</li>
                    <li><Ruler className={iconClass} /><strong>Measure</strong> &mdash; Drag to measure a distance on the map</li>
                    <li><Calculator className={iconClass} /><strong>Calculate scale</strong> &mdash; Enter a known distance in metres, then drag it on the map</li>
                    <li>
                      <Crosshair className={iconClass} /><strong>Update coordinate transform</strong> &mdash; Aligns the controls
                      with the map using two controls. Shortcut: <kbd>T</kbd>.
                      <ol className="list-decimal list-inside ml-4 space-y-0.5">
                        <li>The two controls farthest apart are pre-selected (change them in the toolbar). Choose two controls
                          <strong> far apart</strong>, ideally in opposite corners: the farther apart, the more accurate the transform.</li>
                        <li>Each chosen control has a mark where it is drawn now. Click on the map where the first control
                          really is, then where the second one is. You can also drag a mark, or select it and nudge it with
                          the arrow keys (Shift for 0.1 mm).</li>
                        <li><Check className={iconClass} /><strong>Apply</strong> (<kbd>Enter</kbd>) updates the transform so the controls
                          land on their marks, and shows the max error. Move a mark and Apply again to refine it.</li>
                        <li>Click anywhere in a control&apos;s toolbar slot (it gets a purple outline) to place that control
                          again with your next map click; the symbol next to it matches its mark on the map.
                          <LocateFixed className={iconClass} /> zooms to its mark.</li>
                      </ol>
                      The transform always uses the same scale in X and Y, so two controls on the same row also work. Panning
                      the map by dragging still works while the tool is open.
                    </li>
                    <li><kbd>Esc</kbd> exits the active tool</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Georeference</p>
                  <p>
                    <strong>Map georeferencing (top-left)</strong> &mdash; {MAP_TAB_HELP.georef} Needs a map (import it in the
                    Map tab). The Map tab&apos;s info box then also shows the cursor&apos;s lat/lon.
                  </p>
                </li>
                <li>
                  <p className="font-medium text-foreground">Courses</p>
                  <p>Manage courses for the event. Each course defines a sequence of controls.</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Plus className={iconClass} /><strong>Add course</strong> &mdash; Create a new course</li>
                    <li><Copy className={iconClass} /><strong>Duplicate</strong> &mdash; Copy an existing course</li>
                    <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove a course</li>
                    <li>Click a course name to rename it</li>
                    <li><strong>Target Difficulty</strong> &mdash; Set the intended difficulty level for the course (White, Yellow, Orange, Purple, or Black). This is stored in the event data and can be used to compare against the actual calculated difficulty in Route Analysis.</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Class Assignments</p>
                  <p>Assign courses to competition classes and set expected number of competitors per class (used for traffic analysis).</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Plus className={iconClass} /><strong>Add class assignment</strong> &mdash; Add a new class</li>
                    <li><RefreshCw className={iconClass} /><strong>Update course runners</strong> &mdash; Recalculate runner counts per course, based on the number of runners per class</li>
                    <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove a class assignment</li>
                  </ul>
                </li>
                <li>
                  <p className="font-medium text-foreground">Controls</p>
                  <p>Summary of all controls across all courses, including codes, positions and floor levels.</p>
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Trash2 className={iconClass} /><strong>Delete control</strong> &mdash; Removes the control, its entries in every course, and graph edges to it. Asks first if courses use it. Shortcut: select a row and press <kbd>Delete</kbd>/<kbd>Backspace</kbd></li>
                    <li><Download className={iconClass} /><strong>Export CSV</strong> &mdash; Download a CSV file of all controls</li>
                  </ul>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
