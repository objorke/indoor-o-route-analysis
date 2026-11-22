"use client"

import type React from "react"

import { useEffect, useRef, useState, useCallback } from "react";
import { getPageIndexForEventPos } from "@indoor-o-route-analysis/core";

// Coordinate transforms live in @indoor-o-route-analysis/core (map-coordinates.ts);
// re-exported here so existing imports from this component keep working.
export {
  getPageIndexForEventPos,
  mapToPixels,
  mapToEvent,
  multiPagePixelsToEvent,
  eventPosToMultiPagePixels,
} from "@indoor-o-route-analysis/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist is untyped dynamic import
let pdfjsLib: any = null;

if (typeof window !== "undefined") {
  import("pdfjs-dist").then((module) => {
    pdfjsLib = module;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  });
}

interface MapViewerProps {
  pdfUrl?: string;
  showBackgroundMap?: boolean;
  mapLayout?: "horizontal" | "vertical" | "pages";
  initialFit?: boolean;
  backgroundOpacity?: number;
  children?: React.ReactNode | ((state: MapViewerState) => React.ReactNode);
  onControllerReady?: (controller: MapViewerController) => void;
  onMouseMove?: (state: MapViewerState, event: React.MouseEvent) => void;
  onMouseDown?: (state: MapViewerState, event: React.MouseEvent) => void;
  onMouseUp?: (state: MapViewerState, event: React.MouseEvent) => void;
  onPageChange?: (page: number) => void;
  disablePan?: boolean;
  cursor?: string;
}

export interface MapViewerState {
  pan: { x: number; y: number };
  zoom: number;
  pdfDimensions: { width: number; height: number };
  pageWidth: number; // Actual PDF page width in points
  pageHeight: number; // Actual PDF page height in points
  pixelsPerMM: number; // Rendered pixels per millimeter on the PDF page
  pageHeightMM: number; // Actual PDF page height in millimeters
  isLoading: boolean;
}

export interface MapViewerController {
  flyTo: (target: { x: number; y: number }, duration?: number) => void;
  /** Center on target instantly via direct DOM write — no React re-render. Call syncPanState() when done animating. */
  panTo: (target: { x: number; y: number }) => void;
  /** Instantly update pan by writing directly to the DOM — no React re-render. Call syncPanState() when done animating. */
  setPan: (pan: { x: number; y: number }) => void;
  /** Sync the DOM pan back to React state after direct DOM animation is done. */
  syncPanState: () => void;
  getPan: () => { x: number; y: number };
  getZoom: () => number;
  setZoom: (newZoom: number) => void;
  getCanvas: () => HTMLCanvasElement | null;
  frameItem: (target: { x: number; y: number }, targetZoom?: number) => void;
  /** Zoom and centre so the whole map fits in the view (with a small margin). */
  fitToView: () => void;
  /** Multiply the zoom by `factor`, keeping the centre of the view fixed. */
  zoomBy: (factor: number) => void;
}

/** Zoom limits shared by wheel, keyboard, pinch and the controller. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
/** Fraction of the view left free around the map by fitToView. */
const FIT_MARGIN = 0.03;

