/**
 * JSON Import/Export functions for EventData
 * These functions handle serialization and deserialization of event data
 */

import { type EventData } from "../models/event";
import { migrateEventData } from "../migrations";
import { assertValidEventStructure } from "./event-validation";

/**
 * Parse JSON string into EventData
 * @param jsonString - JSON string to parse
 * @returns Parsed EventData
 * @throws Error if JSON is invalid or missing required fields
 */
export function parseEventFromJSON(jsonString: string): EventData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;

  try {
    parsed = JSON.parse(jsonString);
  } catch (_error) {
    throw new Error("Invalid JSON format");
  }

  // Validate required fields for EventData
  if (!parsed.name || typeof parsed.name !== "string") {
    // If name is missing but title exists, it might be a partial migration or manual edit
    if (parsed.title && typeof parsed.title === "string") {
      parsed.name = parsed.title;
    } else {
      throw new Error("Missing or invalid required field: name");
    }
  }

  if (!parsed.id || typeof parsed.id !== "string") {
    throw new Error("Missing or invalid required field: id");
  }

  let migrated: EventData;
  try {
    migrated = migrateEventData(parsed);
  } catch (error) {
    // Migration assumes the basic shape; report what is wrong with it instead of a TypeError
    assertValidEventStructure(parsed);
    throw new Error(`Invalid event file: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Reject malformed files here, with a readable message, rather than crashing a view later
  assertValidEventStructure(migrated);
  return migrated;
}

/**
 * Serialize EventData to JSON string
 * @param event - EventData to serialize
 * @param pretty - Whether to format with indentation (default: true)
 * @returns JSON string
 */
export function serializeEventToJSON(event: EventData, pretty: boolean = true): string {
  const indent = pretty ? 2 : 0;

  return JSON.stringify(event, null, indent);
}

/**
 * Validate EventData structure
 * @param event - EventData to validate
 * @returns true if valid
 * @throws Error if validation fails
 */
export function validateEventData(event: EventData): boolean {
  if (!event.id || typeof event.id !== "string") {
    throw new Error("Invalid event: missing or invalid id");
  }

  if (!event.name || typeof event.name !== "string") {
    throw new Error("Invalid event: missing or invalid name");
  }

  return true;
}

