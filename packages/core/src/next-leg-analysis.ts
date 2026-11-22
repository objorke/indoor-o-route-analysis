/**
 * Abortable, incremental analysis of candidate next legs.
 *
 * Used by Course Setting for both "Color by difficulty" and the "Next leg
 * suggestions" list: for each candidate control, find the quickest route from
 * the last course control and report its distance and difficulty. The loop
 * yields to the event loop regularly so the UI stays responsive and can show
 * progress, and it stops as soon as the given AbortSignal fires.
 */

import type { RouteAnalyzer } from "./route-analyzer";

export interface NextLegResult {
  controlId: string;
  /** Route length in meters */
  distance: number;
  difficulty: number;
}

export interface NextLegProgress {
  done: number;
  total: number;
}

export interface AnalyzeNextLegsOptions {
  /** Abort to stop the analysis; the promise then resolves with partial results. */
  signal?: AbortSignal;
  /** Called after each candidate with the running count. */
  onProgress?: (progress: NextLegProgress) => void;
  /** Called with each successful result as soon as it is available. */
  onResult?: (result: NextLegResult) => void;
  /** Max time (ms) to compute before yielding to the event loop. Default 16. */
  timeSliceMs?: number;
}

export interface AnalyzeNextLegsOutcome {
  results: NextLegResult[];
  /** True if the analysis was stopped via the abort signal before finishing. */
  aborted: boolean;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Minimal subset of RouteAnalyzer needed here (eases testing). */
type LegRouteFinder = Pick<RouteAnalyzer, "findAlternativePathsBetweenControls">;

export async function analyzeNextLegs(
  analyzer: LegRouteFinder,
  fromControlId: string,
  candidateControlIds: string[],
  options: AnalyzeNextLegsOptions = {},
): Promise<AnalyzeNextLegsOutcome> {
  const { signal, onProgress, onResult, timeSliceMs = 16 } = options;
  const total = candidateControlIds.length;
  const results: NextLegResult[] = [];

  // Yield once up front so callers can render their "busy" state first.
  await yieldToEventLoop();
  if (signal?.aborted) return { results, aborted: true };
  onProgress?.({ done: 0, total });

  let sliceStart = Date.now();
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) return { results, aborted: true };

    const targetId = candidateControlIds[i];
    try {
      const routes = analyzer.findAlternativePathsBetweenControls(fromControlId, targetId, 1);
      if (routes.length > 0) {
        const result: NextLegResult = {
          controlId: targetId,
          distance: routes[0].distance,
          difficulty: routes[0].difficulty,
        };
        results.push(result);
        onResult?.(result);
      }
    } catch (e) {
      console.warn(`Failed to find route ${fromControlId} → ${targetId}`, e);
    }
    onProgress?.({ done: i + 1, total });

    if (Date.now() - sliceStart >= timeSliceMs) {
      await yieldToEventLoop();
      sliceStart = Date.now();
    }
  }

  return { results, aborted: signal?.aborted ?? false };
}
