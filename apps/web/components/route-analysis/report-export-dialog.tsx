"use client"

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { RadioGroup, RadioGroupItem } from "@indoor-o-route-analysis/ui";

interface ReportExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: "html" | "pdf", scope: "current-course" | "all-courses") => void;
  courseName?: string;
  scoringModelName: string;
}

export function ReportExportDialog({
  isOpen,
  onClose,
  onExport,
  courseName,
  scoringModelName,
}: ReportExportDialogProps) {
  const [format, setFormat] = useState<"html" | "pdf">("html");
  const [scope, setScope] = useState<"current-course" | "all-courses">("current-course");

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(format, scope);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-sm bg-background border border-border rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Export Report</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Configuration */}
        <div className="p-4 space-y-5">
           <div className="text-sm text-foreground bg-muted/40 p-3 rounded-md border border-border">
             <div className="flex justify-between items-center mb-1">
                 <span className="text-muted-foreground mr-1 text-xs uppercase font-semibold">Model</span>
                 <span className="font-medium text-xs">{scoringModelName}</span>
             </div>
             {courseName && (
                <div className="flex justify-between items-center">
                    <span className="text-muted-foreground mr-1 text-xs uppercase font-semibold">Course</span>
                    <span className="font-medium text-xs">{courseName}</span>
                </div>
             )}
           </div>

           <div className="space-y-3">
             <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Scope</Label>
             <RadioGroup 
                value={scope} 
                onValueChange={(val) => setScope(val as "current-course" | "all-courses")}
                className="gap-2"
             >
                <div className={`flex items-start space-x-2 rounded-md border p-2 transition-colors ${scope === 'current-course' ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                    <RadioGroupItem value="current-course" id="scope-current" className="mt-1" disabled={!courseName} />
                    <div className="grid gap-0.5" onClick={() => courseName && setScope('current-course')} role="button">
                        <Label htmlFor="scope-current" className={`font-medium cursor-pointer ${!courseName ? 'text-muted-foreground' : ''}`}>Current Course</Label>
                        <span className="text-xs text-muted-foreground">Detailed analysis for currently selected course</span>
                    </div>
                </div>

                <div className={`flex items-start space-x-2 rounded-md border p-2 transition-colors ${scope === 'all-courses' ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                    <RadioGroupItem value="all-courses" id="scope-all" className="mt-1" />
                    <div className="grid gap-0.5" onClick={() => setScope('all-courses')} role="button">
                        <Label htmlFor="scope-all" className="font-medium cursor-pointer">All Courses</Label>
                        <span className="text-xs text-muted-foreground">Summary analysis for all courses in event</span>
                    </div>
                </div>
             </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Format</Label>
            <RadioGroup 
                value={format} 
                onValueChange={(val) => setFormat(val as "html" | "pdf")}
                className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="html" id="fmt-html" />
                <Label htmlFor="fmt-html" className="font-normal cursor-pointer">HTML</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="fmt-pdf" disabled />
                <Label htmlFor="fmt-pdf" className="font-normal cursor-pointer opacity-50 text-muted-foreground">PDF (not ready yet)</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
            <Button size="sm" onClick={handleExport}>Export</Button>
        </div>
      </div>
    </div>
  );
}
