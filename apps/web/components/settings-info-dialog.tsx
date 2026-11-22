"use client"

import { X, Settings } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface SettingsInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsInfoDialog({
  isOpen,
  onClose,
}: SettingsInfoDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" />Settings Guide</h2>
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
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">General Settings</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Theme</p>
              <p>
                Choose a <strong>light</strong>, <strong>medium</strong> (dim grey) or <strong>dark</strong> (default)
                interface. Purple is the selection color in all themes. The choice is stored in this browser only and
                applies immediately. The map itself (PDF) is not affected.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Controls with focus point (Rendering tab)</p>
              <p>
                Draws a dot at the exact centre of each control circle (the IOF MapPosition) in all map views. Useful
                when aligning the map precisely with the coordinate transform tool in Event → Map. Stored in this
                browser only (it used to be a per-event option in the Map tab).
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Example repositories (Examples tab)</p>
              <p>
                Sources for File → Examples. Each repository is the URL of an <code>index.json</code> listing event
                files (<code>title</code>, <code>url</code>, <code>date</code>, <code>country</code>); entry URLs may be
                relative to the index. The default repository (objorke/indoor-o-data) is listed initially; add your own
                with the URL field and press Enter, or remove any of them (including the default, which can be added back).
                With no repositories, File → Examples is hidden. The list is stored in this browser only. Event files are
                fetched directly from the repository when you open them.
              </p>
            </div>



            <div>
              <p className="font-medium text-foreground mb-1">Auto-save</p>
              <p>
                When enabled, the current event file is automatically saved to disk every 5 minutes.
                This helps prevent data loss during long editing sessions. Auto-save only applies when
                working with a file that has already been saved at least once.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Persist locally</p>
              <p>
                Stores your current work in the browser&apos;s local IndexedDB storage. This allows you to
                recover your session if the browser is accidentally closed or refreshed. The data is
                stored only in your browser and is not sent to any server.
              </p>
            </div>


            <div>
              <p className="font-medium text-foreground mb-1">Map cache</p>
              <p>
                Loaded PDF maps are cached in the browser&apos;s IndexedDB for faster subsequent loads.
                The cache size is displayed here. Use the Clear button to free up storage space if
                needed — maps will be re-cached when loaded again. It sits with Restore defaults and Clear all user data
                at the bottom of the General tab.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Restore defaults (General tab)</p>
              <p>
                Resets every setting (theme, running speed, analysis options, example repositories, …) and all
                feature flags to their defaults. Events and maps stored in the browser are kept.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Clear all user data (General tab)</p>
              <p>
                Deletes everything this app has stored in this browser: events, map PDFs, recent files, settings
                and feature flags, then reloads the app. Save events you want to keep to file first. This cannot be
                undone. The offline app files are kept.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="font-medium text-foreground mb-1">Analysis</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Find all routes algorithm</p>
              <p>
                Chooses how the <strong>Show all routes</strong> button in Route Analysis enumerates
                the alternatives for each leg. The setting has no effect while that button is off.
              </p>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <strong>Cluster A* (default)</strong> — condenses same-floor regions into clusters
                  and enumerates every distinct stair sequence, shortest first. Exhaustive over real
                  route choices, one route per stair sequence, and fast.
                </li>
                <li>
                  <strong>Basic DFS</strong> — plain depth-first search of the raw graph for every
                  path that never revisits a node. Also shows corridor variations that share a stair
                  sequence, but it is exponential: a search budget caps the result, so it can be
                  incomplete on large venues.
                </li>
                <li>
                  <strong>Basic BFS</strong> — the same exhaustive search explored by hop count
                  instead of depth. Short-hop routes surface first, at a much higher memory cost.
                </li>
                <li>
                  <strong>Penalised Dijkstra</strong> — repeats the shortest-path search while
                  penalising edges already used. Fastest and scales well, but it samples the route
                  space rather than enumerating it, so alternatives can be missed.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Max routes (k)</p>
              <p>
                The maximum number of alternative routes computed per leg when <strong>Show all
                routes</strong> is off. Higher values find more alternatives at the cost of
                analysis time.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Running speed</p>
              <p>
                The average running speed used to estimate leg and course completion times in route
                analysis. Adjust this to match the expected pace of your target competitor group.
                The value is specified in meters per second (m/s), with the equivalent pace shown
                in minutes per kilometer.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="font-medium text-foreground mb-1">Features</p>
              <p>In the same order as the views in the top bar.</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Directions</p>
              <p>
                Shows the Directions view in the top bar, for drawing ISInOM directions and course print symbols (out-of-bounds
                areas, uncrossable borders, one-way passages, compulsory crossings, map flip points), and draws the
                directions in Course Setting, Route Analysis and Route Builder. Off by default; directions stored in
                the event file are kept either way.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Course Setting</p>
              <p>
                Shows the Course Setting view in the top bar, for placing controls and building courses on the map. On by
                default; turn it off to hide the view. Courses and controls in the event file are kept either way.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Route Builder</p>
              <p>
                Enables the Route Builder tool, which allows you to manually draw routes on the map
                by clicking through graph nodes. Useful for comparing hand-drawn routes against
                computed optimal routes.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Labs</p>
              <p>
                Enables the Labs section, which provides access to experimental and in-development
                features. These features may be incomplete or change without notice.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Modify Graph</p>
              <p>
                Enables graph modification tools that allow batch operations on the routing graph,
                such as automated transformations and bulk edits. Use with caution as these
                operations can make large-scale changes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
