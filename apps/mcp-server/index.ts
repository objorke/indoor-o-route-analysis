#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { parseEventFromJSON } from "@indoor-o-route-analysis/core";
import { createEventRouteAnalyzer, getEventScoringModel } from "@indoor-o-route-analysis/core";
import { analyzeCourseLegs } from "@indoor-o-route-analysis/core";
import { ScoringModelRegistry } from "@indoor-o-route-analysis/core";
import type { EventData } from "@indoor-o-route-analysis/core";
import { getActualCourseControls } from "@indoor-o-route-analysis/core";
import {
  buildHumanRouteLabelResolver,
  traceToExplanation,
  analyzeThinkingEffort,
  getCoordinates,
} from "@indoor-o-route-analysis/core";

/**
 * Only .json paths are accepted for load_event/resource reads — this tool
 * only ever parses via parseEventFromJSON (no IOF XML support here, unlike
 * analyse-cli's loader). Rejecting other extensions up front, before any
 * read, narrows what would otherwise be an arbitrary-local-file-read
 * surface (any path an MCP client passes as a tool argument) down to
 * "files that look like they could be an event export."
 */
function assertJsonPath(filePath: string): void {
  if (path.extname(filePath).toLowerCase() !== ".json") {
    throw new Error(`Unsupported file format: expected a .json file, got "${filePath}"`);
  }
}

// In-memory storage for the current event
let currentEvent: EventData | null = null;
let currentEventPath: string | null = null;

/**
 * MCP Server for Indoor Orienteering Route Analysis
 */
const server = new Server(
  {
    name: "indoor-o-route-analysis",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * List available resources (event JSON files)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [];

  if (currentEventPath) {
    resources.push({
      uri: `file://${currentEventPath}`,
      name: currentEvent?.name || path.basename(currentEventPath),
      description: `Current loaded event: ${currentEvent?.name || "Unknown"}`,
      mimeType: "application/json",
    });
  }

  return { resources };
});

