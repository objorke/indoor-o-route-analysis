#!/usr/bin/env tsx
/**
 * Convert indoor orienteering event files between formats.
 *
 * Supported input formats:  JSON (.json), IOF XML (.xml)
 * Supported output formats: JSON (.json), IOF XML (.xml), CSV graph-only (.csv)
 *
 * Usage:
 *   pnpm convert <input> <output>
 *   pnpm convert <input> --format json|xml|csv [-o <output>]
 *
 * Examples:
 *   pnpm convert event.json event.xml
 *   pnpm convert event.xml event.json
 *   pnpm convert event.json --format csv
 *   pnpm convert event.json -o graph.csv
 *   pnpm convert event.xml --format csv -o output/graph.csv
 *
 * CSV output produces two files:
 *   <basename>_nodes.csv  — All graph vertices and controls with positions
 *   <basename>_edges.csv  — All graph edges with labels and properties
 */

import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";
import {
  serializeEventToJSON,
  exportEventToIOFXML,
  parseEventFile,
} from "@indoor-o-route-analysis/core";
import type { EventData } from "@indoor-o-route-analysis/core";

// Polyfill DOMParser for Node.js (required by IOF XML importer)
const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;

type OutputFormat = "json" | "xml" | "csv";

interface CliArgs {
  inputFile: string;
  outputFile: string | undefined;
  format: OutputFormat | undefined;
}

function printUsage(): void {
  console.log(`Usage: pnpm convert <input> [output] [options]

Arguments:
  input          Input file (.json or .xml)
  output         Output file (format auto-detected from extension)

Options:
  --format, -f   Output format: json, xml, or csv
  -o <file>      Output file path
  --help, -h     Show this help

Output formats:
  json           Full event data as JSON
  xml            IOF XML 3.0 with indoor route extensions
  csv            Graph-only: produces two files (<name>_nodes.csv and <name>_edges.csv)

Examples:
  pnpm convert event.json event.xml
  pnpm convert event.xml event.json
  pnpm convert event.json --format csv
  pnpm convert event.json -o graph.csv`);
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let inputFile: string | undefined;
  let outputFile: string | undefined;
  let format: OutputFormat | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--format" || arg === "-f") {
      const val = args[++i];
      if (!val || !["json", "xml", "csv"].includes(val)) {
        console.error(`Error: --format must be one of: json, xml, csv`);
        process.exit(1);
      }
      format = val as OutputFormat;
    } else if (arg === "-o") {
      outputFile = args[++i];
      if (!outputFile) {
        console.error("Error: -o requires a file path");
        process.exit(1);
      }
    } else if (!arg.startsWith("-")) {
      if (!inputFile) {
        inputFile = arg;
      } else if (!outputFile) {
        outputFile = arg;
      } else {
        console.error(`Error: unexpected argument "${arg}"`);
        process.exit(1);
      }
    } else {
      console.error(`Error: unknown option "${arg}"`);
      process.exit(1);
    }
  }

  if (!inputFile) {
    printUsage();
    process.exit(1);
  }

  return { inputFile, outputFile, format };
}

function detectInputFormat(filePath: string): "json" | "xml" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".xml") return "xml";
  console.error(`Error: unsupported input file extension "${ext}". Use .json or .xml`);
  process.exit(1);
}

function detectOutputFormat(filePath: string): OutputFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".xml") return "xml";
  if (ext === ".csv") return "csv";
  console.error(`Error: cannot detect output format from extension "${ext}". Use --format`);
  process.exit(1);
}

