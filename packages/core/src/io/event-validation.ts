/**
 * Structural validation of event data read from files (JSON event files, the
 * MCP server, the CLIs). Malformed or hostile files are rejected at import
 * with a readable message, instead of crashing a view later. Type guards only,
 * no schema dependency. Unknown extra fields are allowed.
 */

import { DIRECTION_KINDS, isDirectionPointKind } from "../models/directions";

const MAX_ERRORS = 20;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Returns human-readable problems; an empty array means the structure is usable. */
export function findEventStructureErrors(data: unknown): string[] {
  const errors: string[] = [];
  const add = (msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };

  if (!isObject(data)) return ["the file does not contain an event object"];
  if (typeof data.id !== "string" || !data.id) add("id must be a non-empty string");
  if (typeof data.name !== "string") add("name must be a string");
  if (data.startTime !== undefined && !isObject(data.startTime)) add("startTime must be an object");

  const optionalString = (obj: Record<string, unknown>, key: string, path: string) => {
    if (obj[key] !== undefined && obj[key] !== null && typeof obj[key] !== "string") add(`${path}.${key} must be a string`);
  };
  for (const key of ["eventUrl", "eventImageUrl", "mapDownloadUrl", "country", "difficultyScoringModel"]) {
    optionalString(data, key, "event");
  }

  const position = (v: unknown, path: string) => {
    if (!isObject(v) || !isFiniteNumber(v.x) || !isFiniteNumber(v.y)) add(`${path} must have numeric x and y`);
  };
  const list = (v: unknown, path: string, each: (item: unknown, itemPath: string) => void) => {
    if (v === undefined || v === null) return;
    if (!Array.isArray(v)) {
      add(`${path} must be an array`);
      return;
    }
    v.forEach((item, i) => {
      if (errors.length < MAX_ERRORS) each(item, `${path}[${i}]`);
    });
  };

  list(data.raceCourses, "raceCourses", (rc, rcPath) => {
    if (!isObject(rc)) return add(`${rcPath} must be an object`);

    list(rc.controls, `${rcPath}.controls`, (c, p) => {
      if (!isObject(c)) return add(`${p} must be an object`);
      if (typeof c.id !== "string") add(`${p}.id must be a string`);
      position(c.mapPosition, `${p}.mapPosition`);
    });

    list(rc.courses, `${rcPath}.courses`, (course, p) => {
      if (!isObject(course)) return add(`${p} must be an object`);
      if (typeof course.id !== "string") add(`${p}.id must be a string`);
      list(course.controls ?? [], `${p}.controls`, (cc, ccPath) => {
        if (!isObject(cc) || typeof cc.controlId !== "string") add(`${ccPath}.controlId must be a string`);
      });
    });

    list(rc.vertices, `${rcPath}.vertices`, (v, p) => {
      if (!isObject(v) || typeof v.id !== "string" || !isFiniteNumber(v.x) || !isFiniteNumber(v.y)) {
        add(`${p} must have a string id and numeric x and y`);
      }
    });

    list(rc.edges, `${rcPath}.edges`, (e, p) => {
      if (!isObject(e) || typeof e.from !== "string" || typeof e.to !== "string") return add(`${p} must have string from and to`);
      if (e.length !== undefined && !(isFiniteNumber(e.length) && e.length >= 0)) add(`${p}.length must be a non-negative number`);
    });

    list(rc.polygons, `${rcPath}.polygons`, (poly, p) => {
      if (!isObject(poly)) return add(`${p} must be an object`);
      list(poly.points, `${p}.points`, (pt, ptPath) => position(pt, ptPath));
      if (poly.points === undefined) add(`${p}.points is missing`);
    });

    list(rc.maps, `${rcPath}.maps`, (map, p) => {
      if (!isObject(map)) return add(`${p} must be an object`);
      if (map.image !== undefined && !isObject(map.image)) add(`${p}.image must be an object`);
      if (isObject(map.image)) {
        optionalString(map.image, "encodedData", `${p}.image`);
        optionalString(map.image, "url", `${p}.image`);
      }
      if (map.scale !== undefined && !isFiniteNumber(map.scale)) add(`${p}.scale must be a number`);
    });

    list(rc.directions, `${rcPath}.directions`, (f, p) => {
      if (!isObject(f)) return add(`${p} must be an object`);
      if (typeof f.id !== "string") add(`${p}.id must be a string`);
      if (typeof f.kind !== "string" || !(DIRECTION_KINDS as readonly string[]).includes(f.kind)) return add(`${p}.kind is not a known direction symbol`);
      if (isDirectionPointKind(f.kind)) {
        position(f.position, `${p}.position`);
        if (!isFiniteNumber(f.rotation)) add(`${p}.rotation must be a number`);
      } else {
        if (!Array.isArray(f.points)) return add(`${p}.points must be an array`);
        list(f.points, `${p}.points`, (pt, ptPath) => position(pt, ptPath));
      }
    });

    list(rc.customRoutes, `${rcPath}.customRoutes`, (r, p) => {
      if (!isObject(r)) add(`${p} must be an object`);
    });
    list(rc.classAssignments, `${rcPath}.classAssignments`, (a, p) => {
      if (!isObject(a)) add(`${p} must be an object`);
    });
  });

  return errors;
}

/** Throws a readable error when the event structure is unusable. */
export function assertValidEventStructure(data: unknown): void {
  const errors = findEventStructureErrors(data);
  if (errors.length > 0) {
    const shown = errors.slice(0, 5).join("; ");
    const more = errors.length > 5 ? ` (and ${errors.length - 5} more)` : "";
    throw new Error(`Invalid event file: ${shown}${more}`);
  }
}
