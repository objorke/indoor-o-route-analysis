import React, { ReactNode } from "react";
import type { Control } from "@indoor-o-route-analysis/core";
import {
  CONTROL_RADIUS,
  CONTROL_POINT_RADIUS,
  START_TRIANGLE_RADIUS,
  CONTROL_STROKE_WIDTH,
  CONTROL_STROKE_WIDTH_SELECTED,
  COURSE_COLOR,
  SELECTED_COURSE_COLOR,
  AVAILABLE_COLOR,
  LEG_STROKE_WIDTH,
  CONTRAST_FILTER,
  SHADOW_COLOR,
  SHADOW_TEXT_STROKE_WIDTH,
  CONTROL_TEXT_SIZE,
  FINISH_INNER_CIRCLE_RADIUS,
  MAP_EXCHANGE_TRIANGLE_RADIUS,
} from "@indoor-o-route-analysis/core";
import type { MapExchangeType } from "@indoor-o-route-analysis/core";

/**
 * SVG polygon points for an equilateral triangle centred at (cx, cy) with the
 * given circumradius, with its first vertex pointing in direction `angle`
 * (radians, 0 = right, -π/2 = up).
 */
export function trianglePoints(cx: number, cy: number, circumradius: number, angle: number): string {
  return [0, 1, 2]
    .map((i) => {
      const a = angle + (i * 2 * Math.PI) / 3;
      return `${cx + circumradius * Math.cos(a)},${cy + circumradius * Math.sin(a)}`;
    })
    .join(" ");
}

/** Direction from `from` to `to`, or pointing up when `to` is missing/coincident. */
function directionAngle(from: { x: number; y: number }, to?: { x: number; y: number }): number {
  if (!to) return -Math.PI / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return -Math.PI / 2;
  return Math.atan2(dy, dx);
}

function isLightColor(color: string): boolean {
  if (!color) return false;
  const c = color.toUpperCase();
  
  // Basic named colors
  if (["WHITE", "YELLOW", "IVORY", "BEIGE", "LIGHTYELLOW"].includes(c)) return true;
  
  // Hex matching
  if (c.startsWith("#")) {
    let hex = c.replace("#", "");
    // Handle short hex #FFF
    if (hex.length === 3) {
      hex = hex.split("").map(char => char + char).join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      // YIQ brightness check
      const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      return yiq >= 128;
    }
  }
  return false;
}

interface ControlRenderProps {
  control: Control & { x: number; y: number };
  courseControls: (Control & { x: number; y: number })[];
  courseControlCodes: string[];
  isSelected?: boolean;
  strokeColor?: string;
  maybeGlow?: string;
  showLabel?: boolean;
  label?: string; // Optional label override
  controlLabelMap?: Map<string, string>; // Map of control ID → display label (handles repeated controls)
  showControlPoint?: boolean; // Show a small dot at the center of the control circle
  /**
   * Map exchange (change or flip) at this control. The control is drawn as both
   * a circle and a start triangle; the triangle points towards `next` (the next
   * control in the course, in the same pixel space) when given.
   */
  mapExchange?: { type: MapExchangeType; next?: { x: number; y: number } };
}

interface LegRenderProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
  width?: number;
  filter?: string;
  /** Stable identifier for the React key, e.g. a loop index. Falls back to rounded coordinates when omitted - only safe when a single leg is rendered per call, since two different legs can round to the same pixel position (e.g. a course revisiting the same corridor). */
  key?: string | number;
}

export class ControlRenderer {
  static readonly CONTROL_RADIUS = CONTROL_RADIUS;

  static getLegCoordinates(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };

