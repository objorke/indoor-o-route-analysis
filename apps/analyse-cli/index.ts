#!/usr/bin/env tsx
/**
 * analyse-cli — Indoor orienteering route analysis CLI tool.
 *
 * Commands:
 *   shortest-path  Find shortest path between two controls/nodes
 *   analyze-course Analyze a specific course (leg-by-leg)
 *   analyze-all    Analyze all courses in the event
 *
 * Usage:
 *   analyse-cli <file> shortest-path --from <id> --to <id> [options]
 *   analyse-cli <file> analyze-course --course <name> [options]
 *   analyse-cli <file> analyze-all [options]
 *
 * Options:
 *   --format json|csv           Output format (default: json)
 *   --scoring-model <id>        Scoring model ID (default: alpha@0.1)
 *   --from <id>                 Start control ID (shortest-path)
 *   --to <id>                   End control ID (shortest-path)
 *   --algorithm shortest|human  Path-finding algorithm for shortest-path
 *                               (default: shortest); "human" adds trace
 *                               narration + cognitive-effort metrics
 *   --course <name>             Course name (analyze-course)
 *   --help                      Show help
 */
import {
  type RouteAnalyzer,
  createEventRouteAnalyzer,
  analyzeCourseLegs,
  getDifficultyCategory,
  getCourseDifficulty,
  getCourseAverageDifficulty,
  ScoringModelRegistry,
  buildHumanRouteLabelResolver,
  traceToExplanation,
  analyzeThinkingEffort,
  getCoordinates,
} from "@indoor-o-route-analysis/core";
import type { EventData } from "@indoor-o-route-analysis/core";
import { loadEventFile } from "./lib/loader.js";
import {
  formatJSON,
  formatShortestPathCSV,
  formatHumanShortestPathCSV,
  formatCourseCSV,
  formatAllCoursesCSV,
} from "./lib/formatter.js";
import type {
  ShortestPathResult,
  HumanShortestPathResult,
  CourseResult,
  LegResult,
  AllCoursesResult,
  CourseSummary,
} from "./lib/formatter.js";

// ── Argument parsing ────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  command: "shortest-path" | "analyze-course" | "analyze-all";
  format: "json" | "csv";
  scoringModel: string;
  from?: string;
  to?: string;
  course?: string;
  algorithm: "shortest" | "human";
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node and script path

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const file = args[0];
  const command = args[1];

  if (!file || !command) {
    printHelp();
    process.exit(1);
  }

  if (!["shortest-path", "analyze-course", "analyze-all"].includes(command)) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  // Parse named options
  let format: "json" | "csv" = "json";
  let scoringModel = "alpha@0.1";
  let from: string | undefined;
  let to: string | undefined;
  let course: string | undefined;
  let algorithm: "shortest" | "human" = "shortest";

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--algorithm":
        if (next !== "shortest" && next !== "human") {
          console.error(`Invalid algorithm: ${next} (expected shortest or human)`);
          process.exit(1);
        }
        algorithm = next;
        i++;
        break;
      case "--format":
        if (next !== "json" && next !== "csv") {
          console.error(`Invalid format: ${next} (expected json or csv)`);
          process.exit(1);
        }
        format = next;
        i++;
        break;
      case "--scoring-model":
        if (!next) {
          console.error("Missing value for --scoring-model");
          process.exit(1);
        }
        scoringModel = next;
        i++;
        break;
      case "--from":
        if (!next) {
          console.error("Missing value for --from");
          process.exit(1);
        }
        from = next;
        i++;
        break;
      case "--to":
        if (!next) {
          console.error("Missing value for --to");
          process.exit(1);
        }
        to = next;
        i++;
        break;
      case "--course":
        if (!next) {
          console.error("Missing value for --course");
          process.exit(1);
        }
        course = next;
        i++;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return {
    file,
    command: command as CliArgs["command"],
    format,
    scoringModel,
    from,
    to,
    course,
    algorithm,
  };
}

