#!/usr/bin/env tsx
import type { EventData, RouteInfo, TraceEvent } from "@indoor-o-route-analysis/core";
import {
  getDifficultyCategory,
  createEventRouteAnalyzer,
  ScoringModelRegistry,
  TraceRecorder,
} from "@indoor-o-route-analysis/core";
import type { MinimalCanvas2DContext } from "@indoor-o-route-analysis/core/render";
import {
  renderRouteVizFrame,
  VIZ_ALL_ROUTES_ALPHA,
  VIZ_ALL_ROUTES_FOUND_FLASH_COLOR,
  VIZ_ALL_ROUTES_PALETTE,
  VIZ_EASIEST_ROUTE_COLOR,
  VIZ_HUMAN_ROUTE_COLOR,
  VIZ_SHORTEST_ROUTE_COLOR,
} from "@indoor-o-route-analysis/core/render";
/**
 * route-viz-cli — renders a video visualization of the route-finding
 * algorithms (shortest route, easiest route, simulated human route, all
 * distinct routes) for a single leg, reusing the real RouteAnalyzer
 * algorithms via an injected trace-recording callback.
 *
 * Usage:
 *   route-viz-cli <file> --course <name> --leg <from>-<to> [options]
 *   route-viz-cli <file> --from <id> --to <id> [options]
 *
 * Options:
 *   --export <list>         Comma-separated phases to include: shortest,
 *                            easiest, human, all-routes (default: all four,
 *                            combinable in any subset)
 *   --duration <seconds>    Animation time PER SELECTED PHASE (default: 20)
 *   --fps <n>               Frames per second (default: 30)
 *   --width <px>            Video width in pixels (default: 1920)
 *   --height <px>           Video height in pixels (default: 1080)
 *   --out <path>            Output .mp4 path (default: derived from course/leg)
 *   --scoring-model <id>    Difficulty scoring model (default: alpha@0.1)
 *   --max-routes <n>        Max number of distinct routes to enumerate (default: 300)
 *   --vcodec <name>         ffmpeg video encoder (default: libopenh264)
 *   --bitrate <rate>        Video bitrate, e.g. "10M" or "8000k" (default: 10M)
 *   --help                  Show this help
 */
import { createCanvas } from "@napi-rs/canvas";
import { computeLayout } from "./lib/layout.js";
import { resolveLegByLabel } from "./lib/leg-resolver.js";
import { loadEventFile } from "./lib/loader.js";
import {
  buildFrameStates,
  CONTENT_PHASE_ORDER,
  type ContentPhaseName,
  MIN_PHASE_DURATION_SECONDS,
  planPhases,
} from "./lib/timeline.js";
import { FfmpegVideoWriter } from "./lib/video-writer.js";

// ── Argument parsing ────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  course?: string;
  leg?: string;
  from?: string;
  to?: string;
  exportPhases: ContentPhaseName[];
  duration: number;
  fps: number;
  width: number;
  height: number;
  out?: string;
  scoringModel: string;
  maxRoutes: number;
  vcodec?: string;
  bitrate?: string;
}

function printHelp(): void {
  console.log(`
route-viz-cli — renders a video visualization of the route-finding algorithms
(shortest route, easiest route, simulated human route, all distinct routes)
for a single leg.

Usage:
  route-viz-cli <file> --course <name> --leg <from>-<to> [options]
  route-viz-cli <file> --from <id> --to <id> [options]

Options:
  --export <list>         Comma-separated phases to include: shortest, easiest,
                           human, all-routes (default: all four; combinable in
                           any subset, e.g. --export shortest,human)
  --duration <seconds>    Animation time PER SELECTED PHASE (default: 20)
  --fps <n>               Frames per second (default: 30)
  --width <px>            Video width in pixels (default: 1920)
  --height <px>           Video height in pixels (default: 1080)
  --out <path>            Output .mp4 path (default: derived from course/leg)
  --scoring-model <id>    Difficulty scoring model (default: alpha@0.1)
  --max-routes <n>        Max number of distinct routes to enumerate (default: 300)
  --vcodec <name>         ffmpeg video encoder (default: libopenh264)
  --bitrate <rate>        Video bitrate, e.g. "10M" or "8000k" (default: 10M)
  --help                  Show this help

Examples:
  route-viz-cli event.json --course "Bana 1" --leg 3-4 --duration 20
  route-viz-cli event.json --course "Bana 1" --leg 3-4 --export shortest,human --duration 10
  route-viz-cli event.json --from 33 --to 34 --out leg.mp4
`);
}

