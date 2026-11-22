/**
 * Example event repositories: remote `index.json` files listing event JSON
 * files (File → Examples). Entry URLs may be relative to the index URL.
 *
 * Index format: `[{ "title": "...", "url": "./file.json", "date": "YYYY-MM-DD", "country": "norway" }]`
 */

/** Built-in repository, always listed first in Settings → Examples. */
export const DEFAULT_EXAMPLE_REPOSITORY_URL =
  "https://raw.githubusercontent.com/objorke/indoor-o-data/refs/heads/main/events/index.json";

export interface ExampleIndexEntry {
  title?: string;
  /** Absolute URL of the event file (resolved against the index URL). */
  url: string;
  date?: string;
  country?: string;
}

/** True for an absolute http(s) URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Trim and validate a user-entered repository index URL; null if invalid. */
export function normalizeRepositoryUrl(value: string): string | null {
  const trimmed = value.trim();
  return isHttpUrl(trimmed) ? new URL(trimmed).toString() : null;
}

/** Resolve an entry URL (e.g. `./file.json`) against its index URL; null if not http(s). */
export function resolveExampleUrl(indexUrl: string, entryUrl: string): string | null {
  try {
    const resolved = new URL(entryUrl.trim(), indexUrl).toString();
    return isHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/** Validate an index.json payload and resolve entry URLs. Invalid entries are dropped. */
export function parseExampleIndex(data: unknown, indexUrl: string): ExampleIndexEntry[] {
  if (!Array.isArray(data)) return [];
  const entries: ExampleIndexEntry[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.url !== "string" || !raw.url.trim()) continue;
    const url = resolveExampleUrl(indexUrl, raw.url);
    if (!url) continue;
    const entry: ExampleIndexEntry = { url };
    if (typeof raw.title === "string") entry.title = raw.title;
    if (typeof raw.date === "string") entry.date = raw.date;
    if (typeof raw.country === "string") entry.country = raw.country;
    entries.push(entry);
  }
  return entries;
}

/** Fetch and parse a repository index. Throws on network/HTTP errors. */
export async function fetchExampleIndex(
  indexUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ExampleIndexEntry[]> {
  const res = await fetchFn(indexUrl);
  if (!res.ok) throw new Error(`Failed to load example index (${res.status})`);
  return parseExampleIndex(await res.json(), indexUrl);
}

/** Short label for a repository URL, e.g. `objorke/indoor-o-data/events`. */
export function repositoryLabel(indexUrl: string): string {
  try {
    const u = new URL(indexUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname === "raw.githubusercontent.com" && parts.length >= 2) {
      // owner/repo/(refs/heads/)branch/path.../index.json
      const rest = parts.slice(2);
      const pathStart = rest[0] === "refs" ? 3 : 1;
      const dir = rest.slice(pathStart, -1).join("/");
      return [parts[0], parts[1], dir].filter(Boolean).join("/");
    }
    return u.hostname + parts.slice(0, -1).map((p) => "/" + p).join("");
  } catch {
    return indexUrl;
  }
}

/** Directory URL of an index (everything up to the last `/`). */
function baseOf(indexUrl: string): string {
  return new URL(".", indexUrl).toString();
}

/**
 * Resolve a `?load-example=` value: a plain filename is looked up in the default
 * repository; an absolute http(s) URL is used as-is. Legacy bundled-example paths
 * (`./x.json`, `/examples/x.json`) are reduced to their filename. Returns null if invalid.
 */
export function resolveLoadExampleParam(
  value: string,
  defaultIndexUrl: string = DEFAULT_EXAMPLE_REPOSITORY_URL,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed)) return trimmed;
  const name = trimmed.replace(/^\.?\/+/, "").replace(/^examples\//, "");
  // Security: plain filenames only (no path traversal / directories)
  if (!name || /[/\\]|\.\./.test(name)) return null;
  return resolveExampleUrl(defaultIndexUrl, "./" + encodeURIComponent(name));
}

/**
 * Inverse of resolveLoadExampleParam: a file in the default repository becomes
 * its filename (short share links); anything else stays an absolute URL.
 */
export function toLoadExampleParam(
  url: string,
  defaultIndexUrl: string = DEFAULT_EXAMPLE_REPOSITORY_URL,
): string {
  const base = baseOf(defaultIndexUrl);
  if (url.startsWith(base)) {
    const rest = url.slice(base.length);
    if (rest && !rest.includes("/") && !rest.includes("?") && !rest.includes("#")) {
      return decodeURIComponent(rest);
    }
  }
  return url;
}

/** Filename part of an event URL (decoded), e.g. `2026-03-08-Fossum-inne-o.json`. */
export function exampleFilename(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "";
    return decodeURIComponent(last);
  } catch {
    return url.split("/").pop() ?? url;
  }
}
