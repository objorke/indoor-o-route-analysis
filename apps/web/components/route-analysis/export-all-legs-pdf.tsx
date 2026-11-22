import { jsPDF } from "jspdf";
import {
  ROUTE_ANALYSIS_COLORS,
  createEventRouteAnalyzer,
  eventPosToMultiPagePixels,
  getActiveMap,
  getActualCourseControls,
  getCourseControlLabelMap,
  type Control,
  type EventData,
} from "@indoor-o-route-analysis/core";
import {
  ControlRenderer,
  buildRoutePathSegments,
  renderLegConnections,
  renderDirections,
  renderRoutePolylines,
} from "@indoor-o-route-analysis/ui";

type ControlWithPos = Control & { x: number; y: number; mapText: string };

export interface ExportAllLegsOptions {
  /** The map viewer's rendered map canvas (background of every page). */
  canvas: HTMLCanvasElement;
  /** Canvas pixels per mm and SVG overlay size, from the viewer state. */
  pixelsPerMM: number;
  width: number;
  height: number;
  event: EventData;
  courseId: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const COURSE_PURPLE = "#8b5cf6";

/**
 * One PDF page per leg of a course: the map, the course directions, all legs
 * (the current one thicker), the course controls, and the best route for the
 * leg. Uses the same shared renderers as the live view (rendered to static
 * SVG markup), so exports and screen look the same.
 */
export async function exportAllLegsPdf({
  canvas,
  pixelsPerMM: ppm,
  width,
  height,
  event,
  courseId,
  onProgress,
  signal,
}: ExportAllLegsOptions): Promise<void> {
  const raceCourse = event.raceCourses?.[0];
  const course = raceCourse?.courses?.find((c) => c.id === courseId);
  if (!raceCourse || !course || !course.controls || course.controls.length < 2) return;
  const controls = raceCourse.controls ?? [];
  const nodes = raceCourse.vertices ?? [];
  const edges = raceCourse.edges ?? [];
  const map = getActiveMap(event, courseId);
  const toPx = (p: { x: number; y: number }) => eventPosToMultiPagePixels(p, map, ppm);

  // Loaded only when exporting, to keep it out of the page bundle
  const { renderToStaticMarkup } = await import("react-dom/server");

  const courseControlsPx: ControlWithPos[] = course.controls
    .map((cc): ControlWithPos | null => {
      const c = controls.find((ctrl) => ctrl.id === cc.controlId);
      return c ? { ...c, ...toPx(c.mapPosition), mapText: cc.mapText ?? c.mapText ?? "" } : null;
    })
    .filter((c): c is ControlWithPos => c !== null);
  const courseControlCodes = courseControlsPx.map((c) => c.mapText || c.id);
  const controlLabelMap = getCourseControlLabelMap(course.controls, controls);
  const legs = getActualCourseControls(course.controls, controls);
  const routeAnalyzer = createEventRouteAnalyzer(event, { courseId });

  // Static parts, the same on every page
  const directionsMarkup = renderToStaticMarkup(
    <g>{renderDirections({ features: raceCourse.directions ?? [], toPx, pixelsPerMM: ppm, mapScale: map?.scale, idPrefix: "leg-export-op" })}</g>,
  );
  const controlsMarkup = renderToStaticMarkup(
    <g>
      {courseControlsPx.map((control) =>
        ControlRenderer.renderControl({
          control,
          courseControls: courseControlsPx,
          courseControlCodes,
          strokeColor: COURSE_PURPLE,
          showLabel: true,
          controlLabelMap,
        }),
      )}
    </g>,
  );

  const nodePx = (id: string) => {
    const n = nodes.find((v) => v.id === id);
    if (n) return { ...n, ...toPx(n) };
    return courseControlsPx.find((c) => c.id === id) ?? (() => {
      const c = controls.find((ctrl) => ctrl.id === id);
      return c ? { ...c, ...toPx(c.mapPosition) } : null;
    })();
  };
  const isIgnoreLength = (fromId: string, toId: string) =>
    !!edges.find((e) => (e.from === fromId && e.to === toId) || (!e.oneWay && e.from === toId && e.to === fromId))?.ignoreLength;

  const page = document.createElement("canvas");
  page.width = canvas.width;
  page.height = canvas.height;
  const ctx = page.getContext("2d");
  if (!ctx) return;
  const drawSvg = (svg: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    });

  const orientation = canvas.width > canvas.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  let pageIndex = 0;
  const totalLegs = legs.length - 1;

  for (let i = 0; i < totalLegs; i++) {
    if (signal?.aborted) throw new Error("Export cancelled");
    if (onProgress) {
      onProgress(i / totalLegs);
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the UI update
    }
    const fromId = legs[i].controlId;
    const toId = legs[i + 1].controlId;
    if (!fromId || !toId || fromId === toId) continue;

    ctx.clearRect(0, 0, page.width, page.height);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(canvas, 0, 0);

    const bestRoute = routeAnalyzer.findAlternativePathsBetweenControls(fromId, toId)[0];
    const legsMarkup = renderToStaticMarkup(
      <g>
        {renderLegConnections({ controls: courseControlsPx, color: COURSE_PURPLE })}
        {renderLegConnections({ controls: courseControlsPx, highlightedLegIndex: i, color: COURSE_PURPLE })}
      </g>,
    );
    const routeMarkup =
      bestRoute && bestRoute.path.length > 0
        ? renderToStaticMarkup(
            <g opacity={0.8}>
              {renderRoutePolylines(buildRoutePathSegments(bestRoute.path, nodePx, isIgnoreLength), {
                color: ROUTE_ANALYSIS_COLORS[0],
                strokeWidth: 4,
              })}
            </g>,
          )
        : "";

    await drawSvg(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${directionsMarkup}${legsMarkup}${controlsMarkup}${routeMarkup}</svg>`,
    );

    if (pageIndex > 0) pdf.addPage([canvas.width, canvas.height], orientation);
    pdf.addImage(page.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    pdf.setFontSize(24);
    pdf.text(`Leg ${pageIndex + 1}: ${fromId} -> ${toId}`, 50, 50);
    pageIndex++;
  }

  if (signal?.aborted) throw new Error("Export cancelled");
  pdf.save(`route-analysis-${courseId}-all-legs.pdf`);
}
