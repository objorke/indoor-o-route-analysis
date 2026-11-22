"use client";

import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from "react";
import MapViewer, { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels, multiPagePixelsToEvent } from "@/components/map-viewer";
import { useAppData } from "@indoor-o-route-analysis/ui";
import type { Node, Edge, Control } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import {
  GRAPH_EDGE_COLOR,
  GRAPH_EDGE_THICKNESS,
  GRAPH_NODE_RADIUS,
  GRAPH_DEAD_END_COLOR,
} from "@indoor-o-route-analysis/core";
import { findDeadEndEdgeIds, edgeKey, removeControl, mergeRaceCourse, updateRaceCourse, verifyGraph as verifyGraphOf, connectOverlapping, edgeLengthOverride, type ConnectOverlappingResult, type GraphFinding } from "@indoor-o-route-analysis/core";

/** Properties of a selected graph element (node, edge, or control). */
export type SelectedNodeProperties = Node & { type: "node" };
export type SelectedEdgeProperties = Edge & { type: "edge"; edgeLength?: number };
export type SelectedControlProperties = Omit<Control, "type"> & { type: "control" };
export type SelectedProperties = SelectedNodeProperties | SelectedEdgeProperties | SelectedControlProperties;

export type { GraphFinding } from "@indoor-o-route-analysis/core";

interface GraphEditorMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  scale?: number;
  onPropertiesChange?: (properties: SelectedProperties | null) => void;
  selectedProperties?: SelectedProperties;
  showBackgroundMap: boolean;
  backgroundOpacity?: number;
  showNormalEdges: boolean;
  showIgnoreEdges: boolean;
  highlightDeadEnds: boolean;
  showEdgeWeights: boolean;
}

export interface GraphEditorMapViewerHandle {
  verifyGraph: () => GraphFinding[];
  selectItem: (type: "node" | "edge" | "control", id: string) => void;
  deleteItem: (type: "node" | "edge" | "control", id: string) => void;
  clearGraph: () => void;
  connectOverlapping: () => ConnectOverlappingResult;
  /** Reverse the selected edge's direction; false when no edge is selected. */
  reverseSelectedEdge: () => boolean;
}

