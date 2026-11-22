"use client"

import { X, Map as MapIcon, EyeOff, GitCommitHorizontal, Waypoints, Info, MousePointer2, Play, Square, Navigation, Wrench, Pickaxe } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface ModifyGraphInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ModifyGraphInfoDialog({
  isOpen,
  onClose,
}: ModifyGraphInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-lg">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Pickaxe className="h-5 w-5" />Modify Graph Guide</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto p-6">
          <div className="space-y-5 text-sm text-foreground">

            <div>
              <p className="font-semibold mb-1">Introduction</p>
              <p className="text-muted-foreground">
                Modify Graph enables &quot;what-if&quot; analysis for course design optimization. When you want to increase
                the difficulty of a specific leg or change route choice dynamics, this tool systematically tests
                all possible graph modifications (blocking passages or making them one-way) to find the change
                that best achieves your goal. This is particularly useful for fine-tuning leg difficulty or
                creating more interesting route choice situations without manually testing each possibility.
              </p>
              <p className="text-muted-foreground mt-1 text-xs italic">Note: This module is experimental.</p>
            </div>

            <div>
              <p className="font-semibold mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2 text-muted-foreground">
                <li><GitCommitHorizontal className={iconClass} /><strong>Show nodes</strong> &mdash; Show or hide all graph nodes on the map.</li>
                <li><Waypoints className={iconClass} /><strong>Show edges</strong> &mdash; Show or hide all graph edges on the map.</li>
                <li><MapIcon className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold mb-1">Analysis Controls</p>
              <ul className="space-y-1.5 ml-2 text-muted-foreground">
                <li><MousePointer2 className={iconClass} /><strong>Pick From / To</strong> &mdash; Click to pick the starting or destination point directly from the map.</li>
                <li><Play className={iconClass} /><strong>Run Analysis</strong> &mdash; Test all possible graph modifications and rank results by effectiveness.</li>
                <li><Square className={iconClass} /><strong>Stop</strong> &mdash; Cancel a running analysis.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold mb-1">Results Actions</p>
              <ul className="space-y-1.5 ml-2 text-muted-foreground">
                <li><Navigation className={iconClass} /><strong>Navigate to route</strong> &mdash; Center the map on the modified route to preview it.</li>
                <li><Wrench className={iconClass} /><strong>Apply modification</strong> &mdash; Permanently apply the selected modification to the graph (remove the edge or make it one-way).</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2 text-muted-foreground">
                <li>Select a course and identify a leg you want to modify</li>
                <li>Set the From and To controls for the leg you want to analyze</li>
                <li>Choose your objective (Maximize Difficulty or Target a specific difficulty)</li>
                <li>Select a modification strategy (Remove Edge or Make One-Way)</li>
                <li>Click <Play className={iconClass} />&quot;Run Analysis&quot; to test all possible modifications</li>
                <li>Review the results list sorted by effectiveness</li>
                <li>Click results to preview the modified vs. original route on the map</li>
                <li>Apply the best modification permanently using <Wrench className={iconClass} /></li>
              </ol>
            </div>

            <div>
              <p className="font-semibold mb-1">How It Works</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Select a <strong>From</strong> and <strong>To</strong> point (controls or nodes) on the map or by typing IDs.</li>
                <li>Choose an <strong>Objective</strong>:
                    <ul className="list-circle pl-5 mt-1">
                        <li><strong>Maximize Difficulty:</strong> Find a modification that increases the route difficulty the most.</li>
                        <li><strong>Target Difficulty:</strong> Find a modification that brings the difficulty closest to a specific value.</li>
                    </ul>
                </li>
                <li>Select a <strong>Strategy</strong>:
                    <ul className="list-circle pl-5 mt-1">
                        <li><strong>Remove Edge:</strong> Simulate blocking a passage.</li>
                        <li><strong>Make One-Way:</strong> Restrict travel to one direction.</li>
                    </ul>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold mb-1">Analyzing Results</p>
              <p className="text-muted-foreground">
                The results list shows the best modifications based on your objective.
                Click on a result to see the modified route (cyan) compared to the original route (red, drawn like the best route in Route Analysis).
                Use the <strong>Exclude edges with ignored length</strong> checkbox to prevent modifying staircases.
              </p>
            </div>

          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end">
            <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
