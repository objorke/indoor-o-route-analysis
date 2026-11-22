import type { Course } from "./course";
import type { Control } from "./control";
import type { Edge, Node } from "./graph";
import type { MapPosition, MapData } from "./map";
import { getDocumentDimensions } from "./map";
import type { DirectionFeature } from "./directions";
import type { Polygon } from "./polygon";
import type { CustomRoute } from "./route";

// IOF event model

export interface EventData {
  id: string;
  name: string; // was title
  startTime: DateAndOptionalTime; // was date
  raceCourses?: RaceCourseData[];

  // Extensions to the IOF event model
  country: "norway" | "sweden" | "";
  eventUrl?: string; // e.g. eventor link
  eventImageUrl?: string; // e.g. logo or banner
  mapDownloadUrl?: string; // link to download the map (PDF/JPG)
  difficultyScoringModel?: string; // e.g. "basic@0.1"
}

export interface DateAndOptionalTime {
  date: string; // "YYYY-MM-DD" ISO 8601
  time?: string; // "10:00:00+01:00" ISO 8601
}

export interface ClassCourseAssignment {
  className: string;
  courseName: string;
  numberOfCompetitors?: number;
}

export interface RaceCourseData {
  courses?: Course[];
  controls?: Control[];
  maps?: MapData[];
  classAssignments?: ClassCourseAssignment[];
 // Extensions to the IOF RaceCourse model
  vertices?: Node[];
  edges?: Edge[];
  polygons?: Polygon[];
  /** Course direction symbols (uncrossable borders, out of bounds, one-way, crossings). */
  directions?: DirectionFeature[];
  customRoutes?: CustomRoute[];
}

export function getActiveMap(event?: EventData, courseId?: string | null): MapData | undefined {
  if (!event || !event.raceCourses || event.raceCourses.length === 0) return undefined;

  const raceCourse = event.raceCourses[0];
  const maps = raceCourse.maps || [];

  if (maps.length === 0) return undefined;

  // If we have a course ID, try to find the map associated with that course
  if (courseId) {
    const course = raceCourse.courses?.find((c) => c.id === courseId);
    if (course && course.mapId) {
      const map = maps.find((m) => m.id === course.mapId);
      if (map) return map;
    }
  }

  // Default to the first map if no course specified or map not found
  return maps[0];
}

/**
 * Returns transform functions that convert between document coordinates (mm) and
 * IOF event coordinates (MapPosition).
 *
 * @param mapData - The map data containing calibration and layout info.
 * @param pageIndex - Zero-based page index. Used when `pageTransformMode` is "manual"
 *   to select the per-page transform. Ignored in "automatic" mode.
 */
/**
 * Returns the zero-based page index for a given IOF event position, based on
 * which manual per-page bounding box contains the point.
 * Falls back to 0 for single-page or automatic-mode maps.
 */
export function getPageIndexForEventPos(
  eventPos: { x: number; y: number },
  mapData: MapData | undefined,
): number {
  if (
    !mapData ||
    mapData.pageTransformMode !== "manual" ||
    (mapData.layout !== "horizontal" && mapData.layout !== "vertical")
  ) {
    return 0;
  }

  const pageCount = mapData.pageCount || 1;
  for (let i = 0; i < pageCount; i++) {
    const pageTx = mapData.pageTransforms?.[i];
    if (!pageTx) continue;
    const minX = Math.min(pageTx.topLeft.x, pageTx.bottomRight.x);
    const maxX = Math.max(pageTx.topLeft.x, pageTx.bottomRight.x);
    const minY = Math.min(pageTx.topLeft.y, pageTx.bottomRight.y);
    const maxY = Math.max(pageTx.topLeft.y, pageTx.bottomRight.y);
    if (eventPos.x >= minX && eventPos.x <= maxX && eventPos.y >= minY && eventPos.y <= maxY) {
      return i;
    }
  }
  return 0;
}

export function getEventTransform(mapData?: MapData, pageIndex?: number) {
  // If no map or invalid dimensions, return identity
  if (!mapData || !mapData.image.width || !mapData.image.height) {
    return {
      toMap: (p: MapPosition) => p,
      toEvent: (p: MapPosition) => p,
    };
  }

  const pageW = mapData.image.width;
  const pageH = mapData.image.height;

  // Manual per-page transforms
  if (mapData.pageTransformMode === "manual") {
    const idx = pageIndex ?? 0;
    const pageTx = mapData.pageTransforms?.[idx];
    const tl = pageTx?.topLeft ?? mapData.mapPositionTopLeft ?? { x: 0, y: 0 };
    const br = pageTx?.bottomRight ?? mapData.mapPositionBottomRight ?? { x: pageW, y: pageH };

    const srcW = br.x - tl.x;
    const srcH = br.y - tl.y;

    if (Math.abs(srcW) < 1e-6 || Math.abs(srcH) < 1e-6) {
      return {
        toMap: (p: MapPosition) => p,
        toEvent: (p: MapPosition) => p,
      };
    }

    // In manual mode, page document coordinates run from 0 to pageW / pageH
    const scaleX = pageW / srcW;
    const scaleY = pageH / srcH;

    return {
      toMap: (p: MapPosition) => ({
        x: (p.x - tl.x) * scaleX,
        y: (p.y - tl.y) * scaleY,
      }),
      toEvent: (p: MapPosition) => ({
        x: p.x / scaleX + tl.x,
        y: p.y / scaleY + tl.y,
      }),
    };
  }

  const dims = getDocumentDimensions(mapData);
  const tl = mapData.mapPositionTopLeft || { x: 0, y: 0 };
  const br = mapData.mapPositionBottomRight || { x: dims.width, y: dims.height };

  // If calibration coordinates define a width/height of 0, avoid division by zero
  const srcX0 = tl.x;
  const srcY0 = tl.y;
  const srcW = br.x - tl.x;
  const srcH = br.y - tl.y;

  const dstW = dims.width;
  const dstH = dims.height;

  if (Math.abs(srcW) < 1e-6 || Math.abs(srcH) < 1e-6) {
    return {
      toMap: (p: MapPosition) => p,
      toEvent: (p: MapPosition) => p,
    };
  }

  const scaleX = dstW / srcW;
  const scaleY = dstH / srcH;

  return {
    toMap: (p: MapPosition) => ({
      x: (p.x - srcX0) * scaleX,
      y: (p.y - srcY0) * scaleY,
    }),
    toEvent: (p: MapPosition) => ({
      x: p.x / scaleX + srcX0,
      y: p.y / scaleY + srcY0,
    }),
  };
}