const GraphEditorMapViewer = forwardRef<GraphEditorMapViewerHandle, GraphEditorMapViewerProps>(
  (
    {
      map,
      pdfUrl,
      scale: _scale = 1,
      onPropertiesChange,
      selectedProperties,
      showBackgroundMap,
      backgroundOpacity = 1,
      showNormalEdges,
      showIgnoreEdges,
      highlightDeadEnds,
      showEdgeWeights,
    },
    ref,
  ) => {
    // Color constant for edges and nodes
    const EDGE_COLOR = GRAPH_EDGE_COLOR;

    const { selectedEvent, updateEvent } = useAppData();
    const clickedEdgeRef = useRef<string | null>(null);
    const clickedNodeRef = useRef<string | null>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    // Drop selections whose node/edge no longer exists (e.g. after undo)
    useEffect(() => {
      if (selectedNodeId && !nodes.some((n) => n.id === selectedNodeId)) setSelectedNodeId(null);
      if (selectedEdgeId && !edges.some((e) => edgeKey(e) === selectedEdgeId)) setSelectedEdgeId(null);
    }, [nodes, edges, selectedNodeId, selectedEdgeId]);
    const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
    const [pointerEdgeId, setPointerEdgeId] = useState<string | null>(null);
    const [pointerDown, setPointerDown] = useState<{ x: number; y: number } | null>(null);
    const [didDrag, setDidDrag] = useState(false);
    const [pointerNodeId, setPointerNodeId] = useState<string | null>(null);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [isCreatingEdge, setIsCreatingEdge] = useState(false);
    const [edgeStartNodeId, setEdgeStartNodeId] = useState<string | null>(null);
    const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const controllerRef = useRef<MapViewerController | null>(null);
    const lastStateRef = useRef<MapViewerState | null>(null);
    const [cursor, setCursor] = useState("crosshair");

    const updateRaceCourseGraph = useCallback(
      (updates: { nodes?: Node[]; edges?: Edge[]; controls?: Control[] }) => {
        if (!selectedEvent?.raceCourses?.length) return;
        // Merge into the latest event so other fields (courses, maps, …) edited meanwhile are kept
        updateEvent(selectedEvent.id, (e) =>
          mergeRaceCourse(e, {
            ...(updates.nodes ? { vertices: updates.nodes } : {}),
            ...(updates.edges ? { edges: updates.edges } : {}),
            ...(updates.controls ? { controls: updates.controls } : {}),
          }),
          undefined,
          { label: "Edit graph" },
        );
      },
      [selectedEvent, updateEvent],
    );

    const nodeRadius = GRAPH_NODE_RADIUS;

    // Compute dead-end edge IDs for highlighting
    const deadEndEdgeIds = useMemo(() => {
      if (!highlightDeadEnds) return new Set<string>();
      const controls = selectedEvent?.raceCourses?.[0]?.controls ?? [];
      const controlIds = controls.map((c) => c.id);
      const nodeIds = [...nodes.map((n) => n.id), ...controlIds];
      return findDeadEndEdgeIds(edges, nodeIds);
    }, [highlightDeadEnds, edges, nodes, selectedEvent]);

    /** Return the next unique integer ID (≥1000) that doesn't collide with any existing node or edge ID. */
    const nextId = (existingIds: string[]): string => {
      let max = 999;
      for (const id of existingIds) {
        const n = parseInt(id, 10);
        if (!isNaN(n) && n > max) max = n;
      }
      return String(max + 1);
    };

    const nextNodeId = (currentNodes: Node[]): string => {
      const allIds = currentNodes.map((n) => n.id);
      return nextId(allIds);
    };

    const toPixels = (_state: MapViewerState, p: { x: number; y: number }) =>
      eventPosToMultiPagePixels(p, map, _state.pixelsPerMM);

    const toEvent = (_state: MapViewerState, p: { x: number; y: number }) =>
      multiPagePixelsToEvent(p, map, _state.pixelsPerMM);

    // Helper to get global MM coordinates for any item
    const getGlobalMM = (item: Node | Control, _state: MapViewerState) => {
      if ("mapPosition" in item && item.mapPosition) {
        return { x: item.mapPosition.x, y: item.mapPosition.y };
      }
      if ("x" in item && typeof item.x === "number" && "y" in item && typeof item.y === "number") {
        return { x: item.x, y: item.y };
      }
      throw new Error("Item has no mapPosition");
    };

    type GraphNode = {
      id: string;
      x: number;
      y: number;
      type: "node" | "control";
      data: Node | Control;
    };

    const getGraphNodes = (state: MapViewerState) => {
      const nodesMap = new Map<string, GraphNode>();

      nodes.forEach((n) => {
        const globalMM = getGlobalMM(n, state);
        const px = eventPosToMultiPagePixels(globalMM, map, state.pixelsPerMM);
        nodesMap.set(n.id, { id: n.id, x: px.x, y: px.y, type: "node", data: n });
      });

      const controls = selectedEvent?.raceCourses?.[0]?.controls ?? [];

      controls.forEach((c) => {
        const globalMM = getGlobalMM(c, state);
        const px = eventPosToMultiPagePixels(globalMM, map, state.pixelsPerMM);
        nodesMap.set(c.id, { id: c.id, x: px.x, y: px.y, type: "control", data: c });
      });
      return nodesMap;
    };

    const getDistToEdge = (edge: Edge, x: number, y: number, graphNodes: Map<string, GraphNode>) => {
      const fromNode = graphNodes.get(edge.from);
      const toNode = graphNodes.get(edge.to);

      if (!fromNode || !toNode) return Infinity;

      const x1 = fromNode.x;
      const y1 = fromNode.y;
      const x2 = toNode.x;
      const y2 = toNode.y;

      const edgeDx = x2 - x1;
      const edgeDy = y2 - y1;
      const edgeDist = Math.hypot(edgeDx, edgeDy);
      if (edgeDist === 0) return Math.hypot(x - x1, y - y1);

      const t = Math.max(0, Math.min(1, ((x - x1) * edgeDx + (y - y1) * edgeDy) / (edgeDist * edgeDist)));
      const closestX = x1 + t * edgeDx;
      const closestY = y1 + t * edgeDy;
      return Math.hypot(x - closestX, y - closestY);
    };

    type HitResult = 
      | { type: "node"; item: Node; dist: number }
      | { type: "control"; item: Control; dist: number }
      | { type: "edge"; item: Edge; dist: number };

    const findNearestItem = (x: number, y: number, graphNodes: Map<string, GraphNode>, _currentEdges: Edge[]): HitResult | null => {
      const HIT_THRESHOLD = 10;
      let bestItem: HitResult | null = null;
      let minItemDist = Infinity;

      for (const node of graphNodes.values()) {
        const dist = Math.hypot(x - node.x, y - node.y);
        const hitRadius = nodeRadius + 3;
        if (dist <= hitRadius && dist < minItemDist) {
          minItemDist = dist;
          bestItem = node.type === "node"
            ? { type: "node", item: node.data as Node, dist }
            : { type: "control", item: node.data as Control, dist };
        }
      }

      let bestEdge: Edge | null = null;
      let minEdgeDist = Infinity;

      for (const edge of edges) {
        if (edge.ignoreLength) {
          if (!showIgnoreEdges) continue;
        } else {
          if (!showNormalEdges) continue;
        }

        const dist = getDistToEdge(edge, x, y, graphNodes);
        if (dist <= HIT_THRESHOLD && dist < minEdgeDist) {
          minEdgeDist = dist;
          bestEdge = edge;
        }
      }

      if (bestItem) return bestItem;
      if (bestEdge) return { type: "edge", item: bestEdge, dist: minEdgeDist };

      return null;
    };

    // Track Ctrl/Cmd key state for cursor changes
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
          setIsShiftPressed(true);
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (!e.ctrlKey && !e.metaKey) {
          setIsShiftPressed(false);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);

    // Update cursor when shift changes, but only if not over an item (handled in MouseMove)
    useEffect(() => {
      if (cursor !== "pointer") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- updating cursor based on keyboard state
        setCursor(isShiftPressed ? "move" : "crosshair");
      }
    }, [isShiftPressed]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle selectedProperties changes (from properties panel)
    useEffect(() => {
      if (selectedProperties && selectedEdgeId && selectedEvent?.id) {
        // If properties changed for the selected edge, update it
        const updatedEdges = edges.map((edge) =>
          edgeKey(edge) === selectedEdgeId ? { ...edge, ...selectedProperties } : edge,
        );
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing edges state from properties panel update
        setEdges(updatedEdges);
        updateRaceCourseGraph({ edges: updatedEdges });
      }
    }, [selectedProperties]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load nodes and edges from event on mount and when event data changes (e.g. import)
    useEffect(() => {
      if (selectedEvent) {
        const raceCourse = selectedEvent.raceCourses?.[0];
        const eventNodes = raceCourse?.vertices ?? [];
        const eventEdges = raceCourse?.edges ?? [];

        // Check if event data differs from local state to avoid loops but allow external updates
        const nodesChanged = JSON.stringify(eventNodes) !== JSON.stringify(nodes);
        const edgesChanged = JSON.stringify(eventEdges) !== JSON.stringify(edges);

        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state from event data
        if (nodesChanged) setNodes(eventNodes);
         
        if (edgesChanged) setEdges(eventEdges);
      }
    }, [selectedEvent]); // eslint-disable-line react-hooks/exhaustive-deps

    // Save nodes and edges to event when they change
    const saveNodesToEvent = (nodeList: Node[]) => {
      setNodes(nodeList);
      updateRaceCourseGraph({ nodes: nodeList });
    };

    const saveEdgesToEvent = useCallback((edgesList: Edge[]) => {
      setEdges(edgesList);
      updateRaceCourseGraph({ edges: edgesList });
    }, [updateRaceCourseGraph]);

    /** Swap the selected edge's from/to (Ctrl/Cmd+R and the menu). Returns false without a selected edge. */
    const reverseSelectedEdge = (): boolean => {
      if (!selectedEdgeId) return false;
      let reversedEdge: Edge | undefined;
      const updatedEdges = edges.map((edge) => {
        if (edgeKey(edge) === selectedEdgeId) {
          reversedEdge = { ...edge, from: edge.to, to: edge.from };
          return reversedEdge;
        }
        return edge;
      });
      if (!reversedEdge) return false;
      saveEdgesToEvent(updatedEdges);
      setSelectedEdgeId(edgeKey(reversedEdge));
      if (onPropertiesChange) onPropertiesChange({ type: "edge", ...reversedEdge });
      return true;
    };

    useImperativeHandle(ref, () => ({
      verifyGraph: (): GraphFinding[] =>
        verifyGraphOf({
          nodes,
          edges,
          controls: selectedEvent?.raceCourses?.[0]?.controls ?? [],
          map: map ?? selectedEvent?.raceCourses?.[0]?.maps?.[0],
          polygons: selectedEvent?.raceCourses?.[0]?.polygons ?? [],
        }),
      selectItem: (type, id) => {
        const state = lastStateRef.current;
        if (!state) return;

        if (type === "edge") {
          const edge = edges.find((e) => edgeKey(e) === id);
          if (edge) {
            setSelectedEdgeId(id);
            setSelectedNodeId(null);
            setSelectedControlId(null);
            // Pan to center of edge with animation
            const controls = selectedEvent?.raceCourses?.[0]?.controls ?? [];
            const fromNode = nodes.find((n) => n.id === edge.from);
            const fromControl = controls.find((c) => c.id === edge.from);
            const from =
              fromNode || (fromControl ? { x: fromControl.mapPosition.x, y: fromControl.mapPosition.y } : null);
            const toNode = nodes.find((n) => n.id === edge.to);
            const toControl = controls.find((c) => c.id === edge.to);
            const to = toNode || (toControl ? { x: toControl.mapPosition.x, y: toControl.mapPosition.y } : null);
            if (from || to) {
              // If both exist, center on midpoint. If one is missing, center on the existing one.
              const cx = from && to ? (from.x + to.x) / 2 : from ? from.x : to!.x;
              const cy = from && to ? (from.y + to.y) / 2 : from ? from.y : to!.y;
              const px = toPixels(state, { x: cx, y: cy });
              controllerRef.current?.frameItem(px, 2);
            }
          }
        } else {
          // node or control
          const item =
            type === "control"
              ? (selectedEvent?.raceCourses?.[0]?.controls ?? []).find((c) => c.id === id)
              : nodes.find((n) => n.id === id);

          if (item) {
            if (type === "control") {
              setSelectedControlId(id);
              setSelectedNodeId(null);
            } else {
              setSelectedNodeId(id);
              setSelectedControlId(null);
            }
            setSelectedEdgeId(null);
            const itemPos =
              type === "control"
                ? { x: (item as Control).mapPosition.x, y: (item as Control).mapPosition.y }
                : { x: (item as Node).x, y: (item as Node).y };
            const px = eventPosToMultiPagePixels(itemPos, map, state.pixelsPerMM);
            controllerRef.current?.frameItem(px, 2);
          }
        }
      },
      deleteItem: (type, id) => {
        if (type === "edge") {
          const updated = edges.filter((e) => edgeKey(e) !== id);
          saveEdgesToEvent(updated);
        } else if (type === "node") {
          const updated = nodes.filter((n) => n.id !== id);
          // Also remove edges connected to this node
          const updatedEdges = edges.filter((e) => e.from !== id && e.to !== id);
          setNodes(updated);
          setEdges(updatedEdges);
          updateRaceCourseGraph({ nodes: updated, edges: updatedEdges });
        } else if (type === "control") {
          if (selectedEvent) {
            const rc = selectedEvent.raceCourses?.[0];
            if (rc) {
              // Shared helper: removes the control, its course entries and its graph edges
              const updatedEdges = edges.filter((e) => e.from !== id && e.to !== id);
              updateEvent(selectedEvent.id, (ev) =>
                updateRaceCourse(ev, (latest) => ({ ...removeControl(latest, id), edges: updatedEdges })),
                undefined,
                { label: "Delete control" },
              );
              setEdges(updatedEdges);
            }
          }
        }
      },
      clearGraph: () => {
        // Clear all nodes and edges
        setNodes([]);
        setEdges([]);
        updateRaceCourseGraph({ nodes: [], edges: [] });
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setSelectedControlId(null);
      },
      reverseSelectedEdge,
      connectOverlapping: (): ConnectOverlappingResult => {
        const raceCourse = selectedEvent?.raceCourses?.[0];
        const result = connectOverlapping({
          controls: raceCourse?.controls ?? [],
          nodes,
          edges,
          polygons: raceCourse?.polygons ?? [],
        });
        if (result.added + result.removed + result.updated > 0) saveEdgesToEvent(result.edges);
        return result;
      },
    }));

    // Handle delete/backspace key for selected items and escape to deselect
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Don't handle shortcuts if focus is on an input element
        const target = e.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          return;
        }

        // Bare letter/number shortcuts below must not fire alongside a
        // modifier - otherwise e.g. Ctrl+S (browser save) would also set
        // the selected edge's label to "S".
        const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

        if (e.key === "Delete" || e.key === "Backspace") {
          if (selectedNodeId) {
            const updated = nodes.filter((node) => node.id !== selectedNodeId);
            const updatedEdges = edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId);
            setNodes(updated);
            setEdges(updatedEdges);
            updateRaceCourseGraph({ nodes: updated, edges: updatedEdges });
            setSelectedNodeId(null);
          } else if (selectedEdgeId) {
            const updated = edges.filter((edge) => edgeKey(edge) !== selectedEdgeId);
            saveEdgesToEvent(updated);
            setSelectedEdgeId(null);
            if (onPropertiesChange) {
              onPropertiesChange(null);
            }
          }
        } else if (e.key === "Escape") {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          if (onPropertiesChange) {
            onPropertiesChange(null);
          }
        } else if (selectedEdgeId && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
          // Ctrl+R (or Cmd+R on Mac) with edge selected - reverse edge direction
          e.preventDefault();
          reverseSelectedEdge();
        } else if (selectedEdgeId && !hasModifier && e.key === "1") {
          // "1" key pressed with edge selected - toggle one-way
          const updatedEdges = edges.map((edge) =>
            edgeKey(edge) === selectedEdgeId ? { ...edge, oneWay: !edge.oneWay } : edge,
          );
          saveEdgesToEvent(updatedEdges);
          const updatedEdge = updatedEdges.find((e) => edgeKey(e) === selectedEdgeId);
          if (onPropertiesChange && updatedEdge) {
            onPropertiesChange({ type: "edge", ...updatedEdge });
          }
        } else if (selectedEdgeId && !hasModifier && e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
          // A-Z key pressed with edge selected - set label, reverseLabel, and ignoreLength
          const upperKey = e.key.toUpperCase();
          const lowerKey = e.key.toLowerCase();
          const updatedEdges = edges.map((edge) =>
            edgeKey(edge) === selectedEdgeId
              ? { ...edge, label: upperKey, reverseLabel: lowerKey, ignoreLength: true }
              : edge,
          );
          saveEdgesToEvent(updatedEdges);
          const updatedEdge = updatedEdges.find((e) => edgeKey(e) === selectedEdgeId);
          if (onPropertiesChange && updatedEdge) {
            onPropertiesChange({ type: "edge", ...updatedEdge });
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedNodeId, selectedEdgeId, nodes, edges, selectedEvent?.id, onPropertiesChange, saveEdgesToEvent, updateRaceCourseGraph]);

    const svgCoordsFromMouse = (event: React.MouseEvent<SVGElement>, state: MapViewerState) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / state.zoom,
        y: (event.clientY - rect.top) / state.zoom,
      };
    };

    const handleMouseDown = (state: MapViewerState) => (e: React.MouseEvent<SVGElement>) => {
      const { x, y } = svgCoordsFromMouse(e, state);
      const graphNodes = getGraphNodes(state);

      // Find nearest item
      const hit = findNearestItem(x, y, graphNodes, edges);

      const hitNode = hit?.type === "node" ? hit.item : null;
      const hitControl = hit?.type === "control" ? hit.item : null;
      const hitEdge = hit?.type === "edge" ? (hit.item as Edge) : null;
      const hitId = hitNode?.id || (hitControl ? hitControl.id : null);

      // Ctrl+click (or Cmd+click on Mac) on edge = split edge with new node
      if ((e.ctrlKey || e.metaKey) && hitEdge) {
        e.preventDefault();
        e.stopPropagation();
        // Create new node at click position
        const mm = toEvent(state, { x, y });
        const newNode: Node = {
          id: nextNodeId(nodes),
          x: mm.x,
          y: mm.y,
        };
        const updatedNodes = [...nodes, newNode];
        // Don't save nodes yet, wait for edges update to be atomic

        // Split the edge
        const updatedEdges = edges.filter((edge) => edge !== hitEdge);
        const newEdge1: Edge = {
          from: hitEdge.from,
          to: newNode.id,
          label: hitEdge.label,
          oneWay: hitEdge.oneWay,
          ignoreLength: hitEdge.ignoreLength,
          reverseLabel: hitEdge.reverseLabel,
        };
        const newEdge2: Edge = {
          from: newNode.id,
          to: hitEdge.to,
          label: "",
          oneWay: hitEdge.oneWay,
          ignoreLength: hitEdge.ignoreLength,
        };
        
        const finalEdges = [...updatedEdges, newEdge1, newEdge2];
        
        // Atomic update of both nodes and edges
        setNodes(updatedNodes);
        setEdges(finalEdges);
        updateRaceCourseGraph({ nodes: updatedNodes, edges: finalEdges });
        
        setSelectedNodeId(newNode.id);
        setSelectedEdgeId(null);
        return;
      }

      // Regular click on edge = track it for selection in mouseup
      if (!e.shiftKey && hitEdge) {
        e.preventDefault();
        e.stopPropagation();
        clickedEdgeRef.current = edgeKey(hitEdge);
        setPointerDown({ x: e.clientX, y: e.clientY });
        setPointerEdgeId(edgeKey(hitEdge));
        return;
      }

      // Ctrl+click (or Cmd+click on Mac) on node = enable dragging mode
      if ((e.ctrlKey || e.metaKey) && hitNode) {
        e.preventDefault();
        e.stopPropagation();
        setPointerDown({ x: e.clientX, y: e.clientY });
        setDidDrag(false);
        setIsDraggingNode(false);
        setPointerNodeId(hitNode.id);
        setPointerEdgeId(null);
        return;
      }

      // Click on node (no SHIFT) = track for selection or edge creation
      if (!e.shiftKey && (hitNode || hitControl)) {
        e.preventDefault();
        e.stopPropagation();
        clickedNodeRef.current = hitId || "";
        e.stopPropagation();
        clickedNodeRef.current = hitId || "";
        setPointerDown({ x: e.clientX, y: e.clientY });
        setCurrentMousePos({ x, y });
        return;
      }

      // Click on empty space
      clickedEdgeRef.current = null;
      setPointerDown({ x: e.clientX, y: e.clientY });
      setDidDrag(false);
      setIsDraggingNode(false);
      setPointerNodeId(null);
      setPointerEdgeId(null);
    };

    const handleMouseMove = (state: MapViewerState) => (e: React.MouseEvent<SVGElement>) => {
      const coords = svgCoordsFromMouse(e, state);

      // Prevent browser text selection during drag/draw operations
      if (pointerDown || isCreatingEdge) {
        e.preventDefault();
      }

      // Update cursor based on hover if not dragging
      if (!pointerDown && !isCreatingEdge) {
        const graphNodes = getGraphNodes(state);
        const hit = findNearestItem(coords.x, coords.y, graphNodes, edges);
        setCursor(hit ? "pointer" : isShiftPressed ? "move" : "crosshair");
      }

      // If creating edge, update temporary edge position
      if (isCreatingEdge) {
        setCurrentMousePos(coords);
        return;
      }

      if (!pointerDown) return;

      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      const dist = Math.hypot(dx, dy);

      // If we have a clicked node and user starts dragging, begin edge creation
      if (clickedNodeRef.current && !isCreatingEdge && dist > 5) {
        setIsCreatingEdge(true);
        setEdgeStartNodeId(clickedNodeRef.current);
        clickedNodeRef.current = null;
        return;
      }

      if (pointerNodeId) {
        // SHIFT was held on mousedown, so dragging is allowed
        if (!isDraggingNode && dist > 5) {
          setIsDraggingNode(true);
        }

        if (isDraggingNode) {
          const mm = toEvent(state, { x: coords.x, y: coords.y });
          const updated = nodes.map((node) => (node.id === pointerNodeId ? { ...node, x: mm.x, y: mm.y } : node));
          saveNodesToEvent(updated);
        }
        return;
      }

      if (dist > 5) {
        setDidDrag(true);
      }
    };

    const handleMouseUp = (state: MapViewerState) => (e: React.MouseEvent<SVGElement>) => {
      // Handle edge creation completion
      if (isCreatingEdge && edgeStartNodeId) {
        const coords = svgCoordsFromMouse(e, state);
        const graphNodes = getGraphNodes(state);

        // Find nearest node/control to snap to (excluding start node)
        let targetItem: GraphNode | null = null;
        let minDist = Infinity;

        for (const item of graphNodes.values()) {
          if (item.id !== edgeStartNodeId) {
            const dist = Math.hypot(coords.x - item.x, coords.y - item.y);
            if (dist < minDist) {
              minDist = dist;
              targetItem = item;
            }
          }
        }

        // Prepare updates
        const currentNodes = [...nodes];
        const currentEdges = [...edges];
        let toNodeId: string;
        let newEdge: Edge | null = null;

        // I. Determine Destination Node
        // A. Snap to existing item
        if (targetItem && minDist < nodeRadius * 2) {
          toNodeId = targetItem.id;
        } 
        // B. or Create new node
        else {
          // Check if releasing on the start node - cancel edge creation
          const startNodePx = graphNodes.get(edgeStartNodeId);
          if (startNodePx) {
            const distFromStart = Math.hypot(coords.x - startNodePx.x, coords.y - startNodePx.y);
            if (distFromStart < nodeRadius * 2) {
              setIsCreatingEdge(false);
              setEdgeStartNodeId(null);
              setCurrentMousePos(null);
              return;
            }
          }

          // Check if clicking on an existing edge (cancel unless Ctrl)
          const hit = findNearestItem(coords.x, coords.y, graphNodes, edges);
          const hitEdge = hit?.type === "edge" ? (hit.item as Edge) : null;

          if (hitEdge && !e.ctrlKey && !e.metaKey) {
            setIsCreatingEdge(false);
            setEdgeStartNodeId(null);
            setCurrentMousePos(null);
            return;
          }

          // Create new node at mouse position
          const mm = toEvent(state, { x: coords.x, y: coords.y });
          const newNode: Node = {
            id: nextNodeId(currentNodes),
            x: mm.x,
            y: mm.y,
          };
          currentNodes.push(newNode);
          toNodeId = newNode.id;
        }

        // II. Create Edge
        // Check if edge already exists (including reversed direction) or self-loop
        const edgeExists =
          currentEdges.some(
            (e) =>
              (e.from === edgeStartNodeId && e.to === toNodeId) || (e.from === toNodeId && e.to === edgeStartNodeId),
          ) || edgeStartNodeId === toNodeId;

        if (!edgeExists) {
          // Level change is now calculated automatically from node positions
          // No need to check levels or set levelChange property
          newEdge = {
            from: edgeStartNodeId,
            to: toNodeId,
            label: "",
          };
          currentEdges.push(newEdge);
        }

        // III. Apply Updates atomically
        setNodes(currentNodes);
        setEdges(currentEdges);
        updateRaceCourseGraph({ nodes: currentNodes, edges: currentEdges });

        // IV. Update Selection
        if (newEdge) {
          setSelectedNodeId(null);
          setSelectedEdgeId(edgeKey(newEdge));
          if (onPropertiesChange) {
            onPropertiesChange({ type: "edge", ...newEdge });
          }
        }

        setIsCreatingEdge(false);
        setEdgeStartNodeId(null);
        setCurrentMousePos(null);
        return;
      }

      if (!pointerDown) return;

      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      const moved = Math.hypot(dx, dy) > 5;
      const coords = svgCoordsFromMouse(e, state);

      const resetInteraction = () => {
        setPointerDown(null);
        setIsDraggingNode(false);
        setPointerNodeId(null);
        setPointerEdgeId(null);
        setDidDrag(false);
      };

      const edgeId = pointerEdgeId ?? clickedEdgeRef.current;

      // Existing node path
      if (pointerNodeId) {
        // Check if dragged over another node - merge them
        const graphNodes = getGraphNodes(state);
        const draggedNode = nodes.find((n) => n.id === pointerNodeId);

        // Use findNearestItem to find target
        const hit = findNearestItem(coords.x, coords.y, graphNodes, []);
        // Only merge with NODES
        const targetNode = hit?.type === "node" && hit.item.id !== pointerNodeId ? hit.item : null;

        // hit.item from getGraphNodes has .data as the original Node object.
        // But hit.item is the GraphNode wrapper? NO.
        // findNearestItem returns { type, item: node.data, dist }.
        // So hit.item IS the Node object.
        const targetNodeData = nodes.find((n) => n.id === targetNode?.id);

        if (draggedNode && targetNodeData) {
          // Merge: keep target node, remove dragged node
          const nodeToRemove = draggedNode.id;
          const nodeToKeep = targetNodeData.id;

          // Remove the dragged node
          const updatedNodes = nodes.filter((n) => n.id !== nodeToRemove);
          saveNodesToEvent(updatedNodes);

          // Update all edges that referenced the removed node
          const updatedEdges = edges
            .map((edge) => ({
              ...edge,
              from: edge.from === nodeToRemove ? nodeToKeep : edge.from,
              to: edge.to === nodeToRemove ? nodeToKeep : edge.to,
            }))
            .filter((edge, idx, arr) => {
              // Remove duplicate edges (same from and to node)
              return idx === arr.findIndex((e) => e.from === edge.from && e.to === edge.to && e.oneWay === edge.oneWay);
            });

          saveEdgesToEvent(updatedEdges);
          setSelectedNodeId(null);
        }

        resetInteraction();
        return;
      }

      // Edge was clicked but dragged - deselect it
      if (edgeId && (didDrag || moved)) {
        setSelectedEdgeId(null);
        if (onPropertiesChange) {
          onPropertiesChange(null);
        }
        clickedEdgeRef.current = null;
        resetInteraction();
        return;
      }

      // Try to select element on mouse up (if not dragged) - improved selection logic
      if (!didDrag && !moved) {
        const graphNodes = getGraphNodes(state);

        // Find nearest item at mouse up position
        const hit = findNearestItem(coords.x, coords.y, graphNodes, edges);

        if (hit) {
          if (hit.type === "edge") {
            const edge = hit.item as Edge;
            setSelectedEdgeId(edgeKey(edge));
            setSelectedNodeId(null);
            setSelectedControlId(null); // Clear control selection
            if (onPropertiesChange) {
              const controls = selectedEvent?.raceCourses?.[0]?.controls ?? [];
              const fromNode = nodes.find((n) => n.id === edge.from);
              const fromControl = controls.find((c) => c.id === edge.from);
              const fromGlobalMM = fromNode
                ? { x: fromNode.x, y: fromNode.y }
                : fromControl
                  ? { x: fromControl.mapPosition.x, y: fromControl.mapPosition.y }
                  : null;
              const toNode = nodes.find((n) => n.id === edge.to);
              const toControl = controls.find((c) => c.id === edge.to);
              const toGlobalMM = toNode
                ? { x: toNode.x, y: toNode.y }
                : toControl
                  ? { x: toControl.mapPosition.x, y: toControl.mapPosition.y }
                  : null;

              let edgeLength = 0;
              if (fromGlobalMM && toGlobalMM && !edge.ignoreLength) {
                const mapData = map ?? selectedEvent?.raceCourses?.[0]?.maps?.[0];
                const mapScale = mapData?.scale ?? 1;
                const fromPx = eventPosToMultiPagePixels(fromGlobalMM, map, state.pixelsPerMM);
                const toPx = eventPosToMultiPagePixels(toGlobalMM, map, state.pixelsPerMM);
                const pixelDist = Math.hypot(toPx.x - fromPx.x, toPx.y - fromPx.y);
                edgeLength = (pixelDist / state.pixelsPerMM) * mapScale * 0.001;
              }
              onPropertiesChange({ type: "edge", ...edge, edgeLength });
            }
            clickedEdgeRef.current = null;
            resetInteraction();
            return;
          } else if (hit.type === "node") {
            const node = hit.item as Node;
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
            setSelectedControlId(null);
            if (onPropertiesChange) {
              onPropertiesChange({ type: "node", ...node });
            }
            clickedNodeRef.current = null;
            resetInteraction();
            return;
          } else if (hit.type === "control") {
            const control = hit.item as Control;
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            setSelectedControlId(control.id);
            clickedNodeRef.current = null;
            resetInteraction();
            if (onPropertiesChange) {
              onPropertiesChange({ ...control, type: "control" });
            }
            return;
          }
        }

        // If no hit, create new node
        const mm = toEvent(state, { x: coords.x, y: coords.y });
        const newNode: Node = {
          id: nextNodeId(nodes),
          x: mm.x,
          y: mm.y,
        };
        const updated = [...nodes, newNode];
        saveNodesToEvent(updated);

        setSelectedNodeId(newNode.id);
        setSelectedEdgeId(null);
        setSelectedControlId(null);

        if (onPropertiesChange) {
          onPropertiesChange({ type: "node", ...newNode });
        }

        clickedNodeRef.current = null;
        resetInteraction();
        return;
      }

      clickedNodeRef.current = null;

      // Deselect all if nothing hit / panned
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedControlId(null);
      resetInteraction();
      if (onPropertiesChange) {
        onPropertiesChange(null);
      }
    };

    const renderSvgContent = (state: MapViewerState, includeWhiteBackground: boolean = false) => {
      const graphNodes = getGraphNodes(state);

      const nodesList: GraphNode[] = [];
      const controlsList: GraphNode[] = [];
      graphNodes.forEach((item) => {
        if (item.type === "node") nodesList.push(item);
        else controlsList.push(item);
      });

      return (
        <svg
          width={state.pdfDimensions.width}
          height={state.pdfDimensions.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            cursor: cursor,
            // Draw nodes/controls outside the map area too, so out-of-bounds findings can be seen
            overflow: "visible",
          }}
          onMouseDown={handleMouseDown(state)}
          onMouseMove={handleMouseMove(state)}
          onMouseUp={handleMouseUp(state)}
        >
          {/* White background rectangle when map is hidden */}
          {includeWhiteBackground && (
            <rect x={0} y={0} width={state.pdfDimensions.width} height={state.pdfDimensions.height} fill="white" />
          )}

          {/* Edges */}
          {edges
            .filter((edge) => {
              if (edge.ignoreLength) return showIgnoreEdges;
              return showNormalEdges;
            })
            .map((edge) => {
              const fromNode = graphNodes.get(edge.from);
              const toNode = graphNodes.get(edge.to);

              if (!fromNode || !toNode) return null;

              // Calculate angle first (using centers)
              const centerX1 = fromNode.x;
              const centerY1 = fromNode.y;
              const centerX2 = toNode.x;
              const centerY2 = toNode.y;
              const dx = centerX2 - centerX1;
              const dy = centerY2 - centerY1;
              const angle = Math.atan2(dy, dx);
              const dist = Math.hypot(dx, dy);

              // Offset edge endpoints to stop at node circumference (not center)
              const x1 = dist > nodeRadius * 2 ? centerX1 + nodeRadius * Math.cos(angle) : centerX1;
              const y1 = dist > nodeRadius * 2 ? centerY1 + nodeRadius * Math.sin(angle) : centerY1;
              const x2 = dist > nodeRadius * 2 ? centerX2 - nodeRadius * Math.cos(angle) : centerX2;
              const y2 = dist > nodeRadius * 2 ? centerY2 - nodeRadius * Math.sin(angle) : centerY2;

              const isSelected = selectedEdgeId === edgeKey(edge);
              const isDeadEnd = deadEndEdgeIds.has(edgeKey(edge));
              const strokeDasharray = edge.ignoreLength ? "5,5" : undefined;
              const isOneWay = edge.oneWay === true;
              const edgeColor = isDeadEnd ? GRAPH_DEAD_END_COLOR : EDGE_COLOR;
              const baseThickness = GRAPH_EDGE_THICKNESS;
              const strokeWidth = isSelected ? Math.max(3, baseThickness * 1.2) : baseThickness;

              // Calculate text positions - closer to the line
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              const perpAngle = angle + Math.PI / 2;
              const labelOffset = 8;
              const labelX1 = midX + labelOffset * Math.cos(perpAngle);
              const labelY1 = midY + labelOffset * Math.sin(perpAngle);
              const labelX2 = midX - labelOffset * Math.cos(perpAngle);
              const labelY2 = midY - labelOffset * Math.sin(perpAngle);

              // Arrow size for direction indicator
              const _arrowSize = 4;

              // Calculate readable text angle - flip if text would be upside down
              const angleDeg = (angle * 180) / Math.PI;
              const textAngleDeg = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;

              // Calculate chevron points at multiple positions along the edge
              const chevronSize = 5;
              const tipLength = 6;
              const chevronPositions = [0.25, 0.5, 0.75]; // 25%, 50%, 75% along the line

              const createChevron = (t: number) => {
                const chevronX = x1 + (x2 - x1) * t;
                const chevronY = y1 + (y2 - y1) * t;
                const tipX = chevronX + tipLength * Math.cos(angle);
                const tipY = chevronY + tipLength * Math.sin(angle);
                const baseAngle1 = angle + (2 * Math.PI) / 3;
                const baseAngle2 = angle - (2 * Math.PI) / 3;
                const base1X = chevronX + chevronSize * Math.cos(baseAngle1);
                const base1Y = chevronY + chevronSize * Math.sin(baseAngle1);
                const base2X = chevronX + chevronSize * Math.cos(baseAngle2);
                const base2Y = chevronY + chevronSize * Math.sin(baseAngle2);
                return { tipX, tipY, base1X, base1Y, base2X, base2Y };
              };

              return (
                <g key={edgeKey(edge)}>
                  {isSelected && (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#ff6600"
                      strokeWidth={6}
                      strokeDasharray={strokeDasharray}
                      opacity={0.8}
                      pointerEvents="none"
                    />
                  )}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={edgeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    opacity={isSelected ? 1 : 0.6}
                    style={{ cursor: "pointer" }}
                  />
                  {/* Chevrons for one-way edges at 25%, 50%, 75% along the line */}
                  {isOneWay &&
                    chevronPositions.map((t, idx) => {
                      const chevron = createChevron(t);
                      return (
                        <g key={`chevron-${idx}`} opacity={isSelected ? 1 : 0.6}>
                          <line
                            x1={chevron.base1X}
                            y1={chevron.base1Y}
                            x2={chevron.tipX}
                            y2={chevron.tipY}
                            stroke={edgeColor}
                            strokeWidth={strokeWidth}
                            pointerEvents="none"
                          />
                          <line
                            x1={chevron.base2X}
                            y1={chevron.base2Y}
                            x2={chevron.tipX}
                            y2={chevron.tipY}
                            stroke={edgeColor}
                            strokeWidth={strokeWidth}
                            pointerEvents="none"
                          />
                        </g>
                      );
                    })}

                  {/* Label on one side with direction indicator */}
                  {edge.label && (
                    <g>
                      {/* Label with arrow toward end node */}
                      {(() => {
                        // If text is flipped for readability, arrow position changes
                        const isFlipped = angleDeg > 90 || angleDeg < -90;
                        // Arrow on the side closest to end node
                        const labelWithArrow = isFlipped ? `←${edge.label}` : `${edge.label}→`;
                        return (
                          <text
                            x={labelX1}
                            y={labelY1}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="12"
                            fontFamily="Arial"
                            fill={edgeColor}
                            opacity={isSelected ? 1 : 0.6}
                            transform={`rotate(${textAngleDeg} ${labelX1} ${labelY1})`}
                            pointerEvents="none"
                          >
                            {labelWithArrow}
                          </text>
                        );
                      })()}
                    </g>
                  )}
                  {/* Reverse label on opposite side with direction indicator */}
                  {edge.reverseLabel && (
                    <g>
                      {/* Label with arrow toward start node (opposite direction) */}
                      {(() => {
                        // If text is flipped for readability, arrow position changes
                        const isFlipped = angleDeg > 90 || angleDeg < -90;
                        // Arrow on the side closest to start node (opposite of main label)
                        const labelWithArrow = isFlipped ? `${edge.reverseLabel}→` : `←${edge.reverseLabel}`;
                        return (
                          <text
                            x={labelX2}
                            y={labelY2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="12"
                            fontFamily="Arial"
                            fill={edgeColor}
                            opacity={isSelected ? 1 : 0.6}
                            transform={`rotate(${textAngleDeg} ${labelX2} ${labelY2})`}
                            pointerEvents="none"
                          >
                            {labelWithArrow}
                          </text>
                        );
                      })()}
                    </g>
                  )}
                  {/* Edge weight label */}
                  {showEdgeWeights && (edgeLengthOverride(edge) !== undefined || !edge.ignoreLength) && (() => {
                    const mapData = map ?? selectedEvent?.raceCourses?.[0]?.maps?.[0];
                    const mapScale = mapData?.scale ?? 1;
                    // A hand-set length is shown instead of the calculated one, marked with "*"
                    const override = edgeLengthOverride(edge);
                    const realDistM = override ?? (dist / state.pixelsPerMM) * mapScale * 0.001;
                    if (override === undefined && realDistM <= 0) return null;
                    const weightText = override !== undefined ? `${override.toFixed(1)}*` : realDistM.toFixed(1);
                    return (
                      <text
                        x={labelX2}
                        y={labelY2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="9"
                        fontFamily="Arial"
                        fill={edgeColor}
                        opacity={isSelected ? 1 : 0.6}
                        transform={`rotate(${textAngleDeg} ${labelX2} ${labelY2})`}
                        pointerEvents="none"
                      >
                        {weightText}
                      </text>
                    );
                  })()}
                </g>
              );
            })}

          {/* Temporary edge while creating */}
          {isCreatingEdge &&
            edgeStartNodeId &&
            currentMousePos &&
            (() => {
              const startNode = graphNodes.get(edgeStartNodeId);
              if (!startNode) return null;

              // Find nearest node to snap to (excluding start node)
              let targetItem: GraphNode | null = null;
              let minDist = Infinity;

              graphNodes.forEach((n) => {
                if (n.id !== edgeStartNodeId) {
                  const dist = Math.hypot(currentMousePos.x - n.x, currentMousePos.y - n.y);
                  if (dist < minDist) {
                    minDist = dist;
                    targetItem = n;
                  }
                }
              });

              const target: GraphNode | null = targetItem;
              const snapToTarget = !!target && minDist < nodeRadius * 2;
              const endPoint = snapToTarget && target ? target : currentMousePos;
              const endX = endPoint.x;
              const endY = endPoint.y;

              // Calculate offset to stop at node circumference
              const tempDx = endX - startNode.x;
              const tempDy = endY - startNode.y;
              const tempAngle = Math.atan2(tempDy, tempDx);
              const tempDist = Math.hypot(tempDx, tempDy);

              // Offset start point to circumference (nodeRadius is already in SVG/pixel units)
              const lineX1 = tempDist > nodeRadius ? startNode.x + nodeRadius * Math.cos(tempAngle) : startNode.x;
              const lineY1 = tempDist > nodeRadius ? startNode.y + nodeRadius * Math.sin(tempAngle) : startNode.y;

              // Offset end point to circumference if snapping to a target node
              const lineX2 = target && tempDist > nodeRadius * 2 ? endX - nodeRadius * Math.cos(tempAngle) : endX;
              const lineY2 = target && tempDist > nodeRadius * 2 ? endY - nodeRadius * Math.sin(tempAngle) : endY;

              return (
                <line
                  x1={lineX1}
                  y1={lineY1}
                  x2={lineX2}
                  y2={lineY2}
                  stroke={EDGE_COLOR}
                  strokeWidth={1.89}
                  opacity={0.6}
                  strokeDasharray="5,5"
                />
              );
            })()}

          {/* Event controls as fixed nodes */}
          {controlsList.map((control) => {
            const controlColor = EDGE_COLOR;
            const isSelected = selectedControlId === control.id;
            return (
              <g key={`control-${control.id}`}>
                {isSelected && (
                  <circle
                    cx={control.x}
                    cy={control.y}
                    r={nodeRadius}
                    fill="none"
                    stroke="#ff6600"
                    strokeWidth={5}
                    opacity={0.8}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={control.x}
                  cy={control.y}
                  r={nodeRadius}
                  fill={controlColor}
                  fillOpacity="0.5"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {nodesList.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const nodeColor = EDGE_COLOR;
            return (
              <g key={`node-${node.id}`}>
                {/* Contrast outline for selected node */}
                {isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius}
                    fill="none"
                    stroke="#ff6600"
                    strokeWidth={5}
                    opacity={0.8}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius}
                  fill={nodeColor}
                  fillOpacity="0.5"
                  stroke={nodeColor}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}
        </svg>
      );
    };

    // Always use MapViewer when pdfUrl exists for pan/zoom functionality
    return (
      <MapViewer
        pdfUrl={pdfUrl ?? undefined}
        showBackgroundMap={showBackgroundMap}
        backgroundOpacity={backgroundOpacity}
        mapLayout={
          map?.layout || selectedEvent?.raceCourses?.[0]?.maps?.[0]?.layout || "horizontal"
        }
        onControllerReady={(c) => (controllerRef.current = c)}
      >
        {(state: MapViewerState) => {
          lastStateRef.current = state;
          return renderSvgContent(state, !showBackgroundMap);
        }}
      </MapViewer>
    );
  },
);

GraphEditorMapViewer.displayName = "GraphEditorMapViewer";

export default GraphEditorMapViewer;
