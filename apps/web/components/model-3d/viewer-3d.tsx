"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getEventTransform, getPageIndexForEventPos } from "@indoor-o-route-analysis/core";
import type { MapData, Polygon } from "@indoor-o-route-analysis/core";
import { mapToWorld, worldToMap, worldToVector3, getPolygonElevation } from "@indoor-o-route-analysis/core/3d";
import { notify } from "@indoor-o-route-analysis/ui";

// Lazy-loaded pdfjs instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any;

interface R3FApi {
  invalidate: () => void;
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

function ViewerController({ expose }: { expose: (api: R3FApi) => void }) {
  const { invalidate, gl, scene, camera } = useThree();
  useEffect(() => {
    expose({ invalidate, gl, scene, camera });
  }, [expose, invalidate, gl, scene, camera]);
  return null;
}

function CameraController({ onFrameAll }: { onFrameAll: boolean }) {
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const { selectedEvent } = useAppData();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift" && controlsRef.current) {
        controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.PAN;
        controlsRef.current.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        controlsRef.current.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" && controlsRef.current) {
        controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        controlsRef.current.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        controlsRef.current.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    // Set default mouse buttons
    if (controlsRef.current) {
      controlsRef.current.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }, []);

  useEffect(() => {
    const polygons = selectedEvent?.raceCourses?.[0]?.polygons;
    const activeMapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (!onFrameAll || !polygons || polygons.length === 0 || !activeMapData) return;

    // Build a bounding box
    const box = new THREE.Box3();

    polygons.forEach((polygon) => {
      polygon.points.forEach((p) => {
        const wp = mapToWorld(p, polygon, activeMapData);
        box.expandByPoint(worldToVector3(wp));
      });
    });

    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const verticalFov = THREE.MathUtils.degToRad(perspectiveCamera.fov || 50);
    const aspect = perspectiveCamera.aspect || gl.domElement.clientWidth / gl.domElement.clientHeight || 1;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const radius = sphere.radius || Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
    const distance = Math.max(radius / Math.sin(verticalFov / 2), radius / Math.sin(horizontalFov / 2)) * 1.2;

    const direction = new THREE.Vector3(1, 1, 1).normalize();
     
    perspectiveCamera.position.copy(direction.multiplyScalar(distance).add(center));
    perspectiveCamera.up.set(0, 0, 1);
    // eslint-disable-next-line react-hooks/immutability -- Three.js camera properties must be mutated directly
    perspectiveCamera.near = Math.max(0.1, distance / 100);
    perspectiveCamera.far = Math.max(perspectiveCamera.far, distance * 4);
    perspectiveCamera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [onFrameAll, selectedEvent, camera, gl]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      zoomToCursor={true}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
}

/**
 * Computes planar UV coordinates for a floor-polygon geometry.
 *
 * Reverses the mapToWorld transform (polygon.origin + flip) to recover IOF map
 * coordinates, then uses getEventTransform to convert to composited texture pixel
 * coordinates, and normalises to UV [0,1].
 */
const calculatePlanarUVs = (
  geometry: THREE.BufferGeometry,
  polygon: Polygon,
  mapData: MapData,
) => {
  const positionAttribute = geometry.getAttribute("position");
  const uvs = [];

  const pageWidth = mapData.image.width ?? 1;
  const pageHeight = mapData.image.height ?? 1;
  const pageCount = mapData.pageCount ?? 1;
  const layout = mapData.layout ?? "horizontal";
  const isManual = mapData.pageTransformMode === "manual";

  const totalWidth = layout === "horizontal" ? pageWidth * pageCount : pageWidth;
  const totalHeight = layout === "vertical" ? pageHeight * pageCount : pageHeight;

  for (let i = 0; i < positionAttribute.count; i++) {
    const wx = positionAttribute.getX(i);
    const wy = positionAttribute.getY(i);
    const wz = positionAttribute.getZ(i);

    // Recover IOF map coords using the same polygon origin used by mapToWorld
    const mapPos = worldToMap({ x: wx, y: wy, z: wz }, polygon, mapData);

    // Convert IOF map coords to page-local pixel coords
    const pageIndex = isManual ? getPageIndexForEventPos(mapPos, mapData) : 0;
    const transform = getEventTransform(mapData, pageIndex);
    const localPixel = transform.toMap(mapPos);

    // Add page offset to get composited-texture pixel coords
    let globalPixelX = localPixel.x;
    let globalPixelY = localPixel.y;
    if (isManual && pageCount > 1) {
      if (layout === "horizontal") {
        globalPixelX += pageIndex * pageWidth;
      } else if (layout === "vertical") {
        globalPixelY += pageIndex * pageHeight;
      }
    }

    const u = totalWidth > 0 ? Math.max(0, Math.min(1, globalPixelX / totalWidth)) : 0;
    const v = totalHeight > 0 ? Math.max(0, Math.min(1, globalPixelY / totalHeight)) : 0;

    uvs.push(u, v);
  }

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
};

function Scene({
  pdfUrl,
  scale: _scale,
  polygonOpacity = 0.9,
  showBackgroundMap = true,
  maxVisibilityElevationRef,
  children,
}: {
  pdfUrl: string | null;
  scale: number;
  polygonOpacity?: number;
  showBackgroundMap?: boolean;
  maxVisibilityElevationRef?: React.MutableRefObject<number>;
  children?: React.ReactNode;
}) {
  const { selectedEvent } = useAppData();
  const [mapTexture, setMapTexture] = useState<THREE.Texture | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const textureRef = useRef<THREE.Texture | null>(null);

  const [activeMaxLevel, setActiveMaxLevel] = useState<number>(-Infinity);

  // Initialize/Reset
  useEffect(() => {
      // If ref is not provided or reset externally, ensure we restart
      if (maxVisibilityElevationRef && maxVisibilityElevationRef.current === undefined) {
          maxVisibilityElevationRef.current = -Infinity;
          setActiveMaxLevel(-Infinity);
      }
  }, [maxVisibilityElevationRef]);


  useFrame(() => {
    if (!maxVisibilityElevationRef) {
        if (activeMaxLevel !== Infinity) setActiveMaxLevel(Infinity);
        return;
    }

    const maxLevel = maxVisibilityElevationRef.current;
    if (activeMaxLevel !== maxLevel) {
      setActiveMaxLevel(maxLevel);
    }
  });

  // Extract complex dep expressions for useEffect dependency arrays
  const activeMapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
  const mapLayout = activeMapData?.layout;
  const mapPageCount = activeMapData?.pageCount;
  const eventPolygons = selectedEvent?.raceCourses?.[0]?.polygons;

  // Load map texture
  useEffect(() => {
    if (!pdfUrl) return;

    let isMounted = true;
    let canvas: HTMLCanvasElement | null = null;

    const loadTexture = async () => {
      // Check if pdfUrl is an image or PDF
      const isPdf =
        pdfUrl.toLowerCase().endsWith(".pdf") || pdfUrl.startsWith("blob:") || pdfUrl.includes("application/pdf");

      if (isPdf) {
        try {
          if (!pdfjsLib) {
            const module = await import("pdfjs-dist");
            pdfjsLib = module;
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          }

          const loadingTask = pdfjsLib.getDocument(pdfUrl);
          const pdf = await loadingTask.promise;

          const pdfScale = 2.0;
          const activeMapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
          const mapLayout = activeMapData?.layout;
          const mapPageCount = activeMapData?.pageCount || 1;
          const numPages = pdf.numPages;

          if ((mapLayout === "horizontal" || mapLayout === "vertical") && numPages > 1 && mapPageCount > 1) {
            // Multi-page: render all pages composited into one texture
            const pagesToRender = Math.min(mapPageCount, numPages);
            const pages = await Promise.all(
              Array.from({ length: pagesToRender }, (_, i) => pdf.getPage(i + 1)),
            );
            const viewports = pages.map((pg) => pg.getViewport({ scale: pdfScale }));

            let canvasWidth: number;
            let canvasHeight: number;
            if (mapLayout === "vertical") {
              canvasWidth = Math.max(...viewports.map((vp) => vp.width));
              canvasHeight = viewports.reduce((sum, vp) => sum + vp.height, 0);
            } else {
              canvasWidth = viewports.reduce((sum, vp) => sum + vp.width, 0);
              canvasHeight = Math.max(...viewports.map((vp) => vp.height));
            }

            canvas = document.createElement("canvas");
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext("2d");

            if (ctx) {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);

              let offset = 0;
              for (let i = 0; i < pages.length; i++) {
                ctx.save();
                if (mapLayout === "vertical") {
                  ctx.translate(0, offset);
                } else {
                  ctx.translate(offset, 0);
                }
                await pages[i].render({ canvasContext: ctx, viewport: viewports[i] }).promise;
                ctx.restore();
                offset += mapLayout === "vertical" ? viewports[i].height : viewports[i].width;
              }

              if (isMounted) {
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.flipY = false;

                setMapTexture(texture);
                textureRef.current = texture;
              }
            }
          } else {
            // Single page rendering
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: pdfScale });

            canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");

            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;

              if (isMounted) {
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.flipY = false;

                setMapTexture(texture);
                textureRef.current = texture;
              }
            }
          }
        } catch (error) {
          console.error("Error loading PDF texture:", error);
        }
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = pdfUrl;

        img.onload = () => {
          if (!isMounted) return;
          canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.flipY = false;
            setMapTexture(texture);
            textureRef.current = texture;
          }
        };
      }
    };

    loadTexture();

    return () => {
      isMounted = false;
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, [pdfUrl, mapLayout, mapPageCount, selectedEvent?.raceCourses]);

  // Clear old meshes
  useEffect(() => {
    meshesRef.current.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            mat.dispose();
          });
        } else {
          mesh.material.dispose();
        }
      }
    });
    meshesRef.current = [];
  }, [eventPolygons]);

  const polygons = selectedEvent?.raceCourses?.[0]?.polygons;

  if (!polygons || polygons.length === 0) {
    return null;
  }

  const activeMap = selectedEvent?.raceCourses?.[0]?.maps?.[0];

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />

      {showBackgroundMap && activeMap &&
        polygons.map((polygon) => {
          if (polygon.points.length < 3) return null;

          const z = getPolygonElevation(polygon);

          // Hiding Logic
          // Use activeMaxLevel (derived from ref)
          const isHidden = maxVisibilityElevationRef && activeMaxLevel > -Infinity && z > activeMaxLevel + 0.5;

          const points = polygon.points.map((p) => {
            const wp = mapToWorld(p, polygon, activeMap);
            return new THREE.Vector2(wp.x, wp.y);
          });
          const shape = new THREE.Shape(points);

          if (polygon.holes) {
            polygon.holes.forEach((hole) => {
              const holePoints = hole.map((p) => {
                const wp = mapToWorld(p, polygon, activeMap);
                return new THREE.Vector2(wp.x, wp.y);
              });
              const holePath = new THREE.Path(holePoints);
              shape.holes.push(holePath);
            });
          }

          const geometry = new THREE.ShapeGeometry(shape);
          const edgesGeometry = new THREE.EdgesGeometry(geometry);

          if (mapTexture) {
            calculatePlanarUVs(geometry, polygon, activeMap);
          }

          const material = new THREE.MeshStandardMaterial({
            map: mapTexture,
            color: mapTexture ? 0xffffff : 0xcccccc, // Use lighter grey if no texture
            side: THREE.DoubleSide,
            transparent: true,
            opacity: mapTexture ? polygonOpacity : Math.min(polygonOpacity, 0.7),
          });

          return (
            <group key={polygon.id} position={[0, 0, z]} visible={!isHidden}>
              <mesh
                geometry={geometry}
                material={material}
                ref={(mesh: THREE.Mesh | null) => {
                  if (mesh) meshesRef.current.push(mesh);
                }}
              />
              <lineSegments geometry={edgesGeometry}>
                <lineBasicMaterial color={0xffaa00} linewidth={2} />
              </lineSegments>
            </group>
          );
        })}

      {children}
    </group>
  );
}

