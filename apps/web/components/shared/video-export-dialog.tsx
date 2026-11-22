"use client"

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@indoor-o-route-analysis/ui";
import { RadioGroup, RadioGroupItem } from "@indoor-o-route-analysis/ui";
import type { VideoExportSettings } from "@indoor-o-route-analysis/core/export";
import { notify } from "@indoor-o-route-analysis/ui";

interface VideoExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (settings: VideoExportSettings) => void;
  onCancel?: () => void;
  isExporting: boolean;
  progress?: number;
  description?: string;
  initialMode?: '2d' | '3d';
  courseName?: string;
  legName?: string | null;
  routeName?: string | null;
  hasSelectedRoute: boolean;
  hasSelectedLeg: boolean;
}

export type { VideoExportSettings };

export function VideoExportDialog({ 
  open, 
  onOpenChange, 
  onExport, 
  onCancel, 
  isExporting, 
  progress, 
  description, 
  initialMode: _initialMode = '2d',
  courseName,
  legName,
  routeName,
  hasSelectedRoute,
  hasSelectedLeg
}: VideoExportDialogProps) {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [durationStr, setDurationStr] = useState("0:10");
  const [preset, setPreset] = useState("1920x1080");
  const [quality, setQuality] = useState("medium");
  const [customBitrate, setCustomBitrate] = useState("30"); // Mbps
  const [scope, setScope] = useState<"current-route" | "current-leg" | "all-legs">("all-legs");

  // Reset/Set default scope when opening
  useEffect(() => {
    if (open) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset scope when dialog opens
        if (hasSelectedRoute) setScope("current-route");
         
        else if (hasSelectedLeg) setScope("current-leg");
         
        else setScope("all-legs");
    }
  }, [open, hasSelectedRoute, hasSelectedLeg]);

  const BITRATES: Record<string, number> = {
    low: 2_500_000,
    medium: 5_000_000,
    high: 10_000_000,
    ultra: 20_000_000,
  };

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value === "custom") return;
    
    const [w, h] = value.split("x").map(Number);
    if (w && h) {
      setWidth(w);
      setHeight(h);
    }
  };

  const handleDimensionChange = (
    type: "width" | "height",
    value: string
  ) => {
    const val = parseInt(value);
    if (type === "width") setWidth(val);
    else setHeight(val);
    setPreset("custom");
  };

  const handleExport = () => {
    // Parse duration
    const parts = durationStr.split(':');
    let seconds = 0;
    if (parts.length === 2) {
      seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else {
      seconds = parseInt(durationStr);
    }
    
    if (isNaN(seconds) || seconds <= 0) {
        notify("Invalid duration", { kind: "error" });
        return;
    }

    let exportBitrate = BITRATES[quality as keyof typeof BITRATES];
    if (quality === 'custom') {
        const mbps = parseFloat(customBitrate);
        if (isNaN(mbps) || mbps <= 0) {
            notify("Invalid custom bitrate", { kind: "error" });
            return;
        }
        exportBitrate = mbps * 1_000_000;
    }

    onExport({ 
        width, 
        height, 
        fps, 
        duration: seconds,
        bitrate: exportBitrate,
        scope
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg max-w-sm w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
              <h3 className="text-md font-semibold">Export Route Video</h3>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {!isExporting && (
             <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onOpenChange(false)}
             >
                <X className="h-4 w-4" />
             </Button>
          )}
        </div>
        
        <div className="grid gap-4 p-4 text-sm max-h-[80vh] overflow-y-auto">
           <div className="text-sm text-foreground bg-muted/40 p-3 rounded-md border border-border">
             <span className="text-muted-foreground mr-1">Course:</span>
             <span className="font-medium">{courseName || "Unknown Course"}</span>
           </div>

           {!isExporting && (
             <div className="space-y-3 pb-2 border-b border-border">
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
                    
                    <div className={`flex items-start space-x-2 rounded-md border p-2 transition-colors ${scope === 'all-legs' ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                        <RadioGroupItem value="all-legs" id="scope-all" className="mt-1" />
                        <div className="grid gap-0.5" onClick={() => setScope('all-legs')} role="button">
                            <Label htmlFor="scope-all" className="font-medium cursor-pointer">
                                Full Course
                            </Label>
                            <span className="text-xs text-muted-foreground">Best route on each leg</span>
                        </div>
                    </div>
                </RadioGroup>
             </div>
           )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="preset" className="text-right">
              Video size
            </Label>
            <div className="col-span-3">
              <Select value={preset} onValueChange={handlePresetChange} disabled={isExporting}>
                <SelectTrigger className="w-full h-8">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1920x1080">1920 x 1080 (Full HD)</SelectItem>
                  <SelectItem value="960x1080">960 x 1080 (Use 2 side-by-side)</SelectItem>
                  <SelectItem value="960x540">960 x 540 (qHD)</SelectItem>
                  <SelectItem value="1080x1920">1080 x 1920 (Portrait Full HD)</SelectItem>
                  <SelectItem value="540x960">540 x 960 (Portrait qHD)</SelectItem>
                  <SelectItem value="1080x960">1080 x 960 (Use 2 stacked)</SelectItem>
                  <SelectItem value="600x600">600 x 600 (Square)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {preset === 'custom' && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="width" className="text-right">
                  Width
                </Label>
                <Input
                  id="width"
                  type="number"
                  value={width}
                  onChange={(e) => handleDimensionChange("width", e.target.value)}
                  className="col-span-3 h-8"
                  disabled={isExporting}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="height" className="text-right">
                  Height
                </Label>
                <Input
                  id="height"
                  type="number"
                  value={height}
                  onChange={(e) => handleDimensionChange("height", e.target.value)}
                  className="col-span-3 h-8"
                  disabled={isExporting}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="quality" className="text-right">
              Quality
            </Label>
            <div className="col-span-3">
              <Select value={quality} onValueChange={setQuality} disabled={isExporting}>
                <SelectTrigger className="w-full h-8">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (2.5 Mbps)</SelectItem>
                  <SelectItem value="medium">Medium (5 Mbps)</SelectItem>
                  <SelectItem value="high">High (10 Mbps)</SelectItem>
                  <SelectItem value="ultra">Ultra (20 Mbps)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {quality === 'custom' && (
              <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customBitrate" className="text-right whitespace-nowrap">
                Bitrate (Mbps)
              </Label>
              <Input
                id="customBitrate"
                type="number"
                value={customBitrate}
                onChange={(e) => setCustomBitrate(e.target.value)}
                className="col-span-3 h-8"
                disabled={isExporting}
                min="0.1"
                step="0.1"
              />
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="fps" className="text-right">
              FPS
            </Label>
            <Input
              id="fps"
              type="number"
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value))}
              className="col-span-3 h-8"
              disabled={isExporting}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="duration" className="text-right">
              Duration
            </Label>
            <Input
              id="duration"
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              placeholder="m:ss"
              className="col-span-3 h-8"
              disabled={isExporting}
            />
          </div>
          {isExporting && (
             <div className="flex flex-col gap-2">
                <div className="text-center text-xs text-muted-foreground">
                    Exporting... {Math.round((progress || 0) * 100)}%
                </div>
                 <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${Math.round((progress || 0) * 100)}%` }}
                     />
                 </div>
             </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
            {isExporting ? (
                 <Button size="sm" variant="destructive" onClick={onCancel}>
                    Cancel Export
                </Button>
            ) : (
                <Button size="sm" onClick={handleExport}>
                    Export
                </Button>
            )}
        </div>
      </div>
    </div>
  );
}

