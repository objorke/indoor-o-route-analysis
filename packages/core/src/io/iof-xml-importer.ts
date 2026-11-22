import type { EventData, RaceCourseData, ClassCourseAssignment } from "../models/event";
import type { Control } from "../models/control";
import { edgeLengthOverride } from "../models/graph";
import { type Course, type MapExchangeType, DEFAULT_NUMBER_OF_COMPETITORS } from "../models/course";
import type { Node } from "../models/graph";
import type { Polygon } from "../models/polygon";
import { isDirectionPointKind, type DirectionFeature } from "../models/directions";
import type { Edge } from "../models/graph";
import type { MapData } from "../models/map";

export class IOFXmlImporter {
  /**
   * Parse IOF XML string into EventData structure
   * @param xmlString - IOF XML string to parse
   * @returns Partial EventData with parsed data
   * @throws Error if XML is invalid or missing required elements
   */
  public parse(xmlString: string): Partial<EventData> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    // Check for parser errors
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error(`XML parsing error: ${parserError.textContent}`);
    }

    // Helper functions to handle namespaces. They walk `children` rather than
    // getElementsByTagName("*"), which returns nothing for XML documents in
    // linkedom (used by the CLIs); `children` works in browsers, jsdom and linkedom.
    // From the document: any descendant; from an element: direct children only.
    const candidates = (el: Element | Document): Element[] => {
      if (el !== doc) return Array.from((el as Element).children);
      const out: Element[] = [];
      const stack: Element[] = Array.from(doc.children).reverse();
      while (stack.length > 0) {
        const n = stack.pop() as Element;
        out.push(n);
        for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
      }
      return out;
    };
    // linkedom keeps the prefix in localName ("x:Routes"); strip it everywhere
    const localNameOf = (n: Element) => (n.localName || n.tagName).split(":").pop() || "";

    const firstChildByLocalName = (el: Element | Document, name: string): Element | null =>
      candidates(el).find((n) => localNameOf(n) === name) ?? null;

    const allChildrenByLocalName = (el: Element | Document, name: string): Element[] =>
      candidates(el).filter((n) => localNameOf(n) === name);

    const textOf = (el: Element | null): string => (el?.textContent || "").trim();

    // Parse main structure
    const courseData = firstChildByLocalName(doc, "CourseData");
    if (!courseData) {
      throw new Error("Invalid IOF XML: missing CourseData root element");
    }

    const eventEl = firstChildByLocalName(courseData, "Event");
    const eventName = textOf(firstChildByLocalName(eventEl || courseData, "Name"));
    const eventDate = textOf(firstChildByLocalName(eventEl || courseData, "Date"));
    const _eventStartTime = textOf(firstChildByLocalName(eventEl || courseData, "StartTime")) || undefined; // If available

    // Parse Event Extensions (eventUrl, country, etc.)
    let eventUrl: string | undefined;
    let eventImageUrl: string | undefined;
    let country: "norway" | "sweden" | "" = "";
    
    if (eventEl) {
      const extensionsEl = firstChildByLocalName(eventEl, "Extensions");
      if (extensionsEl) {
        const eventUrlEl = firstChildByLocalName(extensionsEl, "EventUrl");
        if (eventUrlEl) {
          eventUrl = textOf(eventUrlEl);
        }
        const eventImageUrlEl = firstChildByLocalName(extensionsEl, "EventImageUrl");
        if (eventImageUrlEl) {
          eventImageUrl = textOf(eventImageUrlEl);
        }
        const countryEl = firstChildByLocalName(extensionsEl, "Country");
        if (countryEl) {
          const countryText = textOf(countryEl).toLowerCase();
          if (countryText === "norway" || countryText === "sweden") {
            country = countryText as "norway" | "sweden";
          }
        }
      }
    }

    const raceCourseData = firstChildByLocalName(courseData, "RaceCourseData");
    if (!raceCourseData) {
      throw new Error("Invalid IOF XML: missing RaceCourseData element");
    }

    // Parse Map scale and calibration
    const mapEl = firstChildByLocalName(raceCourseData, "Map");
    const scaleText = mapEl ? textOf(firstChildByLocalName(mapEl, "Scale")) : null;
    const mapScale = scaleText ? Number(scaleText) : 1000; // Default to 1000 if not specified

    // Extract Map Position if available (extent of OCAD map in mm)
    let mapPositionTopLeft: { x: number; y: number } | undefined;
    let mapPositionBottomRight: { x: number; y: number } | undefined;

    if (mapEl) {
      const topLeft = firstChildByLocalName(mapEl, "MapPositionTopLeft");
      if (topLeft) {
        mapPositionTopLeft = {
          x: Number(topLeft.getAttribute("x") || 0),
          y: Number(topLeft.getAttribute("y") || 0),
        };
      }
      const bottomRight = firstChildByLocalName(mapEl, "MapPositionBottomRight");
      if (bottomRight) {
        mapPositionBottomRight = {
          x: Number(bottomRight.getAttribute("x") || 0),
          y: Number(bottomRight.getAttribute("y") || 0),
        };
      }
    }

    // Create a map data object with parsed scale and extents
    const parsedMap: MapData = {
      id: crypto.randomUUID(),
      scale: mapScale,
      image: { url: "", width: 0, height: 0 }, // Placeholder - will be set when map image is loaded
      mapPositionTopLeft: mapPositionTopLeft || { x: 0, y: 0 },
      mapPositionBottomRight: mapPositionBottomRight,
      layout: "horizontal",
    };

    // Map control type
    const mapControlType = (t: string): "start" | "control" | "finish" => {
      const lt = (t || "").toLowerCase();
      if (lt === "start") return "start";
      if (lt === "finish") return "finish";
      return "control";
    };

    // Parse Controls
    const controlEls = allChildrenByLocalName(raceCourseData, "Control");
    const controls: Control[] = [];
    const controlById = new Map<string, Control>();

    controlEls.forEach((cEl) => {
      const typeAttr = (cEl.getAttribute("type") || "control").toLowerCase();
      const id = textOf(firstChildByLocalName(cEl, "Id"));
      const mapPos = firstChildByLocalName(cEl, "MapPosition");
      const x = mapPos ? Number(mapPos.getAttribute("x") || 0) : 0;
      const y = mapPos ? Number(mapPos.getAttribute("y") || 0) : 0;
      
      if (!id) return;

      const ctrl: Control = {
        id,
        // code: id, // Control interface uses id as code (implied)
        type: mapControlType(typeAttr),
        mapPosition: { x, y }
      };
      controls.push(ctrl);
      controlById.set(id, ctrl);
    });

    // Parse Courses
    const courseEls = allChildrenByLocalName(raceCourseData, "Course");
    const courses: Course[] = courseEls.map((courseEl) => {
      const name = textOf(firstChildByLocalName(courseEl, "Name")) || "Course";
      // Parse numberOfCompetitors attribute
      const numCompetitorsAttr = courseEl.getAttribute("numberOfCompetitors");
      const numberOfCompetitors = numCompetitorsAttr 
          ? parseInt(numCompetitorsAttr, 10) 
          : DEFAULT_NUMBER_OF_COMPETITORS;

      const courseControlEls = allChildrenByLocalName(courseEl, "CourseControl");
      const courseControls = courseControlEls.map((ccEl) => {
        const cType = mapControlType(ccEl.getAttribute("type") || "control");
        const code = textOf(firstChildByLocalName(ccEl, "Control"));
        const mapTextRaw = textOf(firstChildByLocalName(ccEl, "MapText"));
        const mapText = mapTextRaw || undefined;
        // const number = mapTextRaw ? Number(mapTextRaw) : undefined;

        // Map exchange extension: <Extensions><x:MapExchange type="change|flip"/></Extensions>
        const ccExtensionsEl = firstChildByLocalName(ccEl, "Extensions");
        const mapExchangeEl = ccExtensionsEl ? firstChildByLocalName(ccExtensionsEl, "MapExchange") : null;
        const mapExchangeType = mapExchangeEl?.getAttribute("type");
        const mapExchange: MapExchangeType | undefined =
          mapExchangeType === "change" || mapExchangeType === "flip" ? mapExchangeType : undefined;

        return {
          controlId: code || "", // CourseControl uses 'controlId' for control code/id
          mapText: mapText,
          type: cType,
          ...(mapExchange ? { mapExchange } : {}),
        };
      });

      return {
        id: crypto.randomUUID(),
        name,
        controls: courseControls,
        mapId: parsedMap.id || "", // Link to the map
        numberOfCompetitors,
      };
    });

    // Parse ClassCourseAssignment elements
    const classAssignmentEls = allChildrenByLocalName(raceCourseData, "ClassCourseAssignment");
    const classAssignments: ClassCourseAssignment[] = classAssignmentEls.map((caEl) => {
      const className = textOf(firstChildByLocalName(caEl, "ClassName"));
      const courseName = textOf(firstChildByLocalName(caEl, "CourseName"));
      const numCompAttr = caEl.getAttribute("numberOfCompetitors");
      const numberOfCompetitors = numCompAttr ? parseInt(numCompAttr, 10) : undefined;
      return { className, courseName, ...(numberOfCompetitors !== undefined && !isNaN(numberOfCompetitors) ? { numberOfCompetitors } : {}) };
    }).filter((ca) => ca.className && ca.courseName);

    // Parse custom extension: Routes (nodes + edges)
    const routesEl = firstChildByLocalName(raceCourseData, "Routes");
    const vertices: Node[] = [];
    const edges: Edge[] = [];

    if (routesEl) {
      const nodeEls = allChildrenByLocalName(routesEl, "Node");
      nodeEls.forEach((nEl) => {
        const id = nEl.getAttribute("id");
        const x = Number(nEl.getAttribute("x") || 0);
        const y = Number(nEl.getAttribute("y") || 0);

        if (id) {
          vertices.push({ id, x, y });
        }
      });

      const edgeEls = allChildrenByLocalName(routesEl, "Edge");
      edgeEls.forEach((eEl) => {
        const from = eEl.getAttribute("from");
        const to = eEl.getAttribute("to");
        const label = eEl.getAttribute("label") || "";
        const oneWay = eEl.getAttribute("oneWay") === "true";
        const teleport = eEl.getAttribute("teleport") === "true";
        const reverseLabel = eEl.getAttribute("reverseLabel") || undefined;
        const length = edgeLengthOverride({ length: Number(eEl.getAttribute("length") ?? Number.NaN) });

        if (from && to) {
          edges.push({
            from,
            to,
            label,
            oneWay,
            ignoreLength: teleport,
            reverseLabel,
            ...(length !== undefined ? { length } : {}),
          });
        }
      });
    }

    // Parse custom extension: Polygons (floor outlines)
    const polygons: Polygon[] = [];
    const polygonsEl = firstChildByLocalName(raceCourseData, "Polygons");
    if (polygonsEl) {
      const parsePoints = (text: string) =>
        text
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((pair) => {
            const [x, y] = pair.split(",").map(Number);
            return { x, y };
          })
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      allChildrenByLocalName(polygonsEl, "Polygon").forEach((pEl) => {
        const id = pEl.getAttribute("id");
        const level = Number(pEl.getAttribute("level"));
        const points = parsePoints(textOf(firstChildByLocalName(pEl, "Points")));
        if (!id || !Number.isFinite(level) || points.length < 3) return;
        const polygon: Polygon = { id, level, points };
        const elevation = pEl.getAttribute("elevation");
        if (elevation !== null && Number.isFinite(Number(elevation))) polygon.elevation = Number(elevation);
        const ox = pEl.getAttribute("originX");
        const oy = pEl.getAttribute("originY");
        if (ox !== null && oy !== null && Number.isFinite(Number(ox)) && Number.isFinite(Number(oy))) {
          polygon.origin = { x: Number(ox), y: Number(oy) };
        }
        const holes = allChildrenByLocalName(pEl, "Hole")
          .map((h) => parsePoints(textOf(h)))
          .filter((h) => h.length >= 3);
        if (holes.length > 0) polygon.holes = holes;
        polygons.push(polygon);
      });
    }

    // Parse custom extension: Directions
    const directions: DirectionFeature[] = [];
    const directionsEl = firstChildByLocalName(raceCourseData, "Directions");
    if (directionsEl) {
      const LINE_KINDS = ["uncrossable", "oob-boundary", "oob-area-boundary"];
      const toPoints = (text: string) =>
        text
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((pair) => pair.split(",").map(Number))
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
          .map(([x, y]) => ({ x, y }));
      allChildrenByLocalName(directionsEl, "Symbol").forEach((el) => {
        const id = el.getAttribute("id");
        const kind = el.getAttribute("kind") ?? "";
        if (!id) return;
        if (isDirectionPointKind(kind)) {
          const x = Number(el.getAttribute("x"));
          const y = Number(el.getAttribute("y"));
          const rotation = Number(el.getAttribute("rotation") ?? 0);
          if ([x, y, rotation].every(Number.isFinite)) directions.push({ id, kind, position: { x, y }, rotation });
          return;
        }
        const points = toPoints(textOf(firstChildByLocalName(el, "Points")));
        if (points.length < 2) return;
        if (kind === "one-way") {
          directions.push({ id, kind, points, style: el.getAttribute("style") === "single" ? "single" : "line" });
        } else if (kind === "oob-area") {
          if (points.length >= 3) directions.push({ id, kind, points, ...(el.getAttribute("outline") === "false" ? { outline: false } : {}) });
        } else if (LINE_KINDS.includes(kind)) {
          directions.push({
            id,
            kind: kind as "uncrossable" | "oob-boundary" | "oob-area-boundary",
            points,
            ...(el.getAttribute("closed") === "true" ? { closed: true } : {}),
          });
        }
      });
    }

    const raceData: RaceCourseData = {
      courses,
      controls,
      maps: [parsedMap],
      classAssignments,
      vertices,
      edges,
      ...(polygons.length > 0 ? { polygons } : {}),
      ...(directions.length > 0 ? { directions } : {}),
    };

    // Build partial event record
    const result: Partial<EventData> = {
      name: eventName || "Imported Event",
      startTime: {
        date: eventDate || new Date().toISOString().split("T")[0],
        time: undefined,
      },
      raceCourses: [raceData],
      country,
      eventUrl,
      eventImageUrl,
    };

    return result;
  }
}