"use client"

import { useState, useCallback, useRef, useEffect } from "react";
import { Menu, Plus, FolderOpen, Save, X as XIcon, FileUp, FileDown, Settings, Trash2, ChevronRight, ChevronDown, Info, Undo2, Redo2 } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getMapFile, getEventPdfData } from "@indoor-o-route-analysis/core/storage";
import { arrayBufferToBase64, mergeRaceCourse } from "@indoor-o-route-analysis/core";
import { ConfirmDialog } from "@indoor-o-route-analysis/ui";
import SettingsDialog from "@/components/settings-dialog";
import type { EventData, RaceCourseData } from "@indoor-o-route-analysis/core";
import { parseEventFromIOFXML, exportEventToIOFXML, assertValidEventStructure } from "@indoor-o-route-analysis/core";
import { serializeEventToJSON } from "@indoor-o-route-analysis/core";
import { processImportedJSON } from "@indoor-o-route-analysis/core";
import { openJsonFilePicker, saveJsonToFile } from "@/lib/file-picker";
import { NO, SE, FI, DK, GB, US, FR, CH, IT, ES, CZ } from 'country-flag-icons/react/3x2';
import { notify, useSettings } from "@indoor-o-route-analysis/ui";
import {
  fetchExampleIndex,
  repositoryLabel,
  resolveLoadExampleParam,
  exampleFilename,
  type ExampleIndexEntry,
} from "@indoor-o-route-analysis/core";

type FileMenuProps = {
  onNavigate?: (screen: string) => void;
  activeScreen?: string;
  /** Called after an example event was loaded from `url` (used for share links). */
  onExampleLoaded?: (eventId: string, url: string) => void;
};

type ExampleRepository = { indexUrl: string; label: string; entries: ExampleIndexEntry[]; error?: string };

// country-flag-icons Props type collapses className/title under React 19 types
const flagProps = (className: string, title: string) =>
  ({ className, title } as Record<string, string>);

function CountryFlag({ country }: { country?: string }) {
  if (!country) return null;
  const code = country.toLowerCase();
  const cls = "w-4 h-3 flex-none"; // Fixed size for menu items

  switch (code) {
    case "sweden": return <SE {...flagProps(cls, country)} />;
    case "norway": return <NO {...flagProps(cls, country)} />;
    case "finland": return <FI {...flagProps(cls, country)} />;
    case "denmark": return <DK {...flagProps(cls, country)} />;
    case "uk": return <GB {...flagProps(cls, country)} />;
    case "usa": return <US {...flagProps(cls, country)} />;
    case "france": return <FR {...flagProps(cls, country)} />;
    case "switzerland": return <CH {...flagProps(cls, country)} />;
    case "italy": return <IT {...flagProps(cls, country)} />;
    case "spain": return <ES {...flagProps(cls, country)} />;
    case "czech republic":
    case "czechia": return <CZ {...flagProps(cls, country)} />;
    default: return null;
  }
}


/**
 * Build a serialized JSON string for the event, embedding PDF data if needed.
 */
async function buildEventJSON(
  selectedEvent: EventData,
  currentPdfData: ArrayBuffer | null,
): Promise<string> {
  const eventData = { ...selectedEvent };
  const mapData = eventData.raceCourses?.[0]?.maps?.[0];

  if (mapData && mapData.saveEncoded) {
    let pdfData: ArrayBuffer | undefined = currentPdfData || undefined;
    if (!pdfData && mapData.id) {
      pdfData = await getMapFile(mapData.id);
    }
    if (!pdfData) {
      pdfData = await getEventPdfData(eventData.id);
    }
    if (pdfData) {
      const newMap = { ...mapData, image: { ...mapData.image } };
      newMap.image.encodedData = arrayBufferToBase64(pdfData);
      if (eventData.raceCourses && eventData.raceCourses[0].maps) {
        const newRaceCourses = [...eventData.raceCourses];
        const course = newRaceCourses[0];
        if (course) {
          const existingMaps = course.maps ?? [];
          const updatedMaps = [...existingMaps];
          updatedMaps[0] = newMap;
          newRaceCourses[0] = { ...course, maps: updatedMaps };
          eventData.raceCourses = newRaceCourses;
        }
      }
    }
  }

  return serializeEventToJSON(eventData);
}

