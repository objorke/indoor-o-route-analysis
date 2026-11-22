"use client"

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic"
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import { usePdfUrl } from "@indoor-o-route-analysis/ui";
import GraphEditorPropertiesPanel from "./properties-panel"
import type { GraphFinding } from "./map-viewer";

const GraphEditorMapViewer = dynamic(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function GraphEditor() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedProperties, setSelectedProperties] = useState<any>(null);
  const [mapScale, setMapScale] = useState<number>(1);
  const [showBackgroundMap, setShowBackgroundMap] = useState(true);
  const [isMapMuted, setIsMapMuted] = useState(false);
  const [showNormalEdges, setShowNormalEdges] = useState(true);
  const [showIgnoreEdges, setShowIgnoreEdges] = useState(true);
  const [highlightDeadEnds, setHighlightDeadEnds] = useState(false);
  const [showEdgeWeights, setShowEdgeWeights] = useState(false);
  const [findings, setFindings] = useState<GraphFinding[] | null>(null);
  const { selectedEvent, pdfBlobUrl, selectedCourseId } = useAppData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapViewerRef = useRef<any>(null);

  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const { pdfUrl, isLoading: _isLoading } = usePdfUrl(activeMap, pdfBlobUrl);

  const runVerifyGraph = () => {
    if (mapViewerRef.current?.verifyGraph) {
      const results = mapViewerRef.current.verifyGraph();
      setFindings(results);
    }
  };

  /** The Verify graph button shows the validation panel (verifying now) or hides it again. */
  const handleVerifyGraph = () => {
    if (findings !== null) setFindings(null);
    else runVerifyGraph();
  };

  const handleSelectFinding = (finding: GraphFinding) => {
    if (finding.elementId && finding.elementType && mapViewerRef.current?.selectItem) {
      mapViewerRef.current.selectItem(finding.elementType, finding.elementId);
    }
  };

  const handleDeleteFinding = (finding: GraphFinding) => {
    if (finding.elementId && finding.elementType && mapViewerRef.current?.deleteItem) {
      mapViewerRef.current.deleteItem(finding.elementType, finding.elementId);
      // Wait a bit for state update then re-verify?
      // Or just clear finding?
      // Re-verifying immediately might run on stale state if state update is async.
      // But verifyGraph accesses refs which should be up to date after render.
      // We can use setTimeout.
      setTimeout(() => {
        runVerifyGraph();
      }, 100);
    }
  };

  // Update map scale when map changes
  useEffect(() => {
    if (activeMap?.scale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state from context
      setMapScale(activeMap.scale);
    }
  }, [activeMap]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main View */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        <GraphEditorMapViewer
          ref={mapViewerRef}
          map={activeMap}
          pdfUrl={pdfUrl}
          scale={mapScale}
          onPropertiesChange={setSelectedProperties}
          selectedProperties={selectedProperties}
          showBackgroundMap={showBackgroundMap}
          backgroundOpacity={isMapMuted ? 0.5 : 1}
          showNormalEdges={showNormalEdges}
          showIgnoreEdges={showIgnoreEdges}
          highlightDeadEnds={highlightDeadEnds}
          showEdgeWeights={showEdgeWeights}
        />

        {/* Properties Panel */}
        <GraphEditorPropertiesPanel
          properties={selectedProperties}
          onPropertiesChange={setSelectedProperties}
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={setShowBackgroundMap}
          isMapMuted={isMapMuted}
          onMuteChange={setIsMapMuted}
          showNormalEdges={showNormalEdges}
          showIgnoreEdges={showIgnoreEdges}
          onShowIgnoreEdgesChange={setShowIgnoreEdges}
          onShowNormalEdgesChange={setShowNormalEdges}
          highlightDeadEnds={highlightDeadEnds}
          onHighlightDeadEndsChange={setHighlightDeadEnds}
          showEdgeWeights={showEdgeWeights}
          onShowEdgeWeightsChange={setShowEdgeWeights}
          onVerifyGraph={handleVerifyGraph}
          isVerifyPanelOpen={findings !== null}
          onClearGraph={() => mapViewerRef.current?.clearGraph?.()}
          onConnectOverlapping={() => mapViewerRef.current?.connectOverlapping?.() ?? null}
          onReverseSelectedEdge={() => mapViewerRef.current?.reverseSelectedEdge?.() ?? false}
          findings={findings}
          onSelectFinding={handleSelectFinding}
          onDeleteFinding={handleDeleteFinding}
        />
      </div>
    </div>
  );
}
