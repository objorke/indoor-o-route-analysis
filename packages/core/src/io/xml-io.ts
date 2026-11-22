/**
 * XML Import/Export functions for IOF CourseData format
 * Supports IOF XML 3.0 standard with custom extensions for indoor routes
 */

import type { EventData, RaceCourseData } from "../models/event";
import { edgeLengthOverride } from "../models/graph";

/**
 * Escape special XML characters
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Export EventData to IOF XML format
 * @param event - EventData to export
 * @returns XML string in IOF CourseData format
 */
export function exportEventToIOFXML(event: EventData): string {
  const raceCourse = event.raceCourses?.[0] || ({} as RaceCourseData);
  const courses = raceCourse.courses || [];
  const controls = raceCourse.controls || [];
  const vertices = raceCourse.vertices || [];
  const edges = raceCourse.edges || [];
  const polygons = raceCourse.polygons || [];
  const directions = raceCourse.directions || [];

  const mapScale = raceCourse.maps?.[0]?.scale;
  const eventDate = event.startTime.date;

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:x="urn:indoor-route-analysis">\n`;
  xml += `  <Event>\n`;
  xml += `    <Name>${escapeXml(event.name)}</Name>\n`;
  xml += `    <Date>${eventDate}</Date>\n`;
  
  // Add event extensions if any
  const hasExtensions = event.eventUrl || event.country || event.eventImageUrl;
  if (hasExtensions) {
    xml += `    <Extensions>\n`;
    if (event.eventUrl) {
      xml += `      <x:EventUrl>${escapeXml(event.eventUrl)}</x:EventUrl>\n`;
    }
    if (event.eventImageUrl) {
      xml += `      <x:EventImageUrl>${escapeXml(event.eventImageUrl)}</x:EventImageUrl>\n`;
    }
    if (event.country) {
      xml += `      <x:Country>${escapeXml(event.country)}</x:Country>\n`;
    }
    xml += `    </Extensions>\n`;
  }
  
  xml += `  </Event>\n`;
  xml += `  <RaceCourseData>\n`;

  // Map info if available
  if (mapScale) {
    xml += `    <Map>\n`;
    xml += `      <Scale>${mapScale}</Scale>\n`;
    xml += `    </Map>\n`;
  }

  // Controls
  controls.forEach((control) => {
    const typeAttr = (control.type || "control").toLowerCase();
    const typeOut = typeAttr === "start" ? "Start" : typeAttr === "finish" ? "Finish" : "Control";
    xml += `    <Control type="${typeOut}">\n`;
    xml += `      <Id>${escapeXml(control.id)}</Id>\n`;
    xml += `      <MapPosition unit="mm" x="${control.mapPosition?.x || 0}" y="${control.mapPosition?.y || 0}" />\n`;
    // Level removed from control model, export logic might need updating if x:Floor is required
    xml += `    </Control>\n`;
  });

  // Courses
  courses.forEach((course) => {
    xml += `    <Course>\n`;
    xml += `      <Name>${escapeXml(course.name)}</Name>\n`;
    if (course.controls && course.controls.length > 0) {
      course.controls.forEach((cc) => {
        const typeAttr = (cc.type || "control").toLowerCase();
        const typeOut = typeAttr === "start" ? "Start" : typeAttr === "finish" ? "Finish" : "Control";
        xml += `      <CourseControl type="${typeOut}">\n`;
        const ctrlText = cc.controlId || "";
        xml += `        <Control>${escapeXml(ctrlText)}</Control>\n`;
        if (cc.mapText !== undefined) {
          xml += `        <MapText>${escapeXml(cc.mapText)}</MapText>\n`;
        }
        // IOF XML 3.0 has no map exchange element; use the schema's Extensions
        // container (must be the last child of CourseControl).
        if (cc.mapExchange) {
          xml += `        <Extensions>\n`;
          xml += `          <x:MapExchange type="${cc.mapExchange}" />\n`;
          xml += `        </Extensions>\n`;
        }
        xml += `      </CourseControl>\n`;
      });
    }
    xml += `    </Course>\n`;
  });

  // Class-Course Assignments
  const classAssignments = raceCourse.classAssignments || [];
  classAssignments.forEach((assignment) => {
    const numCompAttr = assignment.numberOfCompetitors != null ? ` numberOfCompetitors="${assignment.numberOfCompetitors}"` : "";
    xml += `    <ClassCourseAssignment${numCompAttr}>\n`;
    xml += `      <ClassName>${escapeXml(assignment.className)}</ClassName>\n`;
    xml += `      <CourseName>${escapeXml(assignment.courseName)}</CourseName>\n`;
    xml += `    </ClassCourseAssignment>\n`;
  });

  // Extension: Routes (vertices + edges)
  if (vertices.length > 0 || edges.length > 0) {
    xml += `    <x:Routes>\n`;
    vertices.forEach((n) => {
      xml += `      <x:Node id="${escapeXml(n.id)}" x="${n.x}" y="${n.y}" />\n`;
    });
    edges.forEach((e) => {
      const attrs: string[] = [];
      attrs.push(`from="${escapeXml(e.from)}"`);
      attrs.push(`to="${escapeXml(e.to)}"`);
      if (e.label) attrs.push(`label="${escapeXml(e.label)}"`);
      if (typeof e.oneWay === "boolean") attrs.push(`oneWay="${e.oneWay ? "true" : "false"}"`);
      if (typeof e.ignoreLength === "boolean") attrs.push(`teleport="${e.ignoreLength ? "true" : "false"}"`); // legacy name mapping
      if (e.reverseLabel) attrs.push(`reverseLabel="${escapeXml(e.reverseLabel)}"`);
      if (edgeLengthOverride(e) !== undefined) attrs.push(`length="${e.length}"`);
      xml += `      <x:Edge ${attrs.join(" ")} />\n`;
    });
    xml += `    </x:Routes>\n`;
  }

  // Extension: Polygons (floor outlines: level, elevation and 3D origin; used for stairs/levels)
  if (polygons.length > 0) {
    const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
    xml += `    <x:Polygons>\n`;
    polygons.forEach((poly) => {
      const attrs = [`id="${escapeXml(poly.id)}"`, `level="${poly.level}"`];
      if (typeof poly.elevation === "number") attrs.push(`elevation="${poly.elevation}"`);
      if (poly.origin) attrs.push(`originX="${poly.origin.x}"`, `originY="${poly.origin.y}"`);
      xml += `      <x:Polygon ${attrs.join(" ")}>\n`;
      xml += `        <x:Points>${pts(poly.points)}</x:Points>\n`;
      (poly.holes ?? []).forEach((hole) => {
        xml += `        <x:Hole>${pts(hole)}</x:Hole>\n`;
      });
      xml += `      </x:Polygon>\n`;
    });
    xml += `    </x:Polygons>\n`;
  }

  // Extension: Directions (course direction symbols, see docs/directions.md)
  if (directions.length > 0) {
    const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
    xml += `    <x:Directions>\n`;
    directions.forEach((f) => {
      const attrs = [`id="${escapeXml(f.id)}"`, `kind="${escapeXml(f.kind)}"`];
      if ("position" in f) {
        attrs.push(`x="${f.position.x}"`, `y="${f.position.y}"`, `rotation="${f.rotation}"`);
        xml += `      <x:Symbol ${attrs.join(" ")} />\n`;
        return;
      }
      if (f.kind === "one-way") attrs.push(`style="${f.style}"`);
      if (f.kind === "oob-area" && f.outline === false) attrs.push(`outline="false"`);
      if ("closed" in f && f.closed) attrs.push(`closed="true"`);
      xml += `      <x:Symbol ${attrs.join(" ")}><x:Points>${pts(f.points)}</x:Points></x:Symbol>\n`;
    });
    xml += `    </x:Directions>\n`;
  }

  xml += `  </RaceCourseData>\n`;
  xml += `</CourseData>`;

  return xml;
}

import { IOFXmlImporter } from "./iof-xml-importer";

/**
 * Parse IOF XML string into EventData structure
 * @param xmlString - IOF XML string to parse
 * @returns Partial EventData with parsed data
 * @throws Error if XML is invalid or missing required elements
 */
export function parseEventFromIOFXML(xmlString: string): Partial<EventData> {
  const importer = new IOFXmlImporter();
  return importer.parse(xmlString);
}

