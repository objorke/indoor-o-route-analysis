/**
 * Node-only helpers (fs/path), exported as `@indoor-o-route-analysis/core/node`
 * so the browser bundle never imports them. Shared by all CLIs.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { EventData } from "../models/event";
import { eventFileFormat, parseEventFile } from "../io/parse-event-file";

/**
 * Load and parse an event file (.json or IOF XML .xml), validating its structure.
 * For .xml, a global `DOMParser` polyfill must be installed first.
 */
export function loadEventFile(filePath: string): EventData {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  const format = eventFileFormat(resolvedPath);
  if (!format) {
    throw new Error(`Unsupported file format: ${path.extname(resolvedPath)} (expected .json or .xml)`);
  }
  return parseEventFile(fs.readFileSync(resolvedPath, "utf-8"), format);
}
