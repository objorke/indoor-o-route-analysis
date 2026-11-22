"use client"

import { X, GitCommitHorizontal, Waypoints, Map as MapIcon, EyeOff, Info, Play, Square, FlaskConical, SkipBack, SkipForward, Pause, Download } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface LabsInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LabsInfoDialog({
  isOpen,
  onClose,
}: LabsInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><FlaskConical className="h-5 w-5" />Labs Guide</h2>
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
                The Labs page is an experimental workspace for analyzing route difficulty and human route-finding
                behavior across your venue&apos;s graph. Pick a lab from the <strong>Lab</strong> selector; each lab
                keeps its own state, so switching between them doesn&apos;t lose your place.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Labs</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Most Difficult Legs (Controls):</strong> Analyzes routes between all pairs of controls and ranks them by difficulty score, using Dijkstra&apos;s shortest path algorithm.</li>
                <li><strong>Most Difficult Legs (Nodes):</strong> Analyzes routes between all pairs of graph nodes, providing a broader view of difficult segments across the entire venue.</li>
                <li><strong>Human Thinking Simulation:</strong> Simulates how a human competitor would find their way between two controls &mdash; short-circuiting on the same floor, otherwise exploring outward from both ends and reasoning about stairs one step at a time &mdash; and narrates the process.</li>
                <li><strong>Clustered Graph:</strong> Groups the entire venue&apos;s graph into same-floor regions (nodes merge only through two-way edges within the same floor; nodes on different floors and one-way edges never merge, whatever the edge label) and colors the map accordingly, so you can see connectivity at a glance.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><GitCommitHorizontal className={iconClass} /><strong>Nodes</strong> &mdash; Show or hide graph nodes on the map.</li>
                <li><Waypoints className={iconClass} /><strong>Edges</strong> &mdash; Show or hide graph edges on the map.</li>
                <li><MapIcon className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Running a Most Difficult Legs Analysis</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Select the Controls or Nodes lab.</li>
                <li>Set the number of top routes to display.</li>
                <li>Click <Play className={iconClass} /><strong>Run Analysis</strong> to start. Progress is shown during computation.</li>
                <li>Click <Square className={iconClass} /><strong>Stop</strong> at any time to abort.</li>
                <li>Results appear sorted by difficulty. Click any row to visualize that route on the map.</li>
              </ol>
              <p className="mt-2">
                Each result row shows the start and end points, the route name with labels, the leg length,
                estimated time, and a difficulty score with a color-coded category badge.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Running a Human Thinking Simulation</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Select the Human Thinking Simulation lab.</li>
                <li>Pick a course and a leg (control-to-control) — the search runs automatically and builds the step-by-step trace.</li>
                <li>Use <SkipBack className={iconClass} /><strong>Previous</strong>, <Play className={iconClass} />/<Pause className={iconClass} /><strong>Play/Pause</strong>, and <SkipForward className={iconClass} /><strong>Next</strong> to step through the simulation, or pick a playback speed. Shortcuts: <strong>Space</strong> play/pause, <strong>&larr;</strong>/<strong>&rarr;</strong> step back/forward. Click any message in the explanation log to jump straight to that step.</li>
                <li>Each message in the log is prefixed by an icon showing what kind of step it is: a magnifying glass for the same-floor check, a footprint for a normal tracking step, an undo arrow for a backtracking step, and a checkmark once a solution is found.</li>
                <li>If the leg needs stairs, the first step always checks that a direct same-floor path isn't possible, e.g. "Same floor? No - we need to check the stairs." — this is the same same-floor check that short-circuits legs that don't need stairs at all.</li>
                <li>Each following step is narrated concretely, e.g. "From control 3 on floor 1, we can reach stairs A, B and C. Let us try up A." — tracking steps start with "From" (where the human currently stands); backtracking steps are prefixed "Backtracking: " and start with "To" (where the plan is trying to reach), naming the floor the candidate stair leads from, e.g. "Backtracking: To control 4 on floor 3, we can come from stairs A, B and C. Let us try up A from floor 2."</li>
                <li>The map overlay shows only the current step: the tracking/backtracking routes committed so far, every candidate stair's entry-point badge (numbered, in its own distinct color matching the candidate's position in the explanation text's stair list), and the chosen (top-ranked) candidate's real corridor path (not a straight line) — all four highlighted with the same white halo/glow used elsewhere on the map. A green ring marks an accepted meeting between the two sides; a red dashed ring marks a rejected one. The final route, once the plan closes, is drawn in the same blue/amber split so you can see exactly how much of it each side contributed.</li>
                <li>The <strong>Short-term memory</strong> panel shows, for the current step, the stair sequence already committed on each side (tracking from the start, backtracking from the control) and which untried alternatives are still being held as fallbacks &mdash; this only appears while stepping through exploration, since nothing is left to remember once the plan closes.</li>
                <li>A one-way passage without a label (a one-way door or corridor) is a planning step like a stair. It is narrated as "the one-way passage" and shown as <strong>&rarr;</strong> in the plan and on the map.</li>
                <li>Stairs are tried nearest first. When several candidates connect to what the other side has already found, the plan closes through the nearest one.</li>
                <li>The <strong>Thinking effort</strong> panel summarizes mental steps, candidates evaluated, rejected meetings, plan depth, and how much longer the human route is than the optimal shortest path.</li>
                <li>Click <Download className={iconClass} /><strong>JSON</strong> or <strong>Markdown</strong> to export the full trace and explanation for later reference.</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Running a Clustered Graph Analysis</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Select the Clustered Graph lab.</li>
                <li>Click <strong>Run Clustering</strong>. Every node and edge is drawn at its real position (not an abstract diagram), tinted by which same-floor cluster it belongs to. A translucent rounded "blob" is drawn behind each cluster's nodes so the floor region reads as one area.</li>
                <li>Floors come from the floor polygons each node lies in, so a cluster never covers two floors. Only floor changes and one-way edges separate clusters; labels and zero-length flags are ignored. Nodes outside every polygon only merge with each other.</li>
                <li>Edges between clusters (stairs, floor changes, one-way passages) are drawn as neutral dashed lines, distinct from same-floor corridors. One-way edges of either kind show a small direction chevron.</li>
                <li>The panel lists every cluster with its color swatch.</li>
                <li>Click <Download className={iconClass} /><strong>Mermaid (.mmd)</strong> to export the condensed cluster graph (one node per cluster, one directed edge per traversable direction of each edge between clusters) for use in a Mermaid renderer.</li>
              </ol>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