function parseExportPhases(raw: string): ContentPhaseName[] {
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);
  const seen = new Set<ContentPhaseName>();
  for (const token of tokens) {
    if (!(CONTENT_PHASE_ORDER as string[]).includes(token)) {
      console.error(`Invalid --export phase "${token}". Valid phases: ${CONTENT_PHASE_ORDER.join(", ")}`);
      process.exit(1);
    }
    seen.add(token as ContentPhaseName);
  }
  if (seen.size === 0) {
    console.error("--export must list at least one phase");
    process.exit(1);
  }
  // Always presented in the canonical order, regardless of the order given.
  return CONTENT_PHASE_ORDER.filter((p) => seen.has(p));
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const file = args[0];
  if (!file || file.startsWith("--")) {
    printHelp();
    process.exit(1);
  }

  let course: string | undefined;
  let leg: string | undefined;
  let from: string | undefined;
  let to: string | undefined;
  let exportPhasesRaw: string | undefined;
  let duration = 20;
  let fps = 30;
  let width = 1920;
  let height = 1080;
  let out: string | undefined;
  let scoringModel = "alpha@0.1";
  let maxRoutes = 300;
  let vcodec: string | undefined;
  let bitrate: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    const requireNext = (name: string): string => {
      const value = args[i + 1];
      if (!value) {
        console.error(`Missing value for ${name}`);
        process.exit(1);
      }
      i++;
      return value;
    };

    switch (arg) {
      case "--course": course = requireNext(arg); break;
      case "--leg": leg = requireNext(arg); break;
      case "--from": from = requireNext(arg); break;
      case "--to": to = requireNext(arg); break;
      case "--export": exportPhasesRaw = requireNext(arg); break;
      case "--duration": duration = Number(requireNext(arg)); break;
      case "--fps": fps = Number(requireNext(arg)); break;
      case "--width": width = Number(requireNext(arg)); break;
      case "--height": height = Number(requireNext(arg)); break;
      case "--out": out = requireNext(arg); break;
      case "--scoring-model": scoringModel = requireNext(arg); break;
      case "--max-routes": maxRoutes = Number(requireNext(arg)); break;
      case "--vcodec": vcodec = requireNext(arg); break;
      case "--bitrate": bitrate = requireNext(arg); break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  if (!course && !from) {
    console.error("Either --course/--leg or --from/--to is required");
    printHelp();
    process.exit(1);
  }
  if (course && !leg) {
    console.error("--course requires --leg");
    process.exit(1);
  }
  if (from && !to) {
    console.error("--from requires --to");
    process.exit(1);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    console.error(`Invalid --duration: ${duration}`);
    process.exit(1);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    console.error(`Invalid --fps: ${fps}`);
    process.exit(1);
  }

  const exportPhases = exportPhasesRaw ? parseExportPhases(exportPhasesRaw) : [...CONTENT_PHASE_ORDER];

  return {
    file,
    course,
    leg,
    from,
    to,
    exportPhases,
    duration,
    fps,
    width,
    height,
    out,
    scoringModel,
    maxRoutes,
    vcodec,
    bitrate,
  };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "video";
}

