import { BookX } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NumericInput,
} from "@indoor-o-route-analysis/ui";
import { transformScale, type DocumentSize, type MapTransformCorners } from "@indoor-o-route-analysis/core";
import { FieldHelp } from "@/components/field-help";

interface TransformEditorProps {
  value: MapTransformCorners;
  /** Document size (mm) the transform is defined against: composed canvas, or the page in manual mode. */
  dims: DocumentSize;
  onCommit: (value: MapTransformCorners) => void;
  onReset: (origin: "top-left" | "bottom-left") => void;
  /** Extra header content, e.g. the page selector in manual mode. */
  headerExtra?: React.ReactNode;
  /** Shown under the grid after a reset/fit, e.g. an Undo link. */
  footer?: React.ReactNode;
}

/**
 * Editor for the axis-aligned map transform: the IOF MapPosition of the
 * document's top-left and bottom-right corners. Inputs commit on blur/Enter.
 */
export function TransformEditor({ value, dims, onCommit, onReset, headerExtra, footer }: TransformEditorProps) {
  const { sx, sy, uniform } = transformScale(value, dims);
  const set = (corner: "tl" | "br", axis: "x" | "y", v: number) =>
    onCommit({ ...value, [corner]: { ...value[corner], [axis]: v } });

  const cell = (corner: "tl" | "br", axis: "x" | "y", label: string) => (
    <NumericInput
      aria-label={label}
      className="h-7 text-xs px-2"
      decimals={3}
      value={value[corner][axis]}
      onCommit={(v) => set(corner, axis, v)}
    />
  );

  return (
    <div className="text-xs flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground flex items-center gap-1">
          Coordinate transform
          <FieldHelp>
            The IOF MapPosition (event coordinates, normally mm) of the document&apos;s top-left and bottom-right
            corners. Controls and the graph are stored in MapPosition; the map PDF is in document mm. A bottom-right Y
            smaller than the top-left Y means Y points up.
          </FieldHelp>
        </span>
        <div className="flex items-center gap-1">
          {headerExtra}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Reset transform">
                <BookX className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onSelect={() => onReset("top-left")}>Reset to mm, origin top-left (Y down)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onReset("bottom-left")}>Reset to mm, origin bottom-left (Y up)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-x-2 gap-y-1 items-center">
        <span />
        <span className="text-[10px] text-muted-foreground text-right pr-2">X</span>
        <span className="text-[10px] text-muted-foreground text-right pr-2">Y</span>
        <span className="text-muted-foreground">Top-left</span>
        {cell("tl", "x", "Top-left X")}
        {cell("tl", "y", "Top-left Y")}
        <span className="text-muted-foreground">Bottom-right</span>
        {cell("br", "x", "Bottom-right X")}
        {cell("br", "y", "Bottom-right Y")}
      </div>
      <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
        <span>
          Scale: {sx.toFixed(3)} × {sy.toFixed(3)} per mm
        </span>
        <span className={uniform ? "text-green-500" : "text-amber-500"}>{uniform ? "(uniform ✓)" : "(not uniform)"}</span>
      </div>
      {footer}
    </div>
  );
}
