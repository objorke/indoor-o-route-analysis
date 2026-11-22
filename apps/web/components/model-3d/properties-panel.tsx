"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@indoor-o-route-analysis/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@indoor-o-route-analysis/ui";
import { Info, Maximize2, Download, Upload, Menu, CheckCircle, AlertTriangle, Target, Crosshair, Box, Trash2 } from "lucide-react";
import { useAppData, confirmAction } from "@indoor-o-route-analysis/ui";
import { ScrollArea } from "@indoor-o-route-analysis/ui";
import Model3DInfoDialog from "./info-dialog";

import type { Polygon } from "@indoor-o-route-analysis/core";
import { updateRaceCourse } from "@indoor-o-route-analysis/core";

export interface ModelMistake {
  id: string;
  type: "control" | "node";
  name?: string;
  point: { x: number; y: number; level?: number };
}

interface Model3DPropertiesPanelProps {
  selectedPolygonId: string | null;
  onSelectPolygon: (id: string | null) => void;
  onFrameAll: () => void;
  onExport: () => void;
  onExportPolygonsJson: () => void;
  onImportPolygonsJson: (file: File) => void;
  onVerify: () => void;
  findings: ModelMistake[];
  verified: boolean;
  onNavigate: (point: { x: number; y: number }) => void;
  show3D: boolean;
  onShow3DChange: (show: boolean) => void;

}

