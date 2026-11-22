/**
 * Single place that decides how a RouteAnalyzer is set up for an event.
 *
 * Every view, CLI tool and the MCP server should create analyzers through
 * `createEventRouteAnalyzer` so that route search and difficulty scores are
 * computed from the same inputs everywhere:
 *
 * - controls, graph vertices and edges from the event's race course
 * - floor polygons (needed for stair counting in the difficulty score and for
 *   the level-change penalty when searching for alternative routes)
 * - the map scale of the course's map (see `getEventMapScale`)
 * - the event's difficulty scoring model, unless one is given explicitly
 */

import type { EventData } from "./models/event";
import { getActiveMap } from "./models/event";
import type { Edge } from "./models/graph";
import { RouteAnalyzer } from "./route-analyzer";
import type { RouteAnalyzerVisualizer } from "./route-analyzer-visualizer";
import type { ScoringModel } from "./scoring-models/base";
import { ScoringModelRegistry } from "./scoring-models/registry";

/** Map scale used when the event has no map or the map has no scale (1:1000). */
export const DEFAULT_MAP_SCALE = 1000;

/**
 * Map scale for an event (or one of its courses): the scale of the course's
 * map, falling back to the first map, then to DEFAULT_MAP_SCALE.
 */
export function getEventMapScale(event: EventData | null | undefined, courseId?: string | null): number {
  const scale = getActiveMap(event ?? undefined, courseId)?.scale;
  return scale && Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_MAP_SCALE;
}

/**
 * Scoring model for an event: the explicitly requested model id if it is
 * registered, otherwise the event's own model, otherwise the default.
 */
export function getEventScoringModel(event: EventData | null | undefined, scoringModelId?: string): ScoringModel {
  if (scoringModelId) {
    const requested = ScoringModelRegistry.getModel(scoringModelId);
    if (requested) return requested;
  }
  return ScoringModelRegistry.getModelOrDefault(event?.difficultyScoringModel);
}

export interface EventRouteAnalyzerOptions {
  /** Course whose map scale should be used (defaults to the first map). */
  courseId?: string | null;
  /** Scoring model instance; takes precedence over `scoringModelId`. */
  scoringModel?: ScoringModel;
  /** Scoring model id (id@version); defaults to the event's model. */
  scoringModelId?: string;
  /** Replacement edge list, e.g. a "what if" variant of the graph. */
  edges?: Edge[];
  /** Optional visualizer/trace recorder. */
  visualizer?: RouteAnalyzerVisualizer;
}

/** Create a RouteAnalyzer for an event with the canonical inputs (see module docs). */
export function createEventRouteAnalyzer(
  event: EventData | null | undefined,
  options: EventRouteAnalyzerOptions = {},
): RouteAnalyzer {
  const raceCourse = event?.raceCourses?.[0];
  return new RouteAnalyzer(
    raceCourse?.controls ?? [],
    raceCourse?.vertices ?? [],
    options.edges ?? raceCourse?.edges ?? [],
    getEventMapScale(event, options.courseId),
    options.scoringModel ?? getEventScoringModel(event, options.scoringModelId),
    raceCourse?.polygons ?? [],
    options.visualizer,
  );
}