/**
 * Read a resource (load event from JSON file)
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (!uri.startsWith("file://")) {
    throw new Error("Only file:// URIs are supported");
  }

  const filePath = uri.slice(7); // Remove "file://"

  assertJsonPath(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  currentEvent = parseEventFromJSON(content);
  currentEventPath = filePath;

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: content,
      },
    ],
  };
});

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "load_event",
        description:
          "Load an event from a JSON file into context. This must be called before using other analysis tools.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Absolute path to the event JSON file",
            },
          },
          required: ["file_path"],
        },
      },
      {
        name: "get_event_info",
        description:
          "Get information about the currently loaded event including name, date, and number of courses.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_courses",
        description:
          "List all courses in the current event with their names and number of controls.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_course_details",
        description:
          "Get detailed information about a specific course including all controls in order.",
        inputSchema: {
          type: "object",
          properties: {
            course_name: {
              type: "string",
              description: "Name of the course to get details for",
            },
          },
          required: ["course_name"],
        },
      },
      {
        name: "list_classes",
        description:
          "List all classes (categories) in the event and their assigned courses.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_graph_info",
        description:
          "Get information about the navigation graph including number of nodes, edges, and polygons.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "analyze_shortest_route",
        description:
          "Find the shortest route between two controls and analyze its properties.",
        inputSchema: {
          type: "object",
          properties: {
            from_control: {
              type: "string",
              description: "Control code to start from (e.g., '31', 'S1')",
            },
            to_control: {
              type: "string",
              description: "Control code to navigate to (e.g., '42', 'F1')",
            },
            max_alternatives: {
              type: "number",
              description: "Maximum number of alternative routes to find (default: 3)",
            },
          },
          required: ["from_control", "to_control"],
        },
      },
      {
        name: "find_human_route",
        description:
          "Simulate how a runner would plan the route between two controls step by step (rather than the true shortest path), with narration of the search and cognitive-effort metrics (mental steps, plan depth, a combined effort score, and the route-length gap vs. the true shortest route). Useful for spotting legs that look easy on paper but are hard to plan through, or 'bait' legs where the shortest route isn't the one a runner would actually find.",
        inputSchema: {
          type: "object",
          properties: {
            from_control: {
              type: "string",
              description: "Control code to start from (e.g., '31', 'S1')",
            },
            to_control: {
              type: "string",
              description: "Control code to navigate to (e.g., '42', 'F1')",
            },
          },
          required: ["from_control", "to_control"],
        },
      },
      {
        name: "analyze_course_difficulty",
        description:
          "Analyze the difficulty of an entire course, providing leg-by-leg breakdown and total difficulty score.",
        inputSchema: {
          type: "object",
          properties: {
            course_name: {
              type: "string",
              description: "Name of the course to analyze",
            },
            scoring_model: {
              type: "string",
              description:
                "Scoring model to use (e.g., 'basic@0.1', 'basic@0.2'). If not specified, uses default model.",
            },
          },
          required: ["course_name"],
        },
      },
    ],
  };
});

/**
 * Handle tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "load_event": {
        const filePath = (args as any).file_path;

        assertJsonPath(filePath);

        if (!fs.existsSync(filePath)) {
          return {
            content: [
              { type: "text", text: `Error: File not found: ${filePath}` },
            ],
          };
        }

        const content = fs.readFileSync(filePath, "utf-8");
        currentEvent = parseEventFromJSON(content);
        currentEventPath = filePath;

        const raceCourse = currentEvent.raceCourses?.[0];
        const numCourses = raceCourse?.courses?.length || 0;
        const numControls = raceCourse?.controls?.length || 0;
        const numNodes = raceCourse?.vertices?.length || 0;
        const numEdges = raceCourse?.edges?.length || 0;

        return {
          content: [
            {
              type: "text",
              text: `✅ Loaded event: ${currentEvent.name}\nDate: ${currentEvent.startTime.date}\nCourses: ${numCourses}\nControls: ${numControls}\nGraph nodes: ${numNodes}\nGraph edges: ${numEdges}`,
            },
          ],
        };
      }

      case "get_event_info": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const raceCourse = currentEvent.raceCourses?.[0];
        const numCourses = raceCourse?.courses?.length || 0;
        const numControls = raceCourse?.controls?.length || 0;

        return {
          content: [
            {
              type: "text",
              text: `Event: ${currentEvent.name}\nDate: ${currentEvent.startTime.date}\nCountry: ${currentEvent.country || "Unknown"}\nCourses: ${numCourses}\nControls: ${numControls}`,
            },
          ],
        };
      }

      case "list_courses": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const raceCourse = currentEvent.raceCourses?.[0];
        const courses = raceCourse?.courses || [];

        if (courses.length === 0) {
          return {
            content: [{ type: "text", text: "No courses found in this event." }],
          };
        }

        const courseList = courses
          .map((course, idx) => {
            const numControls = course.controls?.length || 0;
            return `${idx + 1}. ${course.name} (${numControls} controls)`;
          })
          .join("\n");

        return {
          content: [
            { type: "text", text: `Courses in ${currentEvent.name}:\n${courseList}` },
          ],
        };
      }

      case "get_course_details": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const courseName = (args as any).course_name;
        const raceCourse = currentEvent.raceCourses?.[0];
        const courses = raceCourse?.courses || [];
        const controls = raceCourse?.controls || [];

        const course = courses.find((c) => c.name === courseName);
        if (!course) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Course not found: ${courseName}\nAvailable courses: ${courses.map((c) => c.name).join(", ")}`,
              },
            ],
          };
        }

        const courseControls = getActualCourseControls(
          course.controls || [],
          controls
        );
        const controlList = courseControls
          .map((cc, idx) => {
            const control = controls.find((c) => c.id === cc.controlId);
            const code = control?.id || cc.controlId;
            const type = cc.type || "control";
            return `${idx + 1}. ${code} (${type})`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Course: ${course.name}\nControls: ${courseControls.length}\n\nControl list:\n${controlList}`,
            },
          ],
        };
      }

      case "list_classes": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const raceCourse = currentEvent.raceCourses?.[0];
        const classAssignments = raceCourse?.classAssignments || [];

        if (classAssignments.length === 0) {
          return {
            content: [
              { type: "text", text: "No class assignments found in this event." },
            ],
          };
        }

        const classList = classAssignments
          .map((ca, idx) => {
            const numCompetitors = ca.numberOfCompetitors || 0;
            return `${idx + 1}. ${ca.className} → ${ca.courseName}${numCompetitors > 0 ? ` (${numCompetitors} competitors)` : ""}`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Classes in ${currentEvent.name}:\n${classList}`,
            },
          ],
        };
      }

      case "get_graph_info": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const raceCourse = currentEvent.raceCourses?.[0];
        const nodes = raceCourse?.vertices || [];
        const edges = raceCourse?.edges || [];
        const polygons = raceCourse?.polygons || [];

        const oneWayEdges = edges.filter((e) => e.oneWay).length;
        const ignoreLengthEdges = edges.filter((e) => e.ignoreLength).length;

        return {
          content: [
            {
              type: "text",
              text: `Navigation Graph:\nNodes: ${nodes.length}\nEdges: ${edges.length}\n  - One-way: ${oneWayEdges}\n  - Stairs (ignoreLength): ${ignoreLengthEdges}\nPolygons: ${polygons.length}`,
            },
          ],
        };
      }

      case "analyze_shortest_route": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const fromControlCode = (args as any).from_control;
        const toControlCode = (args as any).to_control;
        const maxAlternatives = (args as any).max_alternatives || 3;

        const raceCourse = currentEvent.raceCourses?.[0];
        const controls = raceCourse?.controls || [];
        const nodes = raceCourse?.vertices || [];
        const edges = raceCourse?.edges || [];

        const fromControl = controls.find((c) => c.id === fromControlCode);
        const toControl = controls.find((c) => c.id === toControlCode);

        if (!fromControl) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Control not found: ${fromControlCode}\nAvailable controls: ${controls.map((c) => c.id).join(", ")}`,
              },
            ],
          };
        }

        if (!toControl) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Control not found: ${toControlCode}\nAvailable controls: ${controls.map((c) => c.id).join(", ")}`,
              },
            ],
          };
        }

        const scoringModel = getEventScoringModel(currentEvent);
        const analyzer = createEventRouteAnalyzer(currentEvent, { scoringModel });

        const routes = analyzer.findAlternativePathsBetweenControls(
          fromControl.id,
          toControl.id,
          maxAlternatives
        );

        if (routes.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `❌ No route found between ${fromControlCode} and ${toControlCode}`,
              },
            ],
          };
        }

        const routeDescriptions = routes.map((route, idx) => {
          const diffCategory = scoringModel.getDifficultyCategory(route.difficulty);
          return `\n${idx + 1}. ${route.description}\n   Distance: ${route.distance.toFixed(1)}m\n   Difficulty: ${route.difficulty.toFixed(2)} (${diffCategory.label})\n   Decision points: ${route.decisionPoints}\n   Alternative edges: ${route.alternativeEdges}\n   One-way edges: ${route.oneWayEdges}\n   Stairs: ${route.ignoreLengthEdges}`;
        });

        return {
          content: [
            {
              type: "text",
              text: `Routes from ${fromControlCode} to ${toControlCode}:${routeDescriptions.join("\n")}`,
            },
          ],
        };
      }

      case "find_human_route": {
        if (!currentEvent) {
          return {
            content: [
              { type: "text", text: "❌ No event loaded. Use load_event tool first." },
            ],
          };
        }

        const fromControlCode = (args as any).from_control;
        const toControlCode = (args as any).to_control;

        const raceCourse = currentEvent.raceCourses?.[0];
        const controls = raceCourse?.controls || [];
        const nodes = raceCourse?.vertices || [];
        const edges = raceCourse?.edges || [];

        const fromControl = controls.find((c) => c.id === fromControlCode);
        const toControl = controls.find((c) => c.id === toControlCode);

        if (!fromControl) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Control not found: ${fromControlCode}\nAvailable controls: ${controls.map((c) => c.id).join(", ")}`,
              },
            ],
          };
        }

        if (!toControl) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Control not found: ${toControlCode}\nAvailable controls: ${controls.map((c) => c.id).join(", ")}`,
              },
            ],
          };
        }

        const scoringModel = getEventScoringModel(currentEvent);
        const analyzer = createEventRouteAnalyzer(currentEvent, { scoringModel });

        const humanResult = analyzer.findHumanRouteWithTrace(fromControl.id, toControl.id);
        if (!humanResult) {
          return {
            content: [
              {
                type: "text",
                text: `❌ No human route found between ${fromControlCode} and ${toControlCode}. No route exists between these controls — check with analyze_shortest_route.`,
              },
            ],
          };
        }

        const fromNodeId = analyzer.getNodeIdForControl(fromControl.id);
        const toNodeId = analyzer.getNodeIdForControl(toControl.id);
        const resolver =
          fromNodeId && toNodeId
            ? buildHumanRouteLabelResolver({
                clusterOf: humanResult.clusterOf ?? {},
                fromNodeId,
                fromLabel: fromControlCode,
                toNodeId,
                toLabel: toControlCode,
                resolveNode: (id) => controls.find((c) => c.id === id) ?? nodes.find((n) => n.id === id) ?? null,
                getCoordinates,
                polygons: raceCourse?.polygons || [],
              })
            : undefined;

        const shortestDistance = analyzer.calculateRouteDistance(fromControl, toControl);
        const effort = analyzeThinkingEffort(humanResult, Number.isFinite(shortestDistance) ? shortestDistance : undefined);
        const narration = traceToExplanation(humanResult, resolver).map((m) => m.text);
        const route = humanResult.route;
        const diffCategory = scoringModel.getDifficultyCategory(route.difficulty);

        const summary =
          `Human route from ${fromControlCode} to ${toControlCode}:\n` +
          `${route.description}\n` +
          `Distance: ${route.distance.toFixed(1)}m\n` +
          `Difficulty: ${route.difficulty.toFixed(2)} (${diffCategory.label})\n` +
          `Same floor: ${humanResult.sameFloor}\n\n` +
          `Narration:\n${narration.map((line) => `  ${line}`).join("\n")}\n\n` +
          `Cognitive effort:\n` +
          `  Mental steps: ${effort.mentalSteps}\n` +
          `  Plan depth: ${effort.planDepth}\n` +
          `  Cognitive effort score: ${effort.cognitiveEffortScore.toFixed(2)}\n` +
          (effort.humanOptimalGap !== undefined ? `  Human/optimal gap: ${effort.humanOptimalGap.toFixed(2)}` : "");

        return {
          content: [{ type: "text", text: summary }],
        };
      }

      case "analyze_course_difficulty": {
        if (!currentEvent) {
          return {
            content: [
              {
                type: "text",
                text: "❌ No event loaded. Use load_event tool first.",
              },
            ],
          };
        }

        const courseName = (args as any).course_name;
        const scoringModelId = (args as any).scoring_model;

        const raceCourse = currentEvent.raceCourses?.[0];
        const courses = raceCourse?.courses || [];
        const controls = raceCourse?.controls || [];
        const nodes = raceCourse?.vertices || [];
        const edges = raceCourse?.edges || [];

        const course = courses.find((c) => c.name === courseName);
        if (!course) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Course not found: ${courseName}\nAvailable courses: ${courses.map((c) => c.name).join(", ")}`,
              },
            ],
          };
        }

        let scoringModel = getEventScoringModel(currentEvent);
        if (scoringModelId) {
          const model = ScoringModelRegistry.getModel(scoringModelId);
          if (model) {
            scoringModel = model;
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Scoring model not found: ${scoringModelId}\nAvailable models: ${ScoringModelRegistry.getAllModels()
                    .map((m) => m.getFullId())
                    .join(", ")}`,
                },
              ],
            };
          }
        }

        const analyzer = createEventRouteAnalyzer(currentEvent, { scoringModel });

        const { legs } = analyzeCourseLegs(course, currentEvent, analyzer, false);

        if (legs.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No legs found for course ${courseName}`,
              },
            ],
          };
        }

        const totalDifficulty = scoringModel.getCourseDifficulty(legs);
        const totalDistance = legs.reduce(
          (sum, leg) => sum + leg.shortestDistance,
          0
        );
        const totalClimb = legs.reduce(
          (sum, leg) => sum + (leg.totalClimb || 0),
          0
        );

        const legDescriptions = legs.map((leg) => {
          const diffCategory = scoringModel.getDifficultyCategory(leg.difficulty);
          return `  ${leg.label}: ${leg.shortestDistance.toFixed(1)}m, difficulty ${leg.difficulty.toFixed(2)} (${diffCategory.label})`;
        });

        const overallCategory = scoringModel.getDifficultyCategory(
          totalDifficulty
        );

        return {
          content: [
            {
              type: "text",
              text: `Course Analysis: ${course.name}\nScoring Model: ${scoringModel.getFullId()}\n\n` +
                `Overall Difficulty: ${totalDifficulty.toFixed(2)} (${overallCategory.label})\n` +
                `Total Distance: ${totalDistance.toFixed(1)}m\n` +
                `Total Climb: ${totalClimb.toFixed(1)}m\n` +
                `Number of Legs: ${legs.length}\n\n` +
                `Leg-by-leg breakdown:\n${legDescriptions.join("\n")}`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Use stderr for logging to avoid interfering with the MCP protocol on stdout
  console.error("Indoor O Route Analysis MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
