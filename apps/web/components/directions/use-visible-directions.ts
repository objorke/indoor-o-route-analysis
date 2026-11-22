import { useFeatureFlags } from "@indoor-o-route-analysis/ui";
import type { EventData, DirectionFeature } from "@indoor-o-route-analysis/core";

const EMPTY: DirectionFeature[] = [];

/** The event's course directions for display in map views, or nothing while the Directions feature flag is off. */
export function useVisibleDirections(event: EventData | null | undefined): DirectionFeature[] {
  const { flags } = useFeatureFlags();
  if (!flags.directions) return EMPTY;
  return event?.raceCourses?.[0]?.directions ?? EMPTY;
}
