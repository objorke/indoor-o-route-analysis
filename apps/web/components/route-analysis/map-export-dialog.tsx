"use client"

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { RadioGroup, RadioGroupItem } from "@indoor-o-route-analysis/ui";

interface MapExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: "png" | "pdf", scope: "current-route" | "current-leg" | "all-legs") => void;
  onCancelExport?: () => void;
  isExporting?: boolean;
  progress?: number;
  courseName?: string;
  legName?: string | null;
  routeName?: string | null;
  hasSelectedRoute: boolean;
  hasSelectedLeg: boolean;
}

export function MapExportDialog({
  isOpen,
  onClose,
  onExport,
  onCancelExport,
  isExporting = false,
  progress = 0,
  courseName,
  legName,
  routeName,
  hasSelectedRoute,
  hasSelectedLeg
}: MapExportDialogProps) {
  const [format, setFormat] = useState<"png" | "pdf">("png");
  const [scope, setScope] = useState<"current-route" | "current-leg" | "all-legs">("all-legs");

  // Reset/Set default scope when opening
  useEffect(() => {
    if (isOpen) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset scope when dialog opens
        if (hasSelectedRoute) setScope("current-route");
         
        else if (hasSelectedLeg) setScope("current-leg");
         
        else setScope("all-legs");
    }
  }, [isOpen, hasSelectedRoute, hasSelectedLeg]);

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(format, scope);
    // Do not close immediately
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-sm bg-background border border-border rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Export Map</h2>
          {!isExporting && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Configuration */}
        <div className="p-4 space-y-5">
           <div className="text-sm text-foreground bg-muted/40 p-3 rounded-md border border-border">
             <span className="text-muted-foreground mr-1">Course:</span>
             <span className="font-medium">{courseName || "Unknown Course"}</span>
           </div>

           {isExporting ? (
             <div className="space-y-4 py-8">
               <div className="space-y-2">
                 <div className="flex justify-between text-xs">
                    <span>Exporting...</span>
                    <span>{Math.round(progress * 100)}%</span>
                 </div>
                 <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div 
                       className="h-full bg-primary transition-all duration-300 ease-out"
                       style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                 </div>
               </div>
               <p className="text-xs text-muted-foreground text-center">
                 Generating pages, please wait...
               </p>
             </div>
           ) : (
             <div className="space-y-5">
                <div className="space-y-3">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Scope</Label>
                    <RadioGroup 
                        value={scope} 
                        onValueChange={(val) => setScope(val as "current-route" | "current-leg" | "all-legs")}
                        className="gap-2"
                    >
                        {hasSelectedRoute && (
                            <div className={`flex items-start space-x-2 rounded-md border p-2 transition-colors ${scope === 'current-route' ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                                <RadioGroupItem value="current-route" id="scope-route" className="mt-1" />
                                <div className="grid gap-0.5" onClick={() => setScope('current-route')} role="button">
                                    <Label htmlFor="scope-route" className="font-medium cursor-pointer">Current Route</Label>
                                    <span className="text-xs text-muted-foreground">{legName} • {routeName}</span>
                                </div>
                            </div>
                        )}

                        {hasSelectedLeg && (
                            <div className={`flex items-start space-x-2 rounded-md border p-2 transition-colors ${scope === 'current-leg' ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                                <RadioGroupItem value="current-leg" id="scope-leg" className="mt-1" />
                                <div className="grid gap-0.5" onClick={() => setScope('current-leg')} role="button">
                                    <Label htmlFor="scope-leg" className="font-medium cursor-pointer">Current Leg</Label>
                                    <span className="text-xs text-muted-foreground">{legName} • All routes</span>
                                </div>
                            </div>
                        )}
                        
                        <div className={`flex items-start space-x-2 rounded-md border p-2 transition-colors ${scope === 'all-legs' ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'} ${format === 'png' ? 'opacity-50' : ''}`}>
                            <RadioGroupItem value="all-legs" id="scope-all" className="mt-1" disabled={format === 'png'} />
                            <div className="grid gap-0.5" onClick={() => format !== 'png' && setScope('all-legs')} role="button">
                                <Label htmlFor="scope-all" className={`font-medium cursor-pointer ${format === 'png' ? 'text-muted-foreground' : ''}`}>
                                    All Legs
                                </Label>
                                <span className="text-xs text-muted-foreground">One page per leg (best route) {format === 'png' && '(PDF only)'}</span>
                            </div>
                        </div>
                    </RadioGroup>
                </div>

                <div className="space-y-3">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Format</Label>
                    <RadioGroup 
                        value={format} 
                        onValueChange={(val) => {
                            const newFormat = val as "png" | "pdf";
                            setFormat(newFormat);
                            if (newFormat === 'png' && scope === 'all-legs') {
                                setScope((hasSelectedRoute ? 'current-route' : hasSelectedLeg ? 'current-leg' : 'current-route') as "current-route" | "current-leg" | "all-legs");
                            }
                        }}
                        className="flex gap-4"
                    >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="png" id="fmt-png" />
                        <Label htmlFor="fmt-png" className="font-normal cursor-pointer">Image (PNG)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="pdf" id="fmt-pdf" />
                        <Label htmlFor="fmt-pdf" className="font-normal cursor-pointer">Document (PDF)</Label>
                    </div>
                    </RadioGroup>
                </div>
             </div>
           )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
            {isExporting ? (
                 <Button size="sm" variant="destructive" onClick={onCancelExport}>Cancel Export</Button>
            ) : (
                <Button size="sm" onClick={handleExport}>Export</Button>
            )}
        </div>
      </div>
    </div>
  );
}
