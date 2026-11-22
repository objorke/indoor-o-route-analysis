"use client"

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Menu,
  Info,
  AlertTriangle,
  Trash2,
  FileUp,
  FileDown,
  MoveHorizontal,
  CheckCircle,
  Crosshair,
  Triangle,
  RefreshCw,
  LineDotRightHorizontal,
  Link,
  Ruler,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { renameAllNodes, mergeRaceCourse, updateRaceCourse, edgeLengthOverride, type ConnectOverlappingResult } from "@indoor-o-route-analysis/core";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getPageIndexForEventPos } from "@/components/map-viewer";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import GraphEditorInfoDialog from "./info-dialog";
import type { GraphFinding } from "./map-viewer";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input, NumericInput } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Checkbox } from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { openJsonFilePicker } from "@/lib/file-picker";

import type { SelectedProperties } from "./map-viewer";
import { notify, confirmAction } from "@indoor-o-route-analysis/ui";


import { FieldHelp } from "@/components/field-help";

/** localStorage key for the Graph Statistics expanded state. */
const STATS_EXPANDED_STORAGE_KEY = "graph-stats-expanded";
/** Toast text after "Connect overlapping". */
function connectOverlappingSummary(r: ConnectOverlappingResult): string {
  if (r.added + r.removed + r.updated === 0) return "Overlapping controls/nodes are already joined by exactly one zero-length edge.";
  const parts = [
    r.added > 0 ? `added ${r.added}` : "",
    r.removed > 0 ? `removed ${r.removed} extra` : "",
    r.updated > 0 ? `made ${r.updated} zero-length` : "",
  ].filter(Boolean);
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} edge(s) between overlapping controls/nodes.`;
}
interface GraphEditorPropertiesPanelProps {
  properties?: SelectedProperties;
  onPropertiesChange?: (properties: SelectedProperties | null) => void;
  showBackgroundMap: boolean;
  onShowBackgroundMapChange: (show: boolean) => void;
  isMapMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;

  showNormalEdges: boolean;
  showIgnoreEdges: boolean;
  onShowIgnoreEdgesChange: (show: boolean) => void;
  onShowNormalEdgesChange: (show: boolean) => void;
  highlightDeadEnds: boolean;
  onHighlightDeadEndsChange: (highlight: boolean) => void;
  showEdgeWeights: boolean;
  onShowEdgeWeightsChange: (show: boolean) => void;
  onVerifyGraph: () => void;
  /** The validation panel is shown (Verify graph toggles it). */
  isVerifyPanelOpen?: boolean;
  findings: GraphFinding[] | null;
  onSelectFinding: (finding: GraphFinding) => void;
  onDeleteFinding: (finding: GraphFinding) => void;
  onClearGraph: () => void;
  /** Exactly one zero-length edge between each pair of overlapping controls/nodes; null without a graph view. */
  onConnectOverlapping: () => ConnectOverlappingResult | null;
  /** Reverse the direction of the selected edge (same as Ctrl/Cmd+R); false without a selected edge. */
  onReverseSelectedEdge: () => boolean;
}

export default function GraphEditorPropertiesPanel({
  properties,
  onPropertiesChange,
  isMapMuted = false,
  onMuteChange,
  showBackgroundMap,
  showIgnoreEdges,
  onShowIgnoreEdgesChange,
  onShowBackgroundMapChange,
  showNormalEdges,
  onShowNormalEdgesChange,
  highlightDeadEnds,
  onHighlightDeadEndsChange,
  showEdgeWeights,
  onShowEdgeWeightsChange,
  onVerifyGraph,
  isVerifyPanelOpen = false,
  findings = null,
  onSelectFinding,
  onDeleteFinding,
  onClearGraph,
  onConnectOverlapping,
  onReverseSelectedEdge,
}: GraphEditorPropertiesPanelProps) {
  // Graph Statistics expanded/collapsed: a per-browser convenience, remembered in localStorage
  const [statsExpanded, setStatsExpandedState] = useState<boolean>(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem(STATS_EXPANDED_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const setStatsExpanded = (expanded: boolean) => {
    setStatsExpandedState(expanded);
    try {
      localStorage.setItem(STATS_EXPANDED_STORAGE_KEY, String(expanded));
    } catch {
      // storage unavailable: keep the in-memory value
    }
  };
  const { selectedEvent, updateEvent } = useAppData();
  const isEdgeProperties =
    properties?.type === "edge" && typeof properties?.from === "string" && typeof properties?.to === "string";
  const isNodeProperties = properties?.type === "node";
  const isControlProperties = properties?.type === "control";

  const handleUpdate = (updates: Record<string, unknown>) => {
    if (onPropertiesChange && properties) {
      onPropertiesChange({ ...properties, ...updates } as SelectedProperties);
    }
  };

  // Helper function to download file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export graph only as JSON
  const exportGraphJSON = useCallback(() => {
    if (!selectedEvent) return;

    const raceCourse = selectedEvent.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const vertices = raceCourse?.vertices || [];
    const edges = raceCourse?.edges || [];

    // Combine controls and vertices into a single list of nodes
    const combinedNodes = [
      ...controls.map((c) => ({
        id: c.id,
        x: c.mapPosition.x,
        y: c.mapPosition.y,
        type: "control",
      })),
      ...vertices.map((v) => ({
        id: v.id,
        x: v.x,
        y: v.y,
        type: "node",
      })),
    ];

    const graphData = {
      nodes: combinedNodes,
      edges: edges,
    };

    const json = JSON.stringify(graphData, null, 2);
    downloadFile(
      json,
      `${(selectedEvent.name || "graph").replace(/\s+/g, "_")}_graph_${selectedEvent.id}.json`,
      "application/json",
    );
  }, [selectedEvent]);

  // Export graph as CSV (from,to,weight,label)
  const exportGraphCSV = useCallback(() => {
    if (!selectedEvent) return;

    const raceCourse = selectedEvent.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const vertices = raceCourse?.vertices || [];
    const edges = raceCourse?.edges || [];

    // Build a coordinate lookup for all nodes
    const nodeMap = new Map<string, { x: number; y: number }>();
    controls.forEach((c) => {
      nodeMap.set(c.id, c.mapPosition);
    });
    vertices.forEach((v) => {
      nodeMap.set(v.id, { x: v.x, y: v.y });
    });

    const rows: string[] = ["from,to,weight,label"];

    for (const edge of edges) {
      let weight = 0;
      if (!edge.ignoreLength) {
        const start = nodeMap.get(edge.from);
        const end = nodeMap.get(edge.to);
        if (start && end) {
          weight = Math.hypot(end.x - start.x, end.y - start.y);
        }
      }

      const weightStr = weight.toFixed(1);
      const escapeCSV = (s: string) => {
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      // Forward direction
      rows.push(`${escapeCSV(edge.from)},${escapeCSV(edge.to)},${weightStr},${escapeCSV(edge.label || "")}`);

      // Reverse direction for bidirectional edges
      if (!edge.oneWay) {
        rows.push(`${escapeCSV(edge.to)},${escapeCSV(edge.from)},${weightStr},${escapeCSV(edge.reverseLabel || edge.label || "")}`);
      }
    }

    const csv = rows.join("\n");
    downloadFile(
      csv,
      `${(selectedEvent.name || "graph").replace(/\s+/g, "_")}_graph_${selectedEvent.id}.csv`,
      "text/csv",
    );
  }, [selectedEvent]);

  const handleRenameAllNodes = useCallback(async () => {
    if (!selectedEvent) return;
    const raceCourse = selectedEvent.raceCourses?.[0];
    if (!raceCourse) return;

    const vertexCount = (raceCourse.vertices ?? []).length;
    const edgeCount = (raceCourse.edges ?? []).length;
    if (vertexCount === 0 && edgeCount === 0) return;

    const ok = await confirmAction(`Rename all ${vertexCount} nodes starting from ID 1000? You can undo this with Ctrl/Cmd+Z.`, {
      title: "Renumber nodes",
      confirmLabel: "Renumber",
    });
    if (!ok) return;

    updateEvent(selectedEvent.id, (e) => updateRaceCourse(e, (rc) => ({ ...rc, ...renameAllNodes(rc) })), undefined, {
      label: "Renumber nodes",
    });
  }, [selectedEvent, updateEvent]);

  const importGraphJSON = useCallback(async () => {
    if (!selectedEvent) return;

    try {
      const handle = await openJsonFilePicker();

      if (handle) {
        const file = await handle.getFile();
        const text = await file.text();
        const graphData = JSON.parse(text);

        if (
          !graphData.nodes ||
          !Array.isArray(graphData.nodes) ||
          !graphData.edges ||
          !Array.isArray(graphData.edges)
        ) {
          notify("Invalid graph JSON format. Expected 'nodes' and 'edges' arrays.", { kind: "error" });
          return;
        }

        // Extract vertices (type === 'node')
        const importedVertices = graphData.nodes
          .filter((n: Record<string, unknown>) => n.type === "node")
          .map((n: Record<string, unknown>) => ({
            id: n.id,
            x: n.x,
            y: n.y,
          }));

        const importedEdges = graphData.edges;

        const currentRaceCourses = selectedEvent.raceCourses || [];
        if (currentRaceCourses.length === 0) {
          notify("No race course found to import graph into.");
          return;
        }

        // Imports into the first race course, as exported
        await updateEvent(selectedEvent.id, (e) =>
          mergeRaceCourse(e, { vertices: importedVertices, edges: importedEdges }),
          undefined,
          { label: "Import graph" },
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Failed to import graph:", err);
        notify("Failed to import graph.", { kind: "error" });
      }
    }
  }, [selectedEvent, updateEvent]);

  const stats = useMemo(() => {
    if (!selectedEvent) return null;
    const raceCourse = selectedEvent.raceCourses?.[0];
    if (!raceCourse) return null;

    const { controls = [], vertices = [], edges = [] } = raceCourse;

    // Create map for node coordinates
    const nodeMap = new Map<string, { x: number; y: number }>();
    controls.forEach((c) => {
      nodeMap.set(c.id, c.mapPosition);
    });
    vertices.forEach((v) => {
      nodeMap.set(v.id, { x: v.x, y: v.y });
    });

    let totalLength = 0;
    let ignoreLengthCount = 0;
    let oneWayCount = 0;

    edges.forEach((edge) => {
      if (edge.ignoreLength) {
        ignoreLengthCount++;
      } else {
        const start = nodeMap.get(edge.from);
        const end = nodeMap.get(edge.to);
        if (start && end) {
          const dx = start.x - end.x;
          const dy = start.y - end.y;
          totalLength += Math.hypot(dx, dy);
        }
      }

      if (edge.oneWay) {
        oneWayCount++;
      }
    });

    return {
      nodeCount: vertices.length,
      controlCount: controls.length,
      edgeCount: edges.length,
      oneWayCount,
      ignoreLengthCount,
      totalLength,
    };
  }, [selectedEvent]);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [selectedFindingIndex, setSelectedFindingIndex] = useState<number | null>(null);

  // Reset selection when findings change
  useEffect(() => {
    setSelectedFindingIndex(null);
  }, [findings]);

  const renderToolbar = () => {
    return (
    <div className="flex items-center justify-between px-2 border-b border-border bg-card h-8">
      <div className="flex items-center gap-1">
        <MapVisibilityToggle
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={onShowBackgroundMapChange}
          isMapMuted={isMapMuted}
          onMuteChange={onMuteChange}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showNormalEdges ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onShowNormalEdgesChange(!showNormalEdges)}
              >
                <MoveHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showNormalEdges 
                ? "Hide the normal graph edges from the view." 
                : "Show all normal graph edges on the map."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showIgnoreEdges ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onShowIgnoreEdgesChange(!showIgnoreEdges)}
              >
                <Triangle className="h-4 w-4" strokeDasharray="3 2" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showIgnoreEdges 
                ? "Hide the edges that have 'ignore length' enabled." 
                : "Show edges that have 'ignore length' enabled (e.g., stairs)."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isVerifyPanelOpen ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={onVerifyGraph}
                aria-label="Verify graph"
                aria-pressed={isVerifyPanelOpen}
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isVerifyPanelOpen
                ? "Hide the validation findings"
                : "Verify the graph for errors such as disconnected nodes, invalid edges or items outside the map, and show the findings"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={highlightDeadEnds ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onHighlightDeadEndsChange(!highlightDeadEnds)}
              >
                <LineDotRightHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {highlightDeadEnds
                ? "Stop highlighting dead-end edges."
                : "Highlight dead-end paths (edges leading to nodes with no onward route)."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showEdgeWeights ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onShowEdgeWeightsChange(!showEdgeWeights)}
              >
                <Ruler className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showEdgeWeights
                ? "Hide edge weight (distance) labels."
                : "Show edge weight (distance) labels next to each edge."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowInfoDialog(true)}
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open the information guide for Graph view features.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Hamburger menu for export */}
        <div className="relative">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open the menu for import, export, and graph management options.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {showExportMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50 p-1"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <button
                onClick={() => {
                  importGraphJSON();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <FileUp className="mr-2 h-3 w-3" />
                Import Graph JSON
              </button>
              <button
                onClick={() => {
                  exportGraphJSON();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <FileDown className="mr-2 h-3 w-3" />
                Export Graph JSON
              </button>
              <button
                onClick={() => {
                  exportGraphCSV();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <FileDown className="mr-2 h-3 w-3" />
                Export Graph CSV
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  handleRenameAllNodes();
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Rename All Nodes
              </button>
              <button
                type="button"
                disabled={properties?.type !== "edge"}
                onClick={() => {
                  onReverseSelectedEdge();
                  setShowExportMenu(false);
                }}
                title={properties?.type === "edge" ? "Swap the start and end of the selected edge (Ctrl/Cmd+R)" : "Select an edge first"}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm disabled:opacity-50 disabled:pointer-events-none"
              >
                <ArrowLeftRight className="mr-2 h-3 w-3" />
                Reverse selected edge
                <span className="ml-auto pl-2 text-muted-foreground">Ctrl+R</span>
              </button>
              <button
                onClick={() => {
                  const r = onConnectOverlapping();
                  if (r) notify(connectOverlappingSummary(r));
                  setShowExportMenu(false);
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm"
              >
                <Link className="mr-2 h-3 w-3" />
                Connect overlapping
              </button>
              <button
                onClick={async () => {
                  setShowExportMenu(false);
                  const ok = await confirmAction("Clear all nodes and edges? You can undo this with Ctrl/Cmd+Z.", {
                    title: "Clear graph",
                    confirmLabel: "Clear",
                    destructive: true,
                  });
                  if (ok) onClearGraph();
                }}
                className="flex w-full items-center px-2 py-2 text-xs hover:bg-destructive hover:text-destructive-foreground text-destructive rounded-sm"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Clear Nodes & Edges
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      {renderToolbar()}
      {/* Properties Section - Scrollable */}
      <div className="flex-1 overflow-auto p-6 pb-0">
        {/* Node Properties */}
        {isNodeProperties && properties?.type === "node" && (() => {
          const nodeProps = properties;
          const mapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
          const pos = { x: nodeProps.x ?? 0, y: nodeProps.y ?? 0 };
          const pageIndex = getPageIndexForEventPos(pos, mapData);
          const isMultiPage = mapData?.pageTransformMode === "manual" && (mapData?.pageCount ?? 1) > 1;
          return (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{"Node Properties"}</h3>
              <div>
                <Label className="text-xs text-muted-foreground">{"ID"}</Label>
                <Input type="text" disabled value={nodeProps.id || ""} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{"X (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof nodeProps.x === "number" ? nodeProps.x.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{"Y (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof nodeProps.y === "number" ? nodeProps.y.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
              </div>
              {isMultiPage && (
                <div>
                  <Label className="text-xs text-muted-foreground">{"Page"}</Label>
                  <Input type="text" disabled value={String(pageIndex + 1)} className="mt-1" />
                </div>
              )}
            </div>
          );
        })()}

        {/* Control Properties */}
        {isControlProperties && properties?.type === "control" && (() => {
          const ctrlProps = properties;
          const mapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
          const pos = { x: ctrlProps.mapPosition?.x ?? 0, y: ctrlProps.mapPosition?.y ?? 0 };
          const pageIndex = getPageIndexForEventPos(pos, mapData);
          const isMultiPage = mapData?.pageTransformMode === "manual" && (mapData?.pageCount ?? 1) > 1;
          return (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{"Control Properties"}</h3>
              <div>
                <Label className="text-xs text-muted-foreground">{"ID"}</Label>
                <Input type="text" disabled value={ctrlProps.id || ""} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{"X (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof ctrlProps.mapPosition?.x === "number" ? ctrlProps.mapPosition.x.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{"Y (mm)"}</Label>
                  <Input
                    type="text"
                    disabled
                    value={typeof ctrlProps.mapPosition?.y === "number" ? ctrlProps.mapPosition.y.toFixed(2) : ""}
                    className="mt-1"
                  />
                </div>
              </div>
              {isMultiPage && (
                <div>
                  <Label className="text-xs text-muted-foreground">{"Page"}</Label>
                  <Input type="text" disabled value={String(pageIndex + 1)} className="mt-1" />
                </div>
              )}
            </div>
          );
        })()}

        {/* Edge Properties */}
        {isEdgeProperties && properties?.type === "edge" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{"Edge Properties"}</h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">{"From"}</Label>
                <Input
                  type="text"
                  disabled
                  value={properties.from || ""}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{"To"}</Label>
                <Input
                  type="text"
                  disabled
                  value={properties.to || ""}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edge-label" className="text-xs text-muted-foreground">
                {"Label"}
              </Label>
              <Input
                id="edge-label"
                type="text"
                placeholder="Enter label"
                value={properties.label || ""}
                onChange={(e) => handleUpdate({ label: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edge-reverse-label" className="text-xs text-muted-foreground">
                {"Reverse Label"}
              </Label>
              <Input
                id="edge-reverse-label"
                type="text"
                placeholder="Enter reverse label"
                value={properties.reverseLabel || ""}
                onChange={(e) => handleUpdate({ reverseLabel: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edge-oneway"
                checked={properties.oneWay || false}
                onCheckedChange={(checked) => handleUpdate({ oneWay: checked })}
                className="border-primary/40 checked:bg-primary checked:border-primary h-5 w-5"
              />
              <Label htmlFor="edge-oneway" className="text-xs text-muted-foreground cursor-pointer">
                {"One-way-passage"}
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edge-map-segment-transition"
                checked={properties.ignoreLength || false}
                onCheckedChange={(checked) => handleUpdate({ ignoreLength: checked })}
                className="border-primary/40 checked:bg-primary checked:border-primary h-5 w-5"
              />
              <Label htmlFor="edge-map-segment-transition" className="text-xs text-muted-foreground cursor-pointer">
                {"Ignore Length"}
              </Label>
              <FieldHelp label="About Ignore Length">
                The edge counts as 0 m in route lengths, and is drawn dashed. Use it where the distance on the map
                doesn&apos;t match the distance run, typically a map-segment transition: a stair between two floors
                drawn in different places on the map, e.g. from stair A on floor 1 (left page) to stair A on floor 2
                (right page). Also for joining two overlapping controls/nodes.
              </FieldHelp>
            </div>

            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edge-length-override"
                  checked={edgeLengthOverride(properties) !== undefined}
                  onCheckedChange={(checked) =>
                    handleUpdate({
                      // Start from the calculated length, rounded to 0.1 m
                      length: checked
                        ? Math.round((properties.ignoreLength ? 0 : properties.edgeLength || 0) * 10) / 10
                        : undefined,
                    })
                  }
                  className="border-primary/40 checked:bg-primary checked:border-primary h-5 w-5"
                />
                <Label htmlFor="edge-length-override" className="text-xs text-muted-foreground cursor-pointer">
                  {"Set length manually"}
                </Label>
                <FieldHelp label="About Set length manually">
                  Enter the real length in metres; it is used instead of the length calculated from the map (and
                  instead of Ignore Length) in all route lengths and analysis. E.g. a stair between floors is 8 m to
                  run but drawn as a jump between pages, or a corridor detour that is drawn as a straight line. Untick
                  to go back to the calculated length.
                </FieldHelp>
              </div>
              {edgeLengthOverride(properties) !== undefined && (
                <div className="flex items-center gap-2">
                  <NumericInput
                    id="edge-length-value"
                    aria-label="Edge length (m)"
                    className="h-8 w-28"
                    min={0}
                    decimals={1}
                    value={edgeLengthOverride(properties) ?? 0}
                    onCommit={(v) => handleUpdate({ length: v })}
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="edge-length" className="text-xs text-muted-foreground">
                {"Actual Length"}
              </Label>
              <Input
                id="edge-length"
                type="text"
                disabled
                // The length used by the route analysis: the hand-set length, else the calculated one
                value={
                  edgeLengthOverride(properties) !== undefined
                    ? `${(edgeLengthOverride(properties) ?? 0).toFixed(1)} m (set manually)`
                    : properties.ignoreLength
                      ? "0 m"
                      : `${(properties.edgeLength || 0).toFixed(1)} m`
                }
                className="mt-1"
              />
            </div>

          </div>
        )}

        {/* No Selection - Show Help */}
        {!properties && !findings && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <p>Select a node or edge to view properties</p>
          </div>
        )}

        {/* Verified - No Issues */}
        {findings && findings.length === 0 && (
          <div className="mt-6 border-t border-border pt-4 pb-6">
            <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 text-green-600 border border-green-500/20">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Graph verified. No issues.</span>
            </div>
          </div>
        )}

        {/* Findings Section */}
        {findings && findings.length > 0 && (
          <div className="mt-6 border-t border-border pt-4 pb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Validation Findings ({findings.length})</h3>
            <div className="space-y-2">
              {findings.map((finding, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 p-2 rounded text-xs border group transition-colors cursor-pointer ${
                    selectedFindingIndex === idx
                      ? "bg-purple-500/20 border-purple-500/50"
                      : "bg-muted/50 border-border hover:border-primary/50"
                  }`}
                  onClick={() => {
                    setSelectedFindingIndex(idx);
                    onSelectFinding(finding);
                  }}
                >
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-medium text-foreground">{finding.type}</div>
                    <div className="text-muted-foreground leading-snug break-words">{finding.message}</div>
                  </div>
                  <div className="flex flex-col gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    {finding.elementId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-muted hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFindingIndex(idx);
                          onSelectFinding(finding);
                        }}
                        title="Find on map"
                      >
                        <Crosshair className="h-3 w-3" />
                      </Button>
                    )}
                    {finding.elementId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFinding(finding);
                          setSelectedFindingIndex(null);
                        }}
                        title="Delete element"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {stats && (
        <div className="border-t border-border p-4 bg-muted/20 text-xs space-y-2">
          <button
            type="button"
            className="flex w-full items-center gap-1 text-left font-semibold text-foreground"
            onClick={() => setStatsExpanded(!statsExpanded)}
            aria-expanded={statsExpanded}
            title={statsExpanded ? "Collapse graph statistics" : "Expand graph statistics"}
          >
            {statsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <h3>Graph Statistics</h3>
          </button>
          {statsExpanded && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <span title="Number of nodes and controls in the graph">Graph order:</span>
            <span className="text-foreground text-right">{stats.nodeCount+stats.controlCount}</span>

            <span title="Number of edges in the graph">Graph size:</span>
            <span className="text-foreground text-right">{stats.edgeCount}</span>

            <span>Nodes:</span>
            <span className="text-foreground text-right">{stats.nodeCount}</span>

            <span>Controls:</span>
            <span className="text-foreground text-right">{stats.controlCount}</span>

            <span>One-way:</span>
            <span className="text-foreground text-right">{stats.oneWayCount}</span>

            <span>Ignore Length:</span>
            <span className="text-foreground text-right">{stats.ignoreLengthCount}</span>

            <span className="font-medium text-foreground pt-1 border-t border-border/50">Total Length:</span>
            <span className="font-medium text-foreground text-right pt-1 border-t border-border/50">
              {stats.totalLength.toFixed(0)} m
            </span>
          </div>
          )}
        </div>
      )}

      {/* Info Dialog */}
      <GraphEditorInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
