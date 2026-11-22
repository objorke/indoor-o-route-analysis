import type { EventData } from "../models/event";
import { parseEventFromJSON } from "./json-io";
import { parseEventFromIOFXML } from "./xml-io";
import { assertValidEventStructure } from "./event-validation";

export type EventFileFormat = "json" | "xml";

/** Format from a file name or extension (".json" / ".xml"), or null when unsupported. */
export function eventFileFormat(fileNameOrExt: string): EventFileFormat | null {
  const ext = fileNameOrExt.toLowerCase().split(".").pop() ?? "";
  if (ext === "json") return "json";
  if (ext === "xml") return "xml";
  return null;
}

/**
 * A complete EventData from IOF XML (which only carries part of an event):
 * fills in id, name, date and country, then runs the structural check.
 */
export function parseEventFromIOFXMLFile(content: string): EventData {
  const partial = parseEventFromIOFXML(content);
  const event: EventData = {
    id: partial.id || crypto.randomUUID(),
    name: partial.name || "Imported Event",
    startTime: partial.startTime || { date: new Date().toISOString().split("T")[0] },
    raceCourses: partial.raceCourses || [],
    country: partial.country || "",
    eventUrl: partial.eventUrl,
    eventImageUrl: partial.eventImageUrl,
  };
  assertValidEventStructure(event);
  return event;
}

/**
 * Parse an event file's text. IOF XML needs a global `DOMParser` (browser, or a
 * Node polyfill such as linkedom/jsdom installed by the caller).
 */
export function parseEventFile(content: string, format: EventFileFormat): EventData {
  return format === "json" ? parseEventFromJSON(content) : parseEventFromIOFXMLFile(content);
}