/** Route labels concatenated plainly (e.g. "FlPLbb"), not comma-separated. */
function routeLetters(route: RouteInfo): string {
  return route.labels.join("") || "—";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  let event: EventData;
  try {
    event = loadEventFile(args.file);
  } catch (error) {
    console.error(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  let fromControlId: string;
  let toControlId: string;
  let courseName = "";
  let legTitle: string;

  if (args.course && args.leg) {
    try {
      const resolved = resolveLegByLabel(event, args.course, args.leg);
      fromControlId = resolved.fromControlId;
      toControlId = resolved.toControlId;
      courseName = resolved.courseName;
      legTitle = `${resolved.fromLabel} → ${resolved.toLabel}`;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else {
    fromControlId = args.from!;
    toControlId = args.to!;
    legTitle = `${fromControlId} → ${toControlId}`;
  }

  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    console.error("No race course data found in event");
    process.exit(1);
  }

  const controls = raceCourse.controls || [];
  const vertices = raceCourse.vertices || [];
  const edges = raceCourse.edges || [];
  const scoringModel = ScoringModelRegistry.getModelOrDefault(args.scoringModel);

  const recorder = new TraceRecorder();
  const analyzer = createEventRouteAnalyzer(event, { scoringModel, visualizer: recorder });

  console.error(`Searching for routes ${fromControlId} → ${toControlId}...`);
  const foundRoutes = analyzer.findAllAlternativePathsBetweenControls(fromControlId, toControlId, args.maxRoutes);
  if (foundRoutes.length === 0) {
    console.error(`No route found from ${fromControlId} to ${toControlId}`);
    process.exit(1);
  }

  // findAllAlternativePathsBetweenControls already dedupes by visible stair
  // label sequence; this is a defensive extra pass so only genuinely
  // distinct node paths ever reach the visualization.
  const seenPaths = new Set<string>();
  const sortedRoutes = foundRoutes.filter((route) => {
    const key = route.path.join(">");
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  });

  const shortest = sortedRoutes[0];
  const easiest = sortedRoutes.reduce((min, r) => (r.difficulty < min.difficulty ? r : min), sortedRoutes[0]);
  const shortestCategory = getDifficultyCategory(shortest.difficulty, scoringModel);
  const easiestCategory = getDifficultyCategory(easiest.difficulty, scoringModel);
  const sameRoute = easiest === shortest;

  console.error(
    `Found ${sortedRoutes.length} distinct route(s). ` +
      `Shortest: ${shortest.distance.toFixed(0)}m (${shortestCategory.label}). ` +
      `Easiest: ${easiest.distance.toFixed(0)}m (${easiestCategory.label}).`
  );

  // The simulated human route runs its own analyzer instance (a RouteAnalyzer's
  // visualizer is fixed at construction) so its search trace doesn't mix with
  // the shared shortest/easiest/all-routes trace above.
  let human: RouteInfo | undefined;
  let humanEvents: TraceEvent[] = [];
  if (args.exportPhases.includes("human")) {
    const humanRecorder = new TraceRecorder();
    const humanAnalyzer = createEventRouteAnalyzer(event, { scoringModel, visualizer: humanRecorder });
    human = humanAnalyzer.findHumanRouteBetweenControls(fromControlId, toControlId);
    humanEvents = humanRecorder.events;
    if (human) {
      console.error(`Simulated human route: ${human.distance.toFixed(0)}m, ${routeLetters(human)}.`);
    } else {
      console.error("Simulated human route: no route found — the 'human' phase will be skipped.");
    }
  }

  if (args.duration < MIN_PHASE_DURATION_SECONDS) {
    console.warn(
      `--duration ${args.duration}s is below the ${MIN_PHASE_DURATION_SECONDS}s minimum per phase needed to stay ` +
        `legible; each selected phase will run ${MIN_PHASE_DURATION_SECONDS}s instead.`
    );
  }

  const layout = computeLayout(vertices, controls, args.width, args.height);
  const selectedPhases = human ? args.exportPhases : args.exportPhases.filter((p) => p !== "human");
  const phases = planPhases(selectedPhases, args.duration, args.fps);

  const eventTitle = `${event.name}${courseName ? ` — ${courseName}` : ""}`;
  const humanCategory = human ? getDifficultyCategory(human.difficulty, scoringModel) : undefined;
  const frames = buildFrameStates({
    selectedPhases,
    events: recorder.events,
    shortest,
    easiest,
    allRoutes: sortedRoutes,
    human,
    humanEvents,
    phases,
    fps: args.fps,
    captions: {
      intro: { caption: eventTitle, subcaption: `Leg ${legTitle}` },
      shortest: {
        caption: "Shortest route",
        subcaption: `${shortest.distance.toFixed(0)} m · ${shortestCategory.label} · ${routeLetters(shortest)}`,
      },
      easiest: {
        caption: "Easiest route",
        subcaption: sameRoute
          ? "Same as the shortest route"
          : `${easiest.distance.toFixed(0)} m · ${easiestCategory.label} · ${routeLetters(easiest)}`,
      },
      human: {
        caption: "Simulated human route",
        subcaption: human && humanCategory
          ? `${human.distance.toFixed(0)} m · ${humanCategory.label} · ${routeLetters(human)}`
          : "—",
      },
      allRoutes: { caption: "All distinct routes", subcaption: `${sortedRoutes.length} routes found` },
      outro: { caption: eventTitle, subcaption: `${sortedRoutes.length} routes analyzed` },
    },
    routeColors: {
      shortest: VIZ_SHORTEST_ROUTE_COLOR,
      easiest: VIZ_EASIEST_ROUTE_COLOR,
      human: VIZ_HUMAN_ROUTE_COLOR,
      allRoutesPalette: VIZ_ALL_ROUTES_PALETTE,
      allRoutesAlpha: VIZ_ALL_ROUTES_ALPHA,
      allRoutesFoundFlash: VIZ_ALL_ROUTES_FOUND_FLASH_COLOR,
    },
  });

  const legControls = { fromNodeId: fromControlId, toNodeId: toControlId };

  const outPath = args.out || `route-viz-${slugify(courseName || legTitle)}.mp4`;
  const writer = new FfmpegVideoWriter({
    width: args.width,
    height: args.height,
    fps: args.fps,
    outPath,
    vcodec: args.vcodec,
    bitrate: args.bitrate,
  });
  await writer.start();

  const canvas = createCanvas(args.width, args.height);
  // @napi-rs/canvas's context is structurally compatible with our minimal
  // interface except for fillStyle/strokeStyle, which it types more broadly
  // (string | CanvasGradient | CanvasPattern) since we only ever assign
  // string colors to them; hence the one contained cast here.
  const ctx = canvas.getContext("2d") as unknown as MinimalCanvas2DContext;

  for (let i = 0; i < frames.length; i++) {
    renderRouteVizFrame(ctx, edges, layout, legControls, frames[i]);
    await writer.writeFrame(canvas.data());

    if (i % 30 === 0 || i === frames.length - 1) {
      const pct = Math.round(((i + 1) / frames.length) * 100);
      process.stderr.write(`\rRendering frames: ${pct}% (${i + 1}/${frames.length})`);
    }
  }
  process.stderr.write("\n");

  await writer.finish();

  const actualDuration = frames.length / args.fps;
  console.log(
    `Wrote ${outPath} (${actualDuration.toFixed(1)}s, ${args.width}x${args.height}, ${args.fps}fps, phases: ${selectedPhases.join(", ")})`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
