import { describe, it, expect } from "vitest";
import { describeDataUrl, fitWithin, formatDataUrlInfo, isDataUrl } from "./embed-image";

describe("embed-image helpers", () => {
  it("isDataUrl", () => {
    expect(isDataUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isDataUrl("https://example.com/a.png")).toBe(false);
    expect(isDataUrl(undefined)).toBe(false);
  });

  it("describeDataUrl reads media type and size", () => {
    expect(describeDataUrl("data:image/png;base64,QUJD")).toEqual({ mediaType: "image/png", bytes: 3 });
    expect(describeDataUrl("data:image/svg+xml,%3Csvg%3E")).toEqual({ mediaType: "image/svg+xml", bytes: 5 });
    expect(formatDataUrlInfo(`data:image/webp;base64,${"A".repeat(4096)}`)).toBe("image/webp · 3 kB");
  });

  it("fitWithin keeps small images and scales the longest side", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(4000, 2000)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(1000, 3000, 300)).toEqual({ width: 100, height: 300 });
  });
});
