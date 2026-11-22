import { Control } from "./models/control";
import { Course } from "./models/course";
import { EventData, RaceCourseData } from "./models/event";
import { MapData } from "./models/map";

// Old interfaces for reference/input typing
interface ControlExtensions {
  level?: number;
}
interface OldControl extends Omit<Control, "level"> {
  extensions?: ControlExtensions;
  level?: number; // In case it's already migrated or mixed
}

interface CourseExtensions {
  numberOfCompetitors?: number;
}
interface OldCourse extends Omit<Course, "numberOfCompetitors"> {
  extensions?: CourseExtensions;
  numberOfCompetitors?: number;
}

interface MapExtensions {
  layout: "horizontal" | "vertical" | "pages";
  saveEncoded?: boolean;
}
interface OldMapData extends Omit<MapData, "layout" | "saveEncoded"> {
  extensions?: MapExtensions;
  layout?: "horizontal" | "vertical" | "pages";
  saveEncoded?: boolean;
}

interface EventExtensions {
  country: "norway" | "sweden" | "";
  eventUrl?: string;
  eventImageUrl?: string;
  difficultyScoringModel?: string;
}
interface OldEventData extends Omit<EventData, "country" | "eventUrl" | "eventImageUrl" | "difficultyScoringModel" | "raceCourses"> {
  extensions?: EventExtensions;
  raceCourses?: OldRaceCourseData[];
  // New props
  country?: "norway" | "sweden" | "";
  eventUrl?: string;
  eventImageUrl?: string;
  difficultyScoringModel?: string;
}

interface RaceExtensions {
  vertices?: any[];
  edges?: any[];
  polygons?: any[];
  customRoutes?: any[];
}
interface OldRaceCourseData extends Omit<RaceCourseData, "vertices" | "edges" | "polygons" | "customRoutes" | "courses" | "controls" | "maps"> {
  extensions?: RaceExtensions;
  courses?: OldCourse[];
  controls?: OldControl[];
  maps?: OldMapData[];
  // New props
  vertices?: any[];
  edges?: any[];
  polygons?: any[];
  customRoutes?: any[];
}

export function migrateEventData(data: any): EventData {
  const oldEvent = data as OldEventData;

  const newEvent: EventData = {
    ...oldEvent,
    id: oldEvent.id || "",
    name: oldEvent.name || "",
    startTime: oldEvent.startTime || { date: new Date().toISOString().split("T")[0] },
    country: oldEvent.country || oldEvent.extensions?.country || "",
    eventUrl: oldEvent.eventUrl || oldEvent.extensions?.eventUrl,
    eventImageUrl: oldEvent.eventImageUrl || oldEvent.extensions?.eventImageUrl,
    difficultyScoringModel: oldEvent.difficultyScoringModel || oldEvent.extensions?.difficultyScoringModel,
    raceCourses: oldEvent.raceCourses ? oldEvent.raceCourses.map(migrateRaceCourseData) : undefined,
  };

  if ("extensions" in newEvent) {
    delete (newEvent as any).extensions;
  }

  return newEvent;
}

function migrateRaceCourseData(data: OldRaceCourseData): RaceCourseData {
  const rawEdges: any[] | undefined = data.edges || data.extensions?.edges;
  const edges = rawEdges?.map(({ id: _id, ...rest }: any) => rest);

  const newRC: RaceCourseData = {
    ...data,
    vertices: data.vertices || data.extensions?.vertices,
    edges,
    polygons: data.polygons || data.extensions?.polygons,
    customRoutes: data.customRoutes || data.extensions?.customRoutes,
    courses: data.courses ? data.courses.map(migrateCourse) : undefined,
    controls: data.controls ? data.controls.map(migrateControl) : undefined,
    maps: data.maps ? data.maps.map(migrateMapData) : undefined,
  };

  if ("extensions" in newRC) {
    delete (newRC as any).extensions;
  }

  return newRC;
}

function migrateCourse(data: OldCourse): Course {
  const newCourse: Course = {
    ...data,
    numberOfCompetitors: data.numberOfCompetitors || data.extensions?.numberOfCompetitors,
  };

  if ("extensions" in newCourse) {
    delete (newCourse as any).extensions;
  }

  return newCourse;
}

function migrateControl(data: OldControl): Control {
  const newControl: Control = {
    ...data,
    // Level migrated away or removed
  };

  if ("extensions" in newControl) {
    delete (newControl as any).extensions;
  }

  return newControl;
}

function migrateMapData(data: OldMapData): MapData {
  const newMap: MapData = {
    ...data,
    layout: data.layout || data.extensions?.layout || "horizontal",
    saveEncoded: data.saveEncoded !== undefined ? data.saveEncoded : data.extensions?.saveEncoded,
  };

  if ("extensions" in newMap) {
    delete (newMap as any).extensions;
  }
  // "Show control points" is an app setting now (Settings → General), not stored per map
  if ("showControlPoints" in newMap) {
    delete (newMap as any).showControlPoints;
  }

  return newMap;
}
