"use client"

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Edit3, Layers, Route, Settings, BarChart3, Circle, Box, PenTool, Pickaxe, FlaskConical } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import EventManager from "@/components/event-manager";
import CourseSetting from "@/components/course-setting";
import DirectionsView from "@/components/directions";
import GraphEditor from "@/components/graph-editor";
import RouteBuilder from "@/components/route-builder";
import Model3D from "@/components/model-3d";
import RouteAnalysis from "@/components/route-analysis";
import EventAnalysis from "@/components/event-analysis";
import LabsPage from "@/components/labs";
import ModifyGraphPage from "@/components/modify-graph";
import LandingPage from "@/components/landing-page";
import FileMenu from "@/components/file-menu";
import { useUndoRedoShortcuts } from "@/components/use-undo-redo-shortcuts";
import { NotificationHost } from "@indoor-o-route-analysis/ui";
import { PreviewWarning } from "@/components/preview-warning";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { useFeatureFlags } from "@indoor-o-route-analysis/ui";
import { processImportedJSON, resolveLoadExampleParam } from "@indoor-o-route-analysis/core";
import { getMapFile } from "@indoor-o-route-analysis/core/storage";

type Screen =
  | "landing"
  | "event-manager"
  | "directions"
  | "course-setting"
  | "graph-editor"
  | "route-builder"
  | "route-analysis"
  | "event-analysis"
  | "labs"
  | "modify-graph"
  | "model-3d";

const NAVIGABLE_SCREENS: Screen[] = [
  "event-manager", "directions", "course-setting", "graph-editor", "route-builder",
  "route-analysis", "event-analysis", "labs", "modify-graph", "model-3d",
];

function screenFromPathname(pathname: string): Screen | null {
  const clean = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (clean === "") return null;
  if (NAVIGABLE_SCREENS.includes(clean as Screen)) return clean as Screen;
  return null;
}

function pathnameForScreen(screen: Screen): string {
  return screen === "event-manager" ? "/" : "/" + screen;
}

