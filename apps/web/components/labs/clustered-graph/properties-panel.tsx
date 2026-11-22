"use client"

import { useCallback, useEffect, useState } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { ScrollArea } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import {
  computeClusteredGraph,
  createLevelLookup,
  assignClusterColors,
  computeClusterGraphEdges,
  clusterGraphToMermaid,
} from "@indoor-o-route-analysis/core";
import { downloadFile } from "@/components/shared";
import { Waypoints, Download } from "lucide-react";

export interface ClusteredGraphState {
  clusterOf: Record<string, string>;
  clusterColors: Record<string, string>;
}

interface ClusteredGraphPanelProps {
  onClusteredGraphChange?: (state: ClusteredGraphState | null) => void;
}

/**
 * "Clustered Graph" lab: runs same-floor clustering (the same Union-Find
 * technique used by the human-route search and the alternative-path
 * enumerator, see graph-clusters.ts) over the whole currently-loaded
 * course's graph and colors every node/edge by its cluster on the map, so
 * you can see at a glance which corridors are mutually reachable without
 * stairs.
 */
export default function ClusteredGraphPanel({ onClusteredGraphChange }: ClusteredGraphPanelProps) {
  const { selectedEvent } = useAppData();
  const raceCourse = selectedEvent?.raceCourses?.[0];
  const edges = raceCourse?.edges ?? [];

  const [clusters, setClusters] = useState<string[] | null>(null);
  const [clusterOf, setClusterOf] = useState<Record<string, string>>({});
  const [clusterColors, setClusterColors] = useState<Record<string, string>>({});

  const runClustering = useCallback(() => {
    const levelOf = createLevelLookup({
      nodes: raceCourse?.vertices ?? [],
      controls: raceCourse?.controls ?? [],
      polygons: raceCourse?.polygons ?? [],
    });
    const clustered = computeClusteredGraph(edges, levelOf);
    const colors = assignClusterColors(clustered.clusters);
    setClusters(clustered.clusters);
    setClusterOf(clustered.clusterOf);
    setClusterColors(colors);
    onClusteredGraphChange?.({ clusterOf: clustered.clusterOf, clusterColors: colors });
  }, [edges, raceCourse, onClusteredGraphChange]);

  // Clear the overlay when this lab unmounts (switching to another lab).
  useEffect(() => () => onClusteredGraphChange?.(null), [onClusteredGraphChange]);

  const handleExportMermaid = () => {
    if (!clusters) return;
    const clusterEdges = computeClusterGraphEdges(edges, clusterOf);
    const mermaid = clusterGraphToMermaid(clusters, clusterEdges);
    downloadFile(mermaid, "clustered-graph.mmd", "text/plain");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border space-y-3">
        <p className="text-sm text-muted-foreground">
          Groups the graph into same-floor regions (two-way edges within one floor; nodes on
          different floors and one-way edges never merge) and colors the map accordingly.
        </p>
        <Button onClick={runClustering} className="w-full gap-2" disabled={edges.length === 0}>
          <Waypoints className="w-4 h-4" /> Run Clustering
        </Button>
        {edges.length === 0 && (
          <p className="text-sm text-destructive">No graph edges found. Please create a graph in the Graph view first.</p>
        )}
      </div>

      {clusters && (
        <>
          <div className="px-4 pt-3 text-sm font-medium">{clusters.length} cluster{clusters.length === 1 ? "" : "s"}</div>
          <ScrollArea className="flex-1 w-full">
            <div className="grid grid-cols-1 gap-1.5 p-4 pt-2">
              {clusters.map((cluster) => (
                <div key={cluster} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: clusterColors[cluster] }}
                  />
                  <span className="truncate">{cluster}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-3 border-t border-border">
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={handleExportMermaid}>
              <Download className="w-3.5 h-3.5" /> Mermaid (.mmd)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
