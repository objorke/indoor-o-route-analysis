"use client"

import React, { useMemo } from "react";
import { getDifficultyCategory, getCourseAverageDifficulty, getEventScoringModel } from "@indoor-o-route-analysis/core";
import type { ScoringModel } from "@indoor-o-route-analysis/core";
import { DifficultyTag } from "./difficulty-tag";
import type { Course, EventData } from "@indoor-o-route-analysis/core";
import type { Leg } from "@indoor-o-route-analysis/core";
import { DIFFICULTY_CATEGORIES } from "@indoor-o-route-analysis/core";
import { CHART_BACKGROUND_OPACITY } from "@indoor-o-route-analysis/core";

// Re-export for backward compatibility
export type { Leg };

export interface RouteInfo {
  path: string[];
  distance: number;
  totalClimb?: number;
  oneWayEdges?: number;
  ignoreLengthEdges?: number;
  decisionPoints?: number;
  alternativeEdges?: number;
  description?: string;
  difficulty?: number;
  repetitionRatio?: number;
}

interface CourseAnalysisReportProps {
  event: EventData;
  course: Course;
  legs: Leg[];
  getAlternativeRoutes: (leg: Leg) => RouteInfo[];
}

// Helper to format mm:ss time given seconds (rounded)
const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.max(0, Math.floor(seconds % 60));
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

// Helper to render colored difficulty tag (replicates DifficultyTag component style)
function renderColoredDifficultyTagHTML(difficulty: number, scoringModel?: ScoringModel): string {
  const safeDifficulty = Number.isFinite(difficulty) ? Math.round(difficulty) : 0;
  const cat = getDifficultyCategory(difficulty, scoringModel);
  // Default to white/gray if model is missing or colors undefined, but usually they are defined
  const bg = cat.color || "#e0e0e0";
  const fg = cat.textColor || "#000000";
  return `<span style="display:inline-block;background-color:${bg};color:${fg};padding:2px 6px;border-radius:4px;font-weight:bold;white-space:nowrap;font-size:0.85em;line-height:1.2;">D${safeDifficulty}</span>`;
}