export default function MapViewer({
  pdfUrl,
  showBackgroundMap = true,
  mapLayout = "horizontal",
  initialFit = false,
  backgroundOpacity = 1,
  children,
  onControllerReady,
  onMouseMove,
  onMouseDown,
  onMouseUp,
  onPageChange,
  disablePan = false,
  cursor,
}: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [pixelsPerMM, setPixelsPerMM] = useState(0);
  const [pageHeightMM, setPageHeightMM] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const panAnimRef = useRef<number | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const pdfDimensionsRef = useRef({ width: 0, height: 0 });
  const innerDivRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{
    startPan: { x: number; y: number };
    startDistance: number;
    startZoom: number;
    startMidpoint: { x: number; y: number };
    isTouching: boolean;
    touchCount: number;
  }>({
    startPan: { x: 0, y: 0 },
    startDistance: 0,
    startZoom: 1,
    startMidpoint: { x: 0, y: 0 },
    isTouching: false,
    touchCount: 0,
  });

  // Keep refs in sync with state so animation loops can read current values
  panRef.current = pan;
  zoomRef.current = zoom;

  const updatePan = useCallback((newPan: { x: number; y: number }) => {
    panRef.current = newPan;
    setPan(newPan);
  }, []);

  const cancelPanAnimation = useCallback(() => {
    if (panAnimRef.current !== null) {
      cancelAnimationFrame(panAnimRef.current);
      panAnimRef.current = null;
    }
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const cancelRenderTask = () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_e) {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }
    };

    const loadPdf = async () => {
      if (!pdfUrl) {
        if (isMounted) {
          clearCanvas();
          setPdfDimensions({ width: 0, height: 0 });
          setPageWidth(0);
          setPageHeight(0);
          setIsLoading(false);
        }
        return;
      }

      if (!canvasRef.current) {
        return;
      }

      // Cancel any previous render task before starting a new one
      cancelRenderTask();

      if (!isMounted) return;
      setIsLoading(true);

      try {
        // Wait for pdfjsLib to be loaded
        if (!pdfjsLib) {
          const module = await import("pdfjs-dist");
          pdfjsLib = module;
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, verbosity: 0 });
        const pdf = await loadingTask.promise;

        if (!isMounted) return;

        const numPages = pdf.numPages;
        setTotalPages(numPages);

        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        if ((mapLayout === "horizontal" || mapLayout === "vertical") && numPages > 1) {
          // Horizontal/Vertical layout: render all pages side by side or stacked
          const pages = await Promise.all(Array.from({ length: numPages }, (_, i) => pdf.getPage(i + 1)));

          const viewports = pages.map((page) => page.getViewport({ scale: 2 }));
          const rawViewports = pages.map((page) => page.getViewport({ scale: 1 }));

          let canvasWidth: number;
          let canvasHeight: number;
          if (mapLayout === "vertical") {
            // Vertical: max width, total height
            canvasWidth = Math.max(...viewports.map((vp) => vp.width));
            canvasHeight = viewports.reduce((sum, vp) => sum + vp.height, 0);
          } else {
            // Horizontal: total width, max height
            canvasWidth = viewports.reduce((sum, vp) => sum + vp.width, 0);
            canvasHeight = Math.max(...viewports.map((vp) => vp.height));
          }

          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          // Ensure map background stays white instead of the canvas default
          context.save();
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.restore();

          if (!isMounted) return;
          setPdfDimensions({ width: canvasWidth, height: canvasHeight });

          // Use first page dimensions for reference
          setPageWidth(rawViewports[0].width);
          setPageHeight(rawViewports[0].height);

          const mmPerPoint = 0.352777777778;
          const pageWidthMM = rawViewports[0].width * mmPerPoint;
          const pageHeightMMVal = rawViewports[0].height * mmPerPoint;
          const pixelsPerMMVal = viewports[0].width / pageWidthMM;
          setPixelsPerMM(pixelsPerMMVal);
          setPageHeightMM(pageHeightMMVal);

          // Render all pages
          let offset = 0;
          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const viewport = viewports[i];

            context.save();
            if (mapLayout === "vertical") {
              context.translate(0, offset);
            } else {
              context.translate(offset, 0);
            }

            const renderTask = page.render({
              canvasContext: context,
              viewport: viewport,
            });
            renderTaskRef.current = renderTask;

            await renderTask.promise;
            context.restore();

            offset += mapLayout === "vertical" ? viewport.height : viewport.width;
          }

          if (isMounted) {
            setIsLoading(false);
          }
        } else {
          // Single page or pages mode: render current page only
          const page = await pdf.getPage(mapLayout === "pages" ? currentPage : 1);
          const viewport = page.getViewport({ scale: 2 });
          const rawViewport = page.getViewport({ scale: 1 });

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          // Ensure map background stays white instead of the canvas default
          context.save();
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.restore();

          if (!isMounted) return;
          setPdfDimensions({ width: viewport.width, height: viewport.height });
          setPageWidth(rawViewport.width);
          setPageHeight(rawViewport.height);

          const mmPerPoint = 0.352777777778;
          const pageWidthMM = rawViewport.width * mmPerPoint;
          const pageHeightMMVal = rawViewport.height * mmPerPoint;
          const pixelsPerMMVal = viewport.width / pageWidthMM;
          setPixelsPerMM(pixelsPerMMVal);
          setPageHeightMM(pageHeightMMVal);

          const renderTask = page.render({
            canvasContext: context,
            viewport: viewport,
          });
          renderTaskRef.current = renderTask;

          await renderTask.promise;
        }

        if (isMounted) {
          setIsLoading(false);
          // Apply initial fit if requested
          if (initialFit && containerRef.current) {
            // Need to know dimensions:
            // mult-page: totalWidth, maxHeight
            // single-page: viewport.width, viewport.height
          }
        }
      } catch (error) {
        if (isMounted) {
          if ((error as Error)?.name === "RenderingCancelledException") {
            // Render was cancelled (this is normal)
          } else {
            console.error("[map-viewer] PDF loading failed:", error);
          }
          setIsLoading(false);
        }
      }
    };

    // Ensure pdfjsLib is loaded before trying to use it
    const loadWhenReady = async () => {
      if (!pdfjsLib) {
        try {
          const module = await import("pdfjs-dist");
          pdfjsLib = module;
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        } catch (e) {
          console.error("[map-viewer] Failed to load pdfjs-dist:", e);
          return;
        }
      }
      await loadPdf();
    };

    if (!showBackgroundMap) {
      cancelRenderTask();
      clearCanvas();
      setIsLoading(false);
      return;
    }

    loadWhenReady();

    return () => {
      isMounted = false;
      cancelRenderTask();
    };
  }, [pdfUrl, showBackgroundMap, mapLayout, currentPage, clearCanvas, initialFit]);

  useEffect(() => {
    pdfDimensionsRef.current = pdfDimensions;
  }, [pdfDimensions]);

  // Provide controller to parent
  useEffect(() => {
    if (!onControllerReady) return;
    const controller: MapViewerController = {
      flyTo: (target, duration = 350) => {
        cancelPanAnimation();
        if (!containerRef.current) return;

        const { clientWidth, clientHeight } = containerRef.current;
        const currentZoom = zoomRef.current;
        const startPan = { ...panRef.current };
        const endPan = {
          x: clientWidth / 2 - target.x * currentZoom,
          y: clientHeight / 2 - target.y * currentZoom,
        };

        // Skip animation if already at target
        if (Math.hypot(endPan.x - startPan.x, endPan.y - startPan.y) < 1) {
          updatePan(endPan);
          return;
        }

        // Instant positioning when duration is 0
        if (duration <= 0) {
          updatePan(endPan);
          return;
        }

        const startTime = performance.now();

        const step = (now: number) => {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / duration, 1);
          // Ease-out cubic for a quick, smooth arrival
          const eased = 1 - (1 - t) ** 3;

          updatePan({
            x: startPan.x + (endPan.x - startPan.x) * eased,
            y: startPan.y + (endPan.y - startPan.y) * eased,
          });

          if (t < 1) {
            panAnimRef.current = requestAnimationFrame(step);
          } else {
            panAnimRef.current = null;
          }
        };
        panAnimRef.current = requestAnimationFrame(step);
      },

      panTo: (target) => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        const newPan = {
          x: clientWidth / 2 - target.x * zoomRef.current,
          y: clientHeight / 2 - target.y * zoomRef.current,
        };
        panRef.current = newPan;
        if (innerDivRef.current) {
          innerDivRef.current.style.transform = `translate(${newPan.x}px, ${newPan.y}px) scale(${zoomRef.current})`;
        }
      },
      setPan: (newPan) => {
        panRef.current = newPan;
        if (innerDivRef.current) {
          innerDivRef.current.style.transform = `translate(${newPan.x}px, ${newPan.y}px) scale(${zoomRef.current})`;
        }
      },
      syncPanState: () => {
        updatePan(panRef.current);
      },

      getPan: () => panRef.current,
      getZoom: () => zoomRef.current,
      setZoom: (newZoom: number) => {
        const clamped = Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM));
        zoomRef.current = clamped;
        setZoom(clamped);
      },
      getCanvas: () => canvasRef.current,
      frameItem: (target, targetZoom = 2) => {
        cancelPanAnimation();
        // Set zoom immediately
        zoomRef.current = targetZoom;
        setZoom(targetZoom);

        if (!containerRef.current) return;

        const { clientWidth, clientHeight } = containerRef.current;
        const startPan = { ...panRef.current };
        const endPan = {
          x: clientWidth / 2 - target.x * targetZoom,
          y: clientHeight / 2 - target.y * targetZoom,
        };

        const duration = 350;
        const startTime = performance.now();

        const step = (now: number) => {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / duration, 1);
          const eased = 1 - (1 - t) ** 3;

          updatePan({
            x: startPan.x + (endPan.x - startPan.x) * eased,
            y: startPan.y + (endPan.y - startPan.y) * eased,
          });

          if (t < 1) {
            panAnimRef.current = requestAnimationFrame(step);
          } else {
            panAnimRef.current = null;
          }
        };
        panAnimRef.current = requestAnimationFrame(step);
      },
      fitToView: () => {
        cancelPanAnimation();
        const { width, height } = pdfDimensionsRef.current;
        if (!containerRef.current || !(width > 0) || !(height > 0)) return;
        const { clientWidth, clientHeight } = containerRef.current;
        const fit = Math.min(clientWidth / width, clientHeight / height) * (1 - 2 * FIT_MARGIN);
        const newZoom = Math.max(MIN_ZOOM, Math.min(fit, MAX_ZOOM));
        zoomRef.current = newZoom;
        setZoom(newZoom);
        updatePan({ x: (clientWidth - width * newZoom) / 2, y: (clientHeight - height * newZoom) / 2 });
      },
      zoomBy: (factor) => {
        cancelPanAnimation();
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        const currentZoom = zoomRef.current;
        const newZoom = Math.max(MIN_ZOOM, Math.min(currentZoom * factor, MAX_ZOOM));
        const ratio = newZoom / currentZoom;
        const cx = clientWidth / 2;
        const cy = clientHeight / 2;
        const p = panRef.current;
        zoomRef.current = newZoom;
        setZoom(newZoom);
        updatePan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio });
      },
    };
    onControllerReady(controller);
    return () => {
      cancelPanAnimation();
    };
  }, [onControllerReady, updatePan, cancelPanAnimation]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      if (!containerRef.current) return;

      // Cancel any running flyTo/frameItem animation
      cancelPanAnimation();

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Read from refs to avoid stale closure when rapid wheel events
      // fire before React re-renders
      const currentZoom = zoomRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(currentZoom * delta, MIN_ZOOM), MAX_ZOOM);

      const zoomRatio = newZoom / currentZoom;
      const currentPan = panRef.current;
      const newPan = {
        x: mouseX - (mouseX - currentPan.x) * zoomRatio,
        y: mouseY - (mouseY - currentPan.y) * zoomRatio,
      };

      // Update refs immediately so the next wheel event (before re-render) sees correct values
      zoomRef.current = newZoom;
      panRef.current = newPan;
      setZoom(newZoom);
      setPan(newPan);
    },
    [cancelPanAnimation],
  );

  // --- Touch handlers for pan and pinch-to-zoom ---
  const getTouchDistance = useCallback((t1: Touch, t2: Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }, []);

  const getTouchMidpoint = useCallback((t1: Touch, t2: Touch, rect: DOMRect) => {
    return {
      x: (t1.clientX + t2.clientX) / 2 - rect.left,
      y: (t1.clientY + t2.clientY) / 2 - rect.top,
    };
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      if (disablePan) return;
      cancelPanAnimation();

      const touches = e.touches;
      touchRef.current.isTouching = true;
      touchRef.current.touchCount = touches.length;

      if (touches.length === 1) {
        // Single finger: pan
        touchRef.current.startPan = {
          x: touches[0].clientX - panRef.current.x,
          y: touches[0].clientY - panRef.current.y,
        };
      } else if (touches.length === 2 && containerRef.current) {
        // Two fingers: pinch-to-zoom + pan
        const rect = containerRef.current.getBoundingClientRect();
        touchRef.current.startDistance = getTouchDistance(touches[0], touches[1]);
        touchRef.current.startZoom = zoomRef.current;
        touchRef.current.startMidpoint = getTouchMidpoint(touches[0], touches[1], rect);
        touchRef.current.startPan = { ...panRef.current };
      }
    },
    [disablePan, cancelPanAnimation, getTouchDistance, getTouchMidpoint],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      if (!touchRef.current.isTouching || disablePan) return;

      const touches = e.touches;

      if (touches.length === 1 && touchRef.current.touchCount === 1) {
        // Single finger: pan
        const newPan = {
          x: touches[0].clientX - touchRef.current.startPan.x,
          y: touches[0].clientY - touchRef.current.startPan.y,
        };
        panRef.current = newPan;
        setPan(newPan);
      } else if (touches.length === 2 && containerRef.current) {
        // Two fingers: pinch-to-zoom around midpoint + pan
        const rect = containerRef.current.getBoundingClientRect();
        const currentDistance = getTouchDistance(touches[0], touches[1]);
        const currentMidpoint = getTouchMidpoint(touches[0], touches[1], rect);

        const scale = currentDistance / touchRef.current.startDistance;
        const newZoom = Math.min(Math.max(touchRef.current.startZoom * scale, MIN_ZOOM), MAX_ZOOM);
        const zoomRatio = newZoom / touchRef.current.startZoom;

        // Zoom around the initial midpoint, then shift by midpoint movement (pan)
        const midShiftX = currentMidpoint.x - touchRef.current.startMidpoint.x;
        const midShiftY = currentMidpoint.y - touchRef.current.startMidpoint.y;

        const newPan = {
          x: touchRef.current.startMidpoint.x - (touchRef.current.startMidpoint.x - touchRef.current.startPan.x) * zoomRatio + midShiftX,
          y: touchRef.current.startMidpoint.y - (touchRef.current.startMidpoint.y - touchRef.current.startPan.y) * zoomRatio + midShiftY,
        };

        zoomRef.current = newZoom;
        panRef.current = newPan;
        setZoom(newZoom);
        setPan(newPan);
      }
    },
    [disablePan, getTouchDistance, getTouchMidpoint],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      const touches = e.touches;

      if (touches.length === 0) {
        touchRef.current.isTouching = false;
        touchRef.current.touchCount = 0;
      } else if (touches.length === 1) {
        // Went from pinch to single finger — reset single-finger pan origin
        touchRef.current.touchCount = 1;
        touchRef.current.startPan = {
          x: touches[0].clientX - panRef.current.x,
          y: touches[0].clientY - panRef.current.y,
        };
      }
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (onMouseDown) {
         if (!containerRef.current) return;
         // Calculate current state to pass
         // Note: Some state values like pixelPerMM might be stale if not updating often, but they are in scope
         // We need to match the signature of onMouseMove which constructs currentState
         // But currentState construction is inside handleMouseMove.
         // Let's duplicate or factor out state construction?
         // For now, let's just pass what we have in scope + pan/zoom
         // Actually, `handleMouseMove` creates a fresh object. We should too.
          const currentState: MapViewerState = {
            pan,
            zoom,
            pdfDimensions,
            pageWidth,
            pageHeight,
            pixelsPerMM,
            pageHeightMM,
            isLoading,
          };
          onMouseDown(currentState, e);
      }

      if (disablePan || e.defaultPrevented) return;

      // Cancel any running animation when user starts manual panning
      cancelPanAnimation();

      // Prevent browser text selection while panning
      e.preventDefault();

      // Start panning on any mouse down inside the viewer
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [pan, zoom, pdfDimensions, pageWidth, pageHeight, pixelsPerMM, pageHeightMM, isLoading, onMouseDown, disablePan, cancelPanAnimation],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;

      // Track mouse position relative to container
      const rect = containerRef.current.getBoundingClientRect();
      setLastMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });

      const currentState: MapViewerState = {
        pan,
        zoom,
        pdfDimensions,
        pageWidth,
        pageHeight,
        pixelsPerMM,
        pageHeightMM,
        isLoading,
      };

      if (onMouseMove) {
        onMouseMove(currentState, e);
      }

      if (!isPanning) return;
      e.preventDefault(); // Prevent browser text selection while panning
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    },
    [
      isPanning,
      startPan,
      zoom,
      pan,
      pdfDimensions,
      pageWidth,
      pageHeight,
      pixelsPerMM,
      pageHeightMM,
      isLoading,
      onMouseMove,
    ],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (onMouseUp) {
       const currentState: MapViewerState = {
        pan,
        zoom,
        pdfDimensions,
        pageWidth,
        pageHeight,
        pixelsPerMM,
        pageHeightMM,
        isLoading,
      };
      onMouseUp(currentState, e);
    }
    setIsPanning(false);
  }, [pan, zoom, pdfDimensions, pageWidth, pageHeight, pixelsPerMM, pageHeightMM, isLoading, onMouseUp]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: false });
    container.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Keyboard zoom controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      // Don't hijack the browser's own zoom shortcut (Ctrl/Cmd +/-).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const mouseX = lastMousePos?.x ?? (containerRef.current?.clientWidth ?? 0) / 2;
        const mouseY = lastMousePos?.y ?? (containerRef.current?.clientHeight ?? 0) / 2;

        const delta = 1.1;
        const newZoom = Math.min(Math.max(zoom * delta, MIN_ZOOM), MAX_ZOOM);
        const zoomRatio = newZoom / zoom;

        setPan((prev) => ({
          x: mouseX - (mouseX - prev.x) * zoomRatio,
          y: mouseY - (mouseY - prev.y) * zoomRatio,
        }));
        setZoom(newZoom);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const mouseX = lastMousePos?.x ?? (containerRef.current?.clientWidth ?? 0) / 2;
        const mouseY = lastMousePos?.y ?? (containerRef.current?.clientHeight ?? 0) / 2;

        const delta = 0.9;
        const newZoom = Math.min(Math.max(zoom * delta, MIN_ZOOM), MAX_ZOOM);
        const zoomRatio = newZoom / zoom;

        setPan((prev) => ({
          x: mouseX - (mouseX - prev.x) * zoomRatio,
          y: mouseY - (mouseY - prev.y) * zoomRatio,
        }));
        setZoom(newZoom);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoom, lastMousePos]);

  if (!pdfUrl && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-muted/20 text-muted-foreground p-8 text-center">
        <p className="text-sm font-medium">No map loaded/available</p>
        <p className="text-xs mt-1">Go to the event page to reload or upload a map.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-white select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isPanning ? "grabbing" : (cursor || "grab"), touchAction: "none" }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-background/80 p-2 rounded text-muted-foreground">Loading map...</div>
        </div>
      )}

      <div
        ref={innerDivRef}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
          width: pdfDimensions.width ? pdfDimensions.width : undefined,
          height: pdfDimensions.height ? pdfDimensions.height : undefined,
        }}
      >
        <canvas
          ref={canvasRef}
          className="bg-white shadow-sm"
          style={{
            display: "block",
            opacity: showBackgroundMap ? backgroundOpacity : 0,
            pointerEvents: showBackgroundMap ? "auto" : "none",
            transition: "opacity 120ms ease",
          }}
        />

        {/* Render children with map state */}
        {typeof children === "function"
          ? children({ pan, zoom, pdfDimensions, pageWidth, pageHeight, pixelsPerMM, pageHeightMM, isLoading })
          : children}
      </div>

      {/* Page navigation for pages mode */}
      {mapLayout === "pages" && totalPages > 1 && !isLoading && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 z-20">
          <button
            onClick={() => {
              const next = Math.max(1, currentPage - 1);
              setCurrentPage(next);
              onPageChange?.(next);
            }}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {"←"}
          </button>
          <span className="text-sm font-mono">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => {
              const next = Math.min(totalPages, currentPage + 1);
              setCurrentPage(next);
              onPageChange?.(next);
            }}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {"→"}
          </button>
        </div>
      )}
    </div>
  );
}