export default function FileMenu({ onNavigate, activeScreen: _activeScreen, onExampleLoaded }: FileMenuProps) {
  const {
    selectedEvent,
    setSelectedEventId,
    updateEvent,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    addEvent,
    unsavedChanges,
    saveCurrentEvent,
    discardChanges,
    fileHandle,
    setFileHandle,
    recentFiles,
    persistToDB,
    setPersistToDB,
    runningSpeed,
    setRunningSpeed,
    routeAnalysisK,
    setRouteAnalysisK,
    routeEnumerationAlgorithm,
    setRouteEnumerationAlgorithm,
    markAsSaved,
    currentPdfData,
    clearRecentFilesList,
    addRecentFileHandle,
    eventFilenames,
    setEventFilename,
    setSelectedCourseId,
  } = useAppData();

  const [showMenu, setShowMenu] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const importIOFInputRef = useRef<HTMLInputElement>(null);
  const { exampleRepositories } = useSettings();
  const [exampleRepos, setExampleRepos] = useState<ExampleRepository[]>([]);
  const [openSubmenu, setOpenSubmenu] = useState<'examples' | 'recent' | null>(null);

  // Load the index.json of every configured example repository (Settings → Examples)
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      exampleRepositories.map(async (indexUrl): Promise<ExampleRepository> => {
        const label = repositoryLabel(indexUrl);
        try {
          return { indexUrl, label, entries: await fetchExampleIndex(indexUrl) };
        } catch (err) {
          console.error(`Failed to load example index ${indexUrl}`, err);
          return { indexUrl, label, entries: [], error: (err as Error).message || "Failed to load" };
        }
      }),
    ).then((repos) => {
      if (!cancelled) setExampleRepos(repos);
    });
    return () => {
      cancelled = true;
    };
  }, [exampleRepositories]);

  const selectedEventRef = useRef(selectedEvent);
  const fileHandleRef = useRef(fileHandle);

  // Update refs
  if (selectedEventRef.current !== selectedEvent) {
    selectedEventRef.current = selectedEvent;
  }
  if (fileHandleRef.current !== fileHandle) {
    fileHandleRef.current = fileHandle;
  }

  // --- Helper: get suggested filename ---
  const getSuggestedFilename = useCallback(() => {
    if (!selectedEvent) return "event.json";
    const savedName = eventFilenames[selectedEvent.id];
    if (fileHandle?.name) return fileHandle.name;
    if (savedName) return savedName;
    const dateStr = selectedEvent.startTime.date || new Date().toISOString().split("T")[0];
    const titleStr = selectedEvent.name || "Untitled";
    return `${dateStr} ${titleStr}.json`;
  }, [selectedEvent, eventFilenames, fileHandle]);

  // --- Open File ---
  const openLocalFile = useCallback(async () => {
    try {
      const handle = await openJsonFilePicker();

      if (handle) {
        const file = await handle.getFile();
        const text = await file.text();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let importedData: any;
        try {
          importedData = JSON.parse(text);
        } catch {
          notify("Failed to parse JSON file.", { kind: "error" });
          return;
        }

        const { event: newEvent, pdfData } = await processImportedJSON(importedData, getMapFile);

        await addEvent(newEvent, pdfData, true);
        if (handle.name) {
          await setEventFilename(newEvent.id, handle.name);
        }

        setFileHandle(handle);
        if (onNavigate) onNavigate("event-manager");
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        console.error(err);
        notify("Error opening file: " + err.message, { kind: "error" });
      }
    }
  }, [addEvent, setFileHandle, onNavigate, setEventFilename]);

  // --- Open Recent File ---
  const handleOpenRecentFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (recentItem: any) => {
      // Web: use File System Access API handle
      const handle = recentItem?.handle || recentItem;
      if (!handle || !handle.getFile) {
        // Handles can't be persisted in localStorage - fall back to file picker
        openLocalFile();
        return;
      }

      try {
        const options = { mode: "read" };

        if (handle.queryPermission) {
          const status = await handle.queryPermission(options);
          if (status !== "granted") {
            const requestStatus = await handle.requestPermission(options);
            if (requestStatus !== "granted") return;
          }
        }

        const file = await handle.getFile();
        const text = await file.text();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let importedData: any;
        try {
          importedData = JSON.parse(text);
        } catch {
          notify("Failed to parse JSON file.", { kind: "error" });
          return;
        }

        const { event: newEvent, pdfData } = await processImportedJSON(importedData, getMapFile);
        newEvent.id = crypto.randomUUID();

        await addEvent(newEvent, pdfData, true);
        if (handle.name) {
          await setEventFilename(newEvent.id, handle.name);
        }

        setFileHandle(handle);
        if (onNavigate) onNavigate("event-manager");
      } catch (err) {
        console.error("Error opening recent file", err);
        notify("Failed to open file: " + (err as Error).message, { kind: "error" });
      }
    },
    [addEvent, setFileHandle, onNavigate, openLocalFile, setEventFilename],
  );

  // Auto-save timer
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (autoSaveEnabled) {
      intervalId = setInterval(async () => {
        const currentEvent = selectedEventRef.current;
        const currentHandle = fileHandleRef.current;

        if (currentEvent && currentHandle) {
          console.log("Auto-saving to file...");
          try {
            if (currentHandle.createWritable) {
              // Web: File System Access API
              const eventData = { ...currentEvent };
              const jsonString = JSON.stringify(eventData, null, 2);
              const writable = await currentHandle.createWritable();
              await writable.write(jsonString);
              await writable.close();
            }
          } catch (e) {
            console.error("Auto-save failed", e);
          }
        }
      }, 5 * 60 * 1000);
    }
    return () => clearInterval(intervalId);
  }, [autoSaveEnabled]);

  // --- Keyboard shortcuts (Ctrl+S, Ctrl+O) ---
  const saveToLocalFileRef = useRef<(() => void) | undefined>(undefined);
  const openLocalFileRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          saveToLocalFileRef.current?.();
          break;
        case 'o':
          e.preventDefault();
          openLocalFileRef.current?.();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Action Handlers ---

  const executeAction = useCallback(
    (action: () => void) => {
      if (unsavedChanges) {
        setPendingAction(() => action);
        setShowUnsavedDialog(true);
      } else {
        action();
      }
    },
    [unsavedChanges]
  );

  const handleDiscardUnsaved = async () => {
    await discardChanges();
    setShowUnsavedDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const createNewEvent = useCallback(async () => {
    try {
      const newEvent: EventData = {
        id: crypto.randomUUID(),
        name: "New Event",
        startTime: { date: new Date().toISOString().split("T")[0] },
        raceCourses: [
          {
            courses: [],
            controls: [],
            maps: [
              {
                id: crypto.randomUUID(),
                scale: 1000,
                image: { url: "", width: 0, height: 0 },
                mapPositionTopLeft: { x: 0, y: 0 },
                layout: "horizontal",
              },
            ],
            vertices: [],
            edges: [],
            polygons: [],
          },
        ],
        country: "",
      };
      await addEvent(newEvent);
      setFileHandle(null);
      if (onNavigate) onNavigate("event-manager");
    } catch (error) {
      console.error("Error adding event:", error);
    }
  }, [addEvent, setFileHandle, onNavigate]);

  // --- Open Example --- `url` is an absolute URL from a repository index; recent-file
  // entries from older versions may hold a bare filename (resolved against the default repository).
  const openExample = useCallback(
    async (url: string) => {
      try {
        const fullUrl = resolveLoadExampleParam(url);
        if (!fullUrl) throw new Error(`Invalid example URL: ${url}`);
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch example event");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const importedData: any = await response.json();

        const { event: newEvent, pdfData } = await processImportedJSON(importedData, getMapFile);

        // Ensure ID is new
        newEvent.id = crypto.randomUUID();
        newEvent.startTime.date = newEvent.startTime.date || new Date().toISOString().split("T")[0];

        await addEvent(newEvent, pdfData, true);
        const filename = exampleFilename(fullUrl);
        if (filename) {
          await setEventFilename(newEvent.id, filename);
        }
        setFileHandle(null);
        await addRecentFileHandle({ name: newEvent.name || filename, url: fullUrl });
        onExampleLoaded?.(newEvent.id, fullUrl);
        // Examples open straight in Route Analysis with the first course (and, via app-shell, its first leg and route) selected
        setSelectedCourseId(newEvent.raceCourses?.[0]?.courses?.[0]?.id ?? null);
        if (onNavigate) onNavigate("route-analysis");
      } catch (error) {
        console.error("Error importing example event:", error);
        notify("Failed to import example event. Please check the repository and your network connection.", { kind: "error" });
      }
    },
    [addEvent, setEventFilename, setFileHandle, onNavigate, addRecentFileHandle, setSelectedCourseId, onExampleLoaded],
  );

  // --- Save ---
  const saveToLocalFile = useCallback(async () => {
    if (!selectedEvent) return;

    const jsonString = await buildEventJSON(selectedEvent, currentPdfData);
    const suggestedName = getSuggestedFilename();

    try {
      // File System Access API where available, browser download fallback otherwise (Firefox/Safari).
      const { handle, saved } = await saveJsonToFile(jsonString, suggestedName, fileHandle);
      if (!saved) return;

      if (handle) setFileHandle(handle);
      await saveCurrentEvent();

      const savedName = handle?.name ?? suggestedName;
      if (savedName && eventFilenames[selectedEvent.id] !== savedName) {
        await setEventFilename(selectedEvent.id, savedName);
      }

      markAsSaved();
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        console.error(err);
        notify("Error saving file: " + err.message, { kind: "error" });
      }
    }
  }, [selectedEvent, fileHandle, setFileHandle, saveCurrentEvent, markAsSaved, currentPdfData, eventFilenames, setEventFilename, getSuggestedFilename]);

  // --- Save As ---
  const saveAsLocalFile = useCallback(async () => {
    if (!selectedEvent) return;

    const jsonString = await buildEventJSON(selectedEvent, currentPdfData);
    const suggestedName = getSuggestedFilename();

    try {
      // "Save As" always prompts for a new location — pass no existing handle.
      const { handle, saved } = await saveJsonToFile(jsonString, suggestedName, null);
      if (!saved) return;

      if (handle) setFileHandle(handle);
      await saveCurrentEvent();

      const savedName = handle?.name ?? suggestedName;
      if (savedName && eventFilenames[selectedEvent.id] !== savedName) {
        await setEventFilename(selectedEvent.id, savedName);
      }

      markAsSaved();
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        console.error(err);
        notify("Error saving file: " + err.message, { kind: "error" });
      }
    }
  }, [selectedEvent, setFileHandle, saveCurrentEvent, markAsSaved, currentPdfData, eventFilenames, setEventFilename, getSuggestedFilename]);

  // Update refs for keyboard shortcuts
  saveToLocalFileRef.current = saveToLocalFile;
  openLocalFileRef.current = openLocalFile;

  const handleConfirmUnsaved = async () => {
    if (persistToDB) {
      await saveCurrentEvent();
    }
    setShowUnsavedDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Helper function to download file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export as IOF XML
  const exportIOFXML = useCallback(async () => {
    if (!selectedEvent) return;

    const xml = exportEventToIOFXML(selectedEvent);
    const dateStr = selectedEvent.startTime.date || new Date().toISOString().split("T")[0];
    const filename = `${dateStr} ${selectedEvent.name}.xml`;

    downloadFile(xml, filename, "application/xml");
  }, [selectedEvent]);

  // --- Import IOF XML ---
  const handleImportXML = useCallback(
    async (file: File) => {
      if (!selectedEvent) return;

      try {
        const text = await file.text();
        const parsed = parseEventFromIOFXML(text);
        // Same structural check as JSON files: reject malformed data before merging it into the event
        assertValidEventStructure({ id: selectedEvent.id, name: parsed.name ?? "", raceCourses: parsed.raceCourses });

        const currentRaceCourse = selectedEvent.raceCourses?.[0] || { controls: [], courses: [] };

        // Merge Controls
        const updatedControls = [...(currentRaceCourse.controls || [])];
        const parsedControls = parsed.raceCourses?.[0].controls || [];

        let changedControlsCount = 0;

        parsedControls.forEach((pc) => {
          const existingIndex = updatedControls.findIndex((c) => c.id === pc.id);
          if (existingIndex >= 0) {
            changedControlsCount++;
            updatedControls[existingIndex] = {
              ...updatedControls[existingIndex],
              ...pc,
              mapPosition: pc.mapPosition || updatedControls[existingIndex].mapPosition,
            };
          } else {
            if (!updatedControls.some((c) => c.id === pc.id)) {
              updatedControls.push(pc);
            }
          }
        });

        // Merge Courses
        const updatedCourses = [...(currentRaceCourse.courses || [])];
        const parsedCourses = parsed.raceCourses?.[0].courses || [];

        parsedCourses.forEach((pc) => {
          const existingIndex = updatedCourses.findIndex((c) => c.name === pc.name);
          if (existingIndex >= 0) {
            updatedCourses[existingIndex] = { ...updatedCourses[existingIndex], controls: pc.controls };
          } else {
            updatedCourses.push(pc);
          }
        });

        // Extension: Routes (Vertices/Edges)
        const parsedVertices = parsed.raceCourses?.[0].vertices || [];
        const parsedEdges = parsed.raceCourses?.[0].edges || [];

        // Class/Course Assignments - replace entirely to match XML content
        const parsedClassAssignments = parsed.raceCourses?.[0].classAssignments || [];

        // Build update object
        const raceCourseUpdate: Partial<RaceCourseData> = {};
        if (parsedControls.length > 0) raceCourseUpdate.controls = updatedControls;
        if (parsedCourses.length > 0) raceCourseUpdate.courses = updatedCourses;
        if (parsedVertices.length > 0 || parsedEdges.length > 0) {
          raceCourseUpdate.vertices = parsedVertices.length > 0 ? parsedVertices : currentRaceCourse.vertices || [];
          raceCourseUpdate.edges = parsedEdges.length > 0 ? parsedEdges : currentRaceCourse.edges || [];
        }
        raceCourseUpdate.classAssignments = parsedClassAssignments;

        // Merge into the latest event (the file read and parse are async)
        await updateEvent(selectedEvent.id, (e) => ({
          ...mergeRaceCourse(e, raceCourseUpdate),
          country: parsed.country || e.country || "",
          eventUrl: parsed.eventUrl || e.eventUrl,
          eventImageUrl: parsed.eventImageUrl || e.eventImageUrl,
        }), undefined, { label: "Import IOF XML" });

        notify(`Import successful!
Courses imported: ${parsedCourses.length}
Controls imported: ${parsedControls.length}
Controls changed: ${changedControlsCount}
Class assignments: ${parsedClassAssignments.length}`, { kind: "success" });

      } catch (e) {
        console.error("Failed to import IOF XML:", e);
        notify("Failed to import IOF XML: " + (e instanceof Error ? e.message : String(e)), { kind: "error" });
      }
    },
    [selectedEvent, updateEvent],
  );

  const onNewEvent = () => executeAction(createNewEvent);
  const onOpenEvent = () => executeAction(openLocalFile);
  const onSaveEvent = () => saveToLocalFile();
  const onSaveAsEvent = () => saveAsLocalFile();
  const onCloseEvent = () =>
    executeAction(() => {
      setSelectedEventId(null);
      setFileHandle(null);
    });

  const closeMenu = () => {
    setShowMenu(false);
    setOpenSubmenu(null);
  };

  return (
    <>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (showMenu) setOpenSubmenu(null);
            setShowMenu(!showMenu);
          }}
          className="rounded-none h-8 w-8"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <div className="absolute top-full left-0 mt-0 w-56 bg-card border border-border shadow-lg py-1 z-50">
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  onNewEvent();
                }}
              >
                <Plus className="h-4 w-4" /> New
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  onOpenEvent();
                }}
              >
                <FolderOpen className="h-4 w-4" /> Open...
              </button>

              {exampleRepos.length > 0 && (
                <div className="relative">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmenu(openSubmenu === "examples" ? null : "examples");
                    }}
                  >
                    <span className="w-4 flex-none" />
                    <span>Examples</span>
                    <span className="ml-auto">
                      {openSubmenu === "examples" ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                  {openSubmenu === "examples" && (
                    <div className="w-full bg-accent/5 sm:absolute sm:left-full sm:top-0 sm:w-80 sm:max-h-[70vh] sm:overflow-y-auto sm:bg-popover sm:border sm:border-border sm:shadow-lg sm:py-1 sm:-ml-1">
                      {exampleRepos.map((repo) => (
                        <div key={repo.indexUrl}>
                          {exampleRepos.length > 1 && (
                            <div
                              className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground truncate pl-8 sm:pl-4"
                              title={repo.indexUrl}
                            >
                              {repo.label}
                            </div>
                          )}
                          {repo.error && (
                            <div className="px-4 py-1 text-xs text-destructive pl-8 sm:pl-4" title={repo.indexUrl}>
                              Could not load: {repo.error}
                            </div>
                          )}
                          {repo.entries.map((item) => (
                            <button
                              key={item.url}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 pl-8 sm:pl-4"
                              onClick={() => {
                                closeMenu();
                                executeAction(() => openExample(item.url));
                              }}
                              title={item.title || exampleFilename(item.url)}
                            >
                              <CountryFlag country={item.country} />
                              <span className="truncate">{item.title || exampleFilename(item.url).replace(/\.json$/, "")}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recentFiles.length > 0 && (
                <div className="relative">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmenu(openSubmenu === "recent" ? null : "recent");
                    }}
                  >
                    <span className="w-4 flex-none" />
                    <span>Recent Files</span>
                    <span className="ml-auto">
                      {openSubmenu === "recent" ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                  {openSubmenu === "recent" && (
                    <div className="w-full bg-accent/5 sm:absolute sm:left-full sm:top-0 sm:w-80 sm:bg-popover sm:border sm:border-border sm:shadow-lg sm:py-1 sm:-ml-1">
                      {recentFiles.map((item, i) => (
                        <button
                          key={i}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground truncate block pl-8 sm:pl-4"
                          onClick={() => {
                            closeMenu();
                            if (item.url) {
                              executeAction(() => openExample(item.url!));
                            } else {
                              executeAction(() => handleOpenRecentFile(item));
                            }
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </button>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-accent hover:text-red-600 flex items-center gap-2 pl-8 sm:pl-4"
                        onClick={() => {
                          clearRecentFilesList();
                          closeMenu();
                        }}
                      >
                        <Trash2 className="h-3 w-3" /> Clear list
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  onSaveEvent();
                }}
                disabled={!selectedEvent}
              >
                <Save className="h-4 w-4" /> Save
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  onSaveAsEvent();
                }}
                disabled={!selectedEvent}
              >
                <Save className="h-4 w-4" /> Save As...
              </button>

              <div className="my-1 border-t border-border" />

              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  importIOFInputRef.current?.click();
                  closeMenu();
                }}
                disabled={!selectedEvent}
              >
                <FileUp className="h-4 w-4" /> Import IOF XML...
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  exportIOFXML();
                }}
                disabled={!selectedEvent}
              >
                <FileDown className="h-4 w-4" /> Export IOF XML...
              </button>

              <div className="my-1 border-t border-border" />
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                onClick={() => {
                  closeMenu();
                  undo();
                }}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" /> Undo{undoLabel ? ` ${undoLabel}` : ""}
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+Z</span>
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                onClick={() => {
                  closeMenu();
                  redo();
                }}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" /> Redo{redoLabel ? ` ${redoLabel}` : ""}
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+Z</span>
              </button>

              <div className="my-1 border-t border-border" />
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  if (onNavigate) onNavigate("landing");
                }}
              >
                <Info className="h-4 w-4" /> About...
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  setShowSettingsDialog(true);
                }}
              >
                <Settings className="h-4 w-4" /> Settings...
              </button>

              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  onCloseEvent();
                }}
                disabled={!selectedEvent}
              >
                <XIcon className="h-4 w-4" /> Close
              </button>
            </div>
          </>
        )}
      </div>

      <input
        type="file"
        accept=".xml,application/xml,text/xml"
        ref={importIOFInputRef}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportXML(f);
          e.currentTarget.value = "";
        }}
      />

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        autoSaveEnabled={autoSaveEnabled}
        onAutoSaveChange={setAutoSaveEnabled}
        persistToDB={persistToDB}
        onPersistToDBChange={setPersistToDB}
        runningSpeed={runningSpeed}
        onRunningSpeedChange={setRunningSpeed}
        routeAnalysisK={routeAnalysisK}
        onRouteAnalysisKChange={setRouteAnalysisK}
        routeEnumerationAlgorithm={routeEnumerationAlgorithm}
        onRouteEnumerationAlgorithmChange={setRouteEnumerationAlgorithm}
      />

      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title={selectedEvent ? selectedEvent.name : "Unsaved Changes"}
        message={`You have unsaved changes${fileHandle ? ` in "${fileHandle.name}"` : ""}. Do you want to save them?`}
        onConfirm={handleConfirmUnsaved}
        onCancel={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscardUnsaved}
        confirmLabel="Save"
        discardLabel="Discard"
      />
    </>
  );
}