function printHelp(): void {
  console.log(`
analyse-cli — Indoor orienteering route analysis CLI

Usage:
  analyse-cli <file> <command> [options]

Commands:
  shortest-path   Find shortest path between two controls/nodes
  analyze-course  Analyze a specific course (leg-by-leg)
  analyze-all     Analyze all courses in the event

Options:
  --format json|csv         Output format (default: json)
  --scoring-model <id>      Scoring model ID (default: alpha@0.1)
  --from <id>               Start control ID (shortest-path)
  --to <id>                 End control ID (shortest-path)
  --algorithm shortest|human  Path-finding algorithm for shortest-path
                            (default: shortest). "human" simulates how a
                            runner would plan the route step by step,
                            including trace narration and cognitive-effort
                            metrics — requires --from/--to to be control
                            IDs (not raw node IDs).
  --course <name>           Course name (analyze-course)
  --help                    Show this help

Examples:
  analyse-cli event.json shortest-path --from S1 --to 31
  analyse-cli event.json shortest-path --from S1 --to 31 --algorithm human
  analyse-cli event.json analyze-course --course "Course A" --format csv
  analyse-cli event.xml analyze-all --format csv --scoring-model alpha@0.1
`);
}

// ── Command handlers ────────────────────────────────────────────────────────

function createAnalyzer(event: EventData, scoringModelId: string): RouteAnalyzer {
  if (!event.raceCourses?.[0]) {
    throw new Error("No race course data found in event");
  }
  return createEventRouteAnalyzer(event, { scoringModel: ScoringModelRegistry.getModelOrDefault(scoringModelId) });
}

