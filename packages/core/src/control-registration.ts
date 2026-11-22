import type { MapPosition } from "./models/map";

/**
 * Calculates the map coordinate transform (top-left and bottom-right corners in
 * IOF event coordinate space) from two control–registration-mark pairs.
 *
 * Each control has a known position in the IOF event coordinate system
 * (`controlEventPos`), and the user places a registration mark at the
 * corresponding location in the document coordinate system (`documentPosMm`,
 * in millimetres measured from the top-left corner of the PDF page).
 *
 * The transform is a simple axis-aligned affine mapping:
 *
 *   eventX = TL.x + (docX / docWidth)  * (BR.x - TL.x)
 *   eventY = TL.y + (docY / docHeight) * (BR.y - TL.y)
 *
 * Given two pairs we can solve for TL and BR on each axis independently:
 *
 *   e1 = TL + u1 * span       (u = doc / docSize, span = BR - TL)
 *   e2 = TL + u2 * span
 *
 *   span = (e1 - e2) / (u1 - u2)
 *   TL   = e1 - u1 * span
 *   BR   = TL + span
 *
 * @param c1Event  Event-space position of first control
 * @param c1Doc    Document-space position (mm) of first registration mark
 * @param c2Event  Event-space position of second control
 * @param c2Doc    Document-space position (mm) of second registration mark
 * @param docWidth Document (image) width in mm
 * @param docHeight Document (image) height in mm
 * @param options  `uniform` locks the aspect ratio (see ControlPairTransformOptions)
 * @returns  New top-left and bottom-right corners in event coordinate space and
 *           the residual, or `null` if the marks are too close (on either axis
 *           when not uniform; overall when uniform).
 */
export interface ControlPairTransformOptions {
  /**
   * Solve for a single scale on both axes (aspect ratio locked). The axis
   * orientation comes from the event/document deltas, falling back to
   * `orientation` (or +1) on an axis where the marks don't differ. Needs only
   * the marks to be apart overall, so two controls on the same row work.
   */
  uniform?: boolean;
  /** Axis signs to use when they can't be derived from the data (e.g. the current transform's). */
  orientation?: { x: 1 | -1; y: 1 | -1 };
}

export interface ControlPairTransformResult {
  topLeft: MapPosition;
  bottomRight: MapPosition;
  /** Largest distance (event units) between a control and where its mark lands with the new transform. */
  maxError: number;
}

export function calculateTransformFromControlPairs(
  c1Event: MapPosition,
  c1Doc: MapPosition,
  c2Event: MapPosition,
  c2Doc: MapPosition,
  docWidth: number,
  docHeight: number,
  options: ControlPairTransformOptions = {},
): ControlPairTransformResult | null {
  if (options.uniform) {
    return solveUniform(c1Event, c1Doc, c2Event, c2Doc, docWidth, docHeight, options.orientation);
  }

  // Normalised document coordinates (0..1)
  const u1x = c1Doc.x / docWidth;
  const u1y = c1Doc.y / docHeight;
  const u2x = c2Doc.x / docWidth;
  const u2y = c2Doc.y / docHeight;

  const duX = u1x - u2x;
  const duY = u1y - u2y;

  // Need sufficient separation on both axes
  if (Math.abs(duX) < 1e-4 || Math.abs(duY) < 1e-4) {
    return null;
  }

  // Solve for each axis
  const spanX = (c1Event.x - c2Event.x) / duX;
  const tlX = c1Event.x - u1x * spanX;

  const spanY = (c1Event.y - c2Event.y) / duY;
  const tlY = c1Event.y - u1y * spanY;

  return {
    topLeft: { x: tlX, y: tlY },
    bottomRight: { x: tlX + spanX, y: tlY + spanY },
    maxError: 0, // exact fit: 2 equations, 2 unknowns per axis
  };
}

/**
 * Uniform scale k (event units per doc mm) with per-axis sign s:
 *   e = TL + s·k·d
 * Least squares over the 4 equations (unknowns TLx, TLy, k). With two points,
 * eliminating TL gives k = (sx·Δdx·Δex + sy·Δdy·Δey) / (Δdx² + Δdy²).
 */
function solveUniform(
  c1Event: MapPosition,
  c1Doc: MapPosition,
  c2Event: MapPosition,
  c2Doc: MapPosition,
  docWidth: number,
  docHeight: number,
  orientation?: { x: 1 | -1; y: 1 | -1 },
): ControlPairTransformResult | null {
  const ddx = c1Doc.x - c2Doc.x;
  const ddy = c1Doc.y - c2Doc.y;
  const dex = c1Event.x - c2Event.x;
  const dey = c1Event.y - c2Event.y;
  const dd2 = ddx * ddx + ddy * ddy;
  if (dd2 < 1e-6) return null; // marks on top of each other (doc mm)

  const eps = 1e-6;
  const sign = (de: number, dd: number, fallback: 1 | -1): 1 | -1 =>
    Math.abs(de) > eps && Math.abs(dd) > eps ? (de * dd >= 0 ? 1 : -1) : fallback;
  const sx = sign(dex, ddx, orientation?.x ?? 1);
  const sy = sign(dey, ddy, orientation?.y ?? 1);

  const k = (sx * ddx * dex + sy * ddy * dey) / dd2;
  if (!(k > 1e-9)) return null;

  const meanDx = (c1Doc.x + c2Doc.x) / 2;
  const meanDy = (c1Doc.y + c2Doc.y) / 2;
  const tlX = (c1Event.x + c2Event.x) / 2 - sx * k * meanDx;
  const tlY = (c1Event.y + c2Event.y) / 2 - sy * k * meanDy;

  const err = (e: MapPosition, d: MapPosition) =>
    Math.hypot(tlX + sx * k * d.x - e.x, tlY + sy * k * d.y - e.y);

  return {
    topLeft: { x: tlX, y: tlY },
    bottomRight: { x: tlX + sx * k * docWidth, y: tlY + sy * k * docHeight },
    maxError: Math.max(err(c1Event, c1Doc), err(c2Event, c2Doc)),
  };
}