    const angle = Math.atan2(dy, dx);
    return {
      x1: from.x + CONTROL_RADIUS * Math.cos(angle),
      y1: from.y + CONTROL_RADIUS * Math.sin(angle),
      x2: to.x - CONTROL_RADIUS * Math.cos(angle),
      y2: to.y - CONTROL_RADIUS * Math.sin(angle),
    };
  }

  static renderLeg({ from, to, color = COURSE_COLOR, width = LEG_STROKE_WIDTH, filter, key: keyHint }: LegRenderProps): ReactNode {
    const coords = this.getLegCoordinates(from, to);
    const key = keyHint !== undefined
      ? `leg-${keyHint}`
      : `leg-${Math.round(from.x)}-${Math.round(from.y)}-${Math.round(to.x)}-${Math.round(to.y)}`;

    return (
      <line
        key={key}
        x1={coords.x1}
        y1={coords.y1}
        x2={coords.x2}
        y2={coords.y2}
        stroke={color}
        strokeWidth={width}
        filter={filter}
        pointerEvents="none"
        strokeLinecap="round"
      />
    );
  }

  /**
   * Generates SVG JSX element for a control based on its type
   * Handles start (triangle), finish (double circle), and regular (circle) controls
   * Shows control number for in-course controls and control code for out-of-course controls
   */
  static renderControl({
    control,
    courseControls,
    courseControlCodes,
    isSelected = false,
    strokeColor,
    maybeGlow,
    showLabel: _showLabel = true,
    label,
    controlLabelMap,
    showControlPoint = false,
    mapExchange,
  }: ControlRenderProps): ReactNode {
    const isInCourse = courseControlCodes.includes(control.id);
    const r = control.type === "start" ? START_TRIANGLE_RADIUS : CONTROL_RADIUS;
    const strokeWidth = isSelected ? CONTROL_STROKE_WIDTH_SELECTED : CONTROL_STROKE_WIDTH;

    const finalStrokeColor = isSelected
      ? SELECTED_COURSE_COLOR
      : strokeColor || isInCourse
      ? strokeColor ?? COURSE_COLOR
      : AVAILABLE_COLOR;

    const needsContrast = isLightColor(finalStrokeColor);
    const contrastFilter = needsContrast ? CONTRAST_FILTER : undefined;
    const finalFilter = maybeGlow || contrastFilter;

    // Get control label (S, F, or number)
    let controlLabel = label ?? "";
    let courseIndex = -1;
    if (isInCourse) {
      courseIndex = courseControls.findIndex((c) => c.id === control.id);
      if (courseIndex >= 0 && label === undefined) {
        // Use pre-computed label map if available (handles repeated controls correctly)
        if (controlLabelMap) {
          controlLabel = controlLabelMap.get(control.id) ?? "";
        } else {
          // Fallback: count position of first occurrence (may be wrong for repeated controls)
          const numberAmongControls = courseControls.slice(0, courseIndex).filter((c) => c.type === "control").length + 1;
          controlLabel = control.type === "control" ? String(numberAmongControls) : "";
        }
        if (control.type === "start" || control.type === "finish") {
          controlLabel = "";
        }
      }
    }

    if (control.type === "start") {
      return this.renderStartControl({
        control,
        r,
        strokeColor: finalStrokeColor,
        strokeWidth,
        maybeGlow: finalFilter,
        courseControls,
        courseIndex,
        controlLabel,
        showCodeLabel: !isInCourse,
        needsContrast,
        showControlPoint,
      });
    }

    if (control.type === "finish") {
      return this.renderFinishControl({
        control,
        r,
        strokeColor: finalStrokeColor,
        strokeWidth,
        maybeGlow: finalFilter,
        controlLabel,
        showCodeLabel: !isInCourse,
        needsContrast,
        showControlPoint,
      });
    }

    // Regular control (optionally with a map exchange triangle)
    return this.renderRegularControl({
      control,
      r,
      strokeColor: finalStrokeColor,
      strokeWidth,
      maybeGlow: finalFilter,
      controlLabel,
      showCodeLabel: !isInCourse,
      needsContrast,
      showControlPoint,
      mapExchangeTriangle: mapExchange
        ? trianglePoints(control.x, control.y, MAP_EXCHANGE_TRIANGLE_RADIUS, directionAngle(control, mapExchange.next))
        : undefined,
    });
  }

  /**
   * Renders a transformation registration mark: a circle with crosshair arms and a label.
   * Uses the same sizing constants as control circles for visual consistency.
   */
  static renderRegistrationMark({
    x,
    y,
    label,
    isSelected = false,
    color,
    selectedColor,
  }: {
    x: number;
    y: number;
    label: string;
    isSelected?: boolean;
    color?: string;
    selectedColor?: string;
  }): ReactNode {
    const baseColor = color ?? AVAILABLE_COLOR;
    const hlColor = selectedColor ?? baseColor;
    const c = isSelected ? hlColor : baseColor;
    const r = CONTROL_RADIUS;
    const strokeWidth = isSelected ? CONTROL_STROKE_WIDTH_SELECTED : CONTROL_STROKE_WIDTH;
    const armLen = r + 12;
    const textStyle = {
      paintOrder: "stroke fill" as const,
      stroke: SHADOW_COLOR,
      strokeWidth: SHADOW_TEXT_STROKE_WIDTH,
      strokeLinejoin: "round" as const,
    };
    return (
      <g key={`reg-mark-${label}-${x}-${y}`} style={{ pointerEvents: "all", cursor: "grab" }}>
        {/* White halo for contrast */}
        <circle cx={x} cy={y} r={r + 2} fill="none" stroke="white" strokeWidth={4} strokeOpacity={0.6} />
        {/* Circle */}
        <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={strokeWidth} opacity={0.95} />
        {/* Center dot */}
        <circle cx={x} cy={y} r={CONTROL_POINT_RADIUS} fill={c} opacity={0.95} pointerEvents="none" />
        {/* Crosshair arms */}
        <line x1={x - armLen} y1={y} x2={x - r - 2} y2={y} stroke={c} strokeWidth={strokeWidth} />
        <line x1={x + r + 2} y1={y} x2={x + armLen} y2={y} stroke={c} strokeWidth={strokeWidth} />
        <line x1={x} y1={y - armLen} x2={x} y2={y - r - 2} stroke={c} strokeWidth={strokeWidth} />
        <line x1={x} y1={y + r + 2} x2={x} y2={y + armLen} stroke={c} strokeWidth={strokeWidth} />
        {/* Label */}
        <text
          x={x + armLen + 4}
          y={y + 4}
          fontSize={CONTROL_TEXT_SIZE}
          fontWeight="bold"
          fill={c}
          pointerEvents="none"
          style={textStyle}
        >
          {label}
        </text>
      </g>
    );
  }

  private static renderStartControl({
    control,
    r,
    strokeColor,
    strokeWidth,
    maybeGlow,
    courseControls,
    courseIndex,
    controlLabel,
    showCodeLabel,
    needsContrast,
    showControlPoint,
  }: {
    control: Control & { x: number; y: number };
    r: number;
    strokeColor: string;
    strokeWidth: number;
    maybeGlow?: string;
    courseControls: (Control & { x: number; y: number })[];
    courseIndex: number;
    controlLabel: string;
    showCodeLabel: boolean;
    needsContrast: boolean;
    showControlPoint?: boolean;
  }): ReactNode {
    // Equilateral triangle centered at control position, pointing towards next control
    const next = courseIndex >= 0 && courseIndex < courseControls.length - 1 ? courseControls[courseIndex + 1] : undefined;
    const points = trianglePoints(control.x, control.y, r, directionAngle(control, next));
    const textFilter = needsContrast ? maybeGlow : undefined;
    const textStyle = needsContrast
      ? undefined
      : {
          textShadow: `0 0 3px ${SHADOW_COLOR}, 0 0 3px ${SHADOW_COLOR}`,
          paintOrder: "stroke fill",
          stroke: SHADOW_COLOR,
          strokeWidth: SHADOW_TEXT_STROKE_WIDTH,
          strokeLinejoin: "round" as const,
        };

    return (
      <g key={control.id}>
        <polygon
          points={points}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={0.95}
          filter={maybeGlow}
        />
        {showControlPoint && (
          <circle
            cx={control.x}
            cy={control.y}
            r={CONTROL_POINT_RADIUS}
            fill={strokeColor}
            opacity={0.95}
            pointerEvents="none"
          />
        )}
        {controlLabel && (
          <text
            x={control.x + 18}
            y={control.y - 12}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={CONTROL_TEXT_SIZE}
            fontWeight="bold"
            fill={strokeColor}
            pointerEvents="none"
            filter={textFilter}
            style={textStyle}
          >
            {controlLabel}
          </text>
        )}
        {showCodeLabel && (
          <text
            x={control.x + 18}
            y={control.y - 12}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={CONTROL_TEXT_SIZE}
            fontWeight="bold"
            fill={strokeColor}
            pointerEvents="none"
            filter={textFilter}
            style={textStyle}
          >
            {control.id}
          </text>
        )}
      </g>
    );
  }

  private static renderFinishControl({
    control,
    r,
    strokeColor,
    strokeWidth,
    maybeGlow,
    controlLabel,
    showCodeLabel,
    needsContrast,
    showControlPoint,
  }: {
    control: Control & { x: number; y: number };
    r: number;
    strokeColor: string;
    strokeWidth: number;
    maybeGlow?: string;
    controlLabel: string;
    showCodeLabel: boolean;
    needsContrast: boolean;
    showControlPoint?: boolean;
  }): ReactNode {
    const textFilter = needsContrast ? maybeGlow : undefined;
    const textStyle = needsContrast
      ? undefined
      : {
          textShadow: `0 0 3px ${SHADOW_COLOR}, 0 0 3px ${SHADOW_COLOR}`,
          paintOrder: "stroke fill",
          stroke: SHADOW_COLOR,
          strokeWidth: SHADOW_TEXT_STROKE_WIDTH,
          strokeLinejoin: "round" as const,
        };
    return (
      <g key={control.id}>
        <circle
          cx={control.x}
          cy={control.y}
          r={r}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={0.95}
          filter={maybeGlow}
        />
        <circle
          cx={control.x}
          cy={control.y}
          r={FINISH_INNER_CIRCLE_RADIUS}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={0.95}
          filter={maybeGlow}
        />
        {showControlPoint && (
          <circle
            cx={control.x}
            cy={control.y}
            r={CONTROL_POINT_RADIUS}
            fill={strokeColor}
            opacity={0.95}
            pointerEvents="none"
          />
        )}
        {controlLabel && (
          <text
            x={control.x + 18}
            y={control.y - 12}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={CONTROL_TEXT_SIZE}
            fontWeight="bold"
            fill={strokeColor}
            pointerEvents="none"
            filter={textFilter}
            style={textStyle}
          >
            {controlLabel}
          </text>
        )}
        {showCodeLabel && (
          <text
            x={control.x + 18}
            y={control.y - 12}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={CONTROL_TEXT_SIZE}
            fontWeight="bold"
            fill={strokeColor}
            pointerEvents="none"
            filter={textFilter}
            style={textStyle}
          >
            {control.id}
          </text>
        )}
      </g>
    );
  }

  private static renderRegularControl({
    control,
    r,
    strokeColor,
    strokeWidth,
    maybeGlow,
    controlLabel,
    showCodeLabel,
    needsContrast,
    showControlPoint,
    mapExchangeTriangle,
  }: {
    control: Control & { x: number; y: number };
    r: number;
    strokeColor: string;
    strokeWidth: number;
    maybeGlow?: string;
    controlLabel: string;
    showCodeLabel: boolean;
    needsContrast: boolean;
    showControlPoint?: boolean;
    /** Polygon points of the map exchange triangle, drawn on top of the circle. */
    mapExchangeTriangle?: string;
  }): ReactNode {
    const textFilter = needsContrast ? maybeGlow : undefined;
    const textStyle = needsContrast
      ? undefined
      : {
          textShadow: `0 0 3px ${SHADOW_COLOR}, 0 0 3px ${SHADOW_COLOR}`,
          paintOrder: "stroke fill",
          stroke: SHADOW_COLOR,
          strokeWidth: SHADOW_TEXT_STROKE_WIDTH,
          strokeLinejoin: "round" as const,
        };
    return (
      <g key={control.id}>
        <circle
          cx={control.x}
          cy={control.y}
          r={r}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={0.95}
          filter={maybeGlow}
        />
        {mapExchangeTriangle && (
          <polygon
            data-testid="map-exchange-triangle"
            points={mapExchangeTriangle}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            opacity={0.95}
            filter={maybeGlow}
            pointerEvents="none"
          />
        )}
        {showControlPoint && (
          <circle
            cx={control.x}
            cy={control.y}
            r={CONTROL_POINT_RADIUS}
            fill={strokeColor}
            opacity={0.95}
            pointerEvents="none"
          />
        )}
        {controlLabel && (
          <text
            x={control.x + 18}
            y={control.y - 12}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={CONTROL_TEXT_SIZE}
            fontWeight="bold"
            fill={strokeColor}
            pointerEvents="none"
            filter={textFilter}
            style={textStyle}
          >
            {controlLabel}
          </text>
        )}
        {showCodeLabel && (
          <text
            x={control.x + 18}
            y={control.y - 12}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={CONTROL_TEXT_SIZE}
            fontWeight="bold"
            fill={strokeColor}
            pointerEvents="none"
            filter={textFilter}
            style={textStyle}
          >
            {control.id}
          </text>
        )}
      </g>
    );
  }
}