function handleShortestPath(event: EventData, args: CliArgs): void {
  if (!args.from || !args.to) {
    console.error("shortest-path requires --from and --to options");
    process.exit(1);
  }

  if (args.algorithm === "human") {
    handleHumanShortestPath(event, args);
    return;
  }

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);

  const routes = analyzer.findAlternativePathsBetweenControls(args.from, args.to, 1);

  if (routes.length === 0) {
    console.error(`No path found from ${args.from} to ${args.to}`);
    process.exit(1);
  }

  const best = routes[0];
  const category = getDifficultyCategory(best.difficulty, scoringModel);

  const result: ShortestPathResult = {
    from: args.from,
    to: args.to,
    path: best.path,
    description: best.description,
    labels: best.labels,
    distance: best.distance,
    difficulty: best.difficulty,
    difficultyCategory: category.label,
    decisionPoints: best.decisionPoints,
    alternativeEdges: best.alternativeEdges,
    totalClimb: best.totalClimb,
  };

  if (args.format === "csv") {
    process.stdout.write(formatShortestPathCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

function handleHumanShortestPath(event: EventData, args: CliArgs): void {
  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const controls = raceCourse.controls || [];
  const vertices = raceCourse.vertices || [];
  const polygons = raceCourse.polygons || [];

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);
  const from = args.from!;
  const to = args.to!;

  const humanResult = analyzer.findHumanRouteWithTrace(from, to);
  if (!humanResult) {
    console.error(
      `No human route found from ${from} to ${to}. Either "${from}"/"${to}" aren't both control IDs ` +
        `(the human-route search only accepts controls, unlike --algorithm shortest which also takes raw node IDs), ` +
        `or no route exists between them (check with --algorithm shortest).`,
    );
    process.exit(1);
  }

  const fromNodeId = analyzer.getNodeIdForControl(from);
  const toNodeId = analyzer.getNodeIdForControl(to);
  const resolver =
    fromNodeId && toNodeId
      ? buildHumanRouteLabelResolver({
          clusterOf: humanResult.clusterOf ?? {},
          fromNodeId,
          fromLabel: from,
          toNodeId,
          toLabel: to,
          resolveNode: (id) => controls.find((c) => c.id === id) ?? vertices.find((n) => n.id === id) ?? null,
          getCoordinates,
          polygons,
        })
      : undefined;

  const fromControl = controls.find((c) => c.id === from);
  const toControl = controls.find((c) => c.id === to);
  const shortestDistance =
    fromControl && toControl ? analyzer.calculateRouteDistance(fromControl, toControl) : undefined;

  const effort = analyzeThinkingEffort(humanResult, Number.isFinite(shortestDistance) ? shortestDistance : undefined);
  const narration = traceToExplanation(humanResult, resolver).map((m) => m.text);
  const route = humanResult.route;
  const category = getDifficultyCategory(route.difficulty, scoringModel);

  const result: HumanShortestPathResult = {
    from,
    to,
    path: route.path,
    description: route.description,
    labels: route.labels,
    distance: route.distance,
    difficulty: route.difficulty,
    difficultyCategory: category.label,
    decisionPoints: route.decisionPoints,
    alternativeEdges: route.alternativeEdges,
    totalClimb: route.totalClimb,
    sameFloor: humanResult.sameFloor,
    narration,
    mentalSteps: effort.mentalSteps,
    planDepth: effort.planDepth,
    cognitiveEffortScore: effort.cognitiveEffortScore,
    humanOptimalGap: effort.humanOptimalGap,
  };

  if (args.format === "csv") {
    process.stdout.write(formatHumanShortestPathCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

function handleAnalyzeCourse(event: EventData, args: CliArgs): void {
  if (!args.course) {
    console.error("analyze-course requires --course option");
    process.exit(1);
  }

  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const courses = raceCourse.courses || [];
  const course = courses.find(
    (c) => c.name.toLowerCase() === args.course!.toLowerCase(),
  );

  if (!course) {
    const available = courses.map((c) => c.name).join(", ");
    console.error(
      `Course "${args.course}" not found. Available courses: ${available}`,
    );
    process.exit(1);
  }

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);
  const { legs, routes } = analyzeCourseLegs(course, event, analyzer, false);

  const legDetails: LegResult[] = legs.map((leg, i) => {
    const bestRoute = routes[i]?.[0];
    const category = getDifficultyCategory(leg.difficulty, scoringModel);

    return {
      leg: leg.label,
      fromControlId: leg.fromControlId,
      toControlId: leg.toControlId,
      distance: leg.shortestDistance,
      difficulty: leg.difficulty,
      difficultyCategory: category.label,
      decisionPoints: leg.decisionPoints,
      alternativeEdges: leg.alternativeEdges,
      description: bestRoute?.description || "",
      labels: bestRoute?.labels || [],
      totalClimb: leg.totalClimb,
    };
  });

  const totalDistance = legs.reduce((sum, l) => sum + l.shortestDistance, 0);
  const maxDifficulty = getCourseDifficulty(legs, scoringModel);
  const avgDifficulty = getCourseAverageDifficulty(legs, scoringModel);
  const maxCategory = getDifficultyCategory(maxDifficulty, scoringModel);

  const result: CourseResult = {
    courseName: course.name,
    legs: legs.length,
    totalDistance,
    maxDifficulty,
    maxDifficultyCategory: maxCategory.label,
    avgDifficulty,
    targetDifficulty: course.targetDifficulty || "",
    legDetails,
  };

  if (args.format === "csv") {
    process.stdout.write(formatCourseCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

function handleAnalyzeAll(event: EventData, args: CliArgs): void {
  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error("No race course data found in event");
  }

  const courses = raceCourse.courses || [];
  if (courses.length === 0) {
    console.error("No courses found in event");
    process.exit(1);
  }

  const analyzer = createAnalyzer(event, args.scoringModel);
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);

  const courseSummaries: CourseSummary[] = courses.map((course) => {
    const { legs } = analyzeCourseLegs(course, event, analyzer, false);

    const totalDistance = legs.reduce((sum, l) => sum + l.shortestDistance, 0);
    const maxDifficulty = getCourseDifficulty(legs, scoringModel);
    const avgDifficulty = getCourseAverageDifficulty(legs, scoringModel);
    const maxCategory = getDifficultyCategory(maxDifficulty, scoringModel);

    return {
      courseName: course.name,
      legs: legs.length,
      totalDistance,
      maxDifficulty,
      maxDifficultyCategory: maxCategory.label,
      avgDifficulty,
      targetDifficulty: course.targetDifficulty || "",
    };
  });

  const result: AllCoursesResult = {
    eventName: event.name,
    eventDate: event.startTime?.date || "",
    courses: courseSummaries,
  };

  if (args.format === "csv") {
    process.stdout.write(formatAllCoursesCSV(result));
  } else {
    console.log(formatJSON(result));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv);

  let event: EventData;
  try {
    event = loadEventFile(args.file);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load file: ${msg}`);
    process.exit(1);
  }

  switch (args.command) {
    case "shortest-path":
      handleShortestPath(event, args);
      break;
    case "analyze-course":
      handleAnalyzeCourse(event, args);
      break;
    case "analyze-all":
      handleAnalyzeAll(event, args);
      break;
  }
}

main();