export interface Model3DViewerProps {
  pdfUrl: string | null;
  scale: number;
  onFrameAllTrigger?: boolean;
  polygonOpacity?: number;
  showBackgroundMap?: boolean;
  maxVisibilityElevationRef?: React.MutableRefObject<number>;
  children?: React.ReactNode;
}

export interface Model3DViewerHandle {
  frameAll: () => void;
  exportModel: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  invalidate: () => void;
  getSize: () => { width: number; height: number };
  getPixelRatio: () => number;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  setPixelRatio: (pixelRatio: number) => void;
}

const Model3DViewer = forwardRef<Model3DViewerHandle, Model3DViewerProps>(
  (
    {
      pdfUrl,
      scale,
      onFrameAllTrigger = false,
      polygonOpacity = 0.9,
      showBackgroundMap = true,
      maxVisibilityElevationRef,
      children,
    },
    ref,
  ) => {
    const { selectedEvent } = useAppData();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const r3fApi = useRef<R3FApi | null>(null);

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      invalidate: () => r3fApi.current?.invalidate(),
      getSize: () => {
        if (!r3fApi.current?.gl) return { width: 0, height: 0 };
        const vec = new THREE.Vector2();
        r3fApi.current.gl.getSize(vec);
        return { width: vec.x, height: vec.y };
      },
      getPixelRatio: () => r3fApi.current?.gl?.getPixelRatio() || 1,
      setSize: (width, height, updateStyle) => r3fApi.current?.gl?.setSize(width, height, updateStyle),
      setPixelRatio: (ratio) => r3fApi.current?.gl?.setPixelRatio(ratio),
      frameAll: () => {
        // Handled via onFrameAllTrigger
      },
      exportModel: async () => {
        const polygons = selectedEvent?.raceCourses?.[0]?.polygons;
        if (!polygons || polygons.length === 0) {
          notify("No polygons to export");
          return;
        }

        const activeMapData = selectedEvent?.raceCourses?.[0]?.maps?.[0];
        if (!activeMapData) {
          notify("No map data available for export");
          return;
        }

        let objContent = "# Indoor Orienteering 3D Model\n";
        objContent += "mtllib model.mtl\n\n";

        let vertexIndex = 1;

        polygons.forEach((polygon, polyIndex) => {
          objContent += `# Polygon ${polyIndex + 1}\n`;
          objContent += `o Polygon_${polyIndex + 1}\n`;

          polygon.points.forEach((p) => {
            const wp = mapToWorld(p, polygon, activeMapData);
            objContent += `v ${wp.x} ${wp.y} ${wp.z ?? 0}\n`;
          });

          objContent += `vt 0 0\n`;
          objContent += `vt 1 0\n`;
          objContent += `vt 1 1\n`;
          objContent += `vt 0 1\n`;

          for (let i = 1; i < polygon.points.length - 1; i++) {
            objContent += `f ${vertexIndex} ${vertexIndex + i} ${vertexIndex + i + 1}\n`;
          }

          vertexIndex += polygon.points.length;
          objContent += "\n";
        });

        const objBlob = new Blob([objContent], { type: "text/plain" });
        const objUrl = URL.createObjectURL(objBlob);
        const objLink = document.createElement("a");
        objLink.href = objUrl;
        objLink.download = "model.obj";
        objLink.click();
        URL.revokeObjectURL(objUrl);

        if (pdfUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = pdfUrl;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((blob) => {
                if (blob) {
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "texture.png";
                  link.click();
                  URL.revokeObjectURL(url);
                }
              }, "image/png");
            }
          };
        }
      },
    }));

    return (
      <div className="relative flex-1 flex flex-col overflow-hidden bg-gray-900 h-full" style={{ width: "100%", height: "100%", touchAction: "none" }}>
        <Canvas 
          gl={{ preserveDrawingBuffer: true }}
          onCreated={(state) => {
             canvasRef.current = state.gl.domElement;
          }}
        >
          <ViewerController expose={(api) => r3fApi.current = api} />
          <PerspectiveCamera makeDefault position={[10, 10, 10]} up={[0, 0, 1]} />
          <CameraController onFrameAll={onFrameAllTrigger} />
          <Scene
            pdfUrl={pdfUrl}
            scale={scale}
            polygonOpacity={polygonOpacity}
            showBackgroundMap={showBackgroundMap}
            maxVisibilityElevationRef={maxVisibilityElevationRef}
          >
            {children}
          </Scene>
        </Canvas>
      </div>
    );
  },
);

Model3DViewer.displayName = "Model3DViewer";

export default Model3DViewer;
