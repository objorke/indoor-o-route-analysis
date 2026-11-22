// Common rendering constants and measurements used across the application

// Conversion constants
export const MM_TO_METERS = 0.001;
export const MM_PER_POINT = 0.352777777778;

// Course Rendering
export const CONTROL_RADIUS = 17;
export const CONTROL_POINT_RADIUS = 0.756; // 0.4mm diameter dot at center of control circle
export const CONTROL_STROKE_WIDTH = 2;
export const CONTROL_STROKE_WIDTH_SELECTED = 3;
export const CONTROL_TEXT_SIZE = 24;
export const START_TRIANGLE_RADIUS = CONTROL_RADIUS;
/**
 * Circumradius of the triangle drawn at a map exchange (change/flip) control.
 * The triangle is inscribed in the control circle: its corners touch the
 * circle, so the circumradius equals the control radius.
 */
export const MAP_EXCHANGE_TRIANGLE_RADIUS = CONTROL_RADIUS;
export const FINISH_INNER_CIRCLE_RADIUS = CONTROL_RADIUS * 0.7;
export const COURSE_COLOR = "#8b5cf6"; // Default purple for course
export const SELECTED_COURSE_COLOR = "#c084fc";
export const LEG_STROKE_WIDTH = 2; // Default stroke width for method signatures

// Colors
export const AVAILABLE_COLOR = "#FF8C00";
export const SELECTION_HIGHLIGHT_COLOR = "#00BFFF"; // Bright blue

// Chart Rendering
export const CHART_BACKGROUND_OPACITY = 0.6;
export const ERROR_COLOR = "#FF6B6B";

// Graph
export const GRAPH_NODE_RADIUS = 3.78;
export const GRAPH_EDGE_COLOR = SELECTION_HIGHLIGHT_COLOR;
export const GRAPH_EDGE_THICKNESS = 1.89;
export const LEVEL_CHANGE_COLOR = "#000080";
export const LEVEL_CHANGE_THICKNESS = GRAPH_EDGE_THICKNESS * 2;
export const GRAPH_DISCONNECTED_COLOR = ERROR_COLOR;
export const GRAPH_DEAD_END_COLOR = "#FFA500"; // Orange for dead-end edges

// Polygons
export const POLYGON_NODE_RADIUS = GRAPH_NODE_RADIUS;
export const POLYGON_STROKE_WIDTH = 2;
export const POLYGON_STROKE_COLOR_DEFAULT = "#ffa500"; // Orange
export const POLYGON_STROKE_COLOR_SELECTED = "#007bff";
export const POLYGON_FILL_COLOR_DEFAULT = "rgba(255, 165, 0, 0.2)";
export const POLYGON_FILL_COLOR_SELECTED = "rgba(0, 123, 255, 0.3)";
export const POLYGON_ORIGIN_RADIUS = 6;
export const POLYGON_ORIGIN_STROKE_WIDTH = 4;

// Effects
export const SHADOW_TEXT_STROKE_WIDTH = 3;
export const SHADOW_COLOR = "white";
export const CONTRAST_FILTER = "drop-shadow(0 0 1px rgba(0,0,0,0.8))";

// Route Analysis
export const ROUTE_ANALYSIS_COLORS = [
  "#FF0054",
  "#00F5D4",
  "#8338EC",
  "#3A86FF",
  "#FFBE0B",
  "#06D6A0"
];
/** The first ROUTE_ANALYSIS_COLORS entry, reused wherever a single "this is the route being played/shown" accent is needed outside route-analysis's own ranked palette (e.g. Route Builder's playback marker and 3D route view). */
export const PRIMARY_ROUTE_COLOR = ROUTE_ANALYSIS_COLORS[0];
/** Stroke width (px) of the primary (best/shown) route; alternatives are drawn slightly thinner. Shared by Route Analysis, Labs and Modify Graph. */
export const PRIMARY_ROUTE_STROKE_WIDTH = 10;
export const ALTERNATIVE_ROUTE_STROKE_WIDTH = 8;

// Labs
export const LABS_ROUTE_COLOR = "#22c55e"; // Green accent in labs overlays (accepted meetings, route-viz "easiest route"); routes themselves use PRIMARY_ROUTE_COLOR

// Labs — Human Thinking overlay (see planning/08-human-route-viz-web.md)
export const HUMAN_OVERLAY_TRACKING_COLOR = "#3b82f6"; // Blue: visited by the forward/tracking side
export const HUMAN_OVERLAY_BACKTRACKING_COLOR = "#f59e0b"; // Amber: visited by the backward/backtracking side
export const HUMAN_OVERLAY_BOTH_COLOR = COURSE_COLOR; // Purple: visited by both sides (pre-meeting overlap)
export const HUMAN_OVERLAY_CURRENT_COLOR = SELECTED_COURSE_COLOR; // Brighter purple (selection color): the cluster being expanded right now
export const HUMAN_OVERLAY_MEETING_COLOR = LABS_ROUTE_COLOR; // Green: an accepted meeting
export const HUMAN_OVERLAY_REJECTED_COLOR = ERROR_COLOR; // Red: a rejected meeting attempt
export const HUMAN_OVERLAY_DISCARDED_OPACITY = 0.35; // Dimming for candidate stairs not chosen this step

// Route Builder
export const ROUTE_BUILDER_LINE_COLOR = "#00ff00"; // Green used in polygon creation/previews as well
export const ROUTE_PATH_COLOR = "#ff0000";
export const ROUTE_WAYPOINT_COLOR = "#ff0000";
export const ROUTE_WAYPOINT_RADIUS = 17;

// Algorithm-visualization (VIZ_*) constants moved to viz-constants.ts, behind
// the ./render subpath — they're only consumed by apps/route-viz-cli.
