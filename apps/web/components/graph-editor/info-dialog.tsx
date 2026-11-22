"use client"

import { X, Map as MapIcon, EyeOff, MoveHorizontal, Triangle, AlertTriangle, Info, Menu, FileUp, FileDown, RefreshCw, Trash2, Crosshair, Route, Link, ArrowLeftRight } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface GraphEditorInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GraphEditorInfoDialog({
  isOpen,
  onClose,
}: GraphEditorInfoDialogProps) {
  if (!isOpen) return null;

  const iconClass = "h-3.5 w-3.5 inline-block align-text-bottom mr-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Route className="h-5 w-5" />Graph Guide</h2>
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
                The Graph view is where you create the routing network that defines all possible paths
                through your venue. This graph is the foundation for route analysis, difficulty calculations,
                and optimal path finding. Nodes represent decision points (intersections, corners, doorways),
                while edges represent the passages between them. A well-constructed graph accurately models
                the movement options available to competitors.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Toolbar Buttons</p>
              <ul className="space-y-1.5 ml-2">
                <li><MapIcon className={iconClass} /><EyeOff className={iconClass} /><strong>Map visibility</strong> &mdash; Cycle through: full map &rarr; dimmed map &rarr; hidden map.</li>
                <li><MoveHorizontal className={iconClass} /><strong>Normal edges</strong> &mdash; Show or hide the normal graph edges on the map.</li>
                <li><Triangle className={iconClass} /><strong>Ignore-length edges</strong> &mdash; Show or hide edges marked as &quot;ignore length&quot; (stairs). Drawn with a dashed style.</li>
                <li><AlertTriangle className={iconClass} /><strong>Verify graph</strong> &mdash; Check the graph for errors such as disconnected nodes, invalid edges, or missing connections, and show the findings; click again to hide them. Nodes and controls outside the map area are named with their type (Start, Control, Finish or Node), position and the map&apos;s range, and are still drawn beyond the map edge so you can find them. It also lists edges without a label that connect two floors: a level change must be a labeled stair, otherwise the two floors are treated as one region.</li>
                <li><Info className={iconClass} /><strong>Info</strong> &mdash; Opens this guide dialog.</li>
                <li><Menu className={iconClass} /><strong>Menu</strong> &mdash; Import, export, and graph management:
                  <ul className="list-disc list-inside ml-4 space-y-0.5">
                    <li><FileUp className={iconClass} /><strong>Import Graph JSON</strong> &mdash; Load a graph from a JSON file</li>
                    <li><FileDown className={iconClass} /><strong>Export Graph JSON</strong> &mdash; Save the graph as a JSON file</li>
                    <li><FileDown className={iconClass} /><strong>Export Graph CSV</strong> &mdash; Save the graph as a CSV file</li>
                    <li><RefreshCw className={iconClass} /><strong>Rename All Nodes</strong> &mdash; Automatically rename all nodes sequentially</li>
                    <li><ArrowLeftRight className={iconClass} /><strong>Reverse selected edge</strong> &mdash; Swap the start and end of the selected edge (same as <kbd>Ctrl/Cmd+R</kbd>). Needs a selected edge.</li>
                    <li><Link className={iconClass} /><strong>Connect overlapping</strong> &mdash; Joins every pair of controls/nodes that overlap (within 2 units, on the same floor) by exactly one zero-length edge: adds it when missing, removes extra edges between the pair, and makes the kept edge zero-length (keeping its label). Running it again changes nothing. Undo with <kbd>Ctrl/Cmd+Z</kbd>.</li>
                    <li><Trash2 className={iconClass} /><strong>Clear Nodes &amp; Edges</strong> &mdash; Remove all graph elements (with confirmation)</li>
                  </ul>
                <p className="mt-2"><strong>Graph Statistics</strong> &mdash; Counts of nodes, controls and edges at the bottom of the panel. Click the heading to collapse or expand it; the choice is remembered in this browser.</p>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Verification Findings</p>
              <p>After verifying the graph, findings are listed in the panel. Each finding has:</p>
              <ul className="space-y-1 ml-2">
                <li><Crosshair className={iconClass} /><strong>Find on map</strong> &mdash; Navigate to the problematic element on the map</li>
                <li><Trash2 className={iconClass} /><strong>Delete</strong> &mdash; Remove the problematic element from the graph</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Load your venue map (PDF) in Event → Map</li>
                <li>Start by placing nodes at major intersections and decision points</li>
                <li>Connect nodes with edges by clicking and dragging between them</li>
                <li>Add intermediate nodes along corridors where controls might be placed</li>
                <li>Mark one-way passages (stairs, escalators) by selecting edges and pressing &quot;1&quot;</li>
                <li>Set edge properties like stair flags for accurate difficulty calculation</li>
                <li>Set an edge&apos;s length by hand: select the edge, tick <strong>Set length manually</strong> and enter the length in metres. It is used instead of the calculated length (and instead of &quot;ignore length&quot;) in all route lengths and analysis; untick to go back to the calculated length. With edge weights shown, a hand-set length is marked with *.</li>
                <li>Use Ctrl+click on edges to split them and add nodes where needed</li>
                <li>Verify the graph by testing routes in Route Analysis</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">Mouse &amp; Keyboard Actions</p>
              <ul className="space-y-1.5 ml-2">
                <li><strong>Click on map</strong> &mdash; Create a new node at that location</li>
                <li><strong>Click + drag from node</strong> &mdash; Create an edge. Connects to another node if you drag to it, or creates a new end node.</li>
                <li><strong>Ctrl + drag node</strong> &mdash; Move a node to a new location</li>
                <li><strong>Click on node/edge</strong> &mdash; Select it and view its properties</li>
                <li><strong>Ctrl + click on edge</strong> &mdash; Split the edge by inserting a new node at that position</li>
                <li><strong>Ctrl+R</strong> &mdash; Reverse the direction of the selected edge</li>
                <li><strong>Press &quot;1&quot;</strong> &mdash; Toggle the one-way property on the selected edge</li>
                <li><strong>Delete / Backspace</strong> &mdash; Delete the selected node or edge</li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
