#!/usr/bin/env tsx
import type { EventData } from '@indoor-o-route-analysis/core';
import { analyzeCourseLegs, createEventRouteAnalyzer, parseEventFromJSON, type RouteAnalyzer, ScoringModelRegistry } from '@indoor-o-route-analysis/core';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// Helper to get control label
function getControlLabel(controlId: string, controls: { id: string; code?: string }[]): string {
  const control = controls.find((c) => c.id === controlId);
  return control?.code || controlId;
}

// Append a worksheet from an array of uniform row objects, deriving columns
// from the first row's keys (header = key). Mirrors the previous
// XLSX.utils.json_to_sheet behaviour.
function appendSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: Record<string, string | number>[],
): void {
  const sheet = wb.addWorksheet(name);
  if (rows.length === 0) return;
  sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
  sheet.addRows(rows);
}

const TARGET_DIFFICULTY_VALUES: Record<string, number> = {
  white: 20, yellow: 40, orange: 60, purple: 80, black: 100,
};

const DEFAULT_INPUT_FOLDER = '../../test-data/events';
const DEFAULT_OUTPUT_FOLDER = '../../output/route-analysis';
/** Default running speed (m/s) used for estimated running time. Matches the web app default. */
const DEFAULT_RUNNING_SPEED = 3.0;

// Split args into flags (--name / --name=value) and positional arguments.
const rawArgs = process.argv.slice(2);
const flagArgs = rawArgs.filter((a) => a.startsWith('--'));
const positionalArgs = rawArgs.filter((a) => !a.startsWith('--'));

const findMaxLeg = flagArgs.includes('--max-leg');
const speedFlag = flagArgs.find((a) => a.startsWith('--speed='));
const runningSpeed = speedFlag ? parseFloat(speedFlag.split('=')[1]) || DEFAULT_RUNNING_SPEED : DEFAULT_RUNNING_SPEED;

const inputFolder = path.resolve(positionalArgs[0] || DEFAULT_INPUT_FOLDER);
const outputFolder = path.resolve(positionalArgs[1] || DEFAULT_OUTPUT_FOLDER);
const fileFilter = positionalArgs[2] || '';

/** Format a duration in seconds as "M:SS". */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Find the single most difficult leg that can be formed between any two existing
 * controls in the event (the "Labs" maximum-difficulty search). Path-finding is
 * distance-based, so only the difficulty scoring depends on the model.
 */
function findMaxDifficultyLeg(
  analyzer: RouteAnalyzer,
  controls: { id: string; code?: string }[],
): { controls: string; difficulty: number } | null {
  let best: { fromId: string; toId: string; difficulty: number } | null = null;
  for (let i = 0; i < controls.length; i++) {
    for (let j = 0; j < controls.length; j++) {
      if (i === j) continue;
      try {
        const alternatives = analyzer.findAlternativePathsBetweenControls(controls[i].id, controls[j].id, 1);
        const route = alternatives[0];
        if (route && Number.isFinite(route.distance) && route.distance > 0) {
          if (!best || route.difficulty > best.difficulty) {
            best = { fromId: controls[i].id, toId: controls[j].id, difficulty: route.difficulty };
          }
        }
      } catch {
        // Unreachable control pair — skip.
      }
    }
  }
  if (!best) return null;
  return {
    controls: `${getControlLabel(best.fromId, controls)}-${getControlLabel(best.toId, controls)}`,
    difficulty: best.difficulty,
  };
}

// Each run overwrites the files directly in the output folder, and additionally
// leaves an untouched copy in a timestamped subfolder (yyyy-mm-dd_hhMM) so past
// runs remain available side by side.
function timestampFolderName(d = new Date()): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const resultsFolder = outputFolder;
if (!fs.existsSync(resultsFolder)) {
  fs.mkdirSync(resultsFolder, { recursive: true });
}

