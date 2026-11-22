"use client"

import { X, Share2, CircleDot, Map as MapIcon, EyeOff, Info, Menu, Download, BarChart3 } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface EventAnalysisInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EventAnalysisInfoDialog({
  isOpen,
  onClose,
}: EventAnalysisInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5" />Event Analysis Guide</h2>
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
                Event Analysis helps you understand how runners will move through your venue during a competition.
                By simulating optimal routes for all courses and classes, this view identifies high-traffic areas,
                potential bottlenecks, and collision zones where runners traveling in opposite directions may meet.
                Use this information to optimize control placement, identify safety concerns, or plan for spectator viewing areas.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><Share2 className={iconClass} /><strong>Edge traffic</strong> &mdash; Show or hide the edge traffic visualization on the map. Displays traffic intensity along each graph edge.</li>
                <li><CircleDot className={iconClass} /><strong>Node traffic</strong> &mdash; Show or hide node traffic as colored circles. Disabled when using collision metric (which is edge-based only).</li>
                <li><MapIcon className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map. Dim the background to improve visibility of the analysis overlay.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
                <li><Menu className={iconClass} /><strong>Menu</strong> &mdash; Export options:
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><Download className={iconClass} /><strong>Export PNG</strong> &mdash; Save the current view as an image</li>
                    <li><Download className={iconClass} /><strong>Export PDF</strong> &mdash; Save the current view as a PDF document</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Set up your event with all courses and class assignments in the Event view</li>
                <li>Enter the expected number of competitors per class</li>
                <li>Open Event Analysis from the navigation menu</li>
                <li>Choose a visualization mode (heatmap, thickness, or both) to see traffic patterns</li>
                <li>Select a metric (Total Traffic or Collision) based on what you want to analyze</li>
                <li>Click on edges or nodes to inspect detailed traffic statistics</li>
                <li>Adjust courses as needed and re-analyze to optimize traffic flow</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Visualization Modes</p>
              <p>Choose between heatmap, line thickness, or both to visualize traffic patterns on the map. Heatmap shows color intensity, while thickness shows line width proportional to traffic volume.</p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Metrics</p>
              <p className="mb-2">Traffic metrics are calculated by simulating the optimal route for every leg of every course, multiplied by the number of competitors on that course.</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Total Traffic:</strong> The sum of all runners passing through a specific segment, regardless of direction. <br/><span className="text-xs text-muted-foreground ml-4">Formula: Forward + Backward</span></li>
                <li><strong>Collision Metric:</strong> A measure of bidirectional flow intensity. It represents the volume of traffic that encounters counter-flow, highlighting areas where head-on meetings are most likely. <br/><span className="text-xs text-muted-foreground ml-4">Formula: Min(Forward, Backward)</span></li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Clicking Elements</p>
              <p>Click on any edge or node to view detailed traffic statistics for that specific element, including forward/backward counts and which courses contribute to the traffic.</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
