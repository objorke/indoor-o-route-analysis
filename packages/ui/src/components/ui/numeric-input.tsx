"use client";

import * as React from "react";
import { Input } from "./input";
import { cn } from "../../utils";
import { formatNumericValue, parseNumericDraft, type NumericDraftOptions } from "./numeric-draft";

export { parseNumericDraft, formatNumericValue } from "./numeric-draft";
export type { NumericDraftOptions, NumericDraftResult } from "./numeric-draft";

export interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max" | "defaultValue">,
    NumericDraftOptions {
  value: number;
  /** Called on blur or Enter with a valid, changed number. */
  onCommit: (value: number) => void;
  /** Max decimals shown when not editing. Default 6. */
  decimals?: number;
}

/**
 * Number field that validates on blur/Enter instead of per keystroke, so
 * "-", "." or an empty field can be typed. Invalid input reverts to the last
 * valid value with a brief red outline. Esc reverts and blurs.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onCommit, min, max, integer, decimals = 6, className, onBlur, onKeyDown, onFocus, ...props }, ref) => {
    const formatted = formatNumericValue(value, decimals);
    const [draft, setDraft] = React.useState(formatted);
    const [focused, setFocused] = React.useState(false);
    const [invalid, setInvalid] = React.useState(false);
    const skipBlurCommit = React.useRef(false);
    // Value sent by the last commit, until the parent's `value` catches up (prevents Enter + blur committing twice)
    const pendingCommit = React.useRef<number | null>(null);
    React.useEffect(() => {
      pendingCommit.current = null;
    }, [value]);

    // Follow external value changes while not editing
    React.useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync draft from prop when not focused
      if (!focused) setDraft(formatted);
    }, [formatted, focused]);

    React.useEffect(() => {
      if (!invalid) return;
      const t = setTimeout(() => setInvalid(false), 1200);
      return () => clearTimeout(t);
    }, [invalid]);

    const commit = () => {
      const result = parseNumericDraft(draft, { min, max, integer });
      if (result.ok) {
        if (result.value !== value && result.value !== pendingCommit.current) {
          pendingCommit.current = result.value;
          onCommit(result.value);
        }
        setDraft(formatNumericValue(result.value, decimals));
      } else {
        setDraft(formatted);
        setInvalid(true);
      }
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        {...props}
        value={draft}
        aria-invalid={invalid || undefined}
        className={cn("font-mono text-right tabular-nums", className)}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          if (skipBlurCommit.current) skipBlurCommit.current = false;
          else commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommit.current = true;
            setDraft(formatted);
            e.currentTarget.blur();
          }
          onKeyDown?.(e);
        }}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";
