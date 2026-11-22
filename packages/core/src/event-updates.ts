import type { EventData, RaceCourseData } from "./models/event";
import type { MapData } from "./models/map";

/**
 * Pure, immutable updaters for EventData. Use them with the app's functional
 * `updateEvent(id, (prev) => next)` so every edit starts from the latest event
 * instead of a copy captured at render time (which silently drops concurrent
 * edits).
 *
 * The app edits the first race course and its first map; see
 * TASKS.md "Single map vs per-course maps".
 */

const EMPTY_RACE_COURSE: RaceCourseData = { courses: [], controls: [], maps: [] };

/** Replace the first race course, creating it when the event has none. */
export function updateRaceCourse(event: EventData, fn: (raceCourse: RaceCourseData) => RaceCourseData): EventData {
  const raceCourses = event.raceCourses ?? [];
  const current = raceCourses[0] ?? EMPTY_RACE_COURSE;
  const next = fn(current);
  if (next === current && raceCourses.length > 0) return event;
  return { ...event, raceCourses: [next, ...raceCourses.slice(1)] };
}

/** Shallow-merge fields into the first race course (e.g. `{ controls }`), keeping the other fields as they are now. */
export function mergeRaceCourse(event: EventData, updates: Partial<RaceCourseData>): EventData {
  return updateRaceCourse(event, (rc) => ({ ...rc, ...updates }));
}

/** Replace the primary map. No-op (same object) when the event has no map. */
export function updatePrimaryMap(event: EventData, fn: (map: MapData) => MapData): EventData {
  const map = event.raceCourses?.[0]?.maps?.[0];
  if (!map) return event;
  return updateRaceCourse(event, (rc) => {
    const maps = [...(rc.maps ?? [])];
    maps[0] = fn(map);
    return { ...rc, maps };
  });
}

/** Set the primary map, adding it (and the race course) when missing. */
export function setPrimaryMap(event: EventData, map: MapData): EventData {
  return updateRaceCourse(event, (rc) => {
    const maps = [...(rc.maps ?? [])];
    if (maps.length > 0) maps[0] = map;
    else maps.push(map);
    return { ...rc, maps };
  });
}
