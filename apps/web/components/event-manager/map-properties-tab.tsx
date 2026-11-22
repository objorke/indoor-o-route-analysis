import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  FolderOpen,
  Ruler,
  Calculator,
  Crosshair,
  Check,
  LocateFixed,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  Checkbox,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ControlRenderer,
  useAppData,
  useSettings,
} from "@indoor-o-route-analysis/ui";
import {
  DEFAULT_MAP_SCALE,
  getEventTransform,
  getPageIndexForEventPos,
  calculateLatLonFromMapPoint,
  formatMapFileInfo,
  getMapTransform,
  getTransformDocumentSize,
  mmTransform,
  setMapTransform,
  setPrimaryMap,
  updatePrimaryMap,
  type EventData,
  type MapData,
  type MapTransformCorners,
} from "@indoor-o-route-analysis/core";
import { type MapViewerState, type MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { FieldHelp } from "@/components/field-help";
import { TransformEditor } from "./transform-editor";
import { MAP_TAB_HELP } from "./map-tab-help";
import { useControlRegistration, type MarkId } from "./use-control-registration";
import { MeasureOverlay, useMeasureTools } from "./use-measure-tools";

/** Mouse movement (px) below which a press-release counts as a click, not a pan. */
const CLICK_TOLERANCE_PX = 4;

/** Colours of the two registration marks (mark 1, mark 2), also used for the toolbar slots. */
const MARK_COLORS: Record<MarkId, { color: string; selectedColor: string }> = {
  1: { color: "#22c55e", selectedColor: "#15803d" },
  2: { color: "#f59e0b", selectedColor: "#b45309" },
};

const MapViewer = dynamic(() => import("@/components/map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-muted" />,
});

/** Small toolbar copy of a registration mark, drawn with the same shared renderer as on the map. */
function MarkSymbol({ n }: { n: MarkId }) {
  const half = ControlRenderer.CONTROL_RADIUS + 14;
  return (
    <svg
      width={20}
      height={20}
      viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`}
      className="shrink-0"
      aria-hidden
    >
      {ControlRenderer.renderRegistrationMark({ x: 0, y: 0, label: "", ...MARK_COLORS[n] })}
    </svg>
  );
}

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

interface MapPropertiesTabProps {
  selectedEvent: EventData;
  mapUriInput: string;
  setMapUriInput: (value: string) => void;
  handleMapUriBlur: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist is untyped dynamic import
  pdfjsLib: any;
  mapScaleInput: number;
  commitMapScale: (value: number) => void;
  mapLayoutInput: "horizontal" | "vertical" | "pages";
  handleMapLayoutChange: (value: string) => void;
  saveEncodedInJson: boolean;
  setSaveEncodedInJson: (value: boolean) => void;
  pdfBlobUrl: string | null;
  cursorCoordinates: { event: { x: number; y: number }; map: { x: number; y: number } } | null;
  setCursorCoordinates: (coords: { event: { x: number; y: number }; map: { x: number; y: number } } | null) => void;
}

export function MapPropertiesTab({
  selectedEvent,
  mapUriInput,
  setMapUriInput,
  handleMapUriBlur,
  pdfjsLib,
  mapScaleInput,
  commitMapScale,
  mapLayoutInput,
  handleMapLayoutChange,
  saveEncodedInJson,
  setSaveEncodedInJson,
  pdfBlobUrl,
  cursorCoordinates,
  setCursorCoordinates,
}: MapPropertiesTabProps) {
  const { currentPdfData, updateEvent } = useAppData();
  const { showControlPoints } = useSettings();
  const primaryMap: MapData | undefined = selectedEvent?.raceCourses?.[0]?.maps?.[0];
  const hasMap = !!primaryMap?.image?.url || !!primaryMap?.image?.encodedData || !!pdfBlobUrl;
  const pageCount = primaryMap?.pageCount || 1;
  const isManual = primaryMap?.pageTransformMode === "manual";
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Replace the primary map, applied to the latest event (no-op without a map). */
  const eventId = selectedEvent.id;
  const updateMap = useCallback(
    async (updater: (map: MapData) => MapData, label = "Edit map") => {
      await updateEvent(eventId, (e) => updatePrimaryMap(e, updater), undefined, { label });
    },
    [eventId, updateEvent],
  );

  const [currentMapPage, setCurrentMapPage] = useState(1);
  
  // Tools state
  // Measure / Calculate scale tools
  const measure = useMeasureTools();
  const { tool: activeTool, setTool: setActiveTool, scaleDistance, setScaleDistance } = measure;

  const mapViewerControllerRef = useRef<MapViewerController | null>(null);
  const latestPixelsPerMM = useRef<number>(3.7795); // updated from onMouseMove state


  const resetTools = () => {
    measure.reset();
    reg.reset();
  };

  /** Canvas mm under the mouse. */
  const canvasMMAt = (state: MapViewerState, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
    const y = (e.clientY - rect.top - state.pan.y) / state.zoom;
    return { x: x / state.pixelsPerMM, y: y / state.pixelsPerMM };
  };

  // Where the mouse went down: a release close to it is a click (places a control), else a pan
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (state: MapViewerState, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    pressRef.current = { x: e.clientX, y: e.clientY };
    const point = canvasMMAt(state, e);

    // Transform tool: grab a placed mark (and skip panning), or let the viewer pan
    if (isControlRegMode) {
      const hitRadius = 14 / (state.zoom * state.pixelsPerMM); // ~14px tolerance
      if (reg.pointerDown(point, hitRadius)) {
        e.preventDefault(); // signal MapViewer to skip pan
        pressRef.current = null;
      }
      return;
    }

    if (activeTool !== "none") measure.pointerDown(point);
  };

  const handleMouseUp = async (state: MapViewerState, e: React.MouseEvent) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (isControlRegMode) {
      if (reg.pointerUp()) return;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= CLICK_TOLERANCE_PX) {
        reg.click(canvasMMAt(state, e));
      }
      return;
    }

    // Scale tool: the drawn line + known distance give the map scale
    const newScale = measure.pointerUp();
    if (newScale !== null) commitMapScale(newScale);
  };


  // --- Control-based registration helpers ---

  const raceCourses = selectedEvent?.raceCourses;
  const controls = useMemo(() => raceCourses?.[0]?.controls || [], [raceCourses]);
  const transformPageIndex = isManual ? currentMapPage - 1 : undefined;

  // "Update coordinate transform" tool: click to place two controls, drag to adjust
  const reg = useControlRegistration({
    map: primaryMap,
    controls,
    pageIndex: transformPageIndex,
    pixelsPerMMRef: latestPixelsPerMM,
    applyTransform: (corners, label) => applyTransform(corners, label),
  });
  const { active: isControlRegMode, mark1: regMark1, mark2: regMark2, draggingMark, selectedMark } = reg;


  /** The single place that persists a transform (global, or the current page in manual mode). */
  const applyTransform = useCallback(
    async (corners: MapTransformCorners, label = "Edit transform", pageIndex: number | undefined = transformPageIndex) => {
      await updateMap((m) => setMapTransform(m, corners, pageIndex), label);
    },
    [updateMap, transformPageIndex],
  );

  const transformDims = primaryMap ? getTransformDocumentSize(primaryMap) : { width: 0, height: 0 };
  const currentTransform = primaryMap ? getMapTransform(primaryMap, transformPageIndex) : null;

  const handleResetTransform = (origin: "top-left" | "bottom-left") => {
    if (!primaryMap) return;
    void applyTransform(mmTransform(transformDims, origin), "Reset transform");
  };

  /** Controls offered first by the transform tool: all, or those rendered on the current page in manual mode. */
  const pageControls = useMemo(() => {
    if (!primaryMap || !isManual || (primaryMap.layout !== "horizontal" && primaryMap.layout !== "vertical")) return controls;
    return controls.filter((c) => getPageIndexForEventPos(c.mapPosition, primaryMap) === currentMapPage - 1);
  }, [controls, primaryMap, isManual, currentMapPage]);

  const handleTransformEdit = (corners: MapTransformCorners) => {
    void applyTransform(corners);
  };

  // --- Map file import ---

  const handleImportMapFile = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();

    let width = 0;
    let height = 0;
    let filePageCount = 1;

    if (pdfjsLib) {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0), verbosity: 0 });
        const pdf = await loadingTask.promise;
        filePageCount = pdf.numPages;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        width = viewport.width * (25.4 / 72);
        height = viewport.height * (25.4 / 72);
      } catch (err) {
        console.error("Failed to parse PDF metadata", err);
      }
    }

    setMapUriInput(file.name);
    // New imports embed the PDF by default so the event file is self-contained
    setSaveEncodedInJson(true);

    const layout = mapLayoutInput;
    const scale = mapScaleInput;
    const newMapId = crypto.randomUUID(); // new id for a new file (generated once: the updater must be pure)
    // Built from the latest event: edits made while the PDF was being read are kept
    await updateEvent(
      eventId,
      (e) => {
        const currentMap =
          e.raceCourses?.[0]?.maps?.[0] ||
          ({ scale: DEFAULT_MAP_SCALE, image: { width: 0, height: 0 }, mapPositionTopLeft: { x: 0, y: 0 }, layout: "horizontal" } as MapData);

        let tl = currentMap.mapPositionTopLeft;
        let br = currentMap.mapPositionBottomRight;
        if ((!tl || (tl.x === 0 && tl.y === 0)) && (!br || (br.x === 0 && br.y === 0))) {
          tl = { x: 0, y: 0 };
          // Default calibration spans the full document based on layout
          br = {
            x: layout === "horizontal" ? width * filePageCount : width,
            y: layout === "vertical" ? height * filePageCount : height,
          };
        }

        return setPrimaryMap(e, {
          ...currentMap,
          id: newMapId,
          scale,
          image: { url: file.name, width, height },
          mapPositionTopLeft: tl,
          mapPositionBottomRight: br,
          layout,
          pageCount: filePageCount,
          saveEncoded: true,
        });
      },
      arrayBuffer,
      { label: "Import map" },
    );
  };

  const openFilePicker = () => fileInputRef.current?.click();

  /** Status line of the transform tool: what to do next. */
  const transformToolHint = (): string => {
    const placingId = reg.placing === 1 ? reg.id1 : reg.id2;
    if (reg.residual !== null) return "Transform updated. Move a mark and Apply again to refine it";
    if (reg.placing && placingId) {
      const tip = !reg.moved[1] && !reg.moved[2] ? " (tip: use two controls far apart)" : "";
      return `Click on the map where control ${placingId} is, or drag its mark${tip}`;
    }
    if (reg.marksClose) return "The controls are close together: choose two far apart for a more accurate transform, then Apply";
    return "Drag a mark to where its control is on the map, then Apply";
  };

  const toggleTransformTool = () => {
    const wasActive = isControlRegMode;
    resetTools();
    if (!wasActive) reg.start(pageControls);
  };

  // Shortcuts: Ctrl/Cmd+O import/replace, 0 fit map to view, T transform tool, Enter apply, Esc exit tool
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openFilePicker();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !hasMap) return;
      const key = e.key.toLowerCase();
      if (key === "0") {
        e.preventDefault();
        mapViewerControllerRef.current?.fitToView();
      } else if (e.key === "Enter" && isControlRegMode && reg.canApply && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void reg.apply();
      } else if (key === "t" && controls.length >= 2) {
        e.preventDefault();
        toggleTransformTool();
      } else if (e.key === "Escape" && (activeTool !== "none" || isControlRegMode)) {
        e.preventDefault();
        resetTools();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const toolButton = (opts: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    tooltip: string;
    disabled?: boolean;
  }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant={opts.active ? "active" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={opts.onClick}
              disabled={opts.disabled}
              aria-label={opts.tooltip}
            >
              {opts.icon}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{opts.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      className="hidden"
      accept=".pdf"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-importing the same file
        if (file) await handleImportMapFile(file);
      }}
    />
  );

  // --- Empty state: no map loaded yet ---
  if (!hasMap) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 h-full">
        {hiddenFileInput}
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
          <Button onClick={openFilePicker} className="gap-2" title="Import map (Ctrl/Cmd+O)">
            <FolderOpen className="h-4 w-4" />
            Import map…
          </Button>
          <p className="text-xs text-muted-foreground">PDF of the venue map. Multi-page PDFs are supported.</p>
          <div className="w-full mt-4">
            <Label htmlFor="map-uri" className="text-[10px] text-muted-foreground">
              or enter a URL
            </Label>
            <Input
              id="map-uri"
              className="h-7 text-xs mt-1"
              value={mapUriInput}
              onChange={(e) => setMapUriInput(e.target.value)}
              onBlur={handleMapUriBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="https://…"
            />
          </div>
        </div>
      </div>
    );
  }

  const pageSelector = isManual && pageCount > 1 && (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setCurrentMapPage((p) => Math.max(1, p - 1))}
        disabled={currentMapPage === 1}
        title="Previous page"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="font-mono text-[10px]">
        Page {currentMapPage}/{pageCount}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setCurrentMapPage((p) => Math.min(pageCount, p + 1))}
        disabled={currentMapPage === pageCount}
        title="Next page"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );


  return (
    <div className="flex-1 flex overflow-hidden p-6 gap-6 h-full">
      {hiddenFileInput}
      <div className="w-96 flex-shrink-0 overflow-auto space-y-5 pr-1">
        {/* Map file */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Map file</div>
              <div className="text-sm truncate" title={primaryMap?.image?.url || mapUriInput}>
                {primaryMap?.image?.url || mapUriInput || "(embedded map)"}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {formatMapFileInfo(primaryMap, currentPdfData?.byteLength)}
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={openFilePicker} title="Replace the map with another PDF (Ctrl/Cmd+O)">
              <FolderOpen className="h-3.5 w-3.5" />
              Replace…
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="save-encoded"
              checked={saveEncodedInJson}
              onCheckedChange={(c) => {
                const checked = c === true;
                setSaveEncodedInJson(checked);
                void updateMap((m) => ({ ...m, saveEncoded: checked }));
              }}
            />
            <Label htmlFor="save-encoded" className="text-xs text-muted-foreground font-normal">
              Save map encoded in event file
            </Label>
            <FieldHelp>{MAP_TAB_HELP.saveEncoded}</FieldHelp>
          </div>

        </div>

        {/* Scale */}
        <div>
          <Label htmlFor="map-scale" className="text-xs text-muted-foreground">
            Map scale
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm">1 :</span>
            <NumericInput
              id="map-scale"
              className="w-24 h-8"
              integer
              min={1}
              value={mapScaleInput}
              onCommit={commitMapScale}
            />
          </div>
        </div>

        {/* Multi-page options (only meaningful with more than one page) */}
        {pageCount > 1 && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="event-map-layout" className="text-xs text-muted-foreground flex items-center gap-1">
                Multi-page layout <FieldHelp>{MAP_TAB_HELP.layout}</FieldHelp>
              </Label>
              <Select value={mapLayoutInput} onValueChange={handleMapLayoutChange}>
                <SelectTrigger id="event-map-layout" className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                  <SelectItem value="pages">Pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="page-transform-mode" className="text-xs text-muted-foreground flex items-center gap-1">
                Multi-page transformation <FieldHelp>{MAP_TAB_HELP.pageTransform}</FieldHelp>
              </Label>
              <Select
                value={primaryMap?.pageTransformMode || "automatic"}
                onValueChange={(value) => {
                  const mode = value as "automatic" | "manual";
                                void updateMap((m) => ({
                    ...m,
                    pageTransformMode: mode,
                    // Initialize per-page transforms when switching to manual
                    pageTransforms:
                      mode === "manual" && !m.pageTransforms
                        ? Array.from({ length: m.pageCount || 1 }, () => ({
                            topLeft: { x: 0, y: 0 },
                            bottomRight: { x: m.image.width || 0, y: m.image.height || 0 },
                          }))
                        : m.pageTransforms,
                  }));
                }}
              >
                <SelectTrigger id="page-transform-mode" className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual (per page)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Coordinate transform */}
        {currentTransform && (
          <TransformEditor
            value={currentTransform}
            dims={transformDims}
            onCommit={handleTransformEdit}
            onReset={handleResetTransform}
            headerExtra={pageSelector}
          />
        )}

      </div>
      <div className="flex-1 flex flex-col gap-2 h-full min-w-0">
        <div className="flex items-center gap-1 flex-wrap min-h-8">
          {toolButton({
            active: false,
            icon: <Maximize2 className="h-4 w-4" />,
            tooltip: "Fit map to view (0)",
            onClick: () => mapViewerControllerRef.current?.fitToView(),
          })}
          {toolButton({
            active: false,
            icon: <ZoomIn className="h-4 w-4" />,
            tooltip: "Zoom in (+)",
            onClick: () => mapViewerControllerRef.current?.zoomBy(1.25),
          })}
          {toolButton({
            active: false,
            icon: <ZoomOut className="h-4 w-4" />,
            tooltip: "Zoom out (−)",
            onClick: () => mapViewerControllerRef.current?.zoomBy(0.8),
          })}
          <div className="w-px h-4 bg-border mx-1" />
          {toolButton({
            active: activeTool === "measure",
            icon: <Ruler className="h-4 w-4" />,
            tooltip: "Measure distance",
            onClick: () => {
              const wasActive = activeTool === "measure";
              resetTools();
              if (!wasActive) setActiveTool("measure");
            },
          })}
          {toolButton({
            active: activeTool === "scale",
            icon: <Calculator className="h-4 w-4" />,
            tooltip: "Calculate scale from distance",
            onClick: () => {
              const wasActive = activeTool === "scale";
              resetTools();
              if (!wasActive) setActiveTool("scale");
            },
          })}
          {toolButton({
            active: isControlRegMode,
            icon: <Crosshair className="h-4 w-4" />,
            tooltip: isControlRegMode
              ? "Exit the coordinate transform tool (Esc)"
              : controls.length < 2
                ? "Update coordinate transform: needs at least two controls"
                : "Update coordinate transform: click on the map where two controls are (T)",
            disabled: !isControlRegMode && controls.length < 2,
            onClick: toggleTransformTool,
          })}

          <div className="w-px h-4 bg-border mx-2" />

          {activeTool === "scale" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Distance:</span>
              <NumericInput className="h-7 w-20 text-xs" min={0.001} value={scaleDistance} onCommit={setScaleDistance} />
              <span className="text-xs text-muted-foreground">m</span>
            </div>
          )}

          {isControlRegMode && (
            <div className="flex items-center gap-2">
              {([1, 2] as const).map((n) => {
                const id = n === 1 ? reg.id1 : reg.id2;
                const mark = n === 1 ? regMark1 : regMark2;
                const isPlacing = reg.placing === n;
                return (
                  // Clicking anywhere in the slot makes it the control the next map click places
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the Select inside is keyboard accessible
                  <fieldset
                    key={n}
                    aria-label={`Control ${n}`}
                    title={id ? `Click here, then on the map where control ${id} is` : undefined}
                    onClick={() => id && reg.setPlacing(n)}
                    className={`m-0 min-w-0 flex items-center gap-1 rounded-md border px-1 cursor-pointer ${isPlacing ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"}`}
                  >
                    <MarkSymbol n={n} />
                    <Select value={id} onValueChange={(v) => reg.setId(n, v)}>
                      <SelectTrigger className="h-7 w-24 text-xs" aria-label={`Control ${n}`}>
                        <SelectValue placeholder={`Control ${n}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {controls.map((c) => (
                          <SelectItem key={c.id} value={c.id} disabled={c.id === (n === 1 ? reg.id2 : reg.id1)}>
                            {c.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title={`Zoom to control ${id || n}`}
                      aria-label={`Zoom to control ${n}`}
                      disabled={!mark}
                      onClick={() => {
                        if (mark && mapViewerControllerRef.current) {
                          const ppm = latestPixelsPerMM.current;
                          mapViewerControllerRef.current.frameItem({ x: mark.x * ppm, y: mark.y * ppm }, 3);
                        }
                      }}
                    >
                      <LocateFixed className="h-3.5 w-3.5" />
                    </Button>
                  </fieldset>
                );
              })}
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void reg.apply()}
                disabled={!reg.canApply}
                title="Update the coordinate transform so the controls land on their marks (Enter)"
              >
                <Check className="h-3 w-3" /> Apply
              </Button>
              {reg.residual !== null && (
                <span
                  className={`font-mono text-[10px] ${reg.residual > 1 ? "text-amber-500" : "text-muted-foreground"}`}
                  title="Largest distance between a control and its mark after applying (MapPosition units)"
                >
                  max error {reg.residual.toFixed(1)} mm
                </span>
              )}
            </div>
          )}

          <span className="text-xs text-muted-foreground ml-2">
            {activeTool === "measure" && "Drag to measure distance"}
            {activeTool === "scale" && "Enter distance in meters, then drag that distance on map"}
            {isControlRegMode && transformToolHint()}
          </span>
        </div>

      <div className="flex-1 border rounded-md overflow-hidden relative bg-muted/10 h-full flex flex-col">
        <MapViewer
          key={selectedEvent.id}
          pdfUrl={pdfBlobUrl || undefined}
          showBackgroundMap={true}
          mapLayout={mapLayoutInput}
          initialFit={true}
          disablePan={activeTool !== "none" || draggingMark !== null}
          cursor={activeTool !== "none" || reg.placing !== null ? "crosshair" : undefined}
          onControllerReady={(ctrl: MapViewerController) => { mapViewerControllerRef.current = ctrl; }}
          onPageChange={(page: number) => setCurrentMapPage(page)}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={(state: MapViewerState, e: React.MouseEvent) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
            const y = (e.clientY - rect.top - state.pan.y) / state.zoom;

            const transform = getEventTransform(primaryMap, transformPageIndex);
            const mapPoint = { x: x / state.pixelsPerMM, y: y / state.pixelsPerMM };
            const eventPoint = transform.toEvent(mapPoint);
            setCursorCoordinates({ event: eventPoint, map: mapPoint }); // Always update cursor info
            latestPixelsPerMM.current = state.pixelsPerMM;

            // Transform tool mark drag: store global canvas mm (same as mapPoint)
            if (isControlRegMode && draggingMark) reg.pointerMove(mapPoint);

            measure.pointerMove(mapPoint);
          }}
        >
          {(state: MapViewerState) => {
            const controlsPx = controls.map((c) => ({
              ...c,
              ...eventPosToMultiPagePixels(c.mapPosition, primaryMap, state.pixelsPerMM),
            }));
            // The controls chosen in the transform tool are highlighted where they are now
            const chosen = isControlRegMode ? new Set([reg.id1, reg.id2]) : new Set<string>();

            return (
              <>
              <svg
                width={state.pdfDimensions.width}
                height={state.pdfDimensions.height}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                }}
              >
                {controlsPx.map((control) =>
                  ControlRenderer.renderControl({
                    control,
                    courseControls: [],
                    courseControlCodes: [],
                    isSelected: chosen.has(control.id),
                    strokeColor: "#ef4444",
                    showControlPoint: showControlPoints,
                  }),
                )}
                
                <MeasureOverlay
                  line={measure.line}
                  tool={activeTool}
                  pixelsPerMM={state.pixelsPerMM}
                  mapScale={primaryMap?.scale || DEFAULT_MAP_SCALE}
                />
                {/* Transform tool marks: where the user placed the two controls */}
                {isControlRegMode &&
                  ([1, 2] as const).map((n) => {
                    const mark = n === 1 ? regMark1 : regMark2;
                    if (!mark) return null;
                    return ControlRenderer.renderRegistrationMark({
                      x: mark.x * state.pixelsPerMM,
                      y: mark.y * state.pixelsPerMM,
                      label: n === 1 ? reg.id1 : reg.id2,
                      isSelected: selectedMark === n,
                      ...MARK_COLORS[n],
                    });
                  })}
              </svg>
              </>
            );
          }}
        </MapViewer>
        {cursorCoordinates && (() => {
            const map = primaryMap;
            let latLonStr = "";
            try {
                if (map && map.latitude !== undefined && map.longitude !== undefined && 
                    !isNaN(map.latitude) && !isNaN(map.longitude)) {
                     const currentLL = calculateLatLonFromMapPoint(
                       cursorCoordinates.map,
                       map.scale || 1000,
                       { latitude: map.latitude, longitude: map.longitude }
                     );
                     
                     if (currentLL) {
                        latLonStr = `${currentLL.latitude.toFixed(6)}, ${currentLL.longitude.toFixed(6)}`;
                     }
                }
            } catch (_e) {
                // Ignore calculation errors for display
            }

            return (
              <div className="absolute bottom-4 left-4 bg-background/90 text-foreground border border-border p-2 rounded text-xs z-10 shadow-sm pointer-events-none space-y-1">
                <div className="font-mono">
                  MapPosition (IOF): {cursorCoordinates.event.x.toFixed(1)}, {cursorCoordinates.event.y.toFixed(1)}
                </div>
                <div className="font-mono text-muted-foreground">
                  DocumentPosition (mm): {cursorCoordinates.map.x.toFixed(1)}, {cursorCoordinates.map.y.toFixed(1)}
                </div>
                {latLonStr && (
                  <div className="font-mono text-primary font-semibold">
                      Lat/Lon: {latLonStr}
                  </div>
                )}
              </div>
            );
        })()}
      </div>
    </div>
    </div>
  );
}
