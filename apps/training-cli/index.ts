#!/usr/bin/env tsx
/**
 * Generate training app data JSON files from event JSON files.
 *
 * Usage:
 *   npx tsx index.ts [fileFilter] [inputFolder] [outputFolder] [--k <n>] [--verbose]
 *
 * Arguments:
 *   fileFilter:    Optional substring filter — only files containing this string are processed (default: all files)
 *   inputFolder:   Default: ../../test-data/events
 *   outputFolder:  Default: ../../output/training-data
 *   --k <n>:       Max routes (per-leg cap) for the "show all routes" enumeration (default: 50)
 *   --verbose:     Print number of routes found for each leg in each course
 *
 * Examples:
 *   npx tsx index.ts 2026
 *   npx tsx index.ts "" ../../test-data/events ../../output/training-data
 *   npx tsx index.ts --k 50 --verbose
 *
 * Each run overwrites the files directly in the output folder, and
 * additionally leaves an untouched copy in a timestamped subfolder named
 * yyyy-mm-dd_hhMM, e.g.:
 *   output/training-data/
 *     *-training.json        <- training JSON files (named with "-training" suffix)
 *     generation-report.json <- route counts and timing per leg/course/event
 *     generation-report.md   <- human-readable version of the report
 *     2026-07-07_0915/       <- untouched copy of that run's files
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseEventFromJSON } from '@indoor-o-route-analysis/core';
import { TrainingDataIO, type TrainingCourse, type TrainingEvent } from '@indoor-o-route-analysis/core';
import { createEventRouteAnalyzer, getEventScoringModel } from '@indoor-o-route-analysis/core';
import { analyzeCourseLegs } from '@indoor-o-route-analysis/core';
import type { EventData } from '@indoor-o-route-analysis/core';

// Default folders
const DEFAULT_INPUT_FOLDER = '../../test-data/events';
const DEFAULT_OUTPUT_FOLDER = '../../output/training-data';

// Parse command line arguments: separate named flags from positional args
const rawArgs = process.argv.slice(2);
const namedArgs: Record<string, string | boolean> = {};
const positionalArgs: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    const key = rawArgs[i].slice(2);
    if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
      namedArgs[key] = rawArgs[i + 1];
      i++;
    } else {
      namedArgs[key] = true;
    }
  } else {
    positionalArgs.push(rawArgs[i]);
  }
}

// Timestamped subfolder name for the untouched per-run copy, matching
// analyse-all-cli's convention: yyyy-mm-dd_hhMM (local time)
function timestampFolderName(d = new Date()): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const fileFilter = positionalArgs[0] || '';
const inputFolder = path.resolve(positionalArgs[1] || DEFAULT_INPUT_FOLDER);
const outputFolder = path.resolve(positionalArgs[2] || DEFAULT_OUTPUT_FOLDER);
const archiveFolder = path.join(outputFolder, timestampFolderName());
const k = parseInt(String(namedArgs['k'] || '50'), 10);
const verbose = Boolean(namedArgs['verbose']);

console.log('Training Data Generator');
console.log('=======================');
console.log(`Input folder:  ${inputFolder}`);
console.log(`Output folder: ${outputFolder}`);
console.log(`Archive copy:  ${archiveFolder}`);
if (fileFilter) console.log(`File filter:   "${fileFilter}"`);
console.log(`k (max paths): ${k}`);
if (verbose) console.log('Verbose:       enabled');
console.log('');

// ============================================================================
// Report types
// ============================================================================

interface LegReport {
  label: string;
  fromControlId: string;
  toControlId: string;
  routeCount: number;
}

interface CourseReport {
  name: string;
  durationMs: number;
  legs: LegReport[];
}

interface EventReport {
  fileName: string;
  eventName: string;
  durationMs: number;
  courses: CourseReport[];
}

interface GenerationReport {
  generatedAt: string;
  k: number;
  totalDurationMs: number;
  events: EventReport[];
}

// ============================================================================
// Processing
// ============================================================================

/**
 * Process a single event file and generate training data with timing report.
 */
function processEventFile(filePath: string): { trainingEvent: TrainingEvent; report: EventReport } {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const event: EventData = parseEventFromJSON(fileContent);

  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) throw new Error('No race course found in event');

  const courses = raceCourse.courses || [];
  if (courses.length === 0) throw new Error('No courses found in event');

  const scoringModel = getEventScoringModel(event);
  const routeAnalyzer = createEventRouteAnalyzer(event, { scoringModel });

  const analyzedCourses: TrainingCourse[] = [];
  const courseReports: CourseReport[] = [];

  for (const course of courses) {
    console.log(`  Analyzing course: ${course.name}`);

    const courseStart = performance.now();

    // Enumerate the full "show all routes" set (findAllRoutes = true), capped at k
    // per leg, so the export matches the web app's "show all routes" view.
    const { legs, routes } = analyzeCourseLegs(course, event, routeAnalyzer, true, k);
    const trainingCourse = TrainingDataIO.generateCourseData(event, course, legs, routes);

    analyzedCourses.push(trainingCourse);

    const courseDurationMs = Math.round(performance.now() - courseStart);

    const legReports: LegReport[] = legs.map((leg, i) => {
      const routeCount = trainingCourse.validRoutes[i]?.length ?? 0;
      if (verbose) {
        console.log(`    Leg ${leg.label}: ${routeCount} route(s)`);
      }
      return {
        label: leg.label,
        fromControlId: leg.fromControlId,
        toControlId: leg.toControlId,
        routeCount,
      };
    });

    courseReports.push({
      name: course.name || 'Untitled Course',
      durationMs: courseDurationMs,
      legs: legReports,
    });
  }

  const trainingEvent = TrainingDataIO.generateEventExport(event, analyzedCourses, scoringModel.getFullId());

  const report: EventReport = {
    fileName: path.basename(filePath),
    eventName: event.name || 'Untitled Event',
    durationMs: courseReports.reduce((sum, c) => sum + c.durationMs, 0),
    courses: courseReports,
  };

  return { trainingEvent, report };
}