export default function Model3DPropertiesPanel({
  selectedPolygonId,
  onSelectPolygon,
  onFrameAll,
  onExport,
  onExportPolygonsJson,
  onImportPolygonsJson,
  onVerify,
  findings = [],
  verified,
  onNavigate,
  show3D,
  onShow3DChange,
}: Model3DPropertiesPanelProps) {
  const { selectedEvent, updateEvent } = useAppData();
  const [polygonFloor, setPolygonFloor] = useState<number>(0);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [polygonElevation, setPolygonElevation] = useState<number>(0);
  const [originX, setOriginX] = useState<number>(0);
  const [originY, setOriginY] = useState<number>(0);
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  const polygons: Polygon[] = selectedEvent?.raceCourses?.[0]?.polygons || [];
  const sortedPolygons = [...polygons].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  const getCentroid = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return { x: 0, y: 0 };
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return { x, y };
  };

  useEffect(() => {
    const polygons = selectedEvent?.raceCourses?.[0]?.polygons;
    if (selectedPolygonId && polygons) {
      const polygon = polygons.find((p) => p.id === selectedPolygonId);
      if (polygon) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local form state from event data
        setPolygonFloor(polygon.level ?? 0);
        setPolygonElevation(polygon.elevation ?? 0);
        setOriginX(polygon.origin?.x || 0);
        setOriginY(polygon.origin?.y || 0);
      }
    }
  }, [selectedPolygonId, selectedEvent?.id, selectedEvent?.raceCourses]);

  const updatePolygons = (updater: (p: Polygon) => Polygon) => {
    if (!selectedEvent?.raceCourses?.[0]?.polygons) return;

    updateEvent(selectedEvent.id, (e) =>
      updateRaceCourse(e, (rc) => (rc.polygons ? { ...rc, polygons: rc.polygons.map(updater) } : rc)),
      undefined,
      { label: "Edit polygon" },
    );
  };

  /** Delete a floor (polygon) from the list, after confirming. Undoable. */
  const handleDeletePolygon = async (p: Polygon) => {
    if (!selectedEvent) return;
    const ok = await confirmAction(`Delete floor ${p.level ?? 0}${p.elevation ? ` (${p.elevation} m)` : ""}? You can undo this with Ctrl/Cmd+Z.`, {
      title: "Delete floor",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await updateEvent(
      selectedEvent.id,
      (e) => updateRaceCourse(e, (rc) => ({ ...rc, polygons: (rc.polygons ?? []).filter((x) => x.id !== p.id) })),
      undefined,
      { label: "Delete floor" },
    );
    if (selectedPolygonId === p.id) onSelectPolygon(null);
  };

  const handlePolygonFloorChange = (value: number) => {
    setPolygonFloor(value);
    if (selectedPolygonId) {
      updatePolygons((p) => (p.id === selectedPolygonId ? { ...p, level: value } : p));
    }
  };

  const handlePolygonElevationChange = (value: number) => {
    setPolygonElevation(value);
    if (selectedPolygonId) {
      updatePolygons((p) => (p.id === selectedPolygonId ? { ...p, elevation: value } : p));
    }
  };

  const handleOriginChange = (x: number, y: number) => {
    setOriginX(x);
    setOriginY(y);
    if (selectedPolygonId) {
      updatePolygons((p) => (p.id === selectedPolygonId ? { ...p, origin: { x, y } } : p));
    }
  };

  return (
    <>
      <div className="w-64 border-l border-border bg-card flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-2 border-b border-border h-8 shrink-0">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={show3D ? "active" : "ghost"}
                    size="icon"
                    onClick={() => onShow3DChange(!show3D)}
                    className="h-7 w-7"
                    title={show3D ? "Hide 3D view" : "Show 3D view"}
                  >
                    <Box className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{show3D ? "Hide 3D view" : "Show 3D view"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {show3D && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onFrameAll} className="h-7 w-7">
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset the camera to frame all geometry in the 3D view.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onVerify} className="h-7 w-7">
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Verify that all controls and nodes are inside polygon boundaries.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowInfoDialog(true)}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open the information guide for 3D model editing features.</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Menu className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={onExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export 3D model (OBJ)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onExportPolygonsJson}>
                        <Download className="h-4 w-4 mr-2" />
                        Export polygons (JSON)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => importFileRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import polygons (JSON)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent>Open the menu for export options.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Properties */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Verified - No Issues */}
            {verified && findings.length === 0 && (
              <div className="border-b border-border pb-4">
                <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 text-green-600 border border-green-500/20">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Verified. No issues.</span>
                </div>
              </div>
            )}

            {/* Findings Section */}
            {findings.length > 0 && (
              <div className="border-b border-border pb-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Validation Findings ({findings.length})</h3>
                <div className="space-y-2">
                  {findings.map((finding) => (
                    <div
                      key={`${finding.type}-${finding.id}`}
                      className="flex items-start gap-2 p-2 rounded bg-muted/50 text-xs border border-border group hover:border-primary/50 transition-colors"
                    >
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="font-medium text-foreground">
                          {finding.type === "control" ? "Control" : "Node"} outside polygon
                        </div>
                        <div className="text-muted-foreground leading-snug break-words">
                          {finding.type === "control" ? "Control" : "Node"} {finding.name || finding.id} is not inside any polygon
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-muted hover:text-foreground"
                          onClick={() => onNavigate(finding.point)}
                          title="Find on map"
                        >
                          <Crosshair className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              {polygons.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-2">No polygons defined</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted bg-opacity-50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium text-muted-foreground">Level</th>
                      <th className="text-left px-2 py-1 font-medium text-muted-foreground">Elevation</th>
                      <th className="text-right px-2 py-1 font-medium text-muted-foreground w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPolygons.map((p) => (
                      <tr
                        key={p.id}
                        className={`border-t border-border border-opacity-60 cursor-pointer ${
                          selectedPolygonId === p.id
                            ? "bg-muted bg-opacity-70"
                            : "hover:bg-muted hover:bg-opacity-30"
                        }`}
                        onClick={() => onSelectPolygon(p.id)}
                      >
                        <td className="px-2 py-1">{p.level ?? 0}</td>
                        <td className="px-2 py-1">{p.elevation ?? 0}m</td>
                        <td className="px-2 py-1 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            title={`Go to floor ${p.level ?? 0}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const centroid = getCentroid(p.points);
                              onNavigate(centroid);
                              onSelectPolygon(p.id);
                            }}
                          >
                            <Target className="h-3 w-3" />
                            <span className="sr-only">Navigate to</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 hover:text-destructive"
                            title={`Delete floor ${p.level ?? 0}`}
                            aria-label={`Delete floor ${p.level ?? 0}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeletePolygon(p);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedPolygonId && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Polygon Properties</h3>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="polygon-level" className="text-xs">
                      Level/Floor
                    </Label>
                    <Input
                      id="polygon-level"
                      type="number"
                      value={polygonFloor}
                      onChange={(e) => handlePolygonFloorChange(Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label htmlFor="polygon-elevation" className="text-xs">
                      Elevation (m)
                    </Label>
                    <Input
                      id="polygon-elevation"
                      type="number"
                      value={polygonElevation}
                      onChange={(e) => handlePolygonElevationChange(Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Origin Point (mm)</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="origin-x" className="text-xs text-muted-foreground">
                          X
                        </Label>
                        <Input
                          id="origin-x"
                          type="number"
                          value={originX}
                          onChange={(e) => handleOriginChange(Number(e.target.value), originY)}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label htmlFor="origin-y" className="text-xs text-muted-foreground">
                          Y
                        </Label>
                        <Input
                          id="origin-y"
                          type="number"
                          value={originY}
                          onChange={(e) => handleOriginChange(originX, Number(e.target.value))}
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Model3DInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
      <input
        ref={importFileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onImportPolygonsJson(file);
            e.target.value = "";
          }
        }}
      />
    </>
  );
}
