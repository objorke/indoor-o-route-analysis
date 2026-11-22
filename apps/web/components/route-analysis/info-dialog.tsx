"use client"

import { X, Box, Maximize2, Map as MapIcon, EyeOff, Info, Menu, Play, Pause, Square, Target, Layers, ArrowUpDown, Repeat, BarChart3, Brain, Split, Tractor, Rat } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface RouteAnalysisInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RouteAnalysisInfoDialog({
  isOpen,
  onClose,
}: RouteAnalysisInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5" />Route Analysis Guide</h2>
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
                Route Analysis is the core tool for evaluating course quality and understanding route choices.
                For each leg between controls, it calculates all viable routes and ranks them by distance.
                This helps course setters understand whether legs offer meaningful route choice, assess difficulty
                based on the number of decision points, and identify whether the intended challenge matches the
                actual routing options available to competitors.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><Box className={iconClass} /><strong>3D / Map view</strong> &mdash; Switch between the 2D map view and the 3D model view. Only available when 3D polygons are defined.</li>
                <li><Maximize2 className={iconClass} /><strong>Frame all</strong> &mdash; Reset the camera to frame all geometry (3D mode only).</li>
                <li>
                  <svg className="h-3.5 w-3.5 inline-block align-text-bottom mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="4" x2="20" y2="20" /><line x1="4" y1="20" x2="20" y2="4" />
                  </svg>
                  <strong>Show/hide edges</strong> &mdash; Toggle visibility of graph edges with length on the map. Edges with &ldquo;ignore length&rdquo; (e.g. stairs) are excluded.
                </li>
                <li><MapIcon className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map.</li>
                <li><Split className={iconClass} /><strong>Branching points</strong> &mdash; Toggle visibility of branching point markers on the selected route. A branching point is any node where the runner has more than one outgoing edge (excluding the way back), regardless of whether the alternatives are significant. Only available when a single route is selected.</li>
                <li><Brain className={iconClass} /><strong>Decision points</strong> &mdash; Toggle visibility of decision point markers on the selected route. A decision point is a node where the runner faces a meaningful route choice: dead-end branches shorter than 50 m and trivial loop-backs are excluded. Decision point markers are drawn on top of branching point markers. Only available when a single route is selected.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
                <li><Menu className={iconClass} /><strong>Menu</strong> &mdash; Export options:
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><strong>Export for training app</strong> &mdash; Export course data for the training application</li>
                    <li><strong>Export map</strong> &mdash; Save the map with routes as an image or PDF</li>
                    <li><strong>Export video</strong> &mdash; Create an animated video of the route playback</li>
                    <li><strong>Export report</strong> &mdash; Generate an HTML report with difficulty charts and route details</li>
                    <li><strong>Export track (GPX)</strong> &mdash; Export the selected route as a GPX track file</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Playback Controls</p>
              <ul className="space-y-1.5 ml-2">
                <li><Play className={iconClass} /><Pause className={iconClass} /><strong>Play / Pause</strong> &mdash; Start or pause the route animation for the selected route. Disabled when no route is selected.</li>
                <li><Square className={iconClass} /><strong>Stop</strong> &mdash; Stop and reset the animation to the beginning.</li>
                <li><strong>Speed selector</strong> &mdash; Choose playback speed: 1x, 2x, 3x, 4x, 5x, or 10x.</li>
                <li><Layers className={iconClass} /><strong>Hide upper levels</strong> &mdash; In 3D mode, hide floors above the runner&apos;s current position for better visibility.</li>
                <li><Target className={iconClass} /><strong>Follow</strong> &mdash; Keep the animated runner centered in the viewport.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Analysis Options</p>
              <ul className="space-y-1.5 ml-2">
                <li>
                  <Tractor className={iconClass} /><strong>Show all routes</strong> &mdash; Controls how alternative routes are found and filtered for each leg.
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                    <li><strong>Off (default):</strong> Uses a heuristic search limited to <em>k</em> candidate routes. Routes that differ only in minor surface-level details (same stair sequence) are deduplicated, so each listed route represents a genuinely distinct path through the building.</li>
                    <li><strong>On:</strong> Runs the enumeration algorithm selected in <em>Settings → Analysis → Find all routes algorithm</em> up to a hard cap, with no k-filtering. Useful for discovering edge-case paths, but it may produce many near-identical routes and is slower to compute. The algorithms: <strong>Cluster A* (default)</strong> enumerates every distinct stair sequence, shortest first; <strong>Basic DFS</strong> and <strong>Basic BFS</strong> enumerate every path that never revisits a node (depth-first / by hop count), so they also show corridor variations sharing a stair sequence, but are budget-capped on large venues; <strong>Penalised Dijkstra</strong> is the fastest but samples rather than enumerates, so it can miss alternatives. The current choice is shown in this button&apos;s tooltip.</li>
                  </ul>
                </li>
                <li><strong>Scoring model</strong> &mdash; Choose which difficulty scoring model to use for the analysis.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Route Information Icons</p>
              <ul className="space-y-1.5 ml-2">
                <li><span className="mr-1">⭐</span><strong>Hardest leg</strong> &mdash; Marks the leg with the highest difficulty in the course.</li>
                <li><Rat className={iconClass} /><strong>Trap</strong> &mdash; The shortest route is more difficult than a longer route, so the easiest route may be chosen even though a more difficult, shorter one exists. Only shown when the easiest route is more than 10% longer and more than 10% easier than the shortest. Hover the icon to see both routes&apos; distance and difficulty.</li>
                <li><Brain className={iconClass} /><strong>Decision points</strong> &mdash; Number of meaningful junctions where the runner must choose a direction. Dead-end branches shorter than 50 m are excluded.</li>
                <li><ArrowUpDown className={iconClass} /><strong>Stairs</strong> &mdash; Number of stair segments along the route.</li>
                <li><Repeat className={iconClass} /><strong>Repetition</strong> &mdash; Ratio of how much of the route overlaps with previously visited segments.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Select a course from the dropdown menu</li>
                <li>Review the difficulty chart to identify the most challenging legs</li>
                <li>Click on a leg to view all alternative routes</li>
                <li>Compare route distances and decision point counts</li>
                <li>Use the play button to animate routes and understand the competitor experience</li>
                <li>Check for unintended shortcuts or overly complex routing</li>
                <li>Export the analysis as an HTML report for documentation or sharing</li>
                <li>Iterate on course design based on your findings</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Understanding Difficulty</p>
              <p>
                Difficulty is calculated based on distance, decision points, and route complexity. Higher numbers
                indicate more challenging legs. The difficulty chart shows the relative difficulty of each leg.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
