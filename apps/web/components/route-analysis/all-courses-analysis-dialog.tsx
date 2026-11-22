"use client"

import { useState, useEffect, useMemo, useRef } from "react";
import { X, Loader2, StopCircle } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { createEventRouteAnalyzer, getCourseDifficulty, getDifficultyCategory } from "@indoor-o-route-analysis/core";
import { getCourseControlLabels, getActualCourseControls } from "@indoor-o-route-analysis/core";
import { DifficultyTag } from "./difficulty-tag";
import { ScoringModelSelect, escapeHtml, safeHttpUrl } from "@/components/shared";
import { DIFFICULTY_CATEGORIES } from "@indoor-o-route-analysis/core";
import type { Leg } from "@indoor-o-route-analysis/core";
import type { ScoringModel } from "@indoor-o-route-analysis/core";
import { ScoringModelRegistry } from "@indoor-o-route-analysis/core";
import type { EventData, Course, Control, ClassCourseAssignment } from "@indoor-o-route-analysis/core";

interface AllCoursesAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventData;
  initialScoringModelId?: string;
  runningSpeed: number;
}

interface CourseAnalysisResult {
  courseId: string;
  courseName: string;
  targetDifficulty?: string; // e.g. "white", "yellow", "orange", "purple", "black"
  assignedClasses: string; // comma-separated list of assigned class names
  length: number; // meters
  totalClimb: number; // meters
  estimatedTime: number; // seconds
  maxDifficulty: number;
  averageDifficulty: number;
  maxDifficulty2?: number; // For second scoring model
  averageDifficulty2?: number; // For second scoring model
  mostDifficultLeg: {
    label: string; // e.g. "1-2"
    codes: string; // e.g. "31-32" (from-to codes)
    difficulty: number;
  } | null;
  status: "pending" | "analyzing" | "completed" | "error";
  legs: Leg[];
}

