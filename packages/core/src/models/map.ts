// IOF Map model
// The position of the control according to tha map's coordinate system.
export interface MapPosition {
  x: number;
  y: number;
}

export interface PageTransform {
  topLeft: MapPosition;
  bottomRight: MapPosition;
}

export interface MapData {
  id?: string;
  scale: number;
  image: MapImage;
  mapPositionTopLeft: MapPosition;
  mapPositionBottomRight?: MapPosition;
  latitude?: number;
  longitude?: number;

  // Extensions to the IOF map model
  layout: "horizontal" | "vertical" | "pages";
  pageCount?: number;
  /** "automatic" uses a single global transform; "manual" uses per-page transforms. Default: "automatic". */
  pageTransformMode?: "automatic" | "manual";
  /** Per-page coordinate transforms used when pageTransformMode is "manual". Index 0 = page 1. */
  pageTransforms?: PageTransform[];
  saveEncoded?: boolean;
}

export interface MapImage {
  encodedData?: string;
  url?: string;
  mediaType?: string;
  width?: number; // width of first page in mm
  height?: number; // height of first page in mm
  resolution?: number;
}

/**
 * Returns the effective document dimensions in mm, accounting for the multi-page layout.
 * - "horizontal": pages are arranged side by side (width = pageWidth * pageCount)
 * - "vertical": pages are stacked vertically (height = pageHeight * pageCount)
 * - "pages": single-page view (dimensions = first page)
 */
export function getDocumentDimensions(mapData: MapData): { width: number; height: number } {
  const w = mapData.image.width || 0;
  const h = mapData.image.height || 0;
  const pages = mapData.pageCount || 1;

  switch (mapData.layout) {
    case "horizontal":
      return { width: w * pages, height: h };
    case "vertical":
      return { width: w, height: h * pages };
    default:
      return { width: w, height: h };
  }
}