/**
 * Generate output filename by adding "-training" before the extension
 */
function generateOutputFilename(inputFilename: string): string {
  const ext = path.extname(inputFilename);
  const baseName = path.basename(inputFilename, ext);
  return `${baseName}-training${ext}`;
}

/**
 * Write a file to the main output folder and an identical copy to the timestamped subfolder.
 */
function writeOutputFile(filename: string, content: string): void {
  fs.writeFileSync(path.join(outputFolder, filename), content, 'utf-8');
  fs.writeFileSync(path.join(archiveFolder, filename), content, 'utf-8');
}

// ============================================================================
// Report rendering
// ============================================================================

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderMarkdownReport(report: GenerationReport): string {
  const lines: string[] = [];

  lines.push('# Training Data Generation Report');
  lines.push('');
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **k (max paths):** ${report.k}`);
  lines.push(`- **Total duration:** ${formatMs(report.totalDurationMs)}`);
  lines.push(`- **Events processed:** ${report.events.length}`);
  lines.push('');

  for (const evt of report.events) {
    lines.push(`## ${evt.eventName}`);
    lines.push('');
    lines.push(`**File:** \`${evt.fileName}\`  `);
    lines.push(`**Duration:** ${formatMs(evt.durationMs)}`);
    lines.push('');

    for (const course of evt.courses) {
      lines.push(`### ${course.name}`);
      lines.push('');
      lines.push(`**Course duration:** ${formatMs(course.durationMs)}`);
      lines.push('');

      const totalRoutes = course.legs.reduce((sum, l) => sum + l.routeCount, 0);
      lines.push(`| Leg | Routes |`);
      lines.push(`|-----|-------:|`);
      for (const leg of course.legs) {
        lines.push(`| ${leg.label} | ${leg.routeCount} |`);
      }
      lines.push(`| **Total** | **${totalRoutes}** |`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*Generated by training data generator*`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (!fs.existsSync(inputFolder)) {
    console.error(`Error: Input folder does not exist: ${inputFolder}`);
    process.exit(1);
  }

  fs.mkdirSync(archiveFolder, { recursive: true });

  const files = fs.readdirSync(inputFolder)
    .filter(file =>
      file.endsWith('.json') &&
      file !== 'index.json' &&
      !file.startsWith('.') &&
      (!fileFilter || file.includes(fileFilter))
    );

  if (files.length === 0) {
    console.log('No JSON files found to process.');
    return;
  }

  console.log(`Found ${files.length} JSON file(s) to process.\n`);

  const totalStart = performance.now();
  let successCount = 0;
  let errorCount = 0;
  const eventReports: EventReport[] = [];

  for (const file of files) {
    const inputPath = path.join(inputFolder, file);
    const outputFilename = generateOutputFilename(file);

    console.log(`Processing: ${file}`);

    try {
      const { trainingEvent, report } = processEventFile(inputPath);

      const jsonContent = JSON.stringify(trainingEvent, null, 2);
      writeOutputFile(outputFilename, jsonContent);

      eventReports.push(report);

      console.log(`  -> ${outputFilename}`);
      console.log(`     ${trainingEvent.courses.length} course(s) exported, ${formatMs(report.durationMs)}\n`);
      successCount++;
    } catch (error) {
      console.error(`  Error: ${(error as Error).message}\n`);
      errorCount++;
    }
  }

  const totalDurationMs = Math.round(performance.now() - totalStart);

  console.log('Summary');
  console.log('-------');
  console.log(`Processed: ${successCount} file(s) successfully`);
  if (errorCount > 0) console.log(`Errors:    ${errorCount} file(s) failed`);
  console.log(`Total:     ${formatMs(totalDurationMs)}`);

  // Write report files
  if (successCount > 0) {
    const generationReport: GenerationReport = {
      generatedAt: new Date().toISOString(),
      k,
      totalDurationMs,
      events: eventReports,
    };

    writeOutputFile('generation-report.json', JSON.stringify(generationReport, null, 2));
    writeOutputFile('generation-report.md', renderMarkdownReport(generationReport));

    console.log('');
    console.log(`Report: ${path.join(outputFolder, 'generation-report.json')}`);
    console.log(`Report: ${path.join(outputFolder, 'generation-report.md')}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
