"use client"


import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Progress } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { createEventRouteAnalyzer, getEventScoringModel, mergeRaceCourse } from "@indoor-o-route-analysis/core";
import type { Node, Control } from "@indoor-o-route-analysis/core";
import { Play, Square, Info, MousePointer2, Navigation, Wrench, GitCommitHorizontal, Waypoints } from "lucide-react";
import { ScrollArea } from "@indoor-o-route-analysis/ui";
import { cn } from "@indoor-o-route-analysis/ui";
import { Toggle } from "@indoor-o-route-analysis/ui";
import { Checkbox } from "@indoor-o-route-analysis/ui";
import { DifficultyTag } from "@/components/route-analysis/difficulty-tag";
import { MapVisibilityToggle } from "@/components/map-visibility-toggle";
import ModifyGraphInfoDialog from "@/components/modify-graph/info-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { runModifyGraphAnalysis, type AnalysisResult, type ModifyStrategy, type ModifyObjective } from "./analysis-logic";
import { notify, confirmAction } from "@indoor-o-route-analysis/ui";

interface ModifyGraphPropertiesPanelProps {
  onRouteSelect: (route: { path: string[], distance: number, modification?: AnalysisResult["modification"], centerOnModification?: boolean } | null) => void;
  pickingTarget: "from" | "to" | null;
  setPickingTarget: (target: "from" | "to" | null) => void;
  lastPicked: { id: string; target: "from" | "to"; timestamp: number } | null;
  
  // Lifted State
  modifyFrom: string;
  setModifyFrom: (val: string) => void;
  modifyTo: string;
  setModifyTo: (val: string) => void;
  
  // Visualization
  showNodes: boolean;
  setShowNodes: (v: boolean) => void;
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  backgroundMode: "normal" | "muted" | "hidden";
  setBackgroundMode: (v: "normal" | "muted" | "hidden") => void;
  
  setOriginalRoute: (route: { path: string[], difficulty: number } | null) => void;
  excludeStairs?: boolean;
  setExcludeStairs?: (v: boolean) => void;
}

