import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button, ConfirmDialog } from "@indoor-o-route-analysis/ui";
import type { Control } from "@indoor-o-route-analysis/core";
import type { Course } from "@indoor-o-route-analysis/core";
import type { Polygon } from "@indoor-o-route-analysis/core";
import { findPolygonForPoint, getCoursesUsingControl } from "@indoor-o-route-analysis/core";

interface ControlsTabProps {
  controls: Control[];
  courses: Course[];
  polygons: Polygon[];
  /** Delete a control everywhere (courses and graph edges included). */
  onDeleteControl?: (controlId: string) => void;
}

interface ControlRow {
  id: string;
  type: string;
  x: number;
  y: number;
  level: number | undefined;
  elevation: number | undefined;
  usedIn: string;
  totalRunners: number;
}

export function ControlsTab({ controls, courses, polygons, onDeleteControl }: ControlsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; message: string } | null>(null);

  /** Delete immediately when unused; otherwise ask first. */
  const requestDelete = (id: string) => {
    if (!onDeleteControl) return;
    const using = getCoursesUsingControl(courses, id);
    if (using.length === 0) {
      onDeleteControl(id);
      if (selectedId === id) setSelectedId(null);
      return;
    }
    const names = using.map((c) => c.name).join(", ");
    setPendingDelete({
      id,
      message: `Control ${id} is used in ${using.length} course${using.length === 1 ? "" : "s"} (${names}). Delete it and remove it from ${using.length === 1 ? "that course" : "those courses"}?`,
    });
  };

  // Delete/Backspace deletes the selected row
  useEffect(() => {
    if (!selectedId || !onDeleteControl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      requestDelete(selectedId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Calculate control usage across courses
  const controlUsage = new Map<string, { courses: string[]; runners: number }>();

  courses.forEach((course) => {
    const runners = course.numberOfCompetitors ?? 0;
    course.controls.forEach((cc) => {
      const existing = controlUsage.get(cc.controlId) || { courses: [], runners: 0 };
      if (!existing.courses.includes(course.name)) {
        existing.courses.push(course.name);
      }
      existing.runners += runners;
      controlUsage.set(cc.controlId, existing);
    });
  });

  // Build table rows
  const rows: ControlRow[] = controls.map((control) => {
    const usage = controlUsage.get(control.id) || { courses: [], runners: 0 };
    
    // Find polygon for this control to get level and elevation
    const polygon = findPolygonForPoint(
      { x: control.mapPosition.x, y: control.mapPosition.y },
      polygons
    );

    return {
      id: control.id,
      type: control.type,
      x: Math.round(control.mapPosition.x * 100) / 100,
      y: Math.round(control.mapPosition.y * 100) / 100,
      level: polygon?.level,
      elevation: polygon?.elevation,
      usedIn: usage.courses.sort().join(", "),
      totalRunners: usage.runners,
    };
  });

  // Sort by control ID (treating numeric IDs numerically)
  rows.sort((a, b) => {
    const aNum = parseInt(a.id);
    const bNum = parseInt(b.id);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    return a.id.localeCompare(b.id);
  });

  const exportCSV = () => {
    // Create CSV header
    const header = ["ID", "Type", "X", "Y", "Level", "Elevation (m)", "Used In", "Total Runners"];
    
    // Create CSV rows
    const csvRows = rows.map((row) => [
      row.id,
      row.type,
      row.x,
      row.y,
      row.level ?? "",
      row.elevation ?? "",
      row.usedIn,
      row.totalRunners,
    ]);

    // Combine header and rows
    const csvContent = [header, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `controls-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-6 min-h-0">
      <div className="max-w-full mx-auto flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">
            {controls.length} control{controls.length !== 1 ? "s" : ""}
          </h3>
          {controls.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>

        {controls.length === 0 ? (
          <div className="text-sm text-muted-foreground">{"No controls defined yet."}</div>
        ) : (
          <div className="flex-1 overflow-auto rounded-md border border-border/60 bg-background shadow-sm min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"ID"}</th>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"Type"}</th>
                  <th className="text-right px-3 py-2 font-medium bg-muted/50">{"X"}</th>
                  <th className="text-right px-3 py-2 font-medium bg-muted/50">{"Y"}</th>
                  <th className="text-right px-3 py-2 font-medium bg-muted/50">{"Level"}</th>
                  <th className="text-right px-3 py-2 font-medium bg-muted/50">{"Elevation (m)"}</th>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"Used In"}</th>
                  <th className="text-right px-3 py-2 font-medium bg-muted/50">{"Total Runners"}</th>
                  {onDeleteControl && <th className="w-8 bg-muted/50" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-border/60 cursor-pointer ${selectedId === row.id ? "bg-primary/15" : "hover:bg-muted/30"}`}
                    onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                  >
                    <td className="px-3 py-2 align-middle font-mono">{row.id}</td>
                    <td className="px-3 py-2 align-middle capitalize">{row.type}</td>
                    <td className="px-3 py-2 align-middle text-right font-mono text-xs">{row.x}</td>
                    <td className="px-3 py-2 align-middle text-right font-mono text-xs">{row.y}</td>
                    <td className="px-3 py-2 align-middle text-right">
                      {row.level !== undefined ? row.level : "-"}
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      {row.elevation !== undefined ? row.elevation.toFixed(1) : "-"}
                    </td>
                    <td className="px-3 py-2 align-middle text-xs max-w-md truncate" title={row.usedIn}>
                      {row.usedIn || "-"}
                    </td>
                    <td className="px-3 py-2 align-middle text-right">{row.totalRunners}</td>
                    {onDeleteControl && (
                      <td className="px-1 py-1 align-middle text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Delete control (Delete)"
                          aria-label={`Delete control ${row.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDelete(row.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Delete control"
        message={pendingDelete?.message ?? ""}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            onDeleteControl?.(pendingDelete.id);
            if (selectedId === pendingDelete.id) setSelectedId(null);
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
