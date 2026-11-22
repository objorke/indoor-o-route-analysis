import { estimateBase64ByteLength, formatByteSize } from "@indoor-o-route-analysis/core";

/**
 * Embedding the event image in the event file as a data: URL, so the file is
 * self-contained. Large images are downscaled and re-encoded to keep the JSON
 * small. Everything runs in the browser; nothing is uploaded.
 */

/** Images at or below both limits are embedded unchanged. */
export const EMBED_MAX_DIMENSION = 1024;
export const EMBED_MAX_BYTES = 300 * 1024;

export function isDataUrl(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

/** Media type and decoded size of a base64 data URL, e.g. { mediaType: "image/png", bytes: 1234 }. */
export function describeDataUrl(value: string): { mediaType: string; bytes: number } {
  const comma = value.indexOf(",");
  const header = comma >= 0 ? value.slice(5, comma) : "";
  const mediaType = header.split(";")[0] || "application/octet-stream";
  const bytes = header.includes(";base64")
    ? estimateBase64ByteLength(value.slice(comma + 1))
    : decodeURIComponent(value.slice(comma + 1)).length;
  return { mediaType, bytes };
}

/** Short label like "image/png · 120 kB". */
export function formatDataUrlInfo(value: string): string {
  const { mediaType, bytes } = describeDataUrl(value);
  return `${mediaType} · ${formatByteSize(bytes)}`;
}

/** Target size that fits within `max` on the longest side, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, max = EMBED_MAX_DIMENSION): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest <= 0) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image"));
    reader.readAsDataURL(blob);
  });
}

/** Encode an image file/blob as a data URL, downscaling (WebP, keeps transparency) when it is large. */
export async function imageBlobToDataUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith("image/")) throw new Error("The file is not an image.");
  // SVG is vector and usually small: keep as-is
  if (blob.type === "image/svg+xml") return readAsDataUrl(blob);

  const bitmap = await createImageBitmap(blob);
  try {
    const target = fitWithin(bitmap.width, bitmap.height);
    const needsResize = target.width !== bitmap.width || target.height !== bitmap.height;
    if (!needsResize && blob.size <= EMBED_MAX_BYTES) return readAsDataUrl(blob);

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return readAsDataUrl(blob);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    // Keep the original when re-encoding didn't help
    if (!encoded || (encoded.size >= blob.size && !needsResize)) return readAsDataUrl(blob);
    return readAsDataUrl(encoded);
  } finally {
    bitmap.close();
  }
}

/** Download an image from a URL (user-initiated) and embed it. Fails when the site doesn't allow cross-origin reads. */
export async function embedImageFromUrl(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    throw new Error(
      "The image could not be downloaded. The site probably doesn't allow it (CORS). Save the image to your computer and use \"Choose image…\" instead.",
    );
  }
  if (!response.ok) throw new Error(`The image could not be downloaded (HTTP ${response.status}).`);
  return imageBlobToDataUrl(await response.blob());
}
