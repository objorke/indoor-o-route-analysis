"use client"

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import type { Node } from "@indoor-o-route-analysis/core";
import { usePdfUrl } from "@indoor-o-route-analysis/ui";
import { calculateEventTrafficGenerator, type EdgeTraffic, type NodeTraffic } from "./analysis-logic";
import EventAnalysisPropertiesPanel from "./properties-panel";
import type { EventAnalysisMapViewerHandle } from "./map-viewer";

const EventAnalysisMapViewer = dynamic(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function EventAnalysis() {
  const { selectedEvent, pdfBlobUrl, selectedCourseId } = useAppData();
  const [edgeTraffic, setEdgeTraffic] = useState<Map<string, EdgeTraffic>>(new Map());
  const [nodeTraffic, setNodeTraffic] = useState<Map<string, NodeTraffic>>(new Map());
  
  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const { pdfUrl } = usePdfUrl(activeMap, pdfBlobUrl);
  
  // Visualization State
  const [visualizationMode, setVisualizationMode] = useState<"heatmap" | "thickness" | "both">("both");
  const [metricMode, setMetricMode] = useState<"total" | "collision">("total");
  const [showEdges, setShowEdges] = useState(true);
  const [showNodes, setShowNodes] = useState(true);
  const [showBackgroundMap, setShowBackgroundMap] = useState(true);
  const [isMapMuted, setIsMapMuted] = useState(true);
  
  // Selection State
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<"edge" | "node" | null>(null);
  const [targetCourseId, setTargetCourseId] = useState<string | null>(null);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const mapRef = useRef<EventAnalysisMapViewerHandle>(null);
  
  // Calculate traffic when event changes
  useEffect(() => {
    let cancelled = false;

    async function runAnalysis() {
        if (!selectedEvent) return;
        
        // Note: Analysis logic expects arrays of Nodes/Edges from the event object
        const nodes = (selectedEvent.raceCourses?.[0]?.vertices || []) as Node[];
        const edges = selectedEvent.raceCourses?.[0]?.edges || [];
        const controls = selectedEvent.raceCourses?.[0]?.controls || [];
        
        setIsAnalyzing(true);
        setProgress(0);
        setEdgeTraffic(new Map());
        setNodeTraffic(new Map());

        try {
            const generator = calculateEventTrafficGenerator(selectedEvent, nodes, edges, controls, targetCourseId);

            for await (const update of generator) {
                if (cancelled) break;
                setProgress(update.progress);
                setEdgeTraffic(update.edgeTraffic);
                setNodeTraffic(update.nodeTraffic);
            }
        } catch (error) {
            console.error("Analysis failed", error);
        } finally {
            if (!cancelled) {
                setIsAnalyzing(false);
            }
        }
    }

    runAnalysis();

    return () => {
        cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, targetCourseId]);

  return (
    <div className="flex flex-1 overflow-hidden flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Main View */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          <EventAnalysisMapViewer
            ref={mapRef}
            map={activeMap}
            pdfUrl={pdfUrl}
            edgeTraffic={edgeTraffic}
            nodeTraffic={nodeTraffic}
            visualizationMode={visualizationMode}
            metricMode={metricMode}
            showEdges={showEdges}
            showNodes={showNodes}
            showBackgroundMap={showBackgroundMap}
            isMapMuted={isMapMuted}
            selectedElementId={selectedElementId}
            onElementClick={(id: string, type: "edge" | "node") => {
              setSelectedElementId(id);
              setSelectedElementType(type);
              if (!showNodes && type === "node") {
                // Option: Auto-enable nodes? or just allow selection hidden?
              }
            }}
          />
        </div>

        {/* Properties Panel */}
        <EventAnalysisPropertiesPanel
          targetCourseId={targetCourseId}
          setTargetCourseId={setTargetCourseId}
          visualizationMode={visualizationMode}
          setVisualizationMode={setVisualizationMode}
          metricMode={metricMode}
          setMetricMode={setMetricMode}
          selectedElementId={selectedElementId}
          selectedElementType={selectedElementType}
          edgeTraffic={edgeTraffic}
          nodeTraffic={nodeTraffic}
          onCloseSelection={() => {
            setSelectedElementId(null);
            setSelectedElementType(null);
          }}
          showEdges={showEdges}
          setShowEdges={setShowEdges}
          showNodes={showNodes}
          setShowNodes={setShowNodes}
          showBackgroundMap={showBackgroundMap}
          setShowBackgroundMap={setShowBackgroundMap}
          isMapMuted={isMapMuted}
          setIsMapMuted={setIsMapMuted}
          isAnalyzing={isAnalyzing}
          progress={progress}
          onExportImage={() => {
            const date = selectedEvent?.startTime?.date || new Date().toISOString().split("T")[0];
            const title = selectedEvent?.name || "Event";
            const type = metricMode === "collision" ? "Collision Analysis" : "Traffic Analysis";
            const filename = `${date} ${title} - ${type}`;
            mapRef.current?.exportImage(filename);
          }}
          onExportPdf={() => {
            const date = selectedEvent?.startTime?.date || new Date().toISOString().split("T")[0];
            const title = selectedEvent?.name || "Event";
            const type = metricMode === "collision" ? "Collision Analysis" : "Traffic Analysis";
            const filename = `${date} ${title} - ${type}`;
            mapRef.current?.exportPdf(filename);
          }}
        />
      </div>
    </div>
  );
}