console.log('Route Analysis');
console.log('==============');
console.log(`Input folder:  ${inputFolder}`);
console.log(`Output folder: ${resultsFolder}`);
if (fileFilter) console.log(`File filter:   "${fileFilter}"`);
console.log(`Running speed: ${runningSpeed} m/s`);
console.log(`Max-leg scan:  ${findMaxLeg ? 'on' : 'off'}`);
console.log('');

const files = fs.readdirSync(inputFolder).filter(f =>
  f.endsWith('.json') && f !== 'index.json' && (!fileFilter || f.includes(fileFilter))
);
const allModels = ScoringModelRegistry.getAllModels();

console.log(`Found ${files.length} files.`);
console.log(`Using ${allModels.length} scoring models: ${allModels.map(m => m.getFullId()).join(', ')}`);

// Data structures for results
interface HardestLeg {
  legName: string;
  route: string;
  length: number;
}

interface MaxPossibleLeg {
  controls: string;
  difficulty: number;
}

interface CourseResult {
  eventDate: string;
  eventTitle: string;
  courseName: string;
  courseId: string;
  targetDifficulty: string;
  targetDifficultyValue: number | '';
  courseLength: number;
  estimatedTimeSec: number;
  maxDifficulties: { [modelId: string]: number };
  avgDifficulties: { [modelId: string]: number };
  hardestLegs: { [modelId: string]: HardestLeg };
}

interface EventResult {
  eventDate: string;
  eventTitle: string;
  fileName: string;
  controlCount: number;
  courseCount: number;
  /** Hardest possible leg between any two existing controls (only with --max-leg). */
  maxPossibleLegs: { [modelId: string]: MaxPossibleLeg };
}

interface LegResult {
  eventDate: string;
  eventTitle: string;
  courseName: string;
  targetDifficulty: string;
  targetDifficultyValue: number | '';
  legIndex: number;
  legName: string;
  fromControl: string;
  toControl: string;
  legLength: number;
  routeDescription: string;
  shortestDifficulty: number;
  lowestDiffRoute: string;
  lowestDiffLength: number;
  lowestDiffDifficulty: number;
  stairChanges: number;
  branchingPoints: number;
  decisionPoints: number;
  difficulties: { [modelId: string]: number };
}