// Build a full HTML document for exporting the report
export function buildCourseReportHTML(
  event: EventData,
  course: Course,
  legs: Leg[],
  getAlternativeRoutes: (leg: Leg) => RouteInfo[],
  scoringModel?: ScoringModel,
  runningSpeed?: number,
): string {
  const courseTotalDistance = legs.reduce((sum, leg) => sum + leg.shortestDistance, 0);
  const mostDifficultLegIdx =
    legs.length > 0
      ? legs.reduce((maxIdx, leg, idx) => (leg.difficulty > legs[maxIdx].difficulty ? idx : maxIdx), 0)
      : -1;
  const mostDifficultLeg = mostDifficultLegIdx >= 0 ? legs[mostDifficultLegIdx].label : "-";

  const eventDate = event.startTime.date ? new Date(event.startTime.date).toISOString().split("T")[0] : "Unknown";

  const overallCourseDifficulty = legs.reduce((max, l) => Math.max(max, l.difficulty), 0);
  const averageCourseDifficulty = getCourseAverageDifficulty(legs, scoringModel);
  const _overallCat = getDifficultyCategory(overallCourseDifficulty, scoringModel);
  const _averageCat = getDifficultyCategory(averageCourseDifficulty, scoringModel);

  // Best routes per leg for totals
  const bestRoutesForTotals = legs.map((leg) => {
    const alternatives = getAlternativeRoutes(leg);
    if (alternatives.length === 0) return null;
    return [...alternatives].sort((a, b) => a.distance - b.distance)[0] || null;
  });

  const totals = bestRoutesForTotals.reduce(
    (acc, r) => {
      if (!r) return acc;
      acc.distance += r.distance;
      acc.totalClimb += (r.totalClimb || 0);
      acc.timeSec += Math.round(r.distance / (runningSpeed || 3));
      acc.difficulty = Math.max(acc.difficulty, r.difficulty || 0);
      acc.oneWay += r.oneWayEdges || 0;
      acc.altEdges += r.alternativeEdges || 0;
      acc.stairs += r.ignoreLengthEdges || 0;
      return acc;
    },
    { distance: 0, totalClimb: 0, timeSec: 0, difficulty: 0, oneWay: 0, altEdges: 0, stairs: 0 },
  );

  let maxEasiestDifficulty = 0;
  legs.forEach(leg => {
     const alternatives = getAlternativeRoutes(leg);
     if (alternatives.length > 0) {
         const minDiff = alternatives.reduce((min, r) => Math.min(min, r.difficulty || 999), 999);
         if (minDiff < 999 && minDiff > maxEasiestDifficulty) {
             maxEasiestDifficulty = minDiff;
         }
     }
  });

  const totalsTimeStr = formatTime(totals.timeSec);
  const _totalsCat = getDifficultyCategory(totals.difficulty, scoringModel);

  // Difficulty chart SVG
  const maxLegDifficulty = legs.reduce((max, leg) => Math.max(max, leg.difficulty), 0);
  // Add 10% buffering so the highest bar doesn't touch the top
  const maxChartDifficulty = Math.max(maxLegDifficulty * 1.1, 1);
  const barWidth = Math.min(40, 900 / Math.max(legs.length, 1));
  const chartHeight = 300;
  const leftPadding = 60;
  const chartWidth = Math.max(legs.length, 1) * barWidth + leftPadding + 40;

  // Derive category boundaries with limits from the shared categories
  const categoryBoundaries = [
    { limit: 20, color: DIFFICULTY_CATEGORIES[0].color, opacity: CHART_BACKGROUND_OPACITY, label: DIFFICULTY_CATEGORIES[0].label },
    { limit: 40, color: DIFFICULTY_CATEGORIES[1].color, opacity: CHART_BACKGROUND_OPACITY, label: DIFFICULTY_CATEGORIES[1].label },
    { limit: 60, color: DIFFICULTY_CATEGORIES[2].color, opacity: CHART_BACKGROUND_OPACITY, label: DIFFICULTY_CATEGORIES[2].label },
    { limit: 80, color: DIFFICULTY_CATEGORIES[3].color, opacity: CHART_BACKGROUND_OPACITY, label: DIFFICULTY_CATEGORIES[3].label },
    { limit: 9999, color: DIFFICULTY_CATEGORIES[4].color, opacity: CHART_BACKGROUND_OPACITY, label: DIFFICULTY_CATEGORIES[4].label },
  ];

  let svgContent = `<svg width="${chartWidth}" height="${chartHeight + 70}" style="display: block; margin: 0 auto;">`;

  categoryBoundaries.forEach((cat, idx) => {
    const prevLimit = idx === 0 ? 0 : categoryBoundaries[idx - 1].limit;
    if (prevLimit >= maxChartDifficulty) return;

    const currentLimit = Math.min(cat.limit, maxChartDifficulty);
    const topPixel = chartHeight - (currentLimit / maxChartDifficulty) * chartHeight;
    const bottomPixel = chartHeight - (prevLimit / maxChartDifficulty) * chartHeight;
    const height = bottomPixel - topPixel;

    svgContent += `<rect x="${leftPadding}" y="${topPixel}" width="${
      Math.max(legs.length, 1) * barWidth + 20
    }" height="${height}" fill="${cat.color}" opacity="${cat.opacity}" />`;
  });

  categoryBoundaries.forEach((cat, idx) => {
    const prevLimit = idx === 0 ? 0 : categoryBoundaries[idx - 1].limit;
    if (prevLimit >= maxChartDifficulty) return;

    // Position text in the Middle of the visible part of the band
    const currentLimit = Math.min(cat.limit, maxChartDifficulty);
    const midValue = (prevLimit + currentLimit) / 2;
    const yPixel = chartHeight - (midValue / maxChartDifficulty) * chartHeight + 5;

    svgContent += `<text x="5" y="${yPixel}" font-size="11" fill="#333">${cat.label}</text>`;
  });

  categoryBoundaries.forEach((cat) => {
    if (cat.limit < maxChartDifficulty) {
      const yPixel = chartHeight - (cat.limit / maxChartDifficulty) * chartHeight;
      svgContent += `<line x1="${leftPadding}" y1="${yPixel}" x2="${
        leftPadding + Math.max(legs.length, 1) * barWidth + 20
      }" y2="${yPixel}" stroke="#666" stroke-width="1" stroke-dasharray="3,3" />`;
    }
  });

  legs.forEach((leg, idx) => {
    const barHeight = (leg.difficulty / maxChartDifficulty) * chartHeight;
    const x = idx * barWidth + leftPadding;
    const y = chartHeight - barHeight;
    const legLabel = leg.label.replace(/\s*→\s*/g, "-");
    svgContent += `<rect x="${x}" y="${y}" width="${
      barWidth - 4
    }" height="${barHeight}" fill="#388E3C" opacity="0.9" />`;
    svgContent += `<text x="${x + (barWidth - 4) / 2}" y="${
      y - 6
    }" text-anchor="middle" font-size="12" font-weight="bold" fill="#388E3C">${Math.round(leg.difficulty)}</text>`;
    svgContent += `<text x="${x + (barWidth - 4) / 2}" y="${
      chartHeight + 14
    }" text-anchor="middle" font-size="11" fill="#000">${legLabel}</text>`;
  });
  svgContent += `
    <line x1="${leftPadding}" y1="0" x2="${leftPadding}" y2="${chartHeight}" stroke="#333" stroke-width="2" />
    <line x1="${leftPadding}" y1="${chartHeight}" x2="${
      leftPadding + Math.max(legs.length, 1) * barWidth + 20
    }" y2="${chartHeight}" stroke="#333" stroke-width="2" />
  </svg>`;

  // Histogram: count legs per difficulty category
  const categoryCounts: Record<string, number> = {
    White: 0,
    Yellow: 0,
    Orange: 0,
    Purple: 0,
    Black: 0,
  };

  legs.forEach((leg) => {
    const category = getDifficultyCategory(leg.difficulty, scoringModel);
    categoryCounts[category.label] = (categoryCounts[category.label] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(categoryCounts), 1);
  const histogramBarHeight = 30;
  const histogramHeight = DIFFICULTY_CATEGORIES.length * (histogramBarHeight + 8) + 40;
  const maxHistogramBarWidth = 300;

  let histogramContent = `<svg width="500" height="${histogramHeight}" style="display: block; margin: 20px auto;">`;
  histogramContent += `<text x="250" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">Legs per Difficulty Category</text>`;

  DIFFICULTY_CATEGORIES.forEach((cat, idx) => {
    const count = categoryCounts[cat.label] || 0;
    const barWidthValue = (count / maxCount) * maxHistogramBarWidth;
    const y = idx * (histogramBarHeight + 8) + 35;

    // Category label
    histogramContent += `<text x="10" y="${y + histogramBarHeight / 2 + 5}" font-size="12" font-weight="bold" fill="#333">${cat.label}</text>`;
    
    // Bar
    histogramContent += `<rect x="100" y="${y}" width="${barWidthValue}" height="${histogramBarHeight}" fill="${cat.color}" stroke="${cat.label === "White" ? "#ccc" : "none"}" stroke-width="${cat.label === "White" ? 1 : 0}" rx="2" />`;
    
    // Count label
    if (count > 0) {
      histogramContent += `<text x="${105 + barWidthValue}" y="${y + histogramBarHeight / 2 + 5}" font-size="12" font-weight="bold" fill="#333"> ${count}</text>`;
    }
  });

  histogramContent += `</svg>`;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${event.name || "Event"} - ${course.name || "Course"}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: white; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { color: #000; border-bottom: 2px solid #000; padding-bottom: 10px; margin: 0 0 5px 0; font-size: 24px; }
    .header-info { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #ccc; font-size: 13px; }
    .header-info div { margin: 3px 0; }
    .header-info strong { display: inline-block; width: 140px; }
    .course-stats { margin-bottom: 20px; display: flex; gap: 30px; font-size: 13px; padding-bottom: 15px; border-bottom: 1px solid #ccc; }
    .course-stats div { display: flex; gap: 10px; align-items: center; }
    .routes-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .routes-table th { padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; color: black; }
    .routes-table td { padding: 8px 10px; border-bottom: 1px solid #ccc; }
    .routes-table tr:hover { background-color: #f5f5f5; }
    .routes-table .leg-separator { border-top: 2px solid #333; }
    .routes-table .leg-group { background-color: #e8e8e8; font-weight: bold; border-top: 2px solid #333; border-bottom: 2px solid #333; }
    .difficulty-chart { margin: 30px 0; padding: 20px; background-color: white; }
    .difficulty-explanation { margin: 20px 0; padding: 15px; background-color: #f0f0f0; border-left: 3px solid #333; border-radius: 0; font-size: 13px; line-height: 1.6; }
    .timestamp { text-align: right; color: #999; font-size: 12px; margin-top: 30px; padding-top: 15px; }
  </style>
</head>
<body>
  <h1>${event.name || "Untitled Event"}: ${course.name || "Untitled Course"}</h1>
  <div class="header-info">
    
    <div><strong>Date:</strong> ${eventDate}</div>
    ${scoringModel ? `<div><strong>Scoring model:</strong> ${scoringModel.name} v${scoringModel.version}</div>` : ""}
  </div>
  <div class="course-stats">
    <div><strong>Length:</strong> ${courseTotalDistance.toFixed(0)} m</div>
    <div><strong>Climb:</strong> ${totals.totalClimb.toFixed(0)} m</div>
    <div>
      <strong>Max difficulty:</strong>
      ${renderColoredDifficultyTagHTML(overallCourseDifficulty, scoringModel)}
    </div>
    <div>
      <strong>Max difficulty (easiest routes):</strong>
      ${renderColoredDifficultyTagHTML(maxEasiestDifficulty, scoringModel)}
    </div>
    <div><strong>Most difficult leg:</strong> ${mostDifficultLeg}</div>
  </div>
  <table class="routes-table">
    <thead>
      <tr>
        <th>Leg</th><th>Route</th><th>Length (m)</th><th>Climb (m)</th><th>Time</th><th>Difficulty</th><th>One-way</th><th>Alternative edges</th><th>Stairs</th><th>Repetition</th>
      </tr>
    </thead>
    <tbody>`;

  let lastLegLabel = "";
  legs.forEach((leg, legIdx) => {
    const alternatives = getAlternativeRoutes(leg);
    const sorted = [...alternatives].sort((a, b) => a.distance - b.distance);
    
    // Stats for comparisons
    const shortestDist = sorted[0]?.distance || 0;
    const shortestTime = Math.round(shortestDist / (runningSpeed || 3));
    const minDifficulty = alternatives.reduce((min, r) => Math.min(min, r.difficulty || 999), 999);

    sorted.forEach((route, idx) => {
      const dist = route.distance;
      const timeSec = Math.round(dist / (runningSpeed || 3));
      const timeStr = formatTime(timeSec);
      
      // Differences
      const diffDist = dist - shortestDist;
      const diffDistStr = diffDist > 0.5 
        ? ` <span style="font-size:0.85em;color:#666;white-space:nowrap;">(+${diffDist.toFixed(0)})</span>` 
        : "";

      const diffTime = timeSec - shortestTime;
      const diffTimeStr = diffTime > 0 
        ? ` <span style="font-size:0.85em;color:#666;white-space:nowrap;">(+${formatTime(diffTime)})</span>` 
        : "";

      // Easiest route detection
      const currentDiff = route.difficulty || 0;
      const isEasiest = alternatives.length > 0 && Math.abs(currentDiff - minDifficulty) < 0.1;
      const easyIcon = (isEasiest && idx !== 0) ? ' <span title="Easiest route" style="font-size:0.9em;opacity:0.8;cursor:help;">easiest route</span>' : '';

      const legSeparator = legIdx > 0 && lastLegLabel !== leg.label ? ' class="leg-separator"' : "";
      lastLegLabel = leg.label;
      const routeLabel = route.description && route.description.trim() ? route.description.replace(/[\s,]+/g, "") : "-";
      const repetition = route.repetitionRatio ? `${Math.round(route.repetitionRatio * 100)}%` : "0%";
      html += `
        <tr${idx === 0 ? legSeparator : ""}>
          <td>${idx === 0 ? leg.label : ""}</td>
          <td>${routeLabel}</td>
          <td title="Route length">${dist.toFixed(0)}${diffDistStr}</td>
          <td title="Total climb">${(route.totalClimb || 0).toFixed(0)}</td>
          <td>${timeStr}${diffTimeStr}</td>
          <td>${renderColoredDifficultyTagHTML(currentDiff, scoringModel)}${easyIcon}</td>
          <td>${route.oneWayEdges || 0}</td>
          <td>${route.alternativeEdges || 0}</td>
          <td>${route.ignoreLengthEdges || 0}</td>
          <td>${repetition}</td>
        </tr>`;
    });
  });

  html += `
        <tr class="leg-group">
          <td colspan="2"><strong>Totals (shortest route per leg)</strong></td>
          <td><strong>${totals.distance.toFixed(0)}</strong></td>
          <td><strong>${totals.totalClimb.toFixed(0)}</strong></td>
          <td><strong>${totalsTimeStr}</strong></td>
          <td><strong>${renderColoredDifficultyTagHTML(totals.difficulty, scoringModel)} ${renderColoredDifficultyTagHTML(maxEasiestDifficulty, scoringModel)}</strong></td>
          <td><strong>${totals.oneWay}</strong></td>
          <td><strong>${totals.altEdges}</strong></td>
          <td><strong>${totals.stairs}</strong></td>
          <td>-</td>
        </tr>
      </tbody>
    </table>
    <div class="difficulty-chart">${svgContent}</div>
    <div class="difficulty-chart">${histogramContent}</div>
    <div class="difficulty-explanation">
      <strong>Route Definition:</strong><br>
      Routes are defined by the stairs they are using. Each letter in a route name represents a stair label:
      <ul style="margin: 10px 0; padding-left: 20px;">
        <li><strong>Uppercase letters (A, B, C, ...)</strong> indicate going upstairs</li>
        <li><strong>Lowercase letters (a, b, c, ...)</strong> indicate going downstairs</li>
      </ul>
    </div>
    <div class="difficulty-explanation">
      <strong>Difficulty Calculation:</strong> <em style="color: #666; font-size: 0.9em;">${
        scoringModel ? `${scoringModel.name} v${scoringModel.version}` : "Proof of Concept"
      }</em><br>
      ${
        scoringModel && scoringModel.description
          ? scoringModel.description
          : `The difficulty score for each route is calculated as the sum of:
      <ul style="margin: 10px 0; padding-left: 20px;">
        <li><strong>One-way-passages:</strong> Number of edges that can only be traversed in one direction</li>
        <li><strong>Alternative edges:</strong> Number of edges at junctions that are not part of the route</li>
        <li><strong>Stairs:</strong> Number of stair connections or floor changes</li>
      </ul>
      Higher difficulty scores indicate more complex route-finding challenges.`
      }
      ${
        scoringModel?.scalingFactor != null && scoringModel?.referenceCourse != null
          ? `<br><br><strong>Scaling Factor:</strong> ${scoringModel.scalingFactor.toFixed(4)}<br>
      The difficulty scores are scaled to achieve a difficulty score of 100 for "${scoringModel.referenceCourse}".`
          : ""
      }
    </div>
    <div class="difficulty-explanation">
      <strong>Running Time Calculation:</strong><br>
      The estimated running time for each route is calculated based on the route distance divided by an average running speed of ${runningSpeed || 3} m/s (approximately ${(() => {
        const pace = 1000 / (runningSpeed || 3) / 60;
        const min = Math.floor(pace);
        const sec = Math.round((pace - min) * 60);
        return `${min}:${sec.toString().padStart(2, "0")}`;
      })()} min/km pace).
      This is a simplified estimate and actual times will vary based on individual running speed, route complexity, and environmental factors.
    </div>
    <div class="difficulty-explanation">
      <strong>Repetition Ratio Calculation:</strong><br>
      The Repetition Ratio indicates how much of the route reuses edges that were already visited in the shortest routes of previous legs.
      It is calculated as the total length of recurring edges divided by the total route length.
      A higher ratio implies simpler navigation due to familiarity with the surroundings.
    </div>
    <div class="difficulty-explanation">
      <strong>Alternative Edges:</strong><br>
      This represents the number of alternative paths available at junctions along the route but not taken. 
      It counts all edges connected to the vertices of the route that are not part of the route itself. 
      Higher values indicate more decision points and potential for wrong turns.
    </div>
    <div class="timestamp">Generated on ${new Date().toISOString().replace("T", " ").substring(0, 19)}</div>
  </body>
</html>`;

  return html;
}

// Optional React component to render the report inside the app (not used by export)
export default function CourseAnalysisReport({ event, course, legs, getAlternativeRoutes: _getAlternativeRoutes }: CourseAnalysisReportProps) {
  const overallCourseDifficulty = legs.reduce((max, l) => Math.max(max, l.difficulty), 0);
  const scoringModel = getEventScoringModel(event);

  const courseTotalDistance = useMemo(() => legs.reduce((sum, leg) => sum + leg.shortestDistance, 0), [legs]);
  const mostDifficultLegIdx = useMemo(
    () =>
      legs.length > 0
        ? legs.reduce((maxIdx, leg, idx) => (leg.difficulty > legs[maxIdx].difficulty ? idx : maxIdx), 0)
        : -1,
    [legs]
  );
  const mostDifficultLeg = mostDifficultLegIdx >= 0 ? legs[mostDifficultLegIdx].label : "-";

  return (
    <div>
      <h2>
        {event.name || "Untitled Event"}: {course.name || "Untitled Course"}
      </h2>
      <div style={{ fontSize: 13 }}>
        <div>
          <strong>Length:</strong> {courseTotalDistance.toFixed(0)} m
        </div>
        <div>
          <strong>Difficulty:</strong> <DifficultyTag difficulty={overallCourseDifficulty} className="ml-2" size="sm" scoringModel={scoringModel} />
        </div>
        <div>
          <strong>Most Difficult Leg:</strong> {mostDifficultLeg}
        </div>
      </div>
      {/* Minimal rendering preview; detailed HTML is produced by buildCourseReportHTML */}
    </div>
  );
}
