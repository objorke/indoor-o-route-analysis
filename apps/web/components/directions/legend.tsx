import { DIRECTION_SYMBOLS, type DirectionKind } from "@indoor-o-route-analysis/core";

export { Button } from "@indoor-o-route-analysis/ui";

/** Symbol legend (colour swatch, name, line width) from the core symbol table. */
export const DIRECTION_SYMBOLS_LEGEND = (
  <ul className="ml-2 space-y-1">
    {(Object.keys(DIRECTION_SYMBOLS) as DirectionKind[]).map((kind) => {
      const s = DIRECTION_SYMBOLS[kind];
      return (
        <li key={kind} className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 rounded-sm" style={{ backgroundColor: s.color }} />
          <span>
            {s.label} &mdash; {s.lineWidth} mm
          </span>
        </li>
      );
    })}
  </ul>
);