async function run() {
  const courseResults: CourseResult[] = [];
  const legResults: LegResult[] = [];
  const eventResults: EventResult[] = [];

  for (const file of files) {
    console.log(`Analyzing ${file}...`);
    const filePath = path.join(inputFolder, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    let event: EventData;
    try {
        event = parseEventFromJSON(content);
    } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
        continue;
    }

    const raceCourse = event.raceCourses?.[0];
    if (!raceCourse) {
        console.warn(`No race course in ${file}`);
        continue;
    }

    const courses = raceCourse.courses || [];
    const controls = raceCourse.controls || [];

    // The maximum-difficulty leg over all existing controls depends only on the
    // event graph + scoring model, so compute it once per event (per model) and
    // reuse it for every course. Skipped unless --max-leg is set.
    const eventMaxPossibleLegs: { [modelId: string]: MaxPossibleLeg } = {};
    if (findMaxLeg) {
      console.log(`  Scanning for maximum-difficulty leg across ${controls.length} controls...`);
      for (const model of allModels) {
        const maxAnalyzer = createEventRouteAnalyzer(event, { scoringModel: model });
        const maxLeg = findMaxDifficultyLeg(maxAnalyzer, controls);
        if (maxLeg) eventMaxPossibleLegs[model.getFullId()] = maxLeg;
      }
    }

    eventResults.push({
      eventDate: event.startTime?.date || '',
      eventTitle: event.name || '',
      fileName: file,
      controlCount: controls.length,
      courseCount: courses.length,
      maxPossibleLegs: eventMaxPossibleLegs,
    });

    for (const course of courses) {
      console.log(`  Course: ${course.name} (${courses.indexOf(course) + 1}/${courses.length})`);
      const courseName = course.name;
      const targetDifficulty = course.targetDifficulty || '';
      const targetDifficultyValue = TARGET_DIFFICULTY_VALUES[targetDifficulty.toLowerCase()] ?? '';

      const modelMaxDifficulties: { [modelId: string]: number } = {};
      const modelAvgDifficulties: { [modelId: string]: number } = {};
      const legModelDifficulties: { [legIndex: number]: { [modelId: string]: number } } = {};

      for (const model of allModels) {
        const analyzer = createEventRouteAnalyzer(event, { scoringModel: model, courseId: course.id });

        // Analyze course
        const { legs } = analyzeCourseLegs(course, event, analyzer, false);
        
        // Max difficulty (course-level)
        const maxDifficulty = model.getCourseDifficulty(legs);
        modelMaxDifficulties[model.getFullId()] = maxDifficulty;

        // Avg difficulty across legs
        const avgDifficulty = legs.length > 0
            ? legs.reduce((sum, leg) => sum + leg.difficulty, 0) / legs.length
            : 0;
        modelAvgDifficulties[model.getFullId()] = avgDifficulty;

        legs.forEach((leg, index) => {
            if (!legModelDifficulties[index]) legModelDifficulties[index] = {};
            legModelDifficulties[index][model.getFullId()] = leg.difficulty;
        });
      }

      // Build leg results using first model's analyzer for leg metadata
      const metaAnalyzer = createEventRouteAnalyzer(event, { scoringModel: allModels[0], courseId: course.id });
      const { legs: metaLegs, routes: metaRoutes } = analyzeCourseLegs(course, event, metaAnalyzer, false);

      const courseLength = metaLegs.reduce((sum, leg) => sum + leg.shortestDistance, 0);
      const estimatedTimeSec = runningSpeed > 0 ? courseLength / runningSpeed : 0;

      // Per-leg display data, keyed by leg index.
      const legName = (i: number) => metaLegs[i].label.replace(' → ', '-');
      const legRoute = (i: number) => metaRoutes[i]?.[0]?.labels.join('') || '';

      // Identify the most difficult leg per model (course difficulty == max leg).
      const hardestLegs: { [modelId: string]: HardestLeg } = {};
      for (const id of allModels.map((m) => m.getFullId())) {
          let bestIndex = -1;
          let bestDifficulty = -Infinity;
          metaLegs.forEach((_leg, index) => {
              const d = legModelDifficulties[index]?.[id] ?? -Infinity;
              if (d > bestDifficulty) {
                  bestDifficulty = d;
                  bestIndex = index;
              }
          });
          if (bestIndex >= 0) {
              hardestLegs[id] = {
                  legName: legName(bestIndex),
                  route: legRoute(bestIndex),
                  length: metaLegs[bestIndex].shortestDistance,
              };
          }
      }

      courseResults.push({
          eventDate: event.startTime?.date || '',
          eventTitle: event.name || '',
          courseName,
          courseId: course.id,
          targetDifficulty,
          targetDifficultyValue,
          courseLength,
          estimatedTimeSec,
          maxDifficulties: modelMaxDifficulties,
          avgDifficulties: modelAvgDifficulties,
          hardestLegs,
      });

      metaLegs.forEach((leg, index) => {
          const alternatives = metaRoutes[index] || [];
          // Alternatives are sorted shortest-first; the leg's scored route is the shortest.
          const shortestRoute = alternatives[0];
          // The route a runner could take with the least difficulty among the analysed alternatives.
          const lowestDiffRoute = alternatives.reduce(
              (best, r) => (r.difficulty < best.difficulty ? r : best),
              shortestRoute,
          );
          legResults.push({
              eventDate: event.startTime?.date || '',
              eventTitle: event.name || '',
              courseName,
              targetDifficulty,
              targetDifficultyValue,
              legIndex: index,
              legName: legName(index),
              fromControl: getControlLabel(leg.fromControlId, controls),
              toControl: getControlLabel(leg.toControlId, controls),
              legLength: leg.shortestDistance,
              routeDescription: shortestRoute?.labels.join('') || '',
              shortestDifficulty: shortestRoute?.difficulty ?? 0,
              lowestDiffRoute: lowestDiffRoute?.labels.join('') || '',
              lowestDiffLength: lowestDiffRoute?.distance ?? 0,
              lowestDiffDifficulty: lowestDiffRoute?.difficulty ?? 0,
              stairChanges: shortestRoute?.ignoreLengthEdges ?? 0,
              branchingPoints: shortestRoute?.branchingPointNodeIds.length ?? 0,
              decisionPoints: shortestRoute?.decisionPoints ?? 0,
              difficulties: legModelDifficulties[index] || {}
          });
      });
    }
  }

  const modelIds = allModels.map(m => m.getFullId());

  // ── Course CSV ──────────────────────────────────────────────────────────────
  const courseDiffHeaders = modelIds.flatMap(id => [
      `${id} (max)`,
      `${id} (avg)`,
      `${id} (hardest leg)`,
      `${id} (hardest leg route)`,
      `${id} (hardest leg length m)`,
  ]);
  let courseCsv = `Event Date,Event Title,Course,Target Difficulty,Target Difficulty Value,Course Length (m),Est. Time,${courseDiffHeaders.join(',')}\n`;
  courseResults.forEach(r => {
      const diffs = modelIds.flatMap(id => {
          const hl = r.hardestLegs[id];
          return [
              r.maxDifficulties[id]?.toFixed(2) || '',
              r.avgDifficulties[id]?.toFixed(2) || '',
              `"${hl?.legName ?? ''}"`,
              `"${hl?.route ?? ''}"`,
              hl ? hl.length.toFixed(1) : '',
          ];
      }).join(',');
      courseCsv += `"${r.eventDate}","${r.eventTitle}","${r.courseName}","${r.targetDifficulty}",${r.targetDifficultyValue},${r.courseLength.toFixed(1)},${formatTime(r.estimatedTimeSec)},${diffs}\n`;
  });
  fs.writeFileSync(path.join(resultsFolder, 'courses.csv'), courseCsv);

  // ── Event CSV ───────────────────────────────────────────────────────────────
  // One row per event. The hardest possible leg between any two existing controls
  // is an event-level property, so it lives here rather than being repeated per course.
  const eventDiffHeaders = findMaxLeg
      ? modelIds.flatMap(id => [`${id} (max possible leg)`, `${id} (max possible difficulty)`])
      : [];
  let eventCsv = `Event Date,Event Title,File,Controls,Courses${eventDiffHeaders.length ? ',' + eventDiffHeaders.join(',') : ''}\n`;
  eventResults.forEach(r => {
      const diffs = findMaxLeg
          ? ',' + modelIds.flatMap(id => {
                const mp = r.maxPossibleLegs[id];
                return [`"${mp?.controls ?? ''}"`, mp ? mp.difficulty.toFixed(2) : ''];
            }).join(',')
          : '';
      eventCsv += `"${r.eventDate}","${r.eventTitle}","${r.fileName}",${r.controlCount},${r.courseCount}${diffs}\n`;
  });
  fs.writeFileSync(path.join(resultsFolder, 'events.csv'), eventCsv);

  // ── Leg CSV ─────────────────────────────────────────────────────────────────
  let legCsv = `Event Date,Event Title,Course,Target Difficulty,Target Difficulty Value,Leg,From,To,Shortest Route,Shortest Length (m),Shortest Difficulty,Lowest-Diff Route,Lowest-Diff Length (m),Lowest-Diff Difficulty,Stairs,Branching Points,Decision Points,${modelIds.join(',')}\n`;
  legResults.forEach(r => {
      const diffs = modelIds.map(id => r.difficulties[id]?.toFixed(2) || '').join(',');
      legCsv += `"${r.eventDate}","${r.eventTitle}","${r.courseName}","${r.targetDifficulty}",${r.targetDifficultyValue},"${r.legName}","${r.fromControl}","${r.toControl}","${r.routeDescription}",${r.legLength.toFixed(1)},${r.shortestDifficulty.toFixed(2)},"${r.lowestDiffRoute}",${r.lowestDiffLength.toFixed(1)},${r.lowestDiffDifficulty.toFixed(2)},${r.stairChanges},${r.branchingPoints},${r.decisionPoints},${diffs}\n`;
  });
  fs.writeFileSync(path.join(resultsFolder, 'legs.csv'), legCsv);

  // ── Excel ────────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();

  const courseSheetData = courseResults.map(r => {
      const row: Record<string, string | number> = {
          'Event Date': r.eventDate,
          'Event Title': r.eventTitle,
          Course: r.courseName,
          'Target Difficulty': r.targetDifficulty,
          'Target Difficulty Value': r.targetDifficultyValue,
          'Course Length (m)': parseFloat(r.courseLength.toFixed(1)),
          'Est. Time': formatTime(r.estimatedTimeSec),
      };
      for (const id of modelIds) {
          const hl = r.hardestLegs[id];
          row[`${id} (max)`] = parseFloat(r.maxDifficulties[id]?.toFixed(2) ?? '0');
          row[`${id} (avg)`] = parseFloat(r.avgDifficulties[id]?.toFixed(2) ?? '0');
          row[`${id} (hardest leg)`] = hl?.legName ?? '';
          row[`${id} (hardest leg route)`] = hl?.route ?? '';
          row[`${id} (hardest leg length m)`] = hl ? parseFloat(hl.length.toFixed(1)) : '';
      }
      return row;
  });
  appendSheet(wb, 'courses', courseSheetData);

  const eventSheetData = eventResults.map(r => {
      const row: Record<string, string | number> = {
          'Event Date': r.eventDate,
          'Event Title': r.eventTitle,
          File: r.fileName,
          Controls: r.controlCount,
          Courses: r.courseCount,
      };
      if (findMaxLeg) {
          for (const id of modelIds) {
              const mp = r.maxPossibleLegs[id];
              row[`${id} (max possible leg)`] = mp?.controls ?? '';
              row[`${id} (max possible difficulty)`] = mp ? parseFloat(mp.difficulty.toFixed(2)) : '';
          }
      }
      return row;
  });
  appendSheet(wb, 'events', eventSheetData);

  const legSheetData = legResults.map(r => {
      const row: Record<string, string | number> = {
          'Event Date': r.eventDate,
          'Event Title': r.eventTitle,
          Course: r.courseName,
          'Target Difficulty': r.targetDifficulty,
          'Target Difficulty Value': r.targetDifficultyValue,
          Leg: r.legName,
          From: r.fromControl,
          To: r.toControl,
          'Shortest Route': r.routeDescription,
          'Shortest Length (m)': parseFloat(r.legLength.toFixed(1)),
          'Shortest Difficulty': parseFloat(r.shortestDifficulty.toFixed(2)),
          'Lowest-Diff Route': r.lowestDiffRoute,
          'Lowest-Diff Length (m)': parseFloat(r.lowestDiffLength.toFixed(1)),
          'Lowest-Diff Difficulty': parseFloat(r.lowestDiffDifficulty.toFixed(2)),
          Stairs: r.stairChanges,
          'Branching Points': r.branchingPoints,
          'Decision Points': r.decisionPoints,
      };
      for (const id of modelIds) {
          row[id] = parseFloat(r.difficulties[id]?.toFixed(2) ?? '0');
      }
      return row;
  });
  appendSheet(wb, 'legs', legSheetData);

  await wb.xlsx.writeFile(path.join(resultsFolder, 'route-analysis.xlsx'));

  // ── JSONL ────────────────────────────────────────────────────────────────────
  const courseJsonl = courseResults.map(r => JSON.stringify({
      eventDate: r.eventDate,
      eventTitle: r.eventTitle,
      courseName: r.courseName,
      courseId: r.courseId,
      targetDifficulty: r.targetDifficulty,
      targetDifficultyValue: r.targetDifficultyValue,
      courseLengthM: parseFloat(r.courseLength.toFixed(1)),
      estimatedTimeSec: Math.round(r.estimatedTimeSec),
      estimatedTime: formatTime(r.estimatedTimeSec),
      maxDifficulties: Object.fromEntries(
          modelIds.map(id => [id, parseFloat(r.maxDifficulties[id]?.toFixed(2) ?? '0')])
      ),
      avgDifficulties: Object.fromEntries(
          modelIds.map(id => [id, parseFloat(r.avgDifficulties[id]?.toFixed(2) ?? '0')])
      ),
      hardestLegs: Object.fromEntries(
          modelIds.map(id => {
              const hl = r.hardestLegs[id];
              return [id, hl ? { leg: hl.legName, route: hl.route, lengthM: parseFloat(hl.length.toFixed(1)) } : null];
          })
      ),
  })).join('\n');
  fs.writeFileSync(path.join(resultsFolder, 'courses.jsonl'), courseJsonl);

  const eventJsonl = eventResults.map(r => JSON.stringify({
      eventDate: r.eventDate,
      eventTitle: r.eventTitle,
      fileName: r.fileName,
      controlCount: r.controlCount,
      courseCount: r.courseCount,
      ...(findMaxLeg ? {
          maxPossibleLegs: Object.fromEntries(
              modelIds.map(id => {
                  const mp = r.maxPossibleLegs[id];
                  return [id, mp ? { controls: mp.controls, difficulty: parseFloat(mp.difficulty.toFixed(2)) } : null];
              })
          ),
      } : {}),
  })).join('\n');
  fs.writeFileSync(path.join(resultsFolder, 'events.jsonl'), eventJsonl);

  const legJsonl = legResults.map(r => JSON.stringify({
      eventDate: r.eventDate,
      eventTitle: r.eventTitle,
      courseName: r.courseName,
      targetDifficulty: r.targetDifficulty,
      targetDifficultyValue: r.targetDifficultyValue,
      legIndex: r.legIndex,
      legName: r.legName,
      fromControl: r.fromControl,
      toControl: r.toControl,
      shortestRoute: r.routeDescription,
      shortestLengthM: parseFloat(r.legLength.toFixed(1)),
      shortestDifficulty: parseFloat(r.shortestDifficulty.toFixed(2)),
      lowestDiffRoute: r.lowestDiffRoute,
      lowestDiffLengthM: parseFloat(r.lowestDiffLength.toFixed(1)),
      lowestDiffDifficulty: parseFloat(r.lowestDiffDifficulty.toFixed(2)),
      stairChanges: r.stairChanges,
      branchingPoints: r.branchingPoints,
      decisionPoints: r.decisionPoints,
      difficulties: Object.fromEntries(
          modelIds.map(id => [id, parseFloat(r.difficulties[id]?.toFixed(2) ?? '0')])
      ),
  })).join('\n');
  fs.writeFileSync(path.join(resultsFolder, 'legs.jsonl'), legJsonl);

  // Leave an untouched copy of this run's output in a timestamped subfolder,
  // alongside the overwritten files directly in resultsFolder.
  const outputFiles = [
    'courses.csv', 'events.csv', 'legs.csv',
    'courses.jsonl', 'events.jsonl', 'legs.jsonl',
    'route-analysis.xlsx',
  ];
  const archiveFolder = path.join(resultsFolder, timestampFolderName());
  fs.mkdirSync(archiveFolder, { recursive: true });
  for (const fileName of outputFiles) {
    fs.copyFileSync(path.join(resultsFolder, fileName), path.join(archiveFolder, fileName));
  }

  console.log(`\nDone! Output written to ${resultsFolder}`);
  console.log(`Dated copy saved to ${archiveFolder}`);
}

run().catch(console.error);
