import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";

/** Small info icon with an explanatory tooltip, placed next to a field label. */
export function FieldHelp({ children, label = "More information" }: { children: React.ReactNode; label?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex text-muted-foreground hover:text-foreground align-middle" aria-label={label}>
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-snug">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
