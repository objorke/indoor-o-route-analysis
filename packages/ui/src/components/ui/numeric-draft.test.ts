import { describe, it, expect } from "vitest";
import { formatNumericValue, parseNumericDraft } from "./numeric-draft";

describe("parseNumericDraft", () => {
  it("parses negatives, decimals, exponents and comma decimals", () => {
    expect(parseNumericDraft("-12.5")).toEqual({ ok: true, value: -12.5 });
    expect(parseNumericDraft(" .5 ")).toEqual({ ok: true, value: 0.5 });
    expect(parseNumericDraft("1e3")).toEqual({ ok: true, value: 1000 });
    expect(parseNumericDraft("3,25")).toEqual({ ok: true, value: 3.25 });
    expect(parseNumericDraft("7.")).toEqual({ ok: true, value: 7 });
  });

  it("rejects intermediate states on commit", () => {
    expect(parseNumericDraft("")).toEqual({ ok: false, reason: "empty" });
    for (const s of ["-", ".", "-.", "1e", "abc", "1.2.3", "--1"]) {
      expect(parseNumericDraft(s)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("applies integer rounding and range", () => {
    expect(parseNumericDraft("999.6", { integer: true })).toEqual({ ok: true, value: 1000 });
    expect(parseNumericDraft("0", { min: 1 })).toEqual({ ok: false, reason: "range" });
    expect(parseNumericDraft("91", { max: 90 })).toEqual({ ok: false, reason: "range" });
    expect(parseNumericDraft("-90", { min: -90, max: 90 })).toEqual({ ok: true, value: -90 });
  });
});

describe("formatNumericValue", () => {
  it("trims floating-point noise", () => {
    expect(formatNumericValue(0.1 + 0.2)).toBe("0.3");
    expect(formatNumericValue(297.00000001, 3)).toBe("297");
    expect(formatNumericValue(-12.5)).toBe("-12.5");
    expect(formatNumericValue(Number.NaN)).toBe("");
  });
});
