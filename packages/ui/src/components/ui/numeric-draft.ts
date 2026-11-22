/**
 * Pure logic behind <NumericInput>: parse a draft string typed by the user.
 * Intermediate states ("-", ".", "-0.", "1e", "") are allowed while typing;
 * they only fail when committed.
 */
export type NumericDraftResult = { ok: true; value: number } | { ok: false; reason: "empty" | "invalid" | "range" };

export interface NumericDraftOptions {
  min?: number;
  max?: number;
  /** Round to an integer before range checks. */
  integer?: boolean;
}

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function parseNumericDraft(draft: string, options: NumericDraftOptions = {}): NumericDraftResult {
  const text = draft.trim().replace(",", ".");
  if (text === "") return { ok: false, reason: "empty" };
  if (!NUMBER_PATTERN.test(text)) return { ok: false, reason: "invalid" };
  let value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid" };
  if (options.integer) value = Math.round(value);
  if (options.min !== undefined && value < options.min) return { ok: false, reason: "range" };
  if (options.max !== undefined && value > options.max) return { ok: false, reason: "range" };
  return { ok: true, value };
}

/** Text shown for a committed value: trims floating-point noise, keeps up to `decimals` digits. */
export function formatNumericValue(value: number, decimals = 6): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(decimals)));
}