export default function AllCoursesAnalysisDialog({
  isOpen,
  onClose,
  event,
  initialScoringModelId,
  runningSpeed,
}: AllCoursesAnalysisDialogProps) {
  const [results, setResults] = useState<CourseAnalysisResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cancelledRef = useRef(false);

  // Scoring model state
  const [scoringModelId, setScoringModelId] = useState<string>(
    initialScoringModelId || ScoringModelRegistry.getDefaultModel().getFullId()
  );
  const [secondScoringModelId, setSecondScoringModelId] = useState<string | null>(null);

  // Get actual scoring model instances
  const scoringModel = useMemo(() => 
    ScoringModelRegistry.getModelOrDefault(scoringModelId), 
    [scoringModelId]
  );
  const secondScoringModel = useMemo(() => 
    secondScoringModelId ? ScoringModelRegistry.getModel(secondScoringModelId) : undefined,
    [secondScoringModelId]
  );

  // Track if we need to re-run analysis
  const [analysisKey, setAnalysisKey] = useState(0);

  // Trigger re-analysis when scoring models change
  useEffect(() => {
    if (isOpen && results.length > 0) {
      setAnalysisKey(k => k + 1);
    }
  }, [scoringModelId, secondScoringModelId, isOpen, results.length]);

  // Initialize results state when dialog opens or analysis key changes
  useEffect(() => {
    const courses = event?.raceCourses?.[0]?.courses;
    const classAssignments = event?.raceCourses?.[0]?.classAssignments || [];
    if (isOpen && event && courses) {
      // Reset cancellation flag when starting new analysis
      cancelledRef.current = false;
      const initialResults: CourseAnalysisResult[] = courses.map((course: Course) => {
        const courseName = course.name || "Untitled Course";
        const assignedClasses = classAssignments
          .filter((a: ClassCourseAssignment) => a.courseName === courseName)
          .map((a: ClassCourseAssignment) => a.className)
          .join(", ");
        return {
          courseId: course.id,
          courseName,
          targetDifficulty: course.targetDifficulty,
          assignedClasses,
          length: 0,
        totalClimb: 0,
        estimatedTime: 0,
        maxDifficulty: 0,
        averageDifficulty: 0,
        maxDifficulty2: undefined,
        averageDifficulty2: undefined,
        mostDifficultLeg: null,
        status: "pending",
        legs: [],
        };
      });
      setResults(initialResults);
      setProgress(0);
      setIsAnalyzing(true);
    }
  }, [isOpen, event, analysisKey]);

  // Run analysis
  useEffect(() => {
    if (!isOpen || !isAnalyzing || !event) return;

    const courses = event.raceCourses?.[0]?.courses || [];
    const controls = event.raceCourses?.[0]?.controls || [];
    const routeAnalyzer = createEventRouteAnalyzer(event, { scoringModel });

    const analyzeAll = async () => {
      const totalCourses = courses.length;

      for (let i = 0; i < totalCourses; i++) {
        if (cancelledRef.current) break;
        
        const course = courses[i];
        
        // Update status to analyzing
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "analyzing" } : r));

        // Yield to UI
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
          const courseControls = getActualCourseControls(course.controls || [], controls);
          const legs: Leg[] = [];
          
          if (courseControls.length >= 2) {
            const courseLabels = getCourseControlLabels(courseControls, controls);

            for (let j = 0; j < courseControls.length - 1; j++) {
              if (cancelledRef.current) break;

              const fromCC = courseControls[j];
              const toCC = courseControls[j+1];
              
              const fromControl = controls.find((c: Control) => c.id === fromCC.controlId);
              const toControl = controls.find((c: Control) => c.id === toCC.controlId);
              
              if (fromControl && toControl) {
                 // Find best route
                 const alternatives = routeAnalyzer.findAlternativePathsBetweenControls(
                   fromCC.controlId, 
                   toCC.controlId, 
                   1 // We only need the best route for basic stats
                 );
                 
                 const bestRoute = alternatives[0] || { distance: 0, difficulty: 0, decisionPoints: 0, alternativeEdges: 0, totalClimb: 0 };
                 
                 const fromLabel = courseLabels[j];
                 const toLabel = courseLabels[j + 1];
                 
                 legs.push({
                   id: j,
                   label: `${fromLabel} → ${toLabel}`,
                   fromControlId: fromControl.id,
                   toControlId: toControl.id,
                   shortestDistance: bestRoute.distance,
                   totalClimb: bestRoute.totalClimb || 0,
                   difficulty: bestRoute.difficulty,
                   decisionPoints: bestRoute.decisionPoints,
                   alternativeEdges: bestRoute.alternativeEdges
                 });
              }
            }
          }

          if (cancelledRef.current) break;

          // Process stats
          const totalLength = legs.reduce((sum, leg) => sum + leg.shortestDistance, 0);
          const totalClimb = legs.reduce((sum, leg) => sum + (leg.totalClimb || 0), 0);
          const estimatedTime = totalLength / runningSpeed;
          const maxDifficulty = getCourseDifficulty(legs, scoringModel);
          const averageDifficulty = scoringModel.getCourseAverageDifficulty(legs);
          
          // Calculate with second scoring model if available
          let maxDifficulty2: number | undefined;
          let averageDifficulty2: number | undefined;
          if (secondScoringModel) {
            // Re-analyze legs with second scoring model
            const routeAnalyzer2 = createEventRouteAnalyzer(event, { scoringModel: secondScoringModel });
            const legs2: Leg[] = [];
            for (let j = 0; j < courseControls.length - 1; j++) {
              const fromCC = courseControls[j];
              const toCC = courseControls[j+1];
              const fromControl = controls.find((c: Control) => c.id === fromCC.controlId);
              const toControl = controls.find((c: Control) => c.id === toCC.controlId);
              if (fromControl && toControl) {
                const alternatives2 = routeAnalyzer2.findAlternativePathsBetweenControls(
                  fromCC.controlId,
                  toCC.controlId,
                  1
                );
                const bestRoute2 = alternatives2[0] || { distance: 0, difficulty: 0, decisionPoints: 0, alternativeEdges: 0, totalClimb: 0 };
                legs2.push({
                  id: j,
                  label: "",
                  fromControlId: fromControl.id,
                  toControlId: toControl.id,
                  shortestDistance: bestRoute2.distance,
                  totalClimb: bestRoute2.totalClimb || 0,
                  difficulty: bestRoute2.difficulty,
                  decisionPoints: bestRoute2.decisionPoints,
                  alternativeEdges: bestRoute2.alternativeEdges
                });
              }
            }
            maxDifficulty2 = getCourseDifficulty(legs2, secondScoringModel);
            averageDifficulty2 = secondScoringModel.getCourseAverageDifficulty(legs2);
          }
          
          let mostDifficultLeg = null;
          if (legs.length > 0) {
            const maxDiff = Math.max(...legs.map(l => l.difficulty));
            const difficultLeg = legs.find(l => l.difficulty === maxDiff);
            
            if (difficultLeg) {
            const fromC = controls.find((c: Control) => c.id === difficultLeg.fromControlId);
            const toC = controls.find((c: Control) => c.id === difficultLeg.toControlId);
              mostDifficultLeg = {
                label: difficultLeg.label,
                codes: `${fromC?.id || "?"}-${toC?.id || "?"}`,
                difficulty: difficultLeg.difficulty
              };
            }
          }

          setResults(prev => prev.map((r, idx) => idx === i ? {
            ...r,
            length: totalLength,
            totalClimb,
            estimatedTime,
            maxDifficulty,
            averageDifficulty,
            maxDifficulty2,
            averageDifficulty2,
            mostDifficultLeg,
            status: "completed",
            legs
          } : r));

        } catch (err) {
          console.error(`Error analyzing course ${course.id}`, err);
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "error" } : r));
        }

        setProgress(Math.round(((i + 1) / totalCourses) * 100));
      }
      
      setIsAnalyzing(false);
    };

    analyzeAll();

    return () => {
      cancelledRef.current = true;
    };
  }, [isOpen, event, scoringModel, secondScoringModel, runningSpeed, isAnalyzing]);

  if (!isOpen) return null;

  const handleCancel = () => {
    cancelledRef.current = true;
    setIsAnalyzing(false);
  };

  const handleClose = () => {
    cancelledRef.current = true;
    setIsAnalyzing(false);
    onClose();
  };

  const exportHtml = () => {
    const eventNameRaw = event?.name || "Event";
    const eventNameDisplay = escapeHtml(eventNameRaw);
    const eventUrl = safeHttpUrl(event?.eventUrl);

    const getEventDate = () => {
        if (event?.startTime?.date) return typeof event.startTime.date === 'string' ? event.startTime.date.split('T')[0] : new Date(event.startTime.date).toISOString().split('T')[0];
        return new Date().toISOString().split('T')[0];
    };
    const eventDateStr = getEventDate();

    const renderDiffBadge = (diff: number, model: ScoringModel) => {
        const cat = getDifficultyCategory(diff, model);
        const bg = cat.color || "#e0e0e0";
        const fg = cat.textColor || "#000000";
        return `<span style="display:inline-block;background-color:${bg};color:${fg};padding:2px 6px;border-radius:4px;font-weight:bold;font-size:0.85em;">D${Math.round(diff)}</span>`;
    };

    const scoringModelInfo = secondScoringModel 
      ? `<strong>Scoring Models:</strong> ${scoringModel.name} v${scoringModel.version}, ${secondScoringModel.name} v${secondScoringModel.version}`
      : `<strong>Scoring Model:</strong> ${scoringModel.name} v${scoringModel.version}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${eventNameDisplay}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { margin-bottom: 20px; }
    .event-link { margin-bottom: 20px; font-size: 1em; }
    .event-link a { color: #0066cc; text-decoration: none; }
    .event-link a:hover { text-decoration: underline; }
    .meta { margin-bottom: 30px; font-size: 0.9em; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; vertical-align: middle; }
    th { background-color: #f5f5f5; font-weight: 600; }
    tr:hover { background-color: #f9f9f9; }
    .timestamp { margin-top: 40px; font-size: 0.8em; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>${eventNameDisplay}</h1>
  ${eventUrl ? `<div class="event-link"><a href="${escapeHtml(eventUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(eventUrl)}</a></div>` : ''}
  <div class="meta">
    <strong>Date:</strong> ${eventDateStr}<br>
    ${scoringModelInfo}<br>
    <strong>Running Speed:</strong> ${runningSpeed} m/s
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Course</th>
        <th>Category</th>
        <th>Classes</th>
        <th>Length</th>
        <th>Climb</th>
        <th>Estimated running time</th>
        <th>Difficulty (${scoringModel.name})</th>
        ${secondScoringModel ? `<th>Difficulty (${secondScoringModel.name})</th>` : ''}
        <th>Most difficult leg</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(r => {
        const timeMin = Math.floor(r.estimatedTime / 60);
        const timeSec = Math.round(r.estimatedTime % 60);
        const timeStr = `${timeMin}:${timeSec.toString().padStart(2, '0')}`;
        
        let mostDiffLegContent = "-";
        if (r.mostDifficultLeg) {
             mostDiffLegContent = `<span>${escapeHtml(r.mostDifficultLeg.label)}</span>`;
        }

        const cat = r.targetDifficulty ? DIFFICULTY_CATEGORIES.find(c => c.label.toLowerCase() === r.targetDifficulty) : undefined;
        const categoryHtml = cat
          ? `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;border:1px solid #ccc;background-color:${cat.color};"></span>${cat.label}</span>`
          : "—";

        return `<tr>
          <td>${escapeHtml(r.courseName)}</td>
          <td>${categoryHtml}</td>
          <td>${escapeHtml(r.assignedClasses || "—")}</td>
          <td>${r.length.toFixed(0)} m</td>
          <td>${(r.totalClimb || 0).toFixed(0)} m</td>
          <td>${timeStr}</td>
          <td>${renderDiffBadge(r.maxDifficulty, scoringModel)}</td>
          ${secondScoringModel && r.maxDifficulty2 !== undefined ? `<td>${renderDiffBadge(r.maxDifficulty2, secondScoringModel)}</td>` : (secondScoringModel ? '<td>—</td>' : '')}
          <td>${mostDiffLegContent}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  
  <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
</body>
</html>`;

    const sanitizeNamePart = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "-").trim();
    const eventFilenamePart = sanitizeNamePart(eventNameRaw);
    const filename = `${eventDateStr} ${eventFilenamePart} - course analysis summary.html`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isCompleted = results.every(r => r.status === "completed" || r.status === "error");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Analyse All Courses</h2>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scoring Model Selectors */}
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Scoring Model:</label>
            <ScoringModelSelect
              value={scoringModelId}
              onValueChange={setScoringModelId}
              disabled={isAnalyzing}
              className="w-[180px] h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Compare with:</label>
            <ScoringModelSelect
              value={secondScoringModelId || "none"}
              onValueChange={(value) => setSecondScoringModelId(value === "none" ? null : value)}
              disabled={isAnalyzing}
              className="w-[180px] h-8 text-xs"
              extraOption={{ value: "none", label: "None" }}
              excludeIds={[scoringModelId]}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Course Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Classes</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Length</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Climb</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Est. Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground" title={`Max difficulty using ${scoringModel.name}`}>
                  Max Diff ({scoringModel.name})
                </th>
                {secondScoringModel && (
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground" title={`Max difficulty using ${secondScoringModel.name}`}>
                    Max Diff ({secondScoringModel.name})
                  </th>
                )}
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Most Difficult Leg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((result) => {
                 const timeMin = Math.floor(result.estimatedTime / 60);
                 const timeSec = Math.round(result.estimatedTime % 60);
                 const timeStr = `${timeMin}:${timeSec.toString().padStart(2, '0')}`;

                 return (
                   <tr key={result.courseId} className="hover:bg-muted/30">
                     <td className="px-4 py-3 font-medium">{result.courseName}</td>
                     <td className="px-4 py-3 text-xs">
                       {(() => {
                         const cat = result.targetDifficulty ? DIFFICULTY_CATEGORIES.find(c => c.label.toLowerCase() === result.targetDifficulty) : undefined;
                         return cat ? (
                           <span className="flex items-center gap-2">
                             <span className="inline-block w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: cat.color }} />
                             {cat.label}
                           </span>
                         ) : "—";
                       })()}
                     </td>
                     <td className="px-4 py-3 text-xs text-muted-foreground">{result.assignedClasses || "—"}</td>
                     <td className="px-4 py-3 font-mono text-xs">
                       {result.length > 0 ? `${result.length.toFixed(0)} m` : "—"}
                     </td>
                     <td className="px-4 py-3 font-mono text-xs">
                       {result.length > 0 ? `${(result.totalClimb || 0).toFixed(0)} m` : "—"}
                     </td>
                     <td className="px-4 py-3 font-mono text-xs">
                       {result.estimatedTime > 0 ? timeStr : "—"}
                     </td>
                     <td className="px-4 py-3">
                       {result.maxDifficulty > 0 ? (
                         <div className="flex items-center gap-2">
                           <DifficultyTag 
                             difficulty={result.maxDifficulty} 
                             size="sm" 
                             scoringModel={scoringModel}
                           />
                         </div>
                       ) : "—"}
                     </td>
                     {secondScoringModel && (
                       <td className="px-4 py-3">
                         {result.maxDifficulty2 !== undefined && result.maxDifficulty2 > 0 ? (
                           <div className="flex items-center gap-2">
                             <DifficultyTag 
                               difficulty={result.maxDifficulty2} 
                               size="sm" 
                               scoringModel={secondScoringModel}
                             />
                           </div>
                         ) : "—"}
                       </td>
                     )}
                     <td className="px-4 py-3 text-xs">
                       {result.mostDifficultLeg ? (
                         <span className="font-semibold">{result.mostDifficultLeg.label}</span>
                       ) : "—"}
                     </td>
                   </tr>
                 );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {isAnalyzing ? (
               <span className="flex items-center gap-2">
                 <Loader2 className="h-3 w-3 animate-spin" />
                 Analyzing... {progress}%
               </span>
            ) : (
               <span>Analysis complete</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAnalyzing && (
              <Button variant="outline" onClick={handleCancel}>
                <StopCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button onClick={exportHtml} disabled={!isCompleted}>
              Export HTML Report
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