function readEvent(filePath: string): EventData {
  // Same parsing and validation as every other CLI (JSON or IOF XML)
  const content = fs.readFileSync(filePath, "utf-8");
  return parseEventFile(content, detectInputFormat(filePath));
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function writeJson(event: EventData, outputPath: string): void {
  const json = serializeEventToJSON(event, true);
  fs.writeFileSync(outputPath, json, "utf-8");
  console.log(`Written: ${outputPath}`);
}

function writeXml(event: EventData, outputPath: string): void {
  const xml = exportEventToIOFXML(event);
  fs.writeFileSync(outputPath, xml, "utf-8");
  console.log(`Written: ${outputPath}`);
}

function writeCsv(event: EventData, outputPath: string): void {
  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    console.error("Error: no race course data found in event");
    process.exit(1);
  }

  const vertices = raceCourse.vertices || [];
  const edges = raceCourse.edges || [];
  const controls = raceCourse.controls || [];

  // Build nodes CSV: combine controls and vertices
  const nodeLines: string[] = ["id,x,y,type"];
  for (const ctrl of controls) {
    nodeLines.push(
      [
        escapeCsvField(ctrl.id),
        ctrl.mapPosition.x.toString(),
        ctrl.mapPosition.y.toString(),
        ctrl.type,
      ].join(","),
    );
  }
  for (const node of vertices) {
    nodeLines.push(
      [escapeCsvField(node.id), node.x.toString(), node.y.toString(), "node"].join(","),
    );
  }

  // Build edges CSV
  const edgeLines: string[] = ["from,to,label,reverseLabel,oneWay,ignoreLength"];
  for (const edge of edges) {
    edgeLines.push(
      [
        escapeCsvField(edge.from),
        escapeCsvField(edge.to),
        escapeCsvField(edge.label),
        escapeCsvField(edge.reverseLabel || ""),
        edge.oneWay ? "true" : "false",
        edge.ignoreLength ? "true" : "false",
      ].join(","),
    );
  }

  // Determine output file names
  const ext = path.extname(outputPath);
  const base = outputPath.slice(0, -ext.length || undefined);
  const nodesPath = `${base}_nodes.csv`;
  const edgesPath = `${base}_edges.csv`;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(nodesPath, nodeLines.join("\n") + "\n", "utf-8");
  fs.writeFileSync(edgesPath, edgeLines.join("\n") + "\n", "utf-8");

  console.log(`Written: ${nodesPath} (${controls.length} controls + ${vertices.length} vertices)`);
  console.log(`Written: ${edgesPath} (${edges.length} edges)`);
}

function main(): void {
  const { inputFile, outputFile, format } = parseArgs(process.argv);

  // Resolve input path
  const inputPath = path.resolve(inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Determine output format
  let outputFormat: OutputFormat;
  if (format) {
    outputFormat = format;
  } else if (outputFile) {
    outputFormat = detectOutputFormat(outputFile);
  } else {
    console.error("Error: specify an output file or use --format");
    process.exit(1);
  }

  // Determine output path
  let outputPath: string;
  if (outputFile) {
    outputPath = path.resolve(outputFile);
  } else {
    // Auto-name based on input file
    const inputExt = path.extname(inputPath);
    const inputBase = path.basename(inputPath, inputExt);
    const inputDir = path.dirname(inputPath);
    const outExt = outputFormat === "csv" ? ".csv" : outputFormat === "xml" ? ".xml" : ".json";
    outputPath = path.join(inputDir, `${inputBase}${outExt}`);

    // Avoid overwriting input
    if (outputPath === inputPath) {
      outputPath = path.join(inputDir, `${inputBase}_converted${outExt}`);
    }
  }

  // Read input
  console.log(`Reading: ${inputPath}`);
  const event = readEvent(inputPath);
  const raceCourse = event.raceCourses?.[0];

  console.log(`Event:   ${event.name} (${event.startTime.date})`);
  if (raceCourse) {
    const nc = raceCourse.controls?.length || 0;
    const nv = raceCourse.vertices?.length || 0;
    const ne = raceCourse.edges?.length || 0;
    const nCourses = raceCourse.courses?.length || 0;
    console.log(`Data:    ${nCourses} course(s), ${nc} control(s), ${nv} vertex/vertices, ${ne} edge(s)`);
  }

  // Write output
  switch (outputFormat) {
    case "json":
      writeJson(event, outputPath);
      break;
    case "xml":
      writeXml(event, outputPath);
      break;
    case "csv":
      writeCsv(event, outputPath);
      break;
  }
}

main();