export default function App() {
  const [activeScreen, setActiveScreenState] = useState<Screen>("event-manager");
  // Event id → URL the event was loaded from (example repositories); used for share links
  const [exampleSourceUrls, setExampleSourceUrls] = useState<Record<string, string>>({});
  // Example just opened: Route Analysis selects its first leg once (see RouteAnalysis)
  const [selectFirstLegForEventId, setSelectFirstLegForEventId] = useState<string | null>(null);
  const handleExampleLoaded = useCallback((eventId: string, url: string) => {
    setExampleSourceUrls((prev) => ({ ...prev, [eventId]: url }));
    setSelectFirstLegForEventId(eventId);
  }, []);
  const clearSelectFirstLeg = useCallback(() => setSelectFirstLegForEventId(null), []);
  const { selectedEvent, unsavedChanges, addEvent, setSelectedCourseId } = useAppData();
  const { flags } = useFeatureFlags();
  useUndoRedoShortcuts();

  // Pending course name from URL — applied once the event is loaded
  const pendingCourseNameRef = useRef<string | null>(null);

  // Navigate to a screen and update the browser URL
  const navigateToScreen = useCallback((screen: Screen) => {
    setActiveScreenState(screen);
    const path = pathnameForScreen(screen);
    window.history.replaceState({ screen }, "", path);
  }, []);

  // Handle URL parameters on mount: load-example, course, and screen from pathname
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loadExample = params.get("load-example");
    const courseName = params.get("course");
    const screenParam = params.get("screen");

    // Determine initial screen from pathname
    const screenFromUrl = screenFromPathname(window.location.pathname);
    const screenFromParam = screenParam && NAVIGABLE_SCREENS.includes(screenParam as Screen)
      ? (screenParam as Screen)
      : null;
    const targetScreen = screenFromParam || screenFromUrl || "event-manager";

    if (courseName) {
      pendingCourseNameRef.current = courseName;
    }

    if (loadExample) {
      // A filename in the default example repository, or an absolute http(s) URL.
      // Security: plain filenames only (path traversal is rejected).
      const exampleUrl = resolveLoadExampleParam(loadExample);
      if (!exampleUrl) {
        console.error("Invalid example filename");
        setActiveScreenState(targetScreen);
        return;
      }

      (async () => {
        try {
          const res = await fetch(exampleUrl);
          if (!res.ok) throw new Error("Failed to fetch example");
          const data = await res.json();
          const { event: newEvent, pdfData } = await processImportedJSON(data, getMapFile);
          newEvent.id = crypto.randomUUID();
          await addEvent(newEvent, pdfData, true);
          handleExampleLoaded(newEvent.id, exampleUrl);

          // Select the course named in the URL, else the first course (like opening an example from the File menu)
          const courses = newEvent.raceCourses?.[0]?.courses;
          const matched = courseName ? courses?.find((c) => c.name === courseName) : undefined;
          if (matched) pendingCourseNameRef.current = null;
          setSelectedCourseId((matched ?? courses?.[0])?.id ?? null);
        } catch (e) {
          console.error("Failed to load example from URL:", e);
        }

        // Navigate to the target screen and strip query params
        setActiveScreenState(targetScreen);
        window.history.replaceState({ screen: targetScreen }, "", pathnameForScreen(targetScreen));
      })();
    } else {
      // No example to load — just apply screen from URL
      setActiveScreenState(targetScreen);
      // Clean the URL if there are stale query params
      if (window.location.search) {
        window.history.replaceState({ screen: targetScreen }, "", pathnameForScreen(targetScreen));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply pending course name when an event becomes available
  useEffect(() => {
    if (!pendingCourseNameRef.current || !selectedEvent) return;
    const courseName = pendingCourseNameRef.current;
    const courses = selectedEvent.raceCourses?.[0]?.courses;
    const matched = courses?.find((c) => c.name === courseName);
    if (matched) {
      setSelectedCourseId(matched.id);
      pendingCourseNameRef.current = null;
    }
  }, [selectedEvent, setSelectedCourseId]);

  // Handle browser popstate (back/forward navigation)
  useEffect(() => {
    const handler = (event: PopStateEvent) => {
      if (event.state?.screen && NAVIGABLE_SCREENS.includes(event.state.screen)) {
        setActiveScreenState(event.state.screen);
      } else {
        const s = screenFromPathname(window.location.pathname);
        setActiveScreenState(s || "event-manager");
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      <NotificationHost />
      {/* Top Toolbar - Menu Bar Style */}
      <header
        className="flex h-8 items-center border-b border-border bg-card select-none"
      >
        {/* FileMenu */}
        <div>
          <FileMenu onNavigate={(screen) => navigateToScreen(screen as Screen)} onExampleLoaded={handleExampleLoaded} />
        </div>

        <div
          className="flex items-center"
        >
          <Button
            variant={activeScreen === "event-manager" ? "default" : "ghost"}
            onClick={() => navigateToScreen("event-manager")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <Settings className="h-4 w-4" />
            {"Event"}
          </Button>
          {flags.directions && (
          <Button
            variant={activeScreen === "directions" ? "default" : "ghost"}
            onClick={() => navigateToScreen("directions")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <Layers className="h-4 w-4" />
            {"Directions"}
          </Button>
          )}
          {flags.courseSetting && (
          <Button
            variant={activeScreen === "course-setting" ? "default" : "ghost"}
            onClick={() => navigateToScreen("course-setting")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <Edit3 className="h-4 w-4" />
            {"Course Setting"}
          </Button>
          )}
          <Button
            variant={activeScreen === "model-3d" ? "default" : "ghost"}
            onClick={() => navigateToScreen("model-3d")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <Box className="h-4 w-4" />
            {"Floors"}
          </Button>
          <Button
            variant={activeScreen === "graph-editor" ? "default" : "ghost"}
            onClick={() => navigateToScreen("graph-editor")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <Route className="h-4 w-4" />
            {"Graph"}
          </Button>
          {flags.routeBuilder && (
          <Button
            variant={activeScreen === "route-builder" ? "default" : "ghost"}
            onClick={() => navigateToScreen("route-builder")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <PenTool className="h-4 w-4" />
            {"Route Builder"}
          </Button>
          )}
          <Button
            variant={activeScreen === "route-analysis" ? "default" : "ghost"}
            onClick={() => navigateToScreen("route-analysis")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <BarChart3 className="h-4 w-4" />
            {"Route Analysis"}
          </Button>
          <Button
            variant={activeScreen === "event-analysis" ? "default" : "ghost"}
            onClick={() => navigateToScreen("event-analysis")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <BarChart3 className="h-4 w-4" />
            {"Event Analysis"}
          </Button>
          {flags.labs && (
          <Button
            variant={activeScreen === "labs" ? "default" : "ghost"}
            onClick={() => navigateToScreen("labs")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <FlaskConical className="h-4 w-4" />
            {"Labs"}
          </Button>
          )}
          {flags.modifyGraph && (
          <Button
            variant={activeScreen === "modify-graph" ? "default" : "ghost"}
            onClick={() => navigateToScreen("modify-graph")}
            className="h-8 px-2 gap-1 rounded-none"
            size="sm"
          >
            <Pickaxe className="h-4 w-4" />
            {"Modify"}
          </Button>
          )}
        </div>

        {/* Drag spacer - fills remaining space */}
        <div
          className="flex-1 h-full"
        />

        {/* Event title - right aligned */}
        {selectedEvent ? (
          <div className="flex items-center gap-2 px-2">
            <div
              className="text-xs text-muted-foreground truncate max-w-[300px]"
              title={selectedEvent.name || "Untitled Event"}
            >
              {selectedEvent.name || "Untitled Event"}
            </div>
            {unsavedChanges && <Circle className="h-2 w-2 fill-orange-500 text-orange-500" />}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2">
            <div className="text-xs text-muted-foreground">No Event Selected</div>
          </div>
        )}

      </header>
      <PreviewWarning />

      {/* Main Content */}
      {activeScreen === "landing" ? (
        <LandingPage />
      ) : activeScreen === "event-manager" ? (
        <EventManager />
      ) : activeScreen === "directions" && flags.directions ? (
        <DirectionsView />
      ) : activeScreen === "course-setting" && flags.courseSetting ? (
        <CourseSetting />
      ) : activeScreen === "modify-graph" ? (
        <ModifyGraphPage />
      ) : activeScreen === "graph-editor" ? (
        <GraphEditor />
      ) : activeScreen === "route-builder" ? (
        <RouteBuilder />
      ) : activeScreen === "route-analysis" ? (
        <RouteAnalysis
          exampleSourceUrls={exampleSourceUrls}
          selectFirstLegForEventId={selectFirstLegForEventId}
          onFirstLegSelected={clearSelectFirstLeg}
        />
      ) : activeScreen === "event-analysis" ? (
        <EventAnalysis />
      ) : activeScreen === "labs" ? (
        <LabsPage />
      ) : activeScreen === "model-3d" ? (
        <Model3D />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-muted-foreground">{"Select a screen from the toolbar above."}</div>
          </div>
        </div>
      )}
    </div>
  );
}