export default function ModifyGraphPropertiesPanel({ 
    onRouteSelect, 
    pickingTarget, 
    setPickingTarget, 
    lastPicked,
    modifyFrom, setModifyFrom,
    modifyTo, setModifyTo,
    showNodes, setShowNodes,
    showEdges, setShowEdges,
    backgroundMode, setBackgroundMode,
    setOriginalRoute,
    excludeStairs = false,
    setExcludeStairs
}: ModifyGraphPropertiesPanelProps) {
  const { selectedEvent, updateEvent } = useAppData();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Modify Graph State
  const [modifyObjective, setModifyObjective] = useState<ModifyObjective>("max");
  const [modifyTargetDiff, setModifyTargetDiff] = useState(5.0);
  const [modifyStrategy, setModifyStrategy] = useState<ModifyStrategy>("remove");
  const [originalDifficulty, setOriginalDifficulty] = useState<number | null>(null);
  const [originalLength, setOriginalLength] = useState<number | null>(null);
  const [originalPath, setOriginalPath] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPickTimeRef = useRef(0);

  // Abort any running analysis when the component unmounts (e.g. page change)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle picking updates and auto-progression
  useEffect(() => {
    if (lastPicked && lastPicked.timestamp > lastPickTimeRef.current) {
        lastPickTimeRef.current = lastPicked.timestamp;
        if (lastPicked.target === "from") {
            setModifyFrom(lastPicked.id);
            // Auto-toggle to picking "to" point
            setPickingTarget("to");
        } else if (lastPicked.target === "to") {
            setModifyTo(lastPicked.id);
            // Auto-stop picking after "to" is selected
            setPickingTarget(null);
        }
    }
  }, [lastPicked, setModifyFrom, setModifyTo, setPickingTarget]);

  const resolveToNodeId = useCallback((id: string, nodes: Node[], controls: Control[]) => {
      // Direct node match
      if (nodes.some(n => n.id === id)) return id;

      // Control match -> Nearest Node
      const control = controls.find(c => c.id === id);
      if (control) {
          const cx = control.mapPosition?.x;
          const cy = control.mapPosition?.y;
          
          if (typeof cx === 'number' && typeof cy === 'number') {
              let closestId = null;
              let minD = Infinity;
              for (const node of nodes) {
                  const dx = node.x - cx;
                  const dy = node.y - cy;
                  const d = dx*dx + dy*dy;
                  if (d < minD) {
                      minD = d;
                      closestId = node.id;
                  }
              }
              if (closestId) return closestId;
          }
      }
      return id;
  }, []);

  // Calculate original route when from/to changes
  useEffect(() => {
      if (!modifyFrom || !modifyTo || !selectedEvent) {
          setOriginalDifficulty(null);
          setOriginalRoute(null);
          onRouteSelect(null);
          return;
      }
      
      const controls = selectedEvent.raceCourses?.[0]?.controls || [];
      const nodes = selectedEvent.raceCourses?.[0]?.vertices || [];
      const edges = selectedEvent.raceCourses?.[0]?.edges || [];

      // Resolve control IDs to node IDs for pathfinding
      const startId = resolveToNodeId(modifyFrom, nodes, controls);
      const endId = resolveToNodeId(modifyTo, nodes, controls);
      
      try {
           const analyzer = createEventRouteAnalyzer(selectedEvent);
           const routes = analyzer.findAlternativePaths(startId, endId, 1);
           if (routes.length > 0) {
               const route = routes[0];
               if (Number.isFinite(route.distance) && route.distance > 0) {
                   setOriginalDifficulty(route.difficulty);
                   setOriginalLength(route.distance);
                   setOriginalPath(route.path);
                   
                   // Show the route immediately
                   setOriginalRoute({ path: route.path, difficulty: route.difficulty });
                   onRouteSelect({ path: route.path, distance: route.distance });
                   return;
               }
           }
      } catch (_e) {
          // ignore
      }
      setOriginalDifficulty(null);
      setOriginalLength(null);
      setOriginalRoute(null);
      setOriginalPath([]);
      onRouteSelect(null);

  }, [modifyFrom, modifyTo, selectedEvent, setOriginalRoute, onRouteSelect, resolveToNodeId]);

  // Clear analysis results when inputs change (but don't clear the displayed route - that's managed by the shortest path effect above)
  useEffect(() => {
    setResults([]);
    setSelectedResultId(null);
  }, [modifyFrom, modifyTo, modifyStrategy, modifyObjective, modifyTargetDiff]);

  const runAnalysisInternal = async () => {
    if (!selectedEvent) {
       return;
    }

    const controls = selectedEvent.raceCourses?.[0]?.controls || [];
    const nodes = selectedEvent.raceCourses?.[0]?.vertices || [];
    const edges = selectedEvent.raceCourses?.[0]?.edges || [];

    if (edges.length === 0) {
       return;
    }

    // Validate inputs for Modify Graph
    if (!modifyFrom || !modifyTo) {
        return;
    }
    if (modifyFrom === modifyTo) {
        return;
    }

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsRunning(true);
    setProgress(0);
    setProcessedCount(0);
    setTotalCount(0);
    setResults([]);
    onRouteSelect(null);
    setSelectedResultId(null);

    const startId = resolveToNodeId(modifyFrom, nodes, controls);
    const endId = resolveToNodeId(modifyTo, nodes, controls);

    try {
        const finalResults = await runModifyGraphAnalysis({
            edges,
            nodes,
            controls,
            event: selectedEvent,
            modifyFrom: startId,
            modifyTo: endId,
            modifyStrategy,
            modifyObjective,
            modifyTargetDiff,
            excludeStairs: excludeStairs || false,
            originalRoutePath: originalPath,
            signal,
            onProgress: async (progress, processed, total, currentResults) => {
                setProgress(progress);
                setProcessedCount(processed);
                setTotalCount(total);
                setResults(currentResults);
                await new Promise(r => setTimeout(r, 0));
            }
        });

        if (!signal.aborted) {
             setResults(finalResults);
             setProgress(100);
             // processed count should be updated by final callback or we leave it
            setProcessedCount(totalCount);
        }
    } catch (e) {
        console.error("Analysis failed", e);
        notify("Analysis failed: " + String(e), { kind: "error" });
    } finally {
        if (!signal.aborted) {
            setIsRunning(false);
            abortControllerRef.current = null;
        }
    }
  };

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsRunning(false);
      }
  };

  // Manual run analysis (for UI button)
  const runAnalysis = async () => {
    return runAnalysisInternal();
  };

  const handleApply = async (res: AnalysisResult) => {
      if (!res.modification || !selectedEvent) return;
      if (!(await confirmAction(`Are you sure you want to ${res.modification.description}? This will modify the graph permanently.`, { title: "Apply graph change", confirmLabel: "Apply" }))) return;

      const raceCourses = selectedEvent.raceCourses || [];
      const currentEdges = raceCourses[0]?.edges || [];
      
      let newEdges = [];
      const type = res.modification.type as string; // remove, oneway-fwd, oneway-rev

      if (type === "remove") {
          newEdges = currentEdges.filter(e => e !== res.modification!.originalEdge);
      } else if (type === "oneway-fwd") {
          newEdges = currentEdges.map(e => e === res.modification!.originalEdge ? { ...e, oneWay: true } : e);
      } else if (type === "oneway-rev") {
          // Swap from/to and set oneDay
          newEdges = currentEdges.map(e => e === res.modification!.originalEdge ? { ...e, oneWay: true, from: e.to, to: e.from } : e);
      } else {
          return;
      }

      // Update event
      // newEdges is matched by identity against the analysed edges; merge only the edges into the latest event
      await updateEvent(selectedEvent.id, (e) => mergeRaceCourse(e, { edges: newEdges }), undefined, { label: "Apply graph change" });
  };

  const handleRowClick = (res: AnalysisResult, shouldPan: boolean = false) => {
      setSelectedResultId(res.id);
      onRouteSelect({ path: res.path, distance: res.length, modification: res.modification, centerOnModification: shouldPan });
  };
  
  const visibleResults = results.filter(res => {
      if (originalDifficulty === null) return true;
      return Math.abs(res.difficulty - originalDifficulty) >= 0.1;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Visual Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle pressed={showNodes} onPressedChange={setShowNodes} size="sm" aria-label="Toggle Nodes">
                   <GitCommitHorizontal className="w-4 h-4" />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showNodes 
                  ? "Hide the graph nodes from the map view." 
                  : "Show all graph nodes on the map."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle pressed={showEdges} onPressedChange={setShowEdges} size="sm" aria-label="Toggle Edges">
                   <Waypoints className="w-4 h-4" />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showEdges 
                  ? "Hide the graph edges from the map view." 
                  : "Show all graph edges on the map."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="w-px h-4 bg-border mx-1" />
          <MapVisibilityToggle
            mode={backgroundMode}
            onModeChange={setBackgroundMode}
            className="h-8 w-8"
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" size="sm" className="h-8 w-8 p-0 ml-auto"
                  onClick={() => setShowInfo(true)}
                >
                  <Info className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open the information guide for graph modification features.</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <ModifyGraphInfoDialog isOpen={showInfo} onClose={() => setShowInfo(false)} />
      </div>

      <div className="p-4 border-b border-border space-y-4">
        
        <div className="space-y-3 p-3">
            <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1">
                    <label className="text-xs font-medium">From</label>
                    <div className="flex gap-1 h-8">
                        <Input value={modifyFrom} onChange={e => setModifyFrom(e.target.value)} placeholder="ID" className="h-full text-xs min-w-0 flex-1" />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                  size="sm" variant={pickingTarget === "from" ? "default" : "outline"} className="h-full w-8 px-0 shrink-0"
                                  onClick={() => setPickingTarget(pickingTarget === "from" ? null : "from")}
                              >
                                  <MousePointer2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Click to pick the starting point from the map.</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
                <div className="space-y-1 flex-1">
                    <label className="text-xs font-medium">To</label>
                    <div className="flex gap-1 h-8">
                        <Input value={modifyTo} onChange={e => setModifyTo(e.target.value)} placeholder="ID" className="h-full text-xs min-w-0 flex-1" />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                  size="sm" variant={pickingTarget === "to" ? "default" : "outline"} className="h-full w-8 px-0 shrink-0"
                                  onClick={() => setPickingTarget(pickingTarget === "to" ? null : "to")}
                              >
                                  <MousePointer2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Click to pick the destination point from the map.</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
                {originalDifficulty !== null && (
                    <div className="h-8 flex items-center">
                         <DifficultyTag difficulty={originalDifficulty} scoringModel={getEventScoringModel(selectedEvent)} />
                    </div>
                )}
            </div>
            
            <div className="space-y-1">
                <label className="text-xs font-medium">Objective</label>
                <Select value={modifyObjective} onValueChange={(v: ModifyObjective) => setModifyObjective(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="max">Maximize Difficulty</SelectItem>
                        <SelectItem value="target">Target Difficulty</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {modifyObjective === "target" && (
                    <div className="space-y-1">
                    <label className="text-xs font-medium">Target Value</label>
                    <Input type="number" value={modifyTargetDiff} onChange={e => setModifyTargetDiff(parseFloat(e.target.value))} className="h-8 text-xs" step="0.1"/>
                </div>
            )}
            <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1">
                    <label className="text-xs font-medium">Strategy</label>
                    <Select value={modifyStrategy} onValueChange={(v: ModifyStrategy) => setModifyStrategy(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="remove">Remove Edge</SelectItem>
                            <SelectItem value="oneway">Make One-Way</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {setExcludeStairs && (
                    <div className="flex items-center space-x-2 h-8 pb-1.5">
                        <Checkbox 
                            id="excludeStairs" 
                            checked={excludeStairs} 
                            onCheckedChange={(c) => setExcludeStairs(c === true)} 
                        />
                        <label
                            htmlFor="excludeStairs"
                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 whitespace-nowrap"
                        >
                            Exclude edges with ignored length
                        </label>
                    </div>
                )}
            </div>
        </div>

        <div className="flex gap-2">
             {!isRunning ? (
                 <Button onClick={runAnalysis} className="flex-1 gap-2">
                     <Play className="w-4 h-4" /> Run Analysis
                 </Button>
             ) : (
                 <Button onClick={handleStop} variant="destructive" className="flex-1 gap-2">
                     <Square className="w-4 h-4" /> Stop
                 </Button>
             )}
        </div>
        
        {isRunning && (
            <div className="space-y-1">
                 <Progress value={progress} className="h-2" />
                 <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{processedCount} / {totalCount}</span>
                    <span>{Math.round(progress)}%</span>
                 </div>
            </div>
        )}
      </div>

      <ScrollArea className="flex-1 w-full">
          <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
                  <tr className="border-b">
                      <th className="h-10 px-4 text-left font-medium">Result</th>
                      <th className="h-10 px-4 text-right font-medium">Difficulty</th>
                      <th className="h-10 px-4 text-center font-medium">Action</th>
                  </tr>
              </thead>
              <tbody>
                  {visibleResults.map((res) => {
                       const isSelected = selectedResultId === res.id;
                       
                       let diffText = "";
                       if (originalDifficulty !== null) {
                           const diff = res.difficulty - originalDifficulty;
                           const sign = diff > 0 ? "+" : "";
                           if (Math.abs(diff) > 0.1) {
                               diffText = `${sign}${diff.toFixed(1)}`;
                           }
                       }

                       let lengthDiffText = "";
                       if (originalLength !== null) {
                           const diff = res.length - originalLength;
                           const sign = diff > 0 ? "+" : "";
                           lengthDiffText = ` (${sign}${Math.round(diff)}m
                           )`;
                       }

                       return (
                           <tr 
                                key={res.id} 
                                className={cn("border-b transition-colors hover:bg-muted/50 cursor-pointer", isSelected && "bg-primary text-primary-foreground hover:bg-primary/90")}
                                onClick={() => handleRowClick(res, true)}
                            >
                                <td className="p-4 align-middle">
                                    <div className="font-medium text-xs">{res.modification?.description}</div>
                                    <div className={cn("text-[10px] mt-0.5", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>New length: {Math.round(res.length)}m{lengthDiffText}</div>
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <div className="flex flex-col items-end gap-0.5">
                                        <DifficultyTag difficulty={res.difficulty} scoringModel={getEventScoringModel(selectedEvent)} />
                                        {diffText && (
                                            <span className={cn("text-[10px] font-medium", parseFloat(diffText) > 0 ? "text-green-600" : "text-red-600")}>
                                                {diffText}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 align-middle text-center">
                                    <div className="flex gap-2 justify-center">
                                        <Button 
                                            variant="ghost" size="icon" className="h-8 w-8 text-xs flex items-center justify-center border"
                                            onClick={(e) => { e.stopPropagation(); handleRowClick(res, true); }}
                                            title="Navigate to route"
                                        >
                                            <Navigation className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" size="icon" className="h-8 w-8 text-xs flex items-center justify-center border hover:bg-destructive/10 hover:text-destructive"
                                            onClick={(e) => { e.stopPropagation(); handleApply(res); }}
                                            title="Apply modification"
                                        >
                                            <Wrench className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                           </tr>
                       );
                  })}
                  {visibleResults.length === 0 && !isRunning && (
                      <tr>
                          <td colSpan={3} className="p-4 text-center text-muted-foreground h-24">
                              No results.
                          </td>
                      </tr>
                  )}
              </tbody>
          </table>
      </ScrollArea>
    </div>
  );
}
