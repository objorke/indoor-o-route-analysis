"use client"

import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { MODEL_3D_TOOLS, type Model3DTool } from "./tools";

interface Model3DToolbarProps {
  tool: Model3DTool;
  onToolChange: (tool: Model3DTool) => void;
}

/** Vertical, icon-only tool palette pinned to the left edge of the map view. */
export function Model3DToolbar({ tool, onToolChange }: Model3DToolbarProps) {
  return (
    <TooltipProvider>
      <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 rounded-md border border-border bg-card/95 p-1 shadow-sm">
        {MODEL_3D_TOOLS.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <Button
                variant={tool === t.id ? "active" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onToolChange(t.id)}
                aria-label={t.label}
                aria-pressed={tool === t.id}
              >
                <t.icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <span className="font-medium">{t.label}</span> ({t.shortcut}) &mdash; {t.description}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
