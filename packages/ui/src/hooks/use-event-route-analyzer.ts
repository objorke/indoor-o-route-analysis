import { useMemo } from "react";
import {
  createEventRouteAnalyzer,
  getEventMapScale,
  getEventScoringModel,
  type EventData,
  type RouteAnalyzer,
  type ScoringModel,
} from "@indoor-o-route-analysis/core";

export interface UseEventRouteAnalyzerOptions {
  /** Course whose map scale should be used. */
  courseId?: string | null;
  /** Scoring model instance; takes precedence over `scoringModelId`. */
  scoringModel?: ScoringModel;
  /** Scoring model id; defaults to the event's model. */
  scoringModelId?: string;
}

/**
 * Memoized `createEventRouteAnalyzer` for React views. The analyzer is only
 * rebuilt when one of its inputs changes (controls, graph, floor polygons, map
 * scale or scoring model), not on unrelated event edits such as renaming a course.
 */
export function useEventRouteAnalyzer(
  event: EventData | null | undefined,
  options: UseEventRouteAnalyzerOptions = {},
): RouteAnalyzer | null {
  const { courseId, scoringModelId } = options;
  const raceCourse = event?.raceCourses?.[0];
  const mapScale = getEventMapScale(event, courseId);
  // Registry instances are shared, so this is referentially stable for a given id
  const scoringModel = options.scoringModel ?? getEventScoringModel(event, scoringModelId);
  const hasEvent = !!event;

  return useMemo(
    () => (hasEvent ? createEventRouteAnalyzer(event, { courseId, scoringModel }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the analyzer inputs, not the whole event object
    [hasEvent, raceCourse?.controls, raceCourse?.vertices, raceCourse?.edges, raceCourse?.polygons, mapScale, scoringModel],
  );
}
