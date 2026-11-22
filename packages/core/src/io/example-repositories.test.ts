import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_EXAMPLE_REPOSITORY_URL,
  exampleFilename,
  fetchExampleIndex,
  normalizeRepositoryUrl,
  parseExampleIndex,
  repositoryLabel,
  resolveExampleUrl,
  resolveLoadExampleParam,
  toLoadExampleParam,
} from "./example-repositories";

const BASE = "https://raw.githubusercontent.com/objorke/indoor-o-data/refs/heads/main/events/";

describe("example repositories", () => {
  it("resolves relative entry URLs against the index URL", () => {
    expect(resolveExampleUrl(DEFAULT_EXAMPLE_REPOSITORY_URL, "./a.json")).toBe(BASE + "a.json");
    expect(resolveExampleUrl(DEFAULT_EXAMPLE_REPOSITORY_URL, "sub/b.json")).toBe(BASE + "sub/b.json");
    expect(resolveExampleUrl(DEFAULT_EXAMPLE_REPOSITORY_URL, "https://x.org/c.json")).toBe("https://x.org/c.json");
  });

  it("rejects non-http entry URLs", () => {
    expect(resolveExampleUrl(DEFAULT_EXAMPLE_REPOSITORY_URL, "javascript:alert(1)")).toBeNull();
    expect(resolveExampleUrl(DEFAULT_EXAMPLE_REPOSITORY_URL, "data:application/json,[]")).toBeNull();
  });

  it("encodes non-ASCII filenames", () => {
    const url = resolveExampleUrl(DEFAULT_EXAMPLE_REPOSITORY_URL, "./2023-07-25-O-ringen-Åre.json")!;
    expect(url).toBe(BASE + "2023-07-25-O-ringen-%C3%85re.json");
    expect(exampleFilename(url)).toBe("2023-07-25-O-ringen-Åre.json");
  });

  it("parses an index, dropping invalid entries", () => {
    const entries = parseExampleIndex(
      [
        { title: "A", url: "./a.json", date: "2026-01-01", country: "norway" },
        { title: "no url" },
        { url: 42 },
        null,
        { url: "ftp://x/y.json" },
      ],
      DEFAULT_EXAMPLE_REPOSITORY_URL,
    );
    expect(entries).toEqual([{ title: "A", url: BASE + "a.json", date: "2026-01-01", country: "norway" }]);
    expect(parseExampleIndex({ not: "an array" }, DEFAULT_EXAMPLE_REPOSITORY_URL)).toEqual([]);
  });

  it("fetches an index and throws on HTTP errors", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify([{ url: "./a.json" }]), { status: 200 }));
    await expect(fetchExampleIndex(DEFAULT_EXAMPLE_REPOSITORY_URL, ok as unknown as typeof fetch)).resolves.toEqual([
      { url: BASE + "a.json" },
    ]);
    const fail = vi.fn(async () => new Response("nope", { status: 404 }));
    await expect(fetchExampleIndex(DEFAULT_EXAMPLE_REPOSITORY_URL, fail as unknown as typeof fetch)).rejects.toThrow("404");
  });

  it("normalizes repository URLs", () => {
    expect(normalizeRepositoryUrl("  https://example.org/index.json ")).toBe("https://example.org/index.json");
    expect(normalizeRepositoryUrl("example.org/index.json")).toBeNull();
    expect(normalizeRepositoryUrl("file:///etc/passwd")).toBeNull();
  });

  it("labels repositories", () => {
    expect(repositoryLabel(DEFAULT_EXAMPLE_REPOSITORY_URL)).toBe("objorke/indoor-o-data/events");
    expect(repositoryLabel("https://raw.githubusercontent.com/a/b/main/index.json")).toBe("a/b");
    expect(repositoryLabel("https://example.org/data/events/index.json")).toBe("example.org/data/events");
  });

  it("round-trips load-example params", () => {
    const url = BASE + "2023-07-25-O-ringen-%C3%85re.json";
    expect(toLoadExampleParam(url)).toBe("2023-07-25-O-ringen-Åre.json");
    expect(resolveLoadExampleParam("2023-07-25-O-ringen-Åre.json")).toBe(url);
    expect(toLoadExampleParam("https://example.org/e.json")).toBe("https://example.org/e.json");
    expect(resolveLoadExampleParam("https://example.org/e.json")).toBe("https://example.org/e.json");
  });

  it("maps legacy bundled-example paths to the default repository", () => {
    expect(resolveLoadExampleParam("./a.json")).toBe(BASE + "a.json");
    expect(resolveLoadExampleParam("/examples/a.json")).toBe(BASE + "a.json");
    expect(resolveLoadExampleParam("examples/a.json")).toBe(BASE + "a.json");
  });

  it("rejects path traversal in load-example params", () => {
    expect(resolveLoadExampleParam("../secret.json")).toBeNull();
    expect(resolveLoadExampleParam("a/b.json")).toBeNull();
    expect(resolveLoadExampleParam("")).toBeNull();
  });
});
