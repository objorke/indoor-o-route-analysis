
import { createEventRouteAnalyzer } from "@indoor-o-route-analysis/core";
import type { Edge, Node, Control, EventData } from "@indoor-o-route-analysis/core";

export interface AnalysisResult {
  id: string; // unique id for key
  from: string;
  to: string;
  routeName: string;
  labels: string[];
  length: number;
  time?: number;
  difficulty: number;
  path: string[];
  // For Modify Graph
  modification?: {
      type: "remove" | "oneway-fwd" | "oneway-rev";
      edgeId: string;
      description: string;
      originalEdge: Edge;
  };
}

export type ModifyStrategy = "remove" | "oneway";
export type ModifyObjective = "max" | "target";

export interface AnalysisParams {
    edges: Edge[];
    nodes: Node[];
    controls: Control[];
    /** Event the graph belongs to; analyzers for each variant are set up from it. */
    event: EventData;
    modifyFrom: string;
    modifyTo: string;
    modifyStrategy: ModifyStrategy;
    modifyObjective: ModifyObjective;
    modifyTargetDiff: number;
    excludeStairs: boolean;
    originalRoutePath?: string[]; // The path of node IDs from the original best route
    signal: AbortSignal;
    onProgress: (progress: number, processed: number, total: number, currentResults: AnalysisResult[]) => Promise<void>;
}

export async function runModifyGraphAnalysis(params: AnalysisParams) {
    const {
        edges,
        nodes,
        controls,
        event,
        modifyFrom,
        modifyTo,
        modifyStrategy,
        modifyObjective,
        modifyTargetDiff,
        excludeStairs,
        originalRoutePath,
        signal,
        onProgress
    } = params;

    const newResults: AnalysisResult[] = [];
    const topN = 50;

    let candidateEdges: Edge[] = [];

    if (originalRoutePath && originalRoutePath.length > 1) {
        // Only consider edges on the original route
        const routeEdges = new Set<Edge>();
        for (let i = 0; i < originalRoutePath.length - 1; i++) {
            const u = originalRoutePath[i];
            const v = originalRoutePath[i+1];
            
            // Find edge connecting u and v
            const edge = edges.find(e => 
                (e.from === u && e.to === v) || 
                (e.from === v && e.to === u && !e.oneWay)
            );
            
            if (edge) {
                routeEdges.add(edge);
            }
        }
        candidateEdges = Array.from(routeEdges);
    } else {
        // If no original route provided, fallback to all edges (or should we return empty?)
        // The prompt implies we should rely on original route for optimization.
        // If no route exists, we can't really modify it to make it harder.
        // But maybe we want to make *any* route impossible?
        // Let's stick to all edges if no path provided, but user said "you only need to consider edges on the original route".
        // If originalRoutePath is missing, maybe we shouldn't run. But let's be safe and use all edges if undefined.
        candidateEdges = edges;
    }

    const totalEdges = candidateEdges.length;
    const chunkSize = 5;
    let processed = 0;

    for (let i = 0; i < totalEdges; i++) {
        if (signal.aborted) break;
        const edge = candidateEdges[i];

        // If excluding stairs, skip edges where ignoreLength is true (normally stairs)
        if (excludeStairs && edge.ignoreLength) continue;


        // Define variants based on strategy
        const variants = [];
        if (modifyStrategy === "remove") {
                variants.push({ type: "remove", desc: `Remove ${edge.from}-${edge.to}` });
        } else if (modifyStrategy === "oneway") {
                variants.push({ type: "oneway-fwd", desc: `One-way ${edge.from} -> ${edge.to}` });
                variants.push({ type: "oneway-rev", desc: `One-way ${edge.to} -> ${edge.from}` });
        }

        for (const variant of variants) {
            let tempEdges: Edge[] = [];
            // Prepare modified edges list
            if (variant.type === "remove") {
                tempEdges = edges.filter(e => e !== edge);
            } else if (variant.type === "oneway-fwd") {
                // Forward: from->to
                tempEdges = edges.map(e => e === edge ? { ...e, oneWay: true } : e);
            } else if (variant.type === "oneway-rev") {
                // Reverse: to->from (swap ids and set oneWay)
                tempEdges = edges.map(e => e === edge ? { ...e, oneWay: true, from: edge.to, to: edge.from } : e);
            } else {
                continue;
            }

            // Create Analyzer
            const analyzer = createEventRouteAnalyzer(event, { edges: tempEdges });

            // Run routing
            try {
                const routes = analyzer.findAlternativePaths(modifyFrom, modifyTo, 1);
                if (routes.length > 0) {
                    const route = routes[0];
                    if (Number.isFinite(route.distance) && route.distance > 0) {
                        newResults.push({
                            id: `mod-${edge.from}-${edge.to}-${i}-${variant.type}`,
                            from: modifyFrom,
                            to: modifyTo,
                            routeName: variant.desc,
                            labels: route.labels || [],
                            length: route.distance,
                            difficulty: route.difficulty,
                            path: route.path,
                            modification: {
                                type: variant.type as "remove" | "oneway-fwd" | "oneway-rev",
                                edgeId: `${edge.from}-${edge.to}`,
                                description: variant.desc,
                                originalEdge: edge
                            }
                        });
                    }
                }
            } catch {
                // routing failed
            }
        }

        processed++;
        if (processed % chunkSize === 0) {
            const progressVal = (processed / totalEdges) * 100;
            
            // Sort
            sortResults(newResults, modifyObjective, modifyTargetDiff);

            if (newResults.length > topN * 5) newResults.length = topN * 5;
            await onProgress(progressVal, processed, totalEdges, newResults.slice(0, topN));
        }
    }

    if (!signal.aborted) {
        sortResults(newResults, modifyObjective, modifyTargetDiff);
        return newResults.slice(0, topN);
    }
    return [];
}

function sortResults(results: AnalysisResult[], objective: ModifyObjective, targetDiff: number) {
    if (objective === "max") {
        results.sort((a, b) => b.difficulty - a.difficulty);
    } else {
        results.sort((a, b) => Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff));
    }
}
