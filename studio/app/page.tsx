"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import { EXAMPLE_MODELS, readExampleFile, type ExampleModel } from "./example-models";
import { applyCanvasExplode, worldOffsetToLocal } from "./explode-layout";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import {
  Box as BoxIcon,
  BoxSelect,
  ChevronDown,
  CircleDot,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Focus,
  Grid3X3,
  Layers3,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  Orbit,
  Pause,
  Play,
  Settings2,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";

type PartInfo = {
  id: string;
  name: string;
  triangles: number;
  visible: boolean;
};

type ExplodeFrame = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ExportSettings = {
  width: number;
  height: number;
  seconds: number;
  fps: number;
  label: string;
  keyframes: TimelineKeyframe[];
  layoutKeyframes: LayoutKeyframe[];
  transition: TransitionStyle;
  explodeFrame: ExplodeFrame;
  rotation: RotationMotion;
};

type TimelineKeyframe = {
  id: string;
  time: number;
  partIndex: number;
  key: number;
  contextMode: ContextMode;
  dissolve: number;
  explode: number;
};

type LayoutKeyframe = {
  id: string;
  time: number;
  explode: number;
  offsets: number[][];
  partIds?: string[];
};

type TimelineDragState = {
  kind: "scrub" | "cue" | "layout";
  id?: string;
  startX: number;
  startTime: number;
  moved: boolean;
};

type ViewMode = "perspective" | "axonometric";
type InterfaceLanguage = "en" | "zh";
type ViewCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type ContextMode = "line" | "dim";
type TransitionStyle = "pop" | "slice";
type RotationDirection = "clockwise" | "counterclockwise";
type RotationMotion = {
  enabled: boolean;
  degreesPerSecond: number;
  direction: RotationDirection;
};
type StrokeWeight = 0.1 | 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;
type StrokeWeights = {
  structure: StrokeWeight;
  ellipse: StrokeWeight;
  silhouette: StrokeWeight;
  major: StrokeWeight;
};
type StrokeOpacities = {
  structure: number;
  ellipse: number;
  silhouette: number;
  major: number;
};
type ZOrientation = "positive-front" | "negative-front" | "positive-up" | "negative-up";

type ViewerHandle = {
  importFile: (file: File, useSourceOrientation?: boolean) => Promise<void>;
  selectPart: (index: number, dissolve?: number) => void;
  deletePart: (index: number) => boolean;
  togglePart: (index: number) => void;
  focusModel: () => void;
  openOrientation: () => void;
  setContextMode: (mode: ContextMode) => void;
  setExplode: (amount: number) => void;
  captureLayout: () => number[][];
  setLayoutState: (amount: number, offsets: number[][]) => void;
  captureStill: (settings: ExportSettings) => Promise<void>;
  recordVideo: (
    settings: ExportSettings,
    onProgress: (progress: number) => void,
  ) => Promise<void>;
};

type ModelViewportProps = {
  explode: number;
  frameAspect: number;
  viewMode: ViewMode;
  showBounds: boolean;
  contextMode: ContextMode;
  transitionStyle: TransitionStyle;
  strokeWeights: StrokeWeights;
  strokeOpacities: StrokeOpacities;
  explodeFrame: ExplodeFrame;
  rotationMotion: RotationMotion;
  language: InterfaceLanguage;
  uiScale: number;
  onPartsChange: (parts: PartInfo[]) => void;
  onSelectPart: (index: number) => void;
  onOrientationApplied: (mode: ZOrientation) => void;
};

const MODEL_COLORS = [0x080808, 0x0b0b0b, 0x101010, 0x060606];
const STROKE_WIDTHS: Record<StrokeWeight, number> = {
  0.1: 0.38,
  0.25: 0.58,
  0.5: 0.82,
  0.75: 1.08,
  1: 1.34,
  1.25: 1.6,
  1.5: 1.86,
  1.75: 2.12,
  2: 2.38,
};
const STROKE_OPTIONS: StrokeWeight[] = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const OPACITY_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function splitCircularEdgeLoops(edges: THREE.EdgesGeometry) {
  const positions = edges.getAttribute("position") as THREE.BufferAttribute;
  const segments: Array<{ a: string; b: string; values: number[] }> = [];
  const endpointSegments = new Map<string, number[]>();
  edges.computeBoundingBox();
  const diagonal = edges.boundingBox?.getSize(new THREE.Vector3()).length() ?? 1;
  const mergeTolerance = Math.max(diagonal * 0.0006, 0.000001);
  const seenSegments = new Set<string>();
  const keyFor = (x: number, y: number, z: number) =>
    `${Math.round(x / mergeTolerance)}:${Math.round(y / mergeTolerance)}:${Math.round(z / mergeTolerance)}`;

  for (let index = 0; index + 1 < positions.count; index += 2) {
    const values = [
      positions.getX(index), positions.getY(index), positions.getZ(index),
      positions.getX(index + 1), positions.getY(index + 1), positions.getZ(index + 1),
    ];
    const a = keyFor(values[0], values[1], values[2]);
    const b = keyFor(values[3], values[4], values[5]);
    const segmentKey = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenSegments.has(segmentKey)) continue;
    seenSegments.add(segmentKey);
    const segmentIndex = segments.length;
    segments.push({ a, b, values });
    endpointSegments.set(a, [...(endpointSegments.get(a) ?? []), segmentIndex]);
    endpointSegments.set(b, [...(endpointSegments.get(b) ?? []), segmentIndex]);
  }

  const visited = new Set<number>();
  const circularSegments = new Set<number>();
  segments.forEach((segment, startIndex) => {
    if (visited.has(startIndex)) return;
    const component: number[] = [];
    const queue = [startIndex];
    const componentEndpoints = new Set<string>();
    visited.add(startIndex);
    while (queue.length) {
      const segmentIndex = queue.pop()!;
      const current = segments[segmentIndex];
      component.push(segmentIndex);
      componentEndpoints.add(current.a);
      componentEndpoints.add(current.b);
      [current.a, current.b].forEach((endpoint) => {
        (endpointSegments.get(endpoint) ?? []).forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      });
    }
    const isClosedRoundLoop = component.length >= 8 && [...componentEndpoints].every(
      (endpoint) => (endpointSegments.get(endpoint)?.length ?? 0) === 2,
    );
    if (isClosedRoundLoop) component.forEach((segmentIndex) => circularSegments.add(segmentIndex));
  });

  // A CAD rim often has a third cylinder-wall edge at every vertex. Find the
  // smooth tangent pair among all incident edges instead of requiring degree 2.
  // This keeps circular/elliptical rims together while straight and 90° runs
  // remain in the structural layer.
  const smoothCurveSegments = new Set<number>();
  endpointSegments.forEach((connectedSegments, endpoint) => {
    if (connectedSegments.length < 2) return;
    const directions = connectedSegments.map((segmentIndex) => {
      const segment = segments[segmentIndex];
      const fromA = segment.a === endpoint;
      const start = fromA ? 0 : 3;
      const end = fromA ? 3 : 0;
      return new THREE.Vector3(
        segment.values[end] - segment.values[start],
        segment.values[end + 1] - segment.values[start + 1],
        segment.values[end + 2] - segment.values[start + 2],
      ).normalize();
    });
    for (let first = 0; first < directions.length - 1; first += 1) {
      for (let second = first + 1; second < directions.length; second += 1) {
        const tangentDot = directions[first].dot(directions[second]);
        const isCurvedContinuation = tangentDot < -0.55 && tangentDot > -0.9994;
        if (!isCurvedContinuation) continue;
        smoothCurveSegments.add(connectedSegments[first]);
        smoothCurveSegments.add(connectedSegments[second]);
      }
    }
  });

  const structural: number[] = [];
  const circular: number[] = [];
  segments.forEach((segment, index) => {
    const isCurved = circularSegments.has(index) || smoothCurveSegments.has(index);
    (isCurved ? circular : structural).push(...segment.values);
  });
  return { structural, circular };
}

class TechnicalEdgePass extends Pass {
  renderScene: THREE.Scene;
  renderCamera: ViewCamera;
  private normalMaterial: THREE.MeshNormalMaterial;
  private normalTarget: THREE.WebGLRenderTarget;
  private compositeMaterial: THREE.ShaderMaterial;
  private fullScreenQuad: FullScreenQuad;

  constructor(scene: THREE.Scene, camera: ViewCamera) {
    super();
    this.renderScene = scene;
    this.renderCamera = camera;
    this.normalMaterial = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide,
      flatShading: true,
      blending: THREE.NoBlending,
    });
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.normalTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.compositeMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.normalTarget.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        perspectiveCamera: { value: camera instanceof THREE.PerspectiveCamera ? 1 : 0 },
        edgeOpacity: { value: 0.42 },
        silhouetteWidth: { value: 1.08 },
        majorWidth: { value: 0.82 },
        silhouetteOpacity: { value: 0.7 },
        majorOpacity: { value: 0.5 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        #include <packing>
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D tNormal;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float perspectiveCamera;
        uniform float edgeOpacity;
        uniform float silhouetteWidth;
        uniform float majorWidth;
        uniform float silhouetteOpacity;
        uniform float majorOpacity;

        float viewDepth(const in float depth) {
          float viewZ = perspectiveCamera > 0.5
            ? perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
            : orthographicDepthToViewZ(depth, cameraNear, cameraFar);
          return abs(viewZ);
        }

        float detailAt(const in vec2 offset, const in vec3 centerNormal, const in float centerDepth) {
          vec2 uv = vUv + offset / resolution;
          float sampleDepth = texture2D(tDepth, uv).x;
          if (centerDepth > 0.99999) return 0.0;
          if (sampleDepth > 0.99999) return 0.0;
          vec3 sampleNormal = normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
          float normalGap = 1.0 - max(dot(centerNormal, sampleNormal), 0.0);
          float normalEdge = smoothstep(0.20, 0.48, normalGap);
          float z0 = viewDepth(centerDepth);
          float z1 = viewDepth(sampleDepth);
          float relativeDepth = abs(z0 - z1) / max(min(z0, z1), 0.001);
          float depthEdge = smoothstep(0.006, 0.028, relativeDepth);
          return max(normalEdge * 0.16, depthEdge);
        }

        float silhouetteAt(const in vec2 direction, const in float centerDepth) {
          if (centerDepth > 0.99999) return 0.0;
          vec2 uv = vUv + direction * silhouetteWidth / resolution;
          return texture2D(tDepth, uv).x > 0.99999 ? 1.0 : 0.0;
        }

        float majorDepthAt(const in vec2 direction, const in float centerDepth) {
          if (centerDepth > 0.99999) return 0.0;
          float sampleDepth = texture2D(tDepth, vUv + direction * majorWidth / resolution).x;
          if (sampleDepth > 0.99999) return 0.0;
          float z0 = viewDepth(centerDepth);
          float z1 = viewDepth(sampleDepth);
          float relativeDepth = abs(z0 - z1) / max(min(z0, z1), 0.001);
          return smoothstep(0.035, 0.11, relativeDepth);
        }

        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float centerDepth = texture2D(tDepth, vUv).x;
          vec3 centerNormal = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
          float seam = 0.0;
          seam = max(seam, detailAt(vec2(1.0, 0.0), centerNormal, centerDepth));
          seam = max(seam, detailAt(vec2(-1.0, 0.0), centerNormal, centerDepth));
          seam = max(seam, detailAt(vec2(0.0, 1.0), centerNormal, centerDepth));
          seam = max(seam, detailAt(vec2(0.0, -1.0), centerNormal, centerDepth));
          float silhouette = 0.0;
          silhouette = max(silhouette, silhouetteAt(vec2(1.0, 0.0), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(-1.0, 0.0), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(0.0, 1.0), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(0.0, -1.0), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(0.7071, 0.7071), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(-0.7071, 0.7071), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(0.7071, -0.7071), centerDepth));
          silhouette = max(silhouette, silhouetteAt(vec2(-0.7071, -0.7071), centerDepth));
          float majorEdge = 0.0;
          majorEdge = max(majorEdge, majorDepthAt(vec2(1.0, 0.0), centerDepth));
          majorEdge = max(majorEdge, majorDepthAt(vec2(-1.0, 0.0), centerDepth));
          majorEdge = max(majorEdge, majorDepthAt(vec2(0.0, 1.0), centerDepth));
          majorEdge = max(majorEdge, majorDepthAt(vec2(0.0, -1.0), centerDepth));
          float luminance = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 seamColor = luminance > 0.42 ? vec3(0.10) : vec3(1.0);
          float combinedEdge = max(
            max(seam * edgeOpacity, majorEdge * majorOpacity),
            silhouette * silhouetteOpacity
          );
          gl_FragColor = vec4(mix(base.rgb, seamColor, combinedEdge), base.a);
        }
      `,
    });
    this.fullScreenQuad = new FullScreenQuad(this.compositeMaterial);
  }

  setCamera(camera: ViewCamera) {
    this.renderCamera = camera;
  }

  setStrength(strength: number) {
    this.compositeMaterial.uniforms.edgeOpacity.value = strength;
  }

  setSilhouetteWidth(width: number) {
    this.compositeMaterial.uniforms.silhouetteWidth.value = width;
  }

  setMajorWidth(width: number) {
    this.compositeMaterial.uniforms.majorWidth.value = width;
  }

  setSilhouetteOpacity(opacity: number) {
    this.compositeMaterial.uniforms.silhouetteOpacity.value = opacity;
  }

  setMajorOpacity(opacity: number) {
    this.compositeMaterial.uniforms.majorOpacity.value = opacity;
  }

  setSize(width: number, height: number) {
    this.normalTarget.setSize(width, height);
    this.compositeMaterial.uniforms.resolution.value.set(width, height);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    const previousOverride = this.renderScene.overrideMaterial;
    const previousBackground = this.renderScene.background;
    const previousLayerMask = this.renderCamera.layers.mask;
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = renderer.getClearAlpha();

    this.renderScene.overrideMaterial = this.normalMaterial;
    this.renderScene.background = null;
    this.renderCamera.layers.set(1);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.normalTarget);
    renderer.clear();
    renderer.render(this.renderScene, this.renderCamera);

    this.renderScene.overrideMaterial = previousOverride;
    this.renderScene.background = previousBackground;
    this.renderCamera.layers.mask = previousLayerMask;
    renderer.setClearColor(previousClearColor, previousClearAlpha);

    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.cameraNear.value = this.renderCamera.near;
    this.compositeMaterial.uniforms.cameraFar.value = this.renderCamera.far;
    this.compositeMaterial.uniforms.perspectiveCamera.value =
      this.renderCamera instanceof THREE.PerspectiveCamera ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fullScreenQuad.render(renderer);
  }

  dispose() {
    this.normalMaterial.dispose();
    this.normalTarget.dispose();
    this.compositeMaterial.dispose();
    this.fullScreenQuad.dispose();
  }
}

type SelectionState = {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  helper: THREE.Box3Helper;
  decoration: THREE.Group;
  decorationLines: THREE.LineSegments;
  decorationPoints: THREE.Points;
  startedAt: number;
  durationMs: number;
  revealFrom: number;
};

const ModelViewport = forwardRef<ViewerHandle, ModelViewportProps>(
  function ModelViewport(
    {
      explode,
      frameAspect,
      viewMode,
      showBounds,
      contextMode,
      transitionStyle,
      strokeWeights,
      strokeOpacities,
      explodeFrame,
      rotationMotion,
      language,
      uiScale,
      onPartsChange,
      onSelectPart,
      onOrientationApplied,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const boundsInterfaceRef = useRef<HTMLDivElement>(null);
    const boundsLabelRef = useRef<HTMLSpanElement>(null);
    const boundsDataRef = useRef<HTMLElement>(null);
    const explainerRef = useRef<HTMLDivElement>(null);
    const explainerTitleRef = useRef<HTMLElement>(null);
    const explainerMetaRef = useRef<HTMLElement>(null);
    const pendingImportRef = useRef<{ object: THREE.Group; fileName: string } | null>(null);
    const exportOverlayRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const composerRef = useRef<EffectComposer | null>(null);
    const renderPassRef = useRef<RenderPass | null>(null);
    const outlinePassRef = useRef<OutlinePass | null>(null);
    const technicalEdgePassRef = useRef<TechnicalEdgePass | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<ViewCamera | null>(null);
    const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const axonometricCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const modelRef = useRef<THREE.Group | null>(null);
    const modelCenterRef = useRef(new THREE.Vector3());
    const visualCenterRef = useRef(new THREE.Vector3());
    const visualCenterReadyRef = useRef(false);
    const modelSpanRef = useRef(3);
    const modelBaseBoundsRef = useRef(new THREE.Box3());
    const meshRefs = useRef<THREE.Mesh[]>([]);
    const basePositions = useRef<Map<string, THREE.Vector3>>(new Map());
    const baseWorldCenters = useRef<Map<string, THREE.Vector3>>(new Map());
    const explodeRanks = useRef<Map<string, number>>(new Map());
    const manualOffsets = useRef<Map<string, THREE.Vector3>>(new Map());
    const selectionRef = useRef<SelectionState | null>(null);
    const recordingRef = useRef(false);
    const recordingTimeRef = useRef<number | null>(null);
    const renderSceneFrameRef = useRef<((delta: number) => void) | null>(null);
    const transitionStyleRef = useRef<TransitionStyle>("pop");
    const explodeRef = useRef(explode);
    const frameAspectRef = useRef(frameAspect);
    const languageRef = useRef<InterfaceLanguage>(language);
    const uiScaleRef = useRef(uiScale);
    const viewModeRef = useRef<ViewMode>(viewMode);
    const showBoundsRef = useRef(showBounds);
    const contextModeRef = useRef<ContextMode>(contextMode);
    const strokeWeightsRef = useRef<StrokeWeights>(strokeWeights);
    const strokeOpacitiesRef = useRef<StrokeOpacities>(strokeOpacities);
    const explodeFrameRef = useRef<ExplodeFrame>(explodeFrame);
    const rotationMotionRef = useRef<RotationMotion>(rotationMotion);
    const exportLineScaleRef = useRef(1);
    const onPartsChangeRef = useRef(onPartsChange);
    const onSelectPartRef = useRef(onSelectPart);
    const onOrientationAppliedRef = useRef(onOrientationApplied);
    const [orientationPrompt, setOrientationPrompt] = useState(false);
    const [orientationMode, setOrientationMode] = useState<ZOrientation>("positive-front");
    const [orientationRequired, setOrientationRequired] = useState(false);

    useLayoutEffect(() => {
      const mount = mountRef.current;
      const stage = mount?.parentElement;
      if (!mount || !stage) return;
      const fitFrame = () => {
        const availableWidth = Math.max(1, stage.clientWidth);
        const availableHeight = Math.max(1, stage.clientHeight);
        const aspect = THREE.MathUtils.clamp(frameAspect, 0.3, 2.2);
        const width = Math.min(availableWidth, availableHeight * aspect);
        const height = width / aspect;
        mount.style.width = `${width}px`;
        mount.style.height = `${height}px`;
      };
      fitFrame();
      let fitFrameRequest = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(fitFrameRequest);
        fitFrameRequest = requestAnimationFrame(fitFrame);
      });
      observer.observe(stage);
      return () => { observer.disconnect(); cancelAnimationFrame(fitFrameRequest); };
    }, [frameAspect]);

    const paintExportBackground = useCallback((context: CanvasRenderingContext2D, width: number, height: number) => {
      context.save();
      const vignette = context.createRadialGradient(
        width * 0.5,
        height * 0.44,
        0,
        width * 0.5,
        height * 0.44,
        Math.max(width, height) * 0.68,
      );
      vignette.addColorStop(0, "#0d0d0d");
      vignette.addColorStop(0.48, "#050505");
      vignette.addColorStop(1, "#010101");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(235,238,230,.045)";
      context.lineWidth = Math.max(1, width / 1900);
      const grid = Math.max(96, width / 16);
      context.beginPath();
      for (let x = 0; x <= width; x += grid) { context.moveTo(x, 0); context.lineTo(x, height); }
      for (let y = 0; y <= height; y += grid) { context.moveTo(0, y); context.lineTo(width, y); }
      context.stroke();
      context.restore();
    }, []);

    const paintExportOverlay = useCallback((context: CanvasRenderingContext2D, width: number, height: number) => {
      context.save();
      const selection = selectionRef.current;
      const camera = cameraRef.current;
      if (!selection || !camera || !showBoundsRef.current || !selection.mesh.visible) {
        context.restore();
        return;
      }
      camera.updateMatrixWorld(true);
      const projected = new THREE.Vector3();
      let minX = 1;
      let minY = 1;
      let maxX = -1;
      let maxY = -1;
      for (const x of [selection.box.min.x, selection.box.max.x]) {
        for (const y of [selection.box.min.y, selection.box.max.y]) {
          for (const z of [selection.box.min.z, selection.box.max.z]) {
            projected.set(x, y, z).project(camera);
            minX = Math.min(minX, projected.x);
            minY = Math.min(minY, projected.y);
            maxX = Math.max(maxX, projected.x);
            maxY = Math.max(maxY, projected.y);
          }
        }
      }
      const padding = Math.max(12, width * 0.006);
      const fontSize = Math.max(16, width / 150) * uiScaleRef.current;
      const left = THREE.MathUtils.clamp(((minX + 1) * 0.5) * width - padding, padding, width - padding * 5);
      const top = THREE.MathUtils.clamp(((1 - maxY) * 0.5) * height - padding, fontSize * 2.3, height - padding * 5);
      const right = THREE.MathUtils.clamp(((maxX + 1) * 0.5) * width + padding, left + padding * 3, width - padding);
      const bottom = THREE.MathUtils.clamp(((1 - minY) * 0.5) * height + padding, top + padding * 3, height - fontSize * 2.4);
      const boxWidth = right - left;
      const boxHeight = bottom - top;
      const corner = THREE.MathUtils.clamp(width * 0.01, 22, 48);
      const fineWidth = Math.max(1, width / 2200);
      context.strokeStyle = "rgba(245,246,240,.24)";
      context.lineWidth = fineWidth;
      context.strokeRect(left, top, boxWidth, boxHeight);
      const tickStep = Math.max(18, width * 0.0085);
      const tickLength = Math.max(5, width * 0.0022);
      context.strokeStyle = "rgba(235,238,231,.72)";
      context.beginPath();
      for (let x = left + tickStep; x < left + boxWidth; x += tickStep) {
        context.moveTo(x, top); context.lineTo(x, top + tickLength);
      }
      for (let y = top + tickStep; y < top + boxHeight; y += tickStep) {
        context.moveTo(left + boxWidth - tickLength, y); context.lineTo(left + boxWidth, y);
      }
      context.stroke();
      context.strokeStyle = "rgba(250,251,247,.96)";
      context.lineWidth = Math.max(1, width / 1600);
      context.beginPath();
      context.moveTo(left, top + corner); context.lineTo(left, top); context.lineTo(left + corner, top);
      context.moveTo(left + boxWidth - corner, top); context.lineTo(left + boxWidth, top); context.lineTo(left + boxWidth, top + corner);
      context.moveTo(left, top + boxHeight - corner); context.lineTo(left, top + boxHeight); context.lineTo(left + corner, top + boxHeight);
      context.moveTo(left + boxWidth - corner, top + boxHeight); context.lineTo(left + boxWidth, top + boxHeight); context.lineTo(left + boxWidth, top + boxHeight - corner);
      context.stroke();
      const nodeSize = Math.max(4, width / 900);
      context.fillStyle = "rgba(250,251,247,.98)";
      context.fillRect(left - nodeSize * 0.5, top - nodeSize * 0.5, nodeSize, nodeSize);
      context.fillRect(left + boxWidth - nodeSize * 0.5, top + boxHeight - nodeSize * 0.5, nodeSize, nodeSize);
      context.font = `500 ${fontSize}px Arial, sans-serif`;
      context.textAlign = "left";
      context.fillStyle = "rgba(246,248,241,.96)";
      context.fillText(boundsLabelRef.current?.textContent ?? "TRACK / MESH", left, Math.max(fontSize, top - fontSize * .65));
      context.textAlign = "right";
      context.font = `500 ${fontSize * 0.82}px Arial, sans-serif`;
      context.fillStyle = "rgba(190,195,186,.72)";
      context.fillText("BND · LIVE · LOCAL", left + boxWidth, Math.max(fontSize, top - fontSize * .65));
      const readout = `GEO  ${boundsDataRef.current?.textContent ?? "X -- / Y -- / Z -- · -- TRIS"}   SYNC 100%`;
      context.font = `500 ${fontSize * 0.72}px Arial, sans-serif`;
      const readoutWidth = context.measureText(readout).width + fontSize;
      context.fillStyle = "rgba(2,3,2,.82)";
      context.fillRect(left + boxWidth - readoutWidth, top + boxHeight + fontSize * 0.35, readoutWidth, fontSize * 1.5);
      context.fillStyle = "rgba(202,207,198,.86)";
      context.fillText(
        readout,
        left + boxWidth,
        top + boxHeight + fontSize * 1.55,
      );
      const title = explainerTitleRef.current?.textContent;
      if (title && explodeRef.current > 0) {
        const displayScale = uiScaleRef.current;
        const titleSize = Math.max(22, width / 108) * displayScale;
        const captionY = height - Math.max(height * 0.075, titleSize * 2.2);
        context.textAlign = "center";
        context.fillStyle = "rgba(244,246,239,.92)";
        context.font = `500 ${titleSize}px Arial, sans-serif`;
        context.fillText(title, width * 0.5, captionY);
        context.fillStyle = "rgba(178,184,175,.7)";
        context.font = `500 ${titleSize * 0.42}px Arial, sans-serif`;
        context.fillText(explainerMetaRef.current?.textContent ?? "ISOLATED VIEW", width * 0.5, captionY + titleSize * 0.82);
        context.strokeStyle = "rgba(240,242,235,.35)";
        context.lineWidth = Math.max(1, width / 2600);
        context.beginPath();
        context.moveTo(width * 0.36, captionY - titleSize * 0.72);
        context.lineTo(width * 0.64, captionY - titleSize * 0.72);
        context.stroke();
      }
      context.restore();
    }, []);

    const prepareExportResolution = useCallback((width: number, height: number) => {
      const renderer = rendererRef.current;
      const composer = composerRef.current;
      const mount = mountRef.current;
      if (!renderer || !composer || !mount) return () => undefined;
      const viewportWidth = Math.max(1, mount.clientWidth);
      const viewportHeight = Math.max(1, mount.clientHeight);
      const viewportAspect = frameAspectRef.current;
      const targetAspect = width / Math.max(height, 1);
      const renderWidth = Math.max(1, Math.round(viewportAspect > targetAspect ? width : height * viewportAspect));
      const renderHeight = Math.max(1, Math.round(viewportAspect > targetAspect ? width / viewportAspect : height));
      const previewBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      const previewSamples: [number, number] = [composer.renderTarget1.samples, composer.renderTarget2.samples];
      const lineScale = THREE.MathUtils.clamp(renderWidth / Math.max(previewBuffer.x, 1), 1, 4);
      exportLineScaleRef.current = lineScale;
      const lineWidths: Array<[LineMaterial, number]> = [];
      meshRefs.current.forEach((mesh) => {
        mesh.children.forEach((child) => {
          if (!(child instanceof LineSegments2)) return;
          const material = child.material as LineMaterial;
          lineWidths.push([material, material.linewidth]);
          material.linewidth *= lineScale;
        });
      });
      technicalEdgePassRef.current?.setSilhouetteWidth(
        STROKE_WIDTHS[strokeWeightsRef.current.silhouette] * lineScale,
      );
      technicalEdgePassRef.current?.setMajorWidth(
        STROKE_WIDTHS[strokeWeightsRef.current.major] * lineScale,
      );
      // A 4x multisampled 3840px render target can exceed the GPU memory budget on
      // portrait and 5:4 exports. The full-resolution render is already supersampled
      // relative to the preview, so export with single-sample targets and keep the
      // interactive preview at 4x MSAA.
      composer.renderTarget1.samples = 0;
      composer.renderTarget2.samples = 0;
      renderer.setPixelRatio(1);
      renderer.setSize(renderWidth, renderHeight, false);
      composer.setPixelRatio(1);
      composer.setSize(renderWidth, renderHeight);
      return () => {
        exportLineScaleRef.current = 1;
        const previewRatio = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(previewRatio);
        renderer.setSize(viewportWidth, viewportHeight, false);
        composer.renderTarget1.samples = previewSamples[0];
        composer.renderTarget2.samples = previewSamples[1];
        composer.setPixelRatio(previewRatio);
        composer.setSize(viewportWidth, viewportHeight);
        lineWidths.forEach(([material, linewidth]) => { material.linewidth = linewidth; });
        technicalEdgePassRef.current?.setSilhouetteWidth(STROKE_WIDTHS[strokeWeightsRef.current.silhouette]);
        technicalEdgePassRef.current?.setMajorWidth(STROKE_WIDTHS[strokeWeightsRef.current.major]);
      };
    }, []);

    const composeExportFrame = useCallback((target: HTMLCanvasElement) => {
      const source = rendererRef.current?.domElement;
      if (!source) return;
      const context = target.getContext("2d", { alpha: false });
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const width = target.width;
      const height = target.height;
      context.fillStyle = "#020302";
      context.fillRect(0, 0, width, height);
      paintExportBackground(context, width, height);
      const sourceAspect = source.width / Math.max(source.height, 1);
      const targetAspect = width / Math.max(height, 1);
      const drawWidth = sourceAspect > targetAspect ? width : height * sourceAspect;
      const drawHeight = sourceAspect > targetAspect ? width / sourceAspect : height;
      const drawX = (width - drawWidth) / 2;
      const drawY = (height - drawHeight) / 2;
      context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      paintExportOverlay(context, width, height);
    }, [paintExportBackground, paintExportOverlay]);

    useEffect(() => {
      explodeRef.current = explode;
    }, [explode]);

    useLayoutEffect(() => {
      frameAspectRef.current = frameAspect;
    }, [frameAspect]);

    useEffect(() => {
      viewModeRef.current = viewMode;
    }, [viewMode]);

    useEffect(() => {
      showBoundsRef.current = showBounds;
    }, [showBounds]);

    useEffect(() => {
      contextModeRef.current = contextMode;
    }, [contextMode]);

    useEffect(() => {
      strokeWeightsRef.current = strokeWeights;
    }, [strokeWeights]);

    useEffect(() => {
      strokeOpacitiesRef.current = strokeOpacities;
    }, [strokeOpacities]);

    useEffect(() => {
      languageRef.current = language;
    }, [language]);

    useEffect(() => {
      uiScaleRef.current = uiScale;
    }, [uiScale]);

    useEffect(() => {
      transitionStyleRef.current = transitionStyle;
    }, [transitionStyle]);

    useEffect(() => {
      onPartsChangeRef.current = onPartsChange;
    }, [onPartsChange]);

    useEffect(() => {
      onSelectPartRef.current = onSelectPart;
    }, [onSelectPart]);

    useEffect(() => {
      onOrientationAppliedRef.current = onOrientationApplied;
    }, [onOrientationApplied]);

    const clearSelection = useCallback((preserveInterface = false) => {
      const selection = selectionRef.current;
      const scene = sceneRef.current;
      if (!selection) return;
      scene?.remove(selection.helper);
      scene?.remove(selection.decoration);
      selection.helper.geometry.dispose();
      (selection.helper.material as THREE.Material).dispose();
      selection.decorationLines.geometry.dispose();
      (selection.decorationLines.material as THREE.Material).dispose();
      selection.decorationPoints.geometry.dispose();
      (selection.decorationPoints.material as THREE.Material).dispose();
      selectionRef.current = null;
      if (boundsInterfaceRef.current && !preserveInterface) boundsInterfaceRef.current.hidden = true;
      if (explainerRef.current && !preserveInterface) explainerRef.current.hidden = true;
    }, []);

    const resetMaterials = useCallback(() => {
      const lineScale = exportLineScaleRef.current;
      const baseWidth = STROKE_WIDTHS[strokeWeightsRef.current.structure] * lineScale;
      const ellipseWidth = STROKE_WIDTHS[strokeWeightsRef.current.ellipse] * lineScale;
      meshRefs.current.forEach((mesh, index) => {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const color = mesh.userData.baseColor ?? MODEL_COLORS[index % MODEL_COLORS.length];
        material.color.setHex(color);
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.opacity = 0.82;
        material.transparent = true;
        material.depthWrite = true;
        if (material.userData.dissolveUniform) material.userData.dissolveUniform.value = 1;
        const visibleOutline = mesh.children.find((child) => child.userData.isVisibleEdge) as LineSegments2 | undefined;
        const hiddenTrace = mesh.children.find((child) => child.userData.isHiddenTrace) as LineSegments2 | undefined;
        const curvedDetail = mesh.children.find((child) => child.userData.isCurvedDetail) as LineSegments2 | undefined;
        if (visibleOutline) {
          const lineMaterial = visibleOutline.material as LineMaterial;
          const dimmed = contextModeRef.current === "dim";
          lineMaterial.color.setHex(0xffffff);
          lineMaterial.opacity = (dimmed ? 0.15 : 0.58) * strokeOpacitiesRef.current.structure;
          lineMaterial.linewidth = baseWidth;
          lineMaterial.dashed = dimmed;
        }
        if (hiddenTrace) {
          const hiddenMaterial = hiddenTrace.material as LineMaterial;
          hiddenMaterial.color.setHex(0xffffff);
          hiddenMaterial.opacity = (contextModeRef.current === "dim" ? 0.025 : 0.1) * strokeOpacitiesRef.current.structure;
          hiddenMaterial.linewidth = Math.max(0.28 * lineScale, baseWidth * 0.46);
          hiddenMaterial.dashed = true;
        }
        if (curvedDetail) {
          const curvedMaterial = curvedDetail.material as LineMaterial;
          const dimmed = contextModeRef.current === "dim";
          curvedMaterial.color.setHex(0xffffff);
          curvedMaterial.opacity = (dimmed ? 0.025 : 0.16) * strokeOpacitiesRef.current.ellipse;
          curvedMaterial.linewidth = ellipseWidth;
          curvedMaterial.dashed = false;
        }
      });
    }, []);

    const applyExplodeAmount = useCallback((amount: number, layoutOffsets?: number[][]) => {
      explodeRef.current = THREE.MathUtils.clamp(amount, 0, 1500);
      const formation = explodeRef.current / 1500;
      const camera = cameraRef.current;
      if (!camera) return;
      if (layoutOffsets) {
        meshRefs.current.forEach((mesh, index) => {
          const offset = layoutOffsets[index];
          if (offset) manualOffsets.current.set(mesh.uuid, new THREE.Vector3(
            offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0,
          ));
        });
      }
      applyCanvasExplode(
        meshRefs.current, basePositions.current, explodeRanks.current,
        manualOffsets.current, camera, explodeFrameRef.current, formation,
      );
      if (explainerRef.current) explainerRef.current.hidden = !selectionRef.current || explodeRef.current <= 0;
    }, []);

    useEffect(() => {
      explodeFrameRef.current = explodeFrame;
      applyExplodeAmount(explodeRef.current);
    }, [applyExplodeAmount, explodeFrame]);

    useEffect(() => {
      if (!recordingRef.current) rotationMotionRef.current = rotationMotion;
    }, [rotationMotion]);

    const applyContextMode = useCallback((mode: ContextMode) => {
      contextModeRef.current = mode;
      const selectedMesh = selectionRef.current?.mesh;
      const lineScale = exportLineScaleRef.current;
      const baseWidth = STROKE_WIDTHS[strokeWeightsRef.current.structure] * lineScale;
      const ellipseWidth = STROKE_WIDTHS[strokeWeightsRef.current.ellipse] * lineScale;
      meshRefs.current.forEach((mesh) => {
        if (mesh === selectedMesh) return;
        const visibleOutline = mesh.children.find((child) => child.userData.isVisibleEdge) as LineSegments2 | undefined;
        const hiddenTrace = mesh.children.find((child) => child.userData.isHiddenTrace) as LineSegments2 | undefined;
        const curvedDetail = mesh.children.find((child) => child.userData.isCurvedDetail) as LineSegments2 | undefined;
        const dimmed = mode === "dim";
        if (visibleOutline) {
          const lineMaterial = visibleOutline.material as LineMaterial;
          lineMaterial.color.setHex(0xffffff);
          lineMaterial.opacity = selectedMesh
            ? (dimmed ? 0.075 : 0.42) * strokeOpacitiesRef.current.structure
            : (dimmed ? 0.15 : 0.58) * strokeOpacitiesRef.current.structure;
          lineMaterial.linewidth = baseWidth;
          lineMaterial.dashed = dimmed;
        }
        if (hiddenTrace) {
          const hiddenMaterial = hiddenTrace.material as LineMaterial;
          hiddenMaterial.color.setHex(0xffffff);
          hiddenMaterial.opacity = selectedMesh
            ? (dimmed ? 0.015 : 0.045) * strokeOpacitiesRef.current.structure
            : (dimmed ? 0.025 : 0.1) * strokeOpacitiesRef.current.structure;
          hiddenMaterial.linewidth = Math.max(0.28 * lineScale, baseWidth * 0.46);
          hiddenMaterial.dashed = true;
        }
        if (curvedDetail) {
          const curvedMaterial = curvedDetail.material as LineMaterial;
          curvedMaterial.color.setHex(0xffffff);
          curvedMaterial.opacity = selectedMesh
            ? (dimmed ? 0.012 : 0.075) * strokeOpacitiesRef.current.ellipse
            : (dimmed ? 0.025 : 0.16) * strokeOpacitiesRef.current.ellipse;
          curvedMaterial.linewidth = ellipseWidth;
          curvedMaterial.dashed = false;
        }
      });
      if (outlinePassRef.current) {
        outlinePassRef.current.visibleEdgeColor.setHex(mode === "dim" ? 0x343733 : 0xc2c5be);
        outlinePassRef.current.edgeStrength = mode === "dim" ? 0.08 : selectedMesh ? 1.05 : 1.42;
        outlinePassRef.current.edgeThickness = mode === "dim" ? 0.22 : selectedMesh ? 0.4 : 0.46;
      }
      if (technicalEdgePassRef.current) {
        technicalEdgePassRef.current.enabled = true;
        technicalEdgePassRef.current.setStrength(mode === "dim" ? 0.08 : selectedMesh ? 0.34 : 0.44);
        technicalEdgePassRef.current.setSilhouetteWidth(
          STROKE_WIDTHS[strokeWeightsRef.current.silhouette] * lineScale,
        );
        technicalEdgePassRef.current.setMajorWidth(STROKE_WIDTHS[strokeWeightsRef.current.major] * lineScale);
        technicalEdgePassRef.current.setSilhouetteOpacity(strokeOpacitiesRef.current.silhouette);
        technicalEdgePassRef.current.setMajorOpacity(strokeOpacitiesRef.current.major);
      }
    }, []);

    useEffect(() => {
      applyContextMode(contextMode);
      const selectedMesh = selectionRef.current?.mesh;
      if (!selectedMesh) return;
      const lineScale = exportLineScaleRef.current;
      const baseWidth = STROKE_WIDTHS[strokeWeights.structure] * lineScale;
      const ellipseWidth = STROKE_WIDTHS[strokeWeights.ellipse] * lineScale;
      const selectedOutline = selectedMesh.children.find(
        (child) => child.userData.isVisibleEdge,
      ) as LineSegments2 | undefined;
      const selectedHiddenTrace = selectedMesh.children.find(
        (child) => child.userData.isHiddenTrace,
      ) as LineSegments2 | undefined;
      const selectedCurvedDetail = selectedMesh.children.find(
        (child) => child.userData.isCurvedDetail,
      ) as LineSegments2 | undefined;
      if (selectedOutline) {
        (selectedOutline.material as LineMaterial).linewidth = baseWidth;
      }
      if (selectedHiddenTrace) {
        (selectedHiddenTrace.material as LineMaterial).linewidth = Math.max(0.28 * lineScale, baseWidth * 0.46);
      }
      if (selectedCurvedDetail) {
        (selectedCurvedDetail.material as LineMaterial).linewidth = ellipseWidth;
      }
      technicalEdgePassRef.current?.setSilhouetteWidth(STROKE_WIDTHS[strokeWeights.silhouette] * lineScale);
      technicalEdgePassRef.current?.setMajorWidth(STROKE_WIDTHS[strokeWeights.major] * lineScale);
      technicalEdgePassRef.current?.setSilhouetteOpacity(strokeOpacities.silhouette);
      technicalEdgePassRef.current?.setMajorOpacity(strokeOpacities.major);
    }, [applyContextMode, contextMode, strokeOpacities, strokeWeights]);

    const selectMesh = useCallback(
      (index: number, dissolve = 0.6) => {
        const preserveInterface = index >= 0 && Boolean(selectionRef.current);
        clearSelection(preserveInterface);
        resetMaterials();
        applyExplodeAmount(explodeRef.current);
        if (index >= 0 && meshRefs.current[index]) {
          const mesh = meshRefs.current[index];
          const lineScale = exportLineScaleRef.current;
          const baseWidth = STROKE_WIDTHS[strokeWeightsRef.current.structure] * lineScale;
          const ellipseWidth = STROKE_WIDTHS[strokeWeightsRef.current.ellipse] * lineScale;
          const material = mesh.material as THREE.MeshStandardMaterial;
          material.color.setHex(0xffffff);
          material.emissive.setHex(0xffffff);
          material.emissiveIntensity = 0;
          material.opacity = 0.06;
          if (material.userData.dissolveUniform) material.userData.dissolveUniform.value = 0;
          const visibleOutline = mesh.children.find((child) => child.userData.isVisibleEdge) as LineSegments2 | undefined;
          const hiddenTrace = mesh.children.find((child) => child.userData.isHiddenTrace) as LineSegments2 | undefined;
          const curvedDetail = mesh.children.find((child) => child.userData.isCurvedDetail) as LineSegments2 | undefined;
          if (visibleOutline) {
            const lineMaterial = visibleOutline.material as LineMaterial;
            lineMaterial.color.setHex(0x101010);
            lineMaterial.opacity = 0.34 * strokeOpacitiesRef.current.structure;
            lineMaterial.linewidth = baseWidth;
            lineMaterial.dashed = false;
          }
          if (hiddenTrace) {
            const hiddenMaterial = hiddenTrace.material as LineMaterial;
            hiddenMaterial.color.setHex(0xffffff);
            hiddenMaterial.opacity = 0.2 * strokeOpacitiesRef.current.structure;
            hiddenMaterial.linewidth = Math.max(0.28 * lineScale, baseWidth * 0.46);
            hiddenMaterial.dashed = true;
          }
          if (curvedDetail) {
            const curvedMaterial = curvedDetail.material as LineMaterial;
            curvedMaterial.color.setHex(0xffffff);
            curvedMaterial.opacity = 0.06 * strokeOpacitiesRef.current.ellipse;
            curvedMaterial.linewidth = ellipseWidth;
            curvedMaterial.dashed = false;
          }
          const scene = sceneRef.current;
          if (scene) {
            const rawBox = new THREE.Box3().setFromObject(mesh);
            const rawSize = rawBox.getSize(new THREE.Vector3());
            const box = rawBox.clone().expandByScalar(0.18);
            const helper = new THREE.Box3Helper(box, 0xffffff);
            const helperMaterial = helper.material as THREE.LineBasicMaterial;
            helperMaterial.transparent = true;
            helperMaterial.opacity = 0;
            helperMaterial.depthTest = false;
            helperMaterial.depthWrite = false;
            helperMaterial.toneMapped = false;
            helper.renderOrder = 100;
            helper.visible = showBoundsRef.current;
            scene.add(helper);
            const decoration = new THREE.Group();
            const decorationLines = new THREE.LineSegments(
              new THREE.BufferGeometry().setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(24 * 2 * 3), 3),
              ),
              new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
              }),
            );
            const decorationPoints = new THREE.Points(
              new THREE.BufferGeometry().setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(8 * 3), 3),
              ),
              new THREE.PointsMaterial({
                color: 0xffffff,
                size: 2.2,
                sizeAttenuation: false,
                transparent: true,
                opacity: 0,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
              }),
            );
            decorationLines.renderOrder = 101;
            decorationPoints.renderOrder = 102;
            decoration.add(decorationLines, decorationPoints);
            decoration.visible = showBoundsRef.current;
            scene.add(decoration);
            selectionRef.current = {
              mesh,
              box,
              helper,
              decoration,
              decorationLines,
              decorationPoints,
              startedAt: recordingTimeRef.current ?? performance.now(),
              durationMs: THREE.MathUtils.clamp(dissolve, 0.08, 2.5) * 1000,
              revealFrom: preserveInterface ? 1 : 0,
            };
            applyExplodeAmount(explodeRef.current);
            // Selection adds a small frame-relative pop without changing camera scale.
            applyContextMode(contextModeRef.current);
            if (boundsLabelRef.current) {
              boundsLabelRef.current.textContent = `TRACK_${String(index + 1).padStart(2, "0")} / ${mesh.name.toUpperCase()}`;
            }
            if (boundsDataRef.current) {
              const positionCount = mesh.geometry.attributes.position?.count ?? 0;
              const triangles = mesh.geometry.index
                ? mesh.geometry.index.count / 3
                : positionCount / 3;
              boundsDataRef.current.textContent =
                `X ${rawSize.x.toFixed(2)} / Y ${rawSize.y.toFixed(2)} / Z ${rawSize.z.toFixed(2)} · ${formatTriangles(Math.round(triangles))} TRIS`;
            }
            if (explainerRef.current) explainerRef.current.hidden = explodeRef.current <= 0;
            if (explainerTitleRef.current) explainerTitleRef.current.textContent = mesh.name.toUpperCase();
            if (explainerMetaRef.current) {
              explainerMetaRef.current.textContent = languageRef.current === "zh"
                ? `结构节点 ${String(index + 1).padStart(2, "0")} · 已分离展示`
                : `STRUCTURAL NODE ${String(index + 1).padStart(2, "0")} · ISOLATED VIEW`;
            }
          }
        }
      },
      [applyContextMode, applyExplodeAmount, clearSelection, resetMaterials],
    );

    const calculateVisualCenter = useCallback(() => {
      const weightedCenter = new THREE.Vector3();
      const size = new THREE.Vector3();
      let totalWeight = 0;
      meshRefs.current.forEach((mesh) => {
        if (!mesh.visible) return;
        const bounds = new THREE.Box3().setFromObject(mesh);
        bounds.getSize(size);
        // Surface-area weighting keeps the pivot with the primary visible mass
        // without letting triangle-dense fasteners or remote micro-details pull it away.
        const visualWeight = Math.max(
          size.x * size.y + size.y * size.z + size.z * size.x,
          Math.max(size.x, size.y, size.z) ** 2 * 0.08,
          0.0001,
        );
        const baseCenter = baseWorldCenters.current.get(mesh.uuid)
          ?? bounds.getCenter(new THREE.Vector3());
        weightedCenter.addScaledVector(baseCenter, visualWeight);
        totalWeight += visualWeight;
      });
      if (totalWeight > 0) weightedCenter.divideScalar(totalWeight);
      else weightedCenter.copy(modelCenterRef.current);
      visualCenterRef.current.copy(weightedCenter);
      visualCenterReadyRef.current = true;
      return weightedCenter;
    }, []);

    const applyRotationMotion = useCallback((delta: number) => {
      const motion = rotationMotionRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!motion.enabled || !camera || !controls || delta <= 0) return;
      const center = visualCenterReadyRef.current
        ? visualCenterRef.current
        : modelCenterRef.current;
      const offset = camera.position.clone().sub(center);
      if (offset.lengthSq() < 0.000001) return;
      const direction = motion.direction === "clockwise" ? -1 : 1;
      const radians = THREE.MathUtils.degToRad(
        THREE.MathUtils.clamp(motion.degreesPerSecond, 1, 120) * delta * direction,
      );
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
      camera.position.copy(center).add(offset);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      controls.target.copy(center);
    }, []);

    const frameModel = useCallback(() => {
      const model = modelRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const mount = mountRef.current;
      if (!model || !camera || !controls || !mount) return;
      const box = modelBaseBoundsRef.current.isEmpty()
        ? new THREE.Box3().setFromObject(model)
        : modelBaseBoundsRef.current.clone();
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const orbitCenter = visualCenterReadyRef.current
        ? visualCenterRef.current
        : center;
      const radius = (Math.max(size.x, size.y, size.z) || 3) * 0.78;
      const crop = explodeFrameRef.current;
      const horizontalSafe = Math.max(0.1, 1 - 2 * Math.max(crop.left, crop.right) / 100) * 0.94;
      const verticalSafe = Math.max(0.1, 1 - 2 * Math.max(crop.top, crop.bottom) / 100) * 0.8;
      camera.zoom = 1;
      if (camera instanceof THREE.OrthographicCamera) {
        const aspect = THREE.MathUtils.clamp(frameAspectRef.current, 0.3, 2.2);
        camera.position.copy(orbitCenter).add(
          new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(radius * 4),
        );
        camera.lookAt(orbitCenter);
        camera.updateMatrixWorld(true);
        const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
        const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
        const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion);
        let projectedHalfWidth = 0;
        let projectedHalfHeight = 0;
        const corner = new THREE.Vector3();
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              corner.set(x, y, z).sub(orbitCenter);
              projectedHalfWidth = Math.max(projectedHalfWidth, Math.abs(corner.dot(screenRight)));
              projectedHalfHeight = Math.max(projectedHalfHeight, Math.abs(corner.dot(screenUp)));
            }
          }
        }
        const halfHeight = Math.max(
          projectedHalfHeight / verticalSafe,
          projectedHalfWidth / Math.max(aspect * horizontalSafe, 0.1),
          0.1,
        );
        camera.userData.halfHeight = halfHeight;
        camera.left = -halfHeight * aspect;
        camera.right = halfHeight * aspect;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
      } else {
        camera.position.copy(orbitCenter).add(new THREE.Vector3(radius * 1.15, radius * 0.72, radius * 1.55));
      }
      camera.near = Math.max(radius / 100, 0.01);
      camera.far = radius * 100;
      camera.lookAt(orbitCenter);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = frameAspectRef.current;
        camera.updateProjectionMatrix();
        let width = 0;
        let height = 0;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          width = Math.max(width, Math.abs(point.x));
          height = Math.max(height, Math.abs(point.y));
        }
        camera.zoom = Math.min(horizontalSafe / Math.max(width, 0.001), verticalSafe / Math.max(height, 0.001));
        camera.updateProjectionMatrix();
      }
      controls.target.copy(orbitCenter);
      controls.update();
    }, []);

    const deleteMesh = useCallback((index: number) => {
      const mesh = meshRefs.current[index];
      if (!mesh || meshRefs.current.length <= 1) return false;
      clearSelection();
      const parent = mesh.parent;
      parent?.remove(mesh);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Points) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      basePositions.current.delete(mesh.uuid);
      baseWorldCenters.current.delete(mesh.uuid);
      explodeRanks.current.delete(mesh.uuid);
      manualOffsets.current.delete(mesh.uuid);
      meshRefs.current = meshRefs.current.filter((candidate) => candidate !== mesh);
      if (outlinePassRef.current) outlinePassRef.current.selectedObjects = meshRefs.current;
      const currentModel = modelRef.current;
      if (currentModel && meshRefs.current.length) {
        const displayedPositions = meshRefs.current.map((candidate) => candidate.position.clone());
        meshRefs.current.forEach((candidate) => {
          const base = basePositions.current.get(candidate.uuid);
          if (base) candidate.position.copy(base);
        });
        currentModel.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(currentModel);
        modelBaseBoundsRef.current.copy(bounds);
        modelCenterRef.current.copy(bounds.getCenter(new THREE.Vector3()));
        modelSpanRef.current = Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) || 3;
        meshRefs.current.forEach((candidate, candidateIndex) => {
          candidate.position.copy(displayedPositions[candidateIndex]);
        });
        currentModel.updateMatrixWorld(true);

      }
      calculateVisualCenter();
      applyExplodeAmount(explodeRef.current);
      resetMaterials();
      return true;
    }, [applyExplodeAmount, calculateVisualCenter, clearSelection, resetMaterials]);

    const registerModel = useCallback(
      (incoming: THREE.Group, modelName: string) => {
        const scene = sceneRef.current;
        if (!scene) return;

        clearSelection();

        if (modelRef.current) {
          scene.remove(modelRef.current);
          modelRef.current.traverse((object) => {
            if (object.userData.isEdgeOutline) {
              (object as LineSegments2).geometry.dispose();
              ((object as LineSegments2).material as THREE.Material).dispose();
              return;
            }
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
              materials.forEach((material) => material.dispose());
            }
          });
        }

        const firstBox = new THREE.Box3().setFromObject(incoming);
        const firstSize = firstBox.getSize(new THREE.Vector3());
        const maxDimension = Math.max(firstSize.x, firstSize.y, firstSize.z) || 1;
        incoming.scale.setScalar(4.8 / maxDimension);
        incoming.updateMatrixWorld(true);
        const centeredBox = new THREE.Box3().setFromObject(incoming);
        const center = centeredBox.getCenter(new THREE.Vector3());
        incoming.position.sub(center);
        incoming.updateMatrixWorld(true);

        const meshes: THREE.Mesh[] = [];
        incoming.traverse((object) => {
          if (object.userData.isEdgeOutline) return;
          if (!(object instanceof THREE.Mesh)) return;

          const meshIndex = meshes.length;
          const fallbackColor = MODEL_COLORS[meshIndex % MODEL_COLORS.length];
          const sourceMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          const material = new THREE.MeshStandardMaterial({
            color: fallbackColor,
            roughness: 1,
            metalness: 0,
            flatShading: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.82,
            depthWrite: true,
          });
          material.userData.dissolveUniform = { value: 1 };
          material.onBeforeCompile = (shader) => {
            shader.uniforms.uDissolve = material.userData.dissolveUniform;
            shader.fragmentShader = shader.fragmentShader.replace(
              "void main() {",
              `
                uniform float uDissolve;
                float dissolveHash(vec2 point) {
                  return fract(sin(dot(floor(point), vec2(12.9898, 78.233))) * 43758.5453);
                }
                void main() {
                  if (dissolveHash(gl_FragCoord.xy) > uDissolve) discard;
              `,
            );
          };
          material.customProgramCacheKey = () => "meshroom-dissolve-v1";
          object.material = material;
          sourceMaterials.forEach((sourceMaterial) => sourceMaterial.dispose());
          object.castShadow = false;
          object.receiveShadow = false;
          object.layers.set(1);
          object.renderOrder = 1;
          object.name = object.name || `Mesh_${String(meshIndex + 1).padStart(2, "0")}`;
          object.userData.baseColor = fallbackColor;
          const sourceEdges = new THREE.EdgesGeometry(object.geometry, 28);
          const edgeGroups = splitCircularEdgeLoops(sourceEdges);
          sourceEdges.dispose();
          const dimmedContext = contextModeRef.current === "dim";
          const baseWidth = STROKE_WIDTHS[strokeWeightsRef.current.structure];
          const ellipseWidth = STROKE_WIDTHS[strokeWeightsRef.current.ellipse];
          object.geometry.computeBoundingSphere();
          const dashUnit = Math.max(object.geometry.boundingSphere?.radius ?? 1, 0.001);
          if (edgeGroups.structural.length) {
            const outlineGeometry = new LineSegmentsGeometry();
            outlineGeometry.setPositions(edgeGroups.structural);
            const outline = new LineSegments2(
              outlineGeometry,
              new LineMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: (dimmedContext ? 0.15 : 0.58) * strokeOpacitiesRef.current.structure,
                linewidth: dimmedContext ? Math.max(0.3, baseWidth * 0.58) : baseWidth,
                dashed: dimmedContext,
                dashScale: 1,
                dashSize: dashUnit * 0.035,
                gapSize: dashUnit * 0.055,
                worldUnits: false,
                alphaToCoverage: true,
                depthTest: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
              }),
            );
            outline.computeLineDistances();
            outline.userData.isEdgeOutline = true;
            outline.userData.isVisibleEdge = true;
            outline.renderOrder = 16;
            outline.frustumCulled = false;
            const hiddenGeometry = new LineSegmentsGeometry();
            hiddenGeometry.setPositions(edgeGroups.structural);
            const hiddenTrace = new LineSegments2(
              hiddenGeometry,
              new LineMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: (dimmedContext ? 0.025 : 0.1) * strokeOpacitiesRef.current.structure,
                linewidth: dimmedContext
                  ? Math.max(0.24, baseWidth * 0.3)
                  : Math.max(0.28, baseWidth * 0.46),
                dashed: true,
                dashScale: 1,
                dashSize: dashUnit * 0.028,
                gapSize: dashUnit * 0.07,
                worldUnits: false,
                alphaToCoverage: true,
                depthTest: true,
                depthFunc: THREE.GreaterDepth,
                depthWrite: false,
              }),
            );
            hiddenTrace.computeLineDistances();
            hiddenTrace.userData.isEdgeOutline = true;
            hiddenTrace.userData.isHiddenTrace = true;
            hiddenTrace.renderOrder = 14;
            hiddenTrace.frustumCulled = false;
            object.add(hiddenTrace, outline);
          }
          if (edgeGroups.circular.length) {
            const circularGeometry = new LineSegmentsGeometry();
            circularGeometry.setPositions(edgeGroups.circular);
            const circularOutline = new LineSegments2(
              circularGeometry,
              new LineMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: (dimmedContext ? 0.025 : 0.16) * strokeOpacitiesRef.current.ellipse,
                linewidth: ellipseWidth,
                worldUnits: false,
                alphaToCoverage: true,
                depthTest: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
              }),
            );
            circularOutline.userData.isEdgeOutline = true;
            circularOutline.userData.isCurvedDetail = true;
            circularOutline.renderOrder = 15;
            circularOutline.frustumCulled = false;
            object.add(circularOutline);
          }
          meshes.push(object);
        });

        modelRef.current = incoming;
        meshRefs.current = meshes;
        if (outlinePassRef.current) outlinePassRef.current.selectedObjects = meshes;
        basePositions.current.clear();
        baseWorldCenters.current.clear();
        explodeRanks.current.clear();
        manualOffsets.current.clear();
        scene.add(incoming);
        incoming.updateMatrixWorld(true);
        const modelCenter = new THREE.Box3().setFromObject(incoming).getCenter(new THREE.Vector3());
        modelBaseBoundsRef.current.setFromObject(incoming);
        modelCenterRef.current.copy(modelCenter);
        modelSpanRef.current = Math.max(
          ...new THREE.Box3().setFromObject(incoming).getSize(new THREE.Vector3()).toArray(),
        ) || 3;
        meshes.forEach((mesh) => {
          basePositions.current.set(mesh.uuid, mesh.position.clone());
          baseWorldCenters.current.set(mesh.uuid, new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()));
          manualOffsets.current.set(mesh.uuid, new THREE.Vector3());
        });
        calculateVisualCenter();
        applyExplodeAmount(explodeRef.current);

        const safeName = modelName.replace(/\.(obj|fbx|glb)$/i, "");
        const partData = meshes.map((mesh, index) => {
          const positionCount = mesh.geometry.attributes.position?.count ?? 0;
          const triangles = mesh.geometry.index
            ? mesh.geometry.index.count / 3
            : positionCount / 3;
          return {
            id: mesh.uuid,
            name: mesh.name || `${safeName}_part_${index + 1}`,
            triangles: Math.max(1, Math.round(triangles)),
            visible: mesh.visible,
          };
        });
        onPartsChangeRef.current(partData);
        selectMesh(-1);
        onSelectPartRef.current(-1);
        frameModel();
        applyExplodeAmount(explodeRef.current);
      },
      [applyExplodeAmount, calculateVisualCenter, clearSelection, frameModel, selectMesh],
    );

    const applyZOrientation = useCallback((mode: ZOrientation) => {
      const pending = pendingImportRef.current;
      const target = pending?.object ?? modelRef.current;
      if (!target) return;
      clearSelection();
      const rotations: Record<ZOrientation, [number, number, number]> = {
        "positive-front": [0, 0, 0],
        "negative-front": [0, Math.PI, 0],
        "positive-up": [-Math.PI / 2, 0, 0],
        "negative-up": [Math.PI / 2, 0, 0],
      };
      if (!pending) meshRefs.current.forEach((mesh) => {
        const base = basePositions.current.get(mesh.uuid);
        if (base) mesh.position.copy(base);
      });
      target.rotation.set(...rotations[mode]);
      target.updateMatrixWorld(true);
      if (pending) {
        pendingImportRef.current = null;
        registerModel(target, pending.fileName);
      } else {
        const center = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
        target.position.sub(center);
        target.updateMatrixWorld(true);
        modelBaseBoundsRef.current.setFromObject(target);
        modelCenterRef.current.copy(modelBaseBoundsRef.current.getCenter(new THREE.Vector3()));
        modelSpanRef.current = Math.max(...modelBaseBoundsRef.current.getSize(new THREE.Vector3()).toArray()) || 3;
        meshRefs.current.forEach((mesh) => {
          baseWorldCenters.current.set(mesh.uuid, new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()));
        });
        calculateVisualCenter();
        onSelectPartRef.current(-1);
        frameModel();
        applyExplodeAmount(explodeRef.current);
      }
      setOrientationMode(mode);
      setOrientationRequired(false);
      setOrientationPrompt(false);
      onOrientationAppliedRef.current(mode);
    }, [applyExplodeAmount, calculateVisualCenter, clearSelection, frameModel, registerModel]);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const scene = new THREE.Scene();
      sceneRef.current = scene;
      scene.fog = new THREE.FogExp2(0x020202, 0.028);

      const perspectiveCamera = new THREE.PerspectiveCamera(36, 1, 0.01, 1000);
      perspectiveCamera.position.set(6, 4.5, 8);
      perspectiveCamera.layers.enable(1);
      perspectiveCameraRef.current = perspectiveCamera;
      const axonometricCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.01, 1000);
      axonometricCamera.position.set(7, 7, 7);
      axonometricCamera.layers.enable(1);
      axonometricCameraRef.current = axonometricCamera;
      const camera = viewModeRef.current === "axonometric" ? axonometricCamera : perspectiveCamera;
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      rendererRef.current = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.shadowMap.enabled = false;
      renderer.domElement.setAttribute("aria-label", "Interactive 3D model viewport");
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controlsRef.current = controls;
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.minDistance = 3;
      controls.maxDistance = 22;

      const renderPass = new RenderPass(scene, camera);
      const outlinePass = new OutlinePass(
        new THREE.Vector2(mount.clientWidth, mount.clientHeight),
        scene,
        camera,
        [],
      );
      const dimmedContext = contextModeRef.current === "dim";
      outlinePass.visibleEdgeColor.setHex(dimmedContext ? 0x343733 : 0xc2c5be);
      outlinePass.hiddenEdgeColor.setHex(0x000000);
      outlinePass.edgeGlow = 0;
      outlinePass.edgeStrength = dimmedContext ? 0.08 : 1.42;
      outlinePass.edgeThickness = dimmedContext ? 0.22 : 0.46;
      outlinePass.downSampleRatio = 1;
      outlinePass.pulsePeriod = 0;
      outlinePass.usePatternTexture = false;
      outlinePass.enabled = false;
      const technicalEdgePass = new TechnicalEdgePass(scene, camera);
      technicalEdgePass.enabled = true;
      technicalEdgePass.setStrength(dimmedContext ? 0.08 : 0.44);
      technicalEdgePass.setSilhouetteWidth(STROKE_WIDTHS[strokeWeightsRef.current.silhouette]);
      technicalEdgePass.setMajorWidth(STROKE_WIDTHS[strokeWeightsRef.current.major]);
      technicalEdgePass.setSilhouetteOpacity(strokeOpacitiesRef.current.silhouette);
      technicalEdgePass.setMajorOpacity(strokeOpacitiesRef.current.major);
      const multisampleTarget = new THREE.WebGLRenderTarget(
        mount.clientWidth,
        mount.clientHeight,
        { depthBuffer: true, stencilBuffer: false },
      );
      multisampleTarget.samples = 4;
      const composer = new EffectComposer(renderer, multisampleTarget);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(mount.clientWidth, mount.clientHeight);
      composer.addPass(renderPass);
      composer.addPass(technicalEdgePass);
      composer.addPass(outlinePass);
      composerRef.current = composer;
      renderPassRef.current = renderPass;
      outlinePassRef.current = outlinePass;
      technicalEdgePassRef.current = technicalEdgePass;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x101010, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.35);
      key.position.set(5, 7, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.52);
      rim.position.set(-6, 1, -5);
      scene.add(rim);
      const fill = new THREE.PointLight(0xffffff, 0.28, 20);
      fill.position.set(0, -3, 5);
      scene.add(fill);

      const createPart = (
        geometry: THREE.BufferGeometry,
        materialIndex: number,
        name: string,
        position: [number, number, number] = [0, 0, 0],
        rotation: [number, number, number] = [0, 0, 0],
      ) => {
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: MODEL_COLORS[materialIndex % MODEL_COLORS.length] }),
        );
        mesh.name = name;
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        return mesh;
      };

      const demo = new THREE.Group();
      demo.name = "KEYPAD_ASSEMBLY_09";
      demo.add(
        createPart(new RoundedBoxGeometry(0.58, 0.34, 0.78, 5, 0.1), 0, "Key 01", [-1.42, 1.62, 0], [0, 0.03, 0]),
        createPart(new RoundedBoxGeometry(0.58, 0.34, 0.78, 5, 0.1), 1, "Key 02", [-0.71, 1.62, 0], [0, -0.02, 0]),
        createPart(new RoundedBoxGeometry(0.58, 0.34, 0.78, 5, 0.1), 2, "Key 03", [0, 1.62, 0], [0, 0.02, 0]),
        createPart(new RoundedBoxGeometry(0.58, 0.34, 0.78, 5, 0.1), 3, "Key 04", [0.71, 1.62, 0], [0, -0.03, 0]),
        createPart(new RoundedBoxGeometry(0.58, 0.34, 0.78, 5, 0.1), 0, "Key 05", [1.42, 1.62, 0], [0, 0.02, 0]),
        createPart(new RoundedBoxGeometry(4.22, 0.2, 1.62, 5, 0.1), 1, "Key plate", [0, 0.83, 0], [0, 0.02, 0]),
        createPart(new RoundedBoxGeometry(3.84, 0.16, 1.32, 5, 0.07), 2, "Switch carrier", [0, 0.13, 0], [0, -0.018, 0]),
        createPart(new RoundedBoxGeometry(3.56, 0.12, 1.16, 5, 0.05), 3, "Control PCB", [0.08, -0.54, 0], [0, 0.025, 0]),
        createPart(new RoundedBoxGeometry(4.34, 0.54, 1.78, 5, 0.14), 0, "Lower shell", [0, -1.37, 0], [0, -0.018, 0]),
      );
      registerModel(demo, "KEYPAD_ASSEMBLY_09");

      const raycaster = new THREE.Raycaster();
      raycaster.layers.set(1);
      const pointer = new THREE.Vector2();
      const dragPlane = new THREE.Plane();
      const dragIntersection = new THREE.Vector3();
      const dragStartWorld = new THREE.Vector3();
      const dragStartOffset = new THREE.Vector3();
      let draggedMesh: THREE.Mesh | null = null;
      let didDrag = false;
      const handlePointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const activeCamera = cameraRef.current;
        if (!activeCamera) return;
        raycaster.setFromCamera(pointer, activeCamera);
        const hit = raycaster.intersectObjects(meshRefs.current, false)[0];
        if (!hit) return;
        const index = meshRefs.current.indexOf(hit.object as THREE.Mesh);
        if (index < 0) return;
        onSelectPartRef.current(index);
        if (explodeRef.current <= 0 || event.button !== 0) return;
        draggedMesh = hit.object as THREE.Mesh;
        didDrag = false;
        const cameraDirection = activeCamera.getWorldDirection(new THREE.Vector3()).normalize();
        dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, hit.point);
        if (!raycaster.ray.intersectPlane(dragPlane, dragStartWorld)) return;
        dragStartOffset.copy(manualOffsets.current.get(draggedMesh.uuid) ?? new THREE.Vector3());
        controls.enabled = false;
        renderer.domElement.setPointerCapture(event.pointerId);
      };
      const handlePointerMove = (event: PointerEvent) => {
        if (!draggedMesh) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const activeCamera = cameraRef.current;
        if (!activeCamera) return;
        raycaster.setFromCamera(pointer, activeCamera);
        if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
        const deltaWorld = dragIntersection.clone().sub(dragStartWorld);
        if (deltaWorld.lengthSq() > 0.00001) didDrag = true;
        const localDelta = worldOffsetToLocal(deltaWorld, draggedMesh.parent);
        manualOffsets.current.set(draggedMesh.uuid, dragStartOffset.clone().add(localDelta));
        applyExplodeAmount(explodeRef.current);
      };
      const handlePointerUp = (event: PointerEvent) => {
        if (!draggedMesh) return;
        draggedMesh = null;
        controls.enabled = true;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
        if (didDrag) renderer.domElement.dataset.manualLayout = "true";
      };
      renderer.domElement.addEventListener("pointerdown", handlePointer);
      renderer.domElement.addEventListener("pointermove", handlePointerMove);
      renderer.domElement.addEventListener("pointerup", handlePointerUp);
      renderer.domElement.addEventListener("pointercancel", handlePointerUp);

      let resizeRequest = 0;
      const resizeViewport = () => {
        if (recordingRef.current) return;
        const width = mount.clientWidth;
        const height = mount.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height);
        composer.setSize(width, height);
        const activeCamera = cameraRef.current;
        if (!activeCamera) return;
        const aspect = width / height;
        if (activeCamera instanceof THREE.PerspectiveCamera) {
          activeCamera.aspect = aspect;
        } else {
          const halfHeight = activeCamera.userData.halfHeight ?? 4;
          activeCamera.left = -halfHeight * aspect;
          activeCamera.right = halfHeight * aspect;
          activeCamera.top = halfHeight;
          activeCamera.bottom = -halfHeight;
        }
        activeCamera.updateProjectionMatrix();
        applyExplodeAmount(explodeRef.current);
      };
      const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRequest);
        resizeRequest = requestAnimationFrame(resizeViewport);
      });
      resizeObserver.observe(mount);

      const projectedCorner = new THREE.Vector3();
      const cameraSpaceCenter = new THREE.Vector3();
      const boundsSize = new THREE.Vector3();
      const corner = new THREE.Vector3();
      const tickEnd = new THREE.Vector3();
      const updateBoundsDecoration = (selection: SelectionState, reveal: number) => {
        const linePositions = selection.decorationLines.geometry.attributes.position as THREE.BufferAttribute;
        const pointPositions = selection.decorationPoints.geometry.attributes.position as THREE.BufferAttribute;
        selection.box.getSize(boundsSize);
        const tickLength = THREE.MathUtils.clamp(
          Math.max(boundsSize.x, boundsSize.y, boundsSize.z) * 0.028,
          0.018,
          0.055,
        );
        let lineVertex = 0;
        let pointVertex = 0;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
              corner.set(
                sx < 0 ? selection.box.min.x : selection.box.max.x,
                sy < 0 ? selection.box.min.y : selection.box.max.y,
                sz < 0 ? selection.box.min.z : selection.box.max.z,
              );
              pointPositions.setXYZ(pointVertex++, corner.x, corner.y, corner.z);
              for (let axis = 0; axis < 3; axis += 1) {
                tickEnd.copy(corner);
                tickEnd.setComponent(axis, tickEnd.getComponent(axis) + [sx, sy, sz][axis] * tickLength);
                linePositions.setXYZ(lineVertex++, corner.x, corner.y, corner.z);
                linePositions.setXYZ(lineVertex++, tickEnd.x, tickEnd.y, tickEnd.z);
              }
            }
          }
        }
        linePositions.needsUpdate = true;
        pointPositions.needsUpdate = true;
        selection.decoration.visible = showBoundsRef.current && selection.mesh.visible;
        (selection.decorationLines.material as THREE.LineBasicMaterial).opacity = reveal * 0.84;
        (selection.decorationPoints.material as THREE.PointsMaterial).opacity = reveal;
      };
      const updateBoundsInterface = (
        box: THREE.Box3,
        activeCamera: ViewCamera,
        reveal: number,
      ) => {
        const element = boundsInterfaceRef.current;
        if (!element || !showBoundsRef.current) {
          if (element) element.hidden = true;
          return;
        }
        box.getCenter(cameraSpaceCenter).applyMatrix4(activeCamera.matrixWorldInverse);
        if (cameraSpaceCenter.z >= 0) {
          element.hidden = true;
          return;
        }
        let minX = 1;
        let minY = 1;
        let maxX = -1;
        let maxY = -1;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              projectedCorner.set(x, y, z).project(activeCamera);
              minX = Math.min(minX, projectedCorner.x);
              minY = Math.min(minY, projectedCorner.y);
              maxX = Math.max(maxX, projectedCorner.x);
              maxY = Math.max(maxY, projectedCorner.y);
            }
          }
        }
        const padding = 10;
        const rawLeft = ((minX + 1) * 0.5) * mount.clientWidth - padding;
        const rawRight = ((maxX + 1) * 0.5) * mount.clientWidth + padding;
        const rawTop = ((1 - maxY) * 0.5) * mount.clientHeight - padding;
        const rawBottom = ((1 - minY) * 0.5) * mount.clientHeight + padding;
        const left = THREE.MathUtils.clamp(rawLeft, 12, mount.clientWidth - 54);
        const top = THREE.MathUtils.clamp(rawTop, 44, mount.clientHeight - 54);
        const right = THREE.MathUtils.clamp(rawRight, left + 42, mount.clientWidth - 12);
        const bottom = THREE.MathUtils.clamp(rawBottom, top + 42, mount.clientHeight - 44);
        element.hidden = false;
        element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        element.style.width = `${right - left}px`;
        element.style.height = `${bottom - top}px`;
        element.style.setProperty("--bounds-reveal", reveal.toFixed(3));
      };

      let frameId = 0;
      const clock = new THREE.Clock();
      const layoutCameraMatrix = new THREE.Matrix4();
      const layoutProjectionMatrix = new THREE.Matrix4();
      const renderSceneFrame = (delta: number) => {
        if (!recordingRef.current) controls.update();
        applyRotationMotion(delta);
        const layoutCamera = cameraRef.current;
        if (layoutCamera && explodeRef.current > 0) {
          layoutCamera.updateMatrixWorld(true);
          if (!layoutCameraMatrix.equals(layoutCamera.matrixWorld)
            || !layoutProjectionMatrix.equals(layoutCamera.projectionMatrix)) {
            applyExplodeAmount(explodeRef.current);
            layoutCameraMatrix.copy(layoutCamera.matrixWorld);
            layoutProjectionMatrix.copy(layoutCamera.projectionMatrix);
          }
        }
        const selection = selectionRef.current;
        if (selection) {
          const animationNow = recordingTimeRef.current ?? performance.now();
          const progress = Math.min(1, (animationNow - selection.startedAt) / selection.durationMs);
          const eased = transitionStyleRef.current === "slice"
            ? THREE.MathUtils.smoothstep(Math.floor(progress * 6) / 6, 0, 1)
            : THREE.MathUtils.clamp(
                THREE.MathUtils.smoothstep(progress, 0, 1)
                  + 0.08 * Math.sin(Math.PI * progress) * (1 - progress),
                0,
                1,
              );
          const interfaceReveal = THREE.MathUtils.lerp(selection.revealFrom, 1, eased);
          const selectedMaterial = selection.mesh.material as THREE.MeshStandardMaterial;
          selectedMaterial.opacity = THREE.MathUtils.lerp(0.06, 1, eased);
          selectedMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.04, 0.46, eased);
          if (selectedMaterial.userData.dissolveUniform) {
            selectedMaterial.userData.dissolveUniform.value = transitionStyleRef.current === "slice"
              ? THREE.MathUtils.smoothstep(progress, 0.02, 0.98)
              : 1;
          }
          const selectedOutline = selection.mesh.children.find(
            (child) => child.userData.isVisibleEdge,
          ) as LineSegments2 | undefined;
          if (selectedOutline) {
            (selectedOutline.material as LineMaterial).opacity = THREE.MathUtils.lerp(0.34, 0.72, eased)
              * strokeOpacitiesRef.current.structure;
          }
          const selectedHiddenTrace = selection.mesh.children.find(
            (child) => child.userData.isHiddenTrace,
          ) as LineSegments2 | undefined;
          if (selectedHiddenTrace) {
            (selectedHiddenTrace.material as LineMaterial).opacity = THREE.MathUtils.lerp(0.05, 0.22, eased)
              * strokeOpacitiesRef.current.structure;
          }
          const selectedCurvedDetail = selection.mesh.children.find(
            (child) => child.userData.isCurvedDetail,
          ) as LineSegments2 | undefined;
          if (selectedCurvedDetail) {
            (selectedCurvedDetail.material as LineMaterial).opacity = THREE.MathUtils.lerp(0.025, 0.12, eased)
              * strokeOpacitiesRef.current.ellipse;
          }
          selection.helper.visible = showBoundsRef.current && selection.mesh.visible;
          (selection.helper.material as THREE.LineBasicMaterial).opacity = showBoundsRef.current
            ? interfaceReveal * 0.96
            : 0;
          selection.box
            .setFromObject(selection.mesh)
            .expandByScalar(THREE.MathUtils.lerp(0.18, 0.07, eased));
          selection.helper.box.copy(selection.box);
          selection.helper.updateMatrixWorld(true);
          updateBoundsDecoration(selection, interfaceReveal);
          const activeCamera = cameraRef.current;
          if (activeCamera && selection.mesh.visible) {
            updateBoundsInterface(selection.box, activeCamera, interfaceReveal);
          } else if (boundsInterfaceRef.current) {
            boundsInterfaceRef.current.hidden = true;
          }
        }
        const activeCamera = cameraRef.current;
        if (activeCamera) composer.render(delta);
      };
      renderSceneFrameRef.current = renderSceneFrame;
      const animate = () => {
        frameId = requestAnimationFrame(animate);
        if (recordingRef.current) {
          clock.getDelta();
          return;
        }
        renderSceneFrame(Math.min(clock.getDelta(), 0.05));
      };
      animate();

      return () => {
        cancelAnimationFrame(frameId);
        cancelAnimationFrame(resizeRequest);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener("pointerdown", handlePointer);
        renderer.domElement.removeEventListener("pointermove", handlePointerMove);
        renderer.domElement.removeEventListener("pointerup", handlePointerUp);
        renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
        controls.dispose();
        renderSceneFrameRef.current = null;
        clearSelection();
        technicalEdgePass.dispose();
        outlinePass.dispose();
        composer.dispose();
        composerRef.current = null;
        renderPassRef.current = null;
        outlinePassRef.current = null;
        technicalEdgePassRef.current = null;
        renderer.dispose();
        mount.removeChild(renderer.domElement);
      };
    }, [applyExplodeAmount, applyRotationMotion, clearSelection, registerModel]);

    useEffect(() => {
      const nextCamera = viewMode === "axonometric"
        ? axonometricCameraRef.current
        : perspectiveCameraRef.current;
      const controls = controlsRef.current;
      if (!nextCamera || !controls) return;
      cameraRef.current = nextCamera;
      controls.object = nextCamera;
      if (renderPassRef.current) renderPassRef.current.camera = nextCamera;
      if (outlinePassRef.current) outlinePassRef.current.renderCamera = nextCamera;
      technicalEdgePassRef.current?.setCamera(nextCamera);
      frameModel();
      applyExplodeAmount(explodeRef.current);
    }, [applyExplodeAmount, frameModel, viewMode]);

    useEffect(() => {
      frameAspectRef.current = frameAspect;
      const frameId = requestAnimationFrame(() => {
        frameModel();
        applyExplodeAmount(explodeRef.current);
      });
      return () => cancelAnimationFrame(frameId);
    }, [applyExplodeAmount, frameAspect, frameModel]);

    useEffect(() => {
      if (selectionRef.current) {
        selectionRef.current.helper.visible = showBounds;
        selectionRef.current.decoration.visible = showBounds;
      }
      if (!showBounds && boundsInterfaceRef.current) boundsInterfaceRef.current.hidden = true;
    }, [showBounds]);

    useEffect(() => {
      applyExplodeAmount(explode);
    }, [applyExplodeAmount, explode]);

    useImperativeHandle(
      ref,
      () => ({
        importFile: async (file: File, useSourceOrientation = false) => {
          const extension = file.name.split(".").pop()?.toLowerCase();
          if (extension !== "obj" && extension !== "fbx" && extension !== "glb") {
            throw new Error("Only .OBJ, .FBX, and .GLB files are supported.");
          }
          const buffer = await file.arrayBuffer();
          let object: THREE.Group;
          if (extension === "obj") {
            const text = new TextDecoder().decode(buffer);
            object = new OBJLoader().parse(text);
          } else if (extension === "fbx") {
            object = new FBXLoader().parse(buffer, "");
          } else {
            // The decoder resolves browser asset URLs at module initialization.
            // Load it only during a client import, never during Worker SSR.
            const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath("/draco/");
            const gltfLoader = new GLTFLoader()
              .setDRACOLoader(dracoLoader)
              .setMeshoptDecoder(MeshoptDecoder);
            try {
              const gltf = await gltfLoader.parseAsync(buffer, "");
              object = gltf.scene;
            } finally {
              dracoLoader.dispose();
            }
          }
          let meshCount = 0;
          object.traverse((node) => { if (node instanceof THREE.Mesh) meshCount++; });
          if (!meshCount) throw new Error("This file has no visible mesh parts. Export a GLB with mesh geometry.");
          const orientationRoot = new THREE.Group();
          orientationRoot.name = object.name || file.name.replace(/\.(obj|fbx|glb)$/i, "");
          orientationRoot.add(object);
          if (useSourceOrientation) {
            pendingImportRef.current = null;
            registerModel(orientationRoot, file.name);
            setOrientationMode("positive-front");
            setOrientationRequired(false);
            setOrientationPrompt(false);
            return;
          }
          pendingImportRef.current = { object: orientationRoot, fileName: file.name };
          setOrientationMode("positive-front");
          setOrientationRequired(true);
          setOrientationPrompt(true);
        },
        selectPart: (index: number) => selectMesh(index),
        deletePart: deleteMesh,
        togglePart: (index: number) => {
          const mesh = meshRefs.current[index];
          if (mesh) mesh.visible = !mesh.visible;
          applyExplodeAmount(explodeRef.current);
        },
        focusModel: () => {
          frameModel();
          applyExplodeAmount(explodeRef.current);
        },
        openOrientation: () => {
          if (modelRef.current || pendingImportRef.current) {
            setOrientationRequired(Boolean(pendingImportRef.current));
            setOrientationPrompt(true);
          }
        },
        setContextMode: applyContextMode,
        setExplode: (amount: number) => {
          applyExplodeAmount(amount);
        },
        captureLayout: () => meshRefs.current.map((mesh) => {
          const offset = manualOffsets.current.get(mesh.uuid) ?? new THREE.Vector3();
          return [offset.x, offset.y, offset.z];
        }),
        setLayoutState: (amount: number, offsets: number[][]) => {
          meshRefs.current.forEach((mesh, index) => {
            const offset = offsets[index] ?? [0, 0, 0];
            manualOffsets.current.set(mesh.uuid, new THREE.Vector3(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0));
          });
          applyExplodeAmount(amount, offsets);
        },
        captureStill: async (settings) => {
          const renderer = rendererRef.current;
          const composer = composerRef.current;
          const camera = cameraRef.current;
          const mount = mountRef.current;
          if (!renderer || !camera || !mount) return;
          await document.fonts.load('500 16px Arial');
          explodeFrameRef.current = settings.explodeFrame;
          applyExplodeAmount(explodeRef.current);
          transitionStyleRef.current = settings.transition;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const restoreViewport = prepareExportResolution(settings.width, settings.height);
          try {
            if (composer) composer.render(); else renderer.render(sceneRef.current!, camera);
            const target = exportOverlayRef.current ?? document.createElement("canvas");
            target.width = settings.width;
            target.height = settings.height;
            composeExportFrame(target);
            await new Promise<void>((resolve, reject) => target.toBlob((blob) => {
              if (!blob) { reject(new Error("Could not render still frame.")); return; }
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `model-breakdown-${settings.label.toLowerCase().replace(/\s+/g, "-")}-still.png`;
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1200);
              resolve();
            }, "image/png"));
          } finally {
            restoreViewport();
          }
        },
        recordVideo: async (settings, onProgress) => {
          const renderer = rendererRef.current;
          const composer = composerRef.current;
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          const mount = mountRef.current;
          if (!renderer || !camera || !controls || !mount) return;
          await document.fonts.load('500 16px Arial');
          explodeFrameRef.current = settings.explodeFrame;
          applyExplodeAmount(explodeRef.current);
          if (!("VideoEncoder" in window) || !("VideoFrame" in window)) {
            throw new Error("MP4 export requires a browser with WebCodecs support.");
          }

          transitionStyleRef.current = settings.transition;
          const previousRotationMotion = { ...rotationMotionRef.current };
          const cameraState = {
            position: camera.position.clone(),
            quaternion: camera.quaternion.clone(),
            up: camera.up.clone(),
            target: controls.target.clone(),
          };
          rotationMotionRef.current = { ...settings.rotation };
          const canvas = exportOverlayRef.current ?? document.createElement("canvas");
          canvas.width = settings.width;
          canvas.height = settings.height;
          recordingRef.current = true;
          recordingTimeRef.current = 0;
          const restoreViewport = prepareExportResolution(settings.width, settings.height);
          if (composer) composer.render();
          else renderer.render(sceneRef.current!, camera);

          try {
            const macroblocks = Math.ceil(settings.width / 16) * Math.ceil(settings.height / 16);
            const macroblocksPerSecond = macroblocks * settings.fps;
            const minimumLevel = macroblocks > 36_864 || macroblocksPerSecond > 2_073_600
              ? "3c" // Level 6.0: required by true 4K 5:4 and 4:5 frames.
              : macroblocksPerSecond > 983_040
                ? "34" // Level 5.2.
                : "33"; // Level 5.1.
            const levelOrder = minimumLevel === "3c"
              ? ["3c", "3d", "3e"]
              : minimumLevel === "34"
                ? ["34", "3c", "3d"]
                : ["33", "34", "3c"];
            const bitrate = Math.round(THREE.MathUtils.clamp(
              settings.width * settings.height * settings.fps * 0.075,
              14_000_000,
              28_000_000,
            ));
            const codecCandidates: VideoEncoderConfig[] = [];
            for (const level of levelOrder) {
              for (const profile of ["64", "4d"]) {
                for (const acceleration of ["prefer-hardware", "no-preference", "prefer-software"] as HardwareAcceleration[]) {
                  codecCandidates.push({
                    codec: `avc1.${profile}00${level}`,
                    width: settings.width,
                    height: settings.height,
                    bitrate,
                    framerate: settings.fps,
                    hardwareAcceleration: acceleration,
                    latencyMode: "quality",
                    avc: { format: "avc" },
                  });
                }
              }
            }
            let codecConfig: VideoEncoderConfig | null = null;
            for (const candidate of codecCandidates) {
              try {
                const support = await VideoEncoder.isConfigSupported(candidate);
                if (support.supported) {
                  codecConfig = support.config ?? candidate;
                  break;
                }
              } catch {
                // Continue through the profile, level, and hardware fallbacks.
              }
            }
            if (!codecConfig) {
              throw new Error("4K H.264 export is not available on this browser/GPU. Update Chrome or Edge and retry.");
            }

            const target = new ArrayBufferTarget();
            const muxer = new Muxer({
              target,
              video: {
                codec: "avc",
                width: settings.width,
                height: settings.height,
                frameRate: settings.fps,
              },
              fastStart: "in-memory",
              firstTimestampBehavior: "offset",
            });
            let encoderError: Error | null = null;
            const encoder = new VideoEncoder({
              output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
              error: (error) => { encoderError = error; },
            });
            encoder.configure(codecConfig);

            const firedCues = new Set<string>();
            const sortedLayouts = [...settings.layoutKeyframes].sort((a, b) => a.time - b.time);
            selectMesh(-1);
            const totalFrames = Math.max(1, Math.round(settings.seconds * settings.fps));
            let reportedProgress = -1;
            const waitForEncoderCapacity = async () => {
              if (encoder.encodeQueueSize <= 3) return;
              await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(() => {
                  encoder.removeEventListener("dequeue", handleDequeue);
                  if (encoderError) reject(encoderError); else resolve();
                }, 2000);
                const handleDequeue = () => {
                  if (encoder.encodeQueueSize > 2) return;
                  window.clearTimeout(timeout);
                  encoder.removeEventListener("dequeue", handleDequeue);
                  if (encoderError) reject(encoderError); else resolve();
                };
                encoder.addEventListener("dequeue", handleDequeue);
              });
            };
            for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
              const elapsed = frameIndex / settings.fps;
              recordingTimeRef.current = elapsed * 1000;
              if (sortedLayouts.length > 0) {
                const nextIndex = sortedLayouts.findIndex((layout) => layout.time > elapsed);
                const nextLayout = nextIndex >= 0 ? sortedLayouts[nextIndex] : sortedLayouts[sortedLayouts.length - 1];
                const previousLayout = nextIndex > 0
                  ? sortedLayouts[nextIndex - 1]
                  : nextIndex === 0
                    ? { id: "assembled", time: 0, explode: 0, offsets: meshRefs.current.map(() => [0, 0, 0]) }
                    : nextLayout;
                const span = Math.max(1 / settings.fps, nextLayout.time - previousLayout.time);
                const mix = THREE.MathUtils.smoothstep((elapsed - previousLayout.time) / span, 0, 1);
                const interpolatedOffsets = meshRefs.current.map((_, index) => {
                  const from = previousLayout.offsets[index] ?? [0, 0, 0];
                  const to = nextLayout.offsets[index] ?? [0, 0, 0];
                  return [0, 1, 2].map((axis) => THREE.MathUtils.lerp(from[axis] ?? 0, to[axis] ?? 0, mix));
                });
                applyExplodeAmount(THREE.MathUtils.lerp(previousLayout.explode, nextLayout.explode, mix), interpolatedOffsets);
              }
              settings.keyframes.forEach((keyframe) => {
                if (elapsed >= keyframe.time && !firedCues.has(keyframe.id)) {
                  firedCues.add(keyframe.id);
                  applyContextMode(keyframe.contextMode);
                  selectMesh(keyframe.partIndex, keyframe.dissolve);
                }
              });

              const deterministicRender = renderSceneFrameRef.current;
              if (deterministicRender) deterministicRender(frameIndex === 0 ? 0 : 1 / settings.fps);
              else if (composer) composer.render(1 / settings.fps);
              else renderer.render(sceneRef.current!, camera);
              composeExportFrame(canvas);
              const frame = new VideoFrame(canvas, {
                timestamp: Math.round((frameIndex / settings.fps) * 1_000_000),
                duration: Math.round(1_000_000 / settings.fps),
              });
              encoder.encode(frame, { keyFrame: frameIndex % (settings.fps * 2) === 0 });
              frame.close();
              await waitForEncoderCapacity();
              const nextProgress = Math.floor(Math.min(92, ((frameIndex + 1) / totalFrames) * 92));
              if (nextProgress !== reportedProgress) {
                reportedProgress = nextProgress;
                onProgress(nextProgress);
              }
              if (frameIndex % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            }

            await encoder.flush();
            encoder.close();
            if (encoderError) throw encoderError;
            muxer.finalize();
            onProgress(98);
            const blob = new Blob([target.buffer], { type: "video/mp4" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `model-breakdown-${settings.label.toLowerCase().replace(/\s+/g, "-")}.mp4`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1200);
            onProgress(100);
          } finally {
            recordingRef.current = false;
            recordingTimeRef.current = null;
            rotationMotionRef.current = previousRotationMotion;
            restoreViewport();
            camera.position.copy(cameraState.position);
            camera.quaternion.copy(cameraState.quaternion);
            camera.up.copy(cameraState.up);
            camera.updateMatrixWorld(true);
            controls.target.copy(cameraState.target);
            controls.update();
          }
        },
      }),
      [applyContextMode, applyExplodeAmount, composeExportFrame, deleteMesh, frameModel, prepareExportResolution, registerModel, selectMesh],
    );

    return (
      <div className="model-viewport" ref={mountRef}>
        <canvas className="export-composite" ref={exportOverlayRef} aria-hidden="true" />
        {orientationPrompt && (
          <div className="orientation-overlay" role="dialog" aria-modal="true" aria-labelledby="orientation-title">
            <div className="orientation-panel">
              <span className="eyebrow">MODEL ORIENTATION / Z AXIS</span>
              <h3 id="orientation-title">Choose the presentation direction</h3>
              <p>Select which way the source model&apos;s Z axis should face. You can reopen this control later.</p>
              <div className="orientation-options">
                {([
                  ["positive-front", "+Z", "FRONT"],
                  ["negative-front", "−Z", "FRONT"],
                  ["positive-up", "+Z", "UP"],
                  ["negative-up", "−Z", "UP"],
                ] as const).map(([mode, axis, direction]) => (
                  <button
                    key={mode}
                    className={orientationMode === mode ? "active" : ""}
                    onClick={() => applyZOrientation(mode)}
                  >
                    <b>{axis}</b>
                    <span>{direction}</span>
                  </button>
                ))}
              </div>
              {!orientationRequired && (
                <button className="orientation-cancel" onClick={() => setOrientationPrompt(false)}>CANCEL</button>
              )}
            </div>
          </div>
        )}
        <div className="bounds-interface" ref={boundsInterfaceRef} hidden aria-hidden="true">
          <i className="bounds-corner corner-tl" />
          <i className="bounds-corner corner-tr" />
          <i className="bounds-corner corner-bl" />
          <i className="bounds-corner corner-br" />
          <b className="bounds-node node-tl" />
          <b className="bounds-node node-br" />
          <span className="bounds-tag bounds-tag-part" ref={boundsLabelRef}>TRACK / MESH</span>
          <span className="bounds-tag bounds-tag-live">BND · LIVE · LOCAL</span>
          <span className="bounds-readout">
            <span>GEO</span>
            <b ref={boundsDataRef}>X -- / Y -- / Z -- · -- TRIS</b>
            <small>SYNC 100%</small>
          </span>
        </div>
        <div className="explode-explainer" ref={explainerRef} hidden aria-hidden="true">
          <span>{language === "zh" ? "组件分解" : "COMPONENT BREAKDOWN"}</span>
          <strong ref={explainerTitleRef}>SELECTED COMPONENT</strong>
          <small ref={explainerMetaRef}>{language === "zh" ? "结构节点 · 已分离展示" : "STRUCTURAL NODE · ISOLATED VIEW"}</small>
        </div>
      </div>
    );
  },
);

const FORMATS: Record<string, Omit<ExportSettings, "keyframes" | "layoutKeyframes" | "transition" | "explodeFrame" | "rotation">> = {
  "16:9 LANDSCAPE": { width: 3840, height: 2160, seconds: 6, fps: 30, label: "16:9 LANDSCAPE" },
  "5:4 LANDSCAPE": { width: 3840, height: 3072, seconds: 6, fps: 30, label: "5:4 LANDSCAPE" },
  "4:5 PORTRAIT": { width: 3072, height: 3840, seconds: 6, fps: 30, label: "4:5 PORTRAIT" },
  "9:16 PORTRAIT": { width: 2160, height: 3840, seconds: 6, fps: 30, label: "9:16 PORTRAIT" },
};

function formatTriangles(value: number) {
  if (value > 999_999) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value > 999) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function Home() {
  const viewerRef = useRef<ViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const timelineDragRef = useRef<TimelineDragState | null>(null);
  const suppressTimelineClickRef = useRef(false);
  const currentTimeRef = useRef(0);
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [selectedPart, setSelectedPart] = useState(-1);
  const [explode, setExplode] = useState(0);
  const [explodeFrame, setExplodeFrame] = useState<ExplodeFrame>({ top: 8, right: 8, bottom: 12.5, left: 8 });
  const [viewMode, setViewMode] = useState<ViewMode>("axonometric");
  const [showBounds, setShowBounds] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadBusyRef = useRef(false);
  const exampleBootRef = useRef(false);
  const [activeExample, setActiveExample] = useState<string | null>(null);
  const [awaitingOrientation, setAwaitingOrientation] = useState(false);
  const [loadMessage, setLoadMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [replacement, setReplacement] = useState<{ example?: ExampleModel; file?: File } | null>(null);
  const [modelName, setModelName] = useState("KEYPAD_ASSEMBLY_09");
  const [notice, setNotice] = useState("Demo model ready");
  useEffect(() => {
    if (!notice || /failed|unsupported|error|rendering|downloading|opening/i.test(notice)) return;
    const timer = window.setTimeout(() => setNotice(""), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [inspectorTab, setInspectorTab] = useState<"MOTION" | "SCENE" | "EXPORT">("MOTION");
  const [format, setFormat] = useState("16:9 LANDSCAPE");
  const [language, setLanguage] = useState<InterfaceLanguage>("en");
  const [uiScale, setUiScale] = useState(1);
  const frameAspect = FORMATS[format].width / FORMATS[format].height;
  const [duration, setDuration] = useState(6);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [keyframes, setKeyframes] = useState<TimelineKeyframe[]>([]);
  const [layoutKeyframes, setLayoutKeyframes] = useState<LayoutKeyframe[]>([]);
  const [contextMode, setContextModeState] = useState<ContextMode>("line");
  const [strokeWeights, setStrokeWeights] = useState<StrokeWeights>({
    structure: 0.5,
    ellipse: 0.5,
    silhouette: 0.25,
    major: 0.1,
  });
  const [strokeOpacities, setStrokeOpacities] = useState<StrokeOpacities>({
    structure: 0.6,
    ellipse: 0.5,
    silhouette: 0.4,
    major: 0.1,
  });
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<number | null>(null);
  const [draggingCueId, setDraggingCueId] = useState<string | null>(null);
  const [draggingLayoutId, setDraggingLayoutId] = useState<string | null>(null);
  const [timelineDropActive, setTimelineDropActive] = useState(false);
  const [timelineHoverSegment, setTimelineHoverSegment] = useState(-1);
  const [segmentCount, setSegmentCount] = useState(4);
  const [dissolveDuration, setDissolveDuration] = useState(0.6);
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>("pop");
  const [rotationMotion, setRotationMotion] = useState<RotationMotion>({
    enabled: true,
    degreesPerSecond: 18,
    direction: "clockwise",
  });

  const copy = language === "zh" ? {
    import: "导入模型", export: "导出 4K", perspective: "透视", axonometric: "轴测", rotate: "旋转",
    explode: "爆炸", axis: "按高度分层", lineDrawing: "线稿模式", active: "当前选择",
    none: "— 未选择 —", dragHint: "爆炸模式下可直接拖拽零件定位", frame: "画幅",
    local: "本地引擎", analyzing: "分析中", project: "项目", structure: "物体结构",
    detected: "识别部件", meshes: "网格", triangles: "三角面", localNote: "几何数据仅在浏览器本地分析。",
    motion: "动画", scene: "场景", output: "导出", explodedStructure: "爆炸结构",
    assembled: "组装", selectionBounds: "选择框", boundsCaption: "显示于当前部件",
    rotation: "转台旋转", turntable: "循环展示", rotationCaption: "围绕模型的主要视觉重心", speed: "速度", direction: "方向",
    visualCenter: "视觉重心", visualPivot: "表面积加权轴心 · 世界 Y 轴", locked: "锁定", loop: "循环 ∞", secondsPerRevolution: "秒 / 圈",
    highlight: "高亮", entrance: "出现方式", viewportScene: "视图场景", modelData: "模型数据",
    videoOutput: "视频输出", resolution: "分辨率", duration: "时长", currentFrame: "渲染当前帧 / PNG",
  } : {
    import: "IMPORT MODEL", export: "EXPORT 4K", perspective: "PERSPECTIVE", axonometric: "AXONOMETRIC", rotate: "ROTATE",
    explode: "EXPLODE", axis: "LAYERS", lineDrawing: "LINE DRAWING", active: "ACTIVE SELECTION",
    none: "— NONE —", dragHint: "DRAG PARTS DIRECTLY WHILE EXPLODED", frame: "FRAME",
    local: "LOCAL ENGINE", analyzing: "ANALYZING", project: "PROJECT", structure: "OBJECT STRUCTURE",
    detected: "Detected parts", meshes: "MESHES", triangles: "TRIANGLES", localNote: "Geometry is analyzed locally in your browser.",
    motion: "MOTION", scene: "SCENE", output: "EXPORT", explodedStructure: "Exploded structure",
    assembled: "ASSEMBLED", selectionBounds: "Selection bounds", boundsCaption: "Visible on active part",
    rotation: "Rotation", turntable: "Turntable loop", rotationCaption: "Orbit around the model's visual center", speed: "SPEED", direction: "DIRECTION",
    visualCenter: "VISUAL CENTER", visualPivot: "AREA-WEIGHTED PIVOT · WORLD Y", locked: "LOCKED", loop: "LOOP ∞", secondsPerRevolution: "SEC / REV",
    highlight: "Highlight", entrance: "ENTRANCE", viewportScene: "Viewport scene", modelData: "Model data",
    videoOutput: "Video output", resolution: "RESOLUTION", duration: "DURATION", currentFrame: "RENDER CURRENT FRAME / PNG",
  };

  const totalTriangles = parts.reduce((sum, part) => sum + part.triangles, 0);

  const updateStrokeWeight = useCallback((layer: keyof StrokeWeights, weight: StrokeWeight) => {
    setStrokeWeights((current) => ({ ...current, [layer]: weight }));
    const label = layer === "silhouette" ? "Air edge" : layer === "major" ? "Major edge" : layer === "ellipse" ? "Ellipse" : "Structure";
    setNotice(`${label} stroke · ${weight} pt`);
  }, []);

  const updateStrokeOpacity = useCallback((layer: keyof StrokeOpacities, percent: number) => {
    setStrokeOpacities((current) => ({ ...current, [layer]: percent / 100 }));
    const label = layer === "silhouette" ? "Air edge" : layer === "major" ? "Major edge" : layer === "ellipse" ? "Ellipse" : "Structure";
    setNotice(`${label} opacity · ${percent}%`);
  }, []);

  const updateExplodeFrame = useCallback((edge: keyof ExplodeFrame, value: number) => {
    const nextValue = Math.round(THREE.MathUtils.clamp(value || 0, 0, 30) * 2) / 2;
    setExplodeFrame((current) => ({ ...current, [edge]: nextValue }));
    setNotice(`Explode crop · ${edge.toUpperCase()} ${nextValue}%`);
  }, []);

  const updateRotationSpeed = useCallback((value: number) => {
    const degreesPerSecond = Math.round(THREE.MathUtils.clamp(value, 4, 60));
    setRotationMotion((current) => ({ ...current, degreesPerSecond }));
    setNotice(`Turntable speed · ${degreesPerSecond}°/s`);
  }, []);

  const updateRotationDirection = useCallback((direction: RotationDirection) => {
    setRotationMotion((current) => ({ ...current, direction }));
    setNotice(`Turntable direction · ${direction === "clockwise" ? "CW" : "CCW"}`);
  }, []);

  const setRotationEnabled = useCallback((enabled: boolean) => {
    setRotationMotion((current) => ({ ...current, enabled }));
    setNotice(enabled ? "Turntable rotation · LOOP ON" : "Turntable rotation · OFF");
  }, []);

  const selectPart = useCallback((index: number, dissolve = dissolveDuration) => {
    setSelectedPart(index);
    viewerRef.current?.selectPart(index, dissolve);
  }, [dissolveDuration]);

  useEffect(() => {
    if (selectedPart < 0) return;
    document.querySelector(`[data-part-index="${selectedPart}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedPart]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const updateDuration = useCallback((rawDuration: number) => {
    const nextDuration = Math.min(30, Math.max(2, rawDuration || 2));
    setDuration(nextDuration);
    currentTimeRef.current = Math.min(currentTimeRef.current, nextDuration);
    setCurrentTime((time) => Math.min(time, nextDuration));
    setKeyframes((frames) => {
      const lastSafeFrame = nextDuration - 1 / 30;
      const keptFrames = frames.filter((frame) => frame.time <= lastSafeFrame);
      const removedCount = frames.length - keptFrames.length;
      if (removedCount > 0) {
        setNotice(`${removedCount} cue${removedCount === 1 ? "" : "s"} past the new endpoint removed`);
      }
      return keptFrames;
    });
    setLayoutKeyframes((frames) => frames.filter((frame) => frame.time <= nextDuration - 1 / 30));
  }, []);

  const addKeyframeAt = useCallback((partIndex: number, requestedTime: number) => {
    if (exporting) return;
    if (partIndex >= parts.length) {
      setNotice(`Part ${partIndex + 1} is not available`);
      return;
    }
    const lastSafeFrame = Math.max(0, duration - 1 / 30);
    const time = Math.min(
      lastSafeFrame,
      Math.round(Math.min(lastSafeFrame, Math.max(0, requestedTime)) * 30) / 30,
    );
    const nextFrame: TimelineKeyframe = {
      id: `${Date.now()}-${partIndex}`,
      time,
      partIndex,
      key: partIndex + 1,
      contextMode,
      dissolve: dissolveDuration,
      explode,
    };
    setKeyframes((frames) => [
      ...frames.filter((frame) => !(frame.partIndex === partIndex && Math.abs(frame.time - time) < 1 / 60)),
      nextFrame,
    ].sort((a, b) => a.time - b.time));
    setSelectedCueId(nextFrame.id);
    setSelectedLayoutId(null);
    selectPart(partIndex);
    setNotice(`Key ${partIndex + 1} · Layer explode ${explode}% · ${time.toFixed(2)}s`);
  }, [contextMode, dissolveDuration, duration, explode, exporting, parts.length, selectPart]);

  const addKeyframe = useCallback((partIndex: number) => {
    addKeyframeAt(partIndex, currentTimeRef.current);
  }, [addKeyframeAt]);

  const addLayoutKeyframe = useCallback(() => {
    if (exporting) return;
    const time = Math.round(THREE.MathUtils.clamp(currentTimeRef.current, 0, Math.max(0, duration - 1 / 30)) * 30) / 30;
    const offsets = viewerRef.current?.captureLayout() ?? parts.map(() => [0, 0, 0]);
    const nextLayout: LayoutKeyframe = { id: `layout-${Date.now()}`, time, explode, offsets, partIds: parts.map((part) => part.id) };
    setLayoutKeyframes((frames) => [
      ...frames.filter((frame) => Math.abs(frame.time - time) >= 1 / 60),
      nextLayout,
    ].sort((a, b) => a.time - b.time));
    setSelectedLayoutId(nextLayout.id);
    setSelectedCueId(null);
    setPlaying(false);
    setNotice(`${language === "zh" ? "布局关键帧" : "Layout key"} · ${explode}% · ${time.toFixed(2)}s`);
  }, [duration, explode, exporting, language, parts]);

  const applyLayoutAtTime = useCallback((time: number) => {
    const sorted = [...layoutKeyframes].sort((a, b) => a.time - b.time);
    if (!sorted.length) return;
    const nextIndex = sorted.findIndex((layout) => layout.time > time);
    const next = nextIndex >= 0 ? sorted[nextIndex] : sorted[sorted.length - 1];
    const previous = nextIndex > 0
      ? sorted[nextIndex - 1]
      : nextIndex === 0
        ? { id: "assembled", time: 0, explode: 0, offsets: parts.map(() => [0, 0, 0]) }
        : next;
    const span = Math.max(1 / 30, next.time - previous.time);
    const mix = THREE.MathUtils.smoothstep((time - previous.time) / span, 0, 1);
    const offsets = parts.map((_, index) => {
      const from = previous.offsets[index] ?? [0, 0, 0];
      const to = next.offsets[index] ?? [0, 0, 0];
      return [0, 1, 2].map((axis) => THREE.MathUtils.lerp(from[axis] ?? 0, to[axis] ?? 0, mix));
    });
    const nextExplode = THREE.MathUtils.lerp(previous.explode, next.explode, mix);
    setExplode(Math.round(nextExplode));
    viewerRef.current?.setLayoutState(nextExplode, offsets);
  }, [layoutKeyframes, parts]);

  const applyTimelineFrame = useCallback((frame: TimelineKeyframe) => {
    setSelectedCueId(frame.id);
    setSelectedLayoutId(null);
    setContextModeState(frame.contextMode);
    setDissolveDuration(frame.dissolve);
    viewerRef.current?.setContextMode(frame.contextMode);
    selectPart(frame.partIndex, frame.dissolve);
  }, [selectPart]);

  const timelineTimeAtClientX = useCallback((clientX: number) => {
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const rawTime = ((clientX - rect.left) / rect.width) * duration;
    return Math.round(THREE.MathUtils.clamp(rawTime, 0, duration) * 30) / 30;
  }, [duration]);

  const scrubTimelineTo = useCallback((time: number) => {
    const nextTime = THREE.MathUtils.clamp(time, 0, duration);
    setPlaying(false);
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    applyLayoutAtTime(nextTime);
    const activeCue = [...keyframes]
      .sort((a, b) => a.time - b.time)
      .filter((frame) => frame.time <= nextTime + 1 / 60)
      .at(-1);
    if (activeCue && selectedCueId !== activeCue.id) {
      applyTimelineFrame(activeCue);
    } else if (!activeCue && selectedCueId) {
      setSelectedCueId(null);
      selectPart(-1);
    }
  }, [applyLayoutAtTime, applyTimelineFrame, duration, keyframes, selectPart, selectedCueId]);

  const beginTimelineScrub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (exporting || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineDragRef.current = {
      kind: "scrub",
      startX: event.clientX,
      startTime: timelineTimeAtClientX(event.clientX),
      moved: false,
    };
    setSelectedCueId(null);
    setSelectedLayoutId(null);
    scrubTimelineTo(timelineTimeAtClientX(event.clientX));
  }, [exporting, scrubTimelineTo, timelineTimeAtClientX]);

  const moveTimelineScrub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = timelineDragRef.current;
    if (!drag || drag.kind !== "scrub" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    drag.moved ||= Math.abs(event.clientX - drag.startX) > 1;
    scrubTimelineTo(timelineTimeAtClientX(event.clientX));
  }, [scrubTimelineTo, timelineTimeAtClientX]);

  const endTimelineScrub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    timelineDragRef.current = null;
  }, []);

  const beginKeyframeDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: "cue" | "layout",
    id: string,
    time: number,
  ) => {
    if (exporting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineDragRef.current = { kind, id, startX: event.clientX, startTime: time, moved: false };
    setPlaying(false);
    if (kind === "cue") {
      setSelectedCueId(id);
      setSelectedLayoutId(null);
      setDraggingCueId(id);
    } else {
      setSelectedLayoutId(id);
      setSelectedCueId(null);
      setDraggingLayoutId(id);
    }
  }, [exporting]);

  const moveKeyframeDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = timelineDragRef.current;
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!drag || drag.kind === "scrub" || !drag.id || !rect || rect.width <= 0) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const deltaTime = ((event.clientX - drag.startX) / rect.width) * duration;
    const nextTime = Math.round(THREE.MathUtils.clamp(drag.startTime + deltaTime, 0, duration) * 30) / 30;
    drag.moved ||= Math.abs(event.clientX - drag.startX) > 1;
    event.currentTarget.style.left = `${(nextTime / duration) * 100}%`;
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    if (drag.kind === "cue") {
      setKeyframes((frames) => frames.map((frame) => frame.id === drag.id ? { ...frame, time: nextTime } : frame));
    } else {
      setLayoutKeyframes((frames) => frames.map((frame) => frame.id === drag.id ? { ...frame, time: nextTime } : frame));
    }
  }, [duration]);

  const endKeyframeDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = timelineDragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag?.kind === "cue") {
      setKeyframes((frames) => [...frames].sort((a, b) => a.time - b.time));
      setNotice(`Cue moved to frame ${Math.round(currentTimeRef.current * 30)}`);
    } else if (drag?.kind === "layout") {
      setLayoutKeyframes((frames) => [...frames].sort((a, b) => a.time - b.time));
      setNotice(`Layout key moved to frame ${Math.round(currentTimeRef.current * 30)}`);
    }
    suppressTimelineClickRef.current = Boolean(drag?.moved);
    timelineDragRef.current = null;
    setDraggingCueId(null);
    setDraggingLayoutId(null);
  }, []);

  const updateExplode = useCallback((amount: number) => {
    const nextAmount = Math.round(THREE.MathUtils.clamp(amount, 0, 1500));
    setExplode(nextAmount);
    viewerRef.current?.setExplode(nextAmount);
    if (selectedCueId) {
      setKeyframes((frames) => frames.map((frame) =>
        frame.id === selectedCueId ? { ...frame, explode: nextAmount } : frame,
      ));
    }
  }, [selectedCueId]);

  const updateContextMode = useCallback((mode: ContextMode) => {
    setContextModeState(mode);
    viewerRef.current?.setContextMode(mode);
    if (selectedCueId) {
      setKeyframes((frames) => frames.map((frame) =>
        frame.id === selectedCueId ? { ...frame, contextMode: mode } : frame,
      ));
    }
  }, [selectedCueId]);

  const updateDissolveDuration = useCallback((rawDuration: number) => {
    const nextDuration = Math.round(THREE.MathUtils.clamp(rawDuration || 0.1, 0.1, 2.5) * 10) / 10;
    setDissolveDuration(nextDuration);
    if (selectedCueId) {
      setKeyframes((frames) => frames.map((frame) =>
        frame.id === selectedCueId ? { ...frame, dissolve: nextDuration } : frame,
      ));
    }
  }, [selectedCueId]);

  const removeSelectedTimelineKey = useCallback(() => {
    if (selectedCueId) {
      setKeyframes((frames) => frames.filter((frame) => frame.id !== selectedCueId));
      setSelectedCueId(null);
      setNotice("Cue removed from timeline");
      return;
    }
    if (selectedLayoutId) {
      setLayoutKeyframes((frames) => frames.filter((frame) => frame.id !== selectedLayoutId));
      setSelectedLayoutId(null);
      setNotice("Layout key removed from timeline");
    }
  }, [selectedCueId, selectedLayoutId]);

  const requestDeletePart = useCallback((index: number) => {
    if (exporting || index < 0 || index >= parts.length) return;
    if (parts.length <= 1) {
      setNotice("The final geometry cannot be deleted");
      return;
    }
    setPlaying(false);
    setDeleteCandidate(index);
  }, [exporting, parts]);

  const confirmDeletePart = useCallback(() => {
    if (deleteCandidate === null) return;
    const removedIndex = deleteCandidate;
    const removedPart = parts[removedIndex];
    if (!removedPart || !viewerRef.current?.deletePart(removedIndex)) {
      setNotice("Geometry could not be deleted");
      setDeleteCandidate(null);
      return;
    }
    setParts((current) => current.filter((_, index) => index !== removedIndex));
    setKeyframes((frames) => frames
      .filter((frame) => frame.partIndex !== removedIndex)
      .map((frame) => ({
        ...frame,
        partIndex: frame.partIndex > removedIndex ? frame.partIndex - 1 : frame.partIndex,
        key: frame.partIndex > removedIndex ? frame.key - 1 : frame.key,
      })));
    setLayoutKeyframes((frames) => frames.map((frame) => {
      const mappedIndex = frame.partIds?.indexOf(removedPart.id) ?? removedIndex;
      return {
        ...frame,
        offsets: frame.offsets.filter((_, index) => index !== mappedIndex),
        partIds: (frame.partIds ?? parts.map((part) => part.id)).filter((id) => id !== removedPart.id),
      };
    }));
    setSelectedPart(-1);
    setSelectedCueId(null);
    setSelectedLayoutId(null);
    setDeleteCandidate(null);
    setNotice(`Geometry deleted · ${removedPart.name}`);
  }, [deleteCandidate, parts]);

  const togglePlayback = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (currentTimeRef.current >= duration - 0.01) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }
    setPlaying(true);
  }, [duration, playing]);

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now() - currentTimeRef.current * 1000;
    let previousTime = currentTimeRef.current - 0.001;
    const fired = new Set(
      keyframes.filter((frame) => frame.time < currentTimeRef.current).map((frame) => frame.id),
    );
    let animationFrame = 0;

    const tick = () => {
      const nextTime = Math.min(duration, (performance.now() - startedAt) / 1000);
      keyframes.forEach((frame) => {
        if (!fired.has(frame.id) && frame.time > previousTime && frame.time <= nextTime) {
          fired.add(frame.id);
          applyTimelineFrame(frame);
        }
      });
      applyLayoutAtTime(nextTime);
      previousTime = nextTime;
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      if (nextTime >= duration) {
        setPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [applyLayoutAtTime, applyTimelineFrame, duration, keyframes, playing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (replacement || loading || awaitingOrientation) return;
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target?.isContentEditable || target?.closest("input, select, textarea, [contenteditable='true']"),
      );
      if (
        exporting ||
        event.repeat ||
        event.isComposing ||
        isTyping
      ) return;
      if (deleteCandidate !== null) {
        if (event.key === "Escape") {
          event.preventDefault();
          setDeleteCandidate(null);
        } else if (event.key === "Enter") {
          event.preventDefault();
          confirmDeletePart();
        }
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        addLayoutKeyframe();
        return;
      }
      if (event.key.toLowerCase() === "x" && selectedPart >= 0) {
        event.preventDefault();
        requestDeletePart(selectedPart);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && (selectedCueId || selectedLayoutId)) {
        event.preventDefault();
        removeSelectedTimelineKey();
        return;
      }
      if (target?.closest("button")) return;
      if (/^Numpad[1-5]$/.test(event.code)) {
        event.preventDefault();
        addKeyframe(Number(event.code.slice(-1)) - 1);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < parts.length) selectPart(index);
      }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && parts.length > 0) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const currentIndex = selectedPart >= 0 ? selectedPart : direction > 0 ? -1 : 0;
        selectPart((currentIndex + direction + parts.length) % parts.length);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? 0.5 : 1 / 30;
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextTime = THREE.MathUtils.clamp(currentTimeRef.current + direction * step, 0, duration);
        setPlaying(false);
        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
        applyLayoutAtTime(nextTime);
        return;
      }
      if (event.key === "0" || event.key === "Escape") selectPart(-1);
      if (event.key.toLowerCase() === "b") setShowBounds((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addKeyframe, addLayoutKeyframe, applyLayoutAtTime, confirmDeletePart, deleteCandidate, duration, exporting, loading, awaitingOrientation, replacement, parts.length, removeSelectedTimelineKey, requestDeletePart, selectPart, selectedCueId, selectedLayoutId, selectedPart, togglePlayback]);

  const resetModelEdits = () => {
    setSelectedPart(-1);
    setKeyframes([]);
    setLayoutKeyframes([]);
    setSelectedCueId(null);
    setSelectedLayoutId(null);
    setDeleteCandidate(null);
    updateExplode(0);
    setContextModeState("line");
    viewerRef.current?.setContextMode("line");
    setCurrentTime(0);
    currentTimeRef.current = 0;
  };

  const loadModel = async (candidate: { example?: ExampleModel; file?: File }) => {
    if (loadBusyRef.current || exporting || awaitingOrientation) return;
    if (candidate.file && !/\.(obj|fbx|glb)$/i.test(candidate.file.name)) {
      setLoadError("Unsupported file. Choose a GLB, OBJ or FBX model.");
      return;
    }
    loadBusyRef.current = true;
    setLoading(true);
    setPlaying(false);
    setLoadError("");
    setLoadMessage("Reading model…");
    try {
      if (!viewerRef.current) throw new Error("The 3D viewer is still starting. Please try again.");
      const file = candidate.example
        ? await readExampleFile(candidate.example, setLoadMessage)
        : candidate.file!;
      setLoadMessage("Preparing mesh parts and outlines…");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 32));
      await viewerRef.current.importFile(file, Boolean(candidate.example));
      resetModelEdits();
      if (candidate.example) updateExplode(1500);
      setModelName(file.name.replace(/\.(obj|fbx|glb)$/i, "").toUpperCase());
      setActiveExample(candidate.example?.id ?? null);
      setAwaitingOrientation(!candidate.example);
      setNotice(candidate.example ? `${candidate.example.name} ready · exploded view · select a part to highlight` : "Choose the model Z-axis display direction");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read this model";
      setLoadError(`${message} Your current model is kept. Try again or import a GLB.`);
    } finally {
      setLoading(false);
      loadBusyRef.current = false;
    }
  };

  const requestModel = (candidate: { example?: ExampleModel; file?: File }) => {
    if (loadBusyRef.current || exporting || awaitingOrientation) return;
    setPlaying(false);
    setReplacement(candidate);
  };

  const importModel = (file: File) => requestModel({ file });

  useEffect(() => {
    if (parts.length && !exampleBootRef.current) {
      exampleBootRef.current = true;
      void loadModel({ example: EXAMPLE_MODELS[1] });
    }
  }, [parts.length]);

  const togglePartVisibility = (index: number) => {
    viewerRef.current?.togglePart(index);
    setParts((current) =>
      current.map((part, partIndex) =>
        partIndex === index ? { ...part, visible: !part.visible } : part,
      ),
    );
  };

  const exportVideo = async () => {
    if (exporting) return;
    const settings: ExportSettings = {
      ...FORMATS[format],
      seconds: duration,
      keyframes: keyframes.map((keyframe) => ({ ...keyframe })),
      layoutKeyframes: layoutKeyframes.map((keyframe) => ({ ...keyframe, offsets: keyframe.offsets.map((offset) => [...offset]) })),
      transition: transitionStyle,
      explodeFrame: { ...explodeFrame },
      rotation: { ...rotationMotion },
    };
    setPlaying(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setExporting(true);
    setExportProgress(0);
    setNotice(`Rendering ${settings.label}…`);
    try {
      await viewerRef.current?.recordVideo(settings, setExportProgress);
      setNotice(`${settings.label} MP4 downloaded`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const exportStill = async () => {
    if (exporting) return;
    const settings: ExportSettings = {
      ...FORMATS[format],
      seconds: duration,
      keyframes: keyframes.map((keyframe) => ({ ...keyframe })),
      layoutKeyframes: layoutKeyframes.map((keyframe) => ({ ...keyframe, offsets: keyframe.offsets.map((offset) => [...offset]) })),
      transition: transitionStyle,
      explodeFrame: { ...explodeFrame },
      rotation: { ...rotationMotion },
    };
    setExporting(true);
    setNotice(`Rendering ${settings.label} still…`);
    try {
      await viewerRef.current?.captureStill(settings);
      setNotice(`${settings.label} PNG downloaded`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Still export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="app-shell" data-language={language} style={{ "--ui-scale": uiScale } as CSSProperties}>
      <header className="topbar">
        <div className="brand-lockup" aria-label="Model Breakdown Studio home">
          <span className="brand-glyph"><span /></span>
          <div>
            <strong>03 / Model Breakdown Studio</strong>
            <small>EXPLODE / EXPLAIN / EXPORT</small>
          </div>
        </div>

        <div className="project-crumbs">
          <span>{copy.project}</span>
          <i>/</i>
          <strong>{modelName}</strong>
          <ChevronDown size={13} />
        </div>

        <div className="topbar-actions">
          <div className="system-status">
            <span className={loading ? "status-dot loading" : "status-dot"} />
            {loading ? copy.analyzing : copy.local}
          </div>
          <button className="button secondary" disabled={loading || exporting || awaitingOrientation || Boolean(replacement)} onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            {copy.import}
          </button>
          <button className="button primary" onClick={() => setInspectorTab("EXPORT")} disabled={exporting || loading || awaitingOrientation || Boolean(replacement)}>
            {exporting ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
            {exporting ? `${Math.round(exportProgress)}%` : copy.export}
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".obj,.fbx,.glb,model/gltf-binary"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importModel(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      {replacement && (
        <div className="replace-overlay" role="dialog" aria-modal="true" aria-labelledby="replace-title" onKeyDown={(event) => { if (event.key === "Escape") setReplacement(null); }}>
          <div className="replace-panel">
            <h2 id="replace-title">Switch to {replacement.example?.name ?? replacement.file?.name}?</h2>
            <p>This replaces the current model and clears its part edits and timeline. Export anything you want to keep first.</p>
            <div><button autoFocus onClick={() => setReplacement(null)}>Keep current model</button><button onClick={() => { const next = replacement; setReplacement(null); void loadModel(next); }}>Load model</button></div>
          </div>
        </div>
      )}
      <section className="studio-shell">
        <nav className="toolrail" aria-label="Viewport tools">
          <button className="tool active" aria-label="Select"><MousePointer2 size={17} /></button>
          <button className="tool" aria-label="Orbit"><Orbit size={17} /></button>
          <button className="tool" aria-label="Frame model" onClick={() => viewerRef.current?.focusModel()}><Focus size={17} /></button>
          <button className="tool" aria-label="Toggle grid"><Grid3X3 size={17} /></button>
          <div className="rail-spacer" />
          <button className="tool" aria-label="Settings"><Settings2 size={17} /></button>
        </nav>

        <aside className="parts-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{copy.structure}</span>
              <h2>{copy.detected}</h2>
            </div>
            <span className="count-badge">{parts.length}</span>
          </div>

          <button className="model-root" onClick={() => selectPart(-1)}>
            <span className="tree-toggle">−</span>
            <BoxIcon size={15} />
            <span>{modelName}</span>
          </button>

          <div className="part-list">
            {parts.map((part, index) => (
              <div
                className={`part-row ${selectedPart === index ? "selected" : ""} ${!part.visible ? "hidden-part" : ""}`}
                key={part.id}
                data-part-index={index}
                draggable={!exporting}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-meshroom-part", String(index));
                  event.dataTransfer.setData("text/plain", String(index));
                  selectPart(index);
                }}
                onDragEnd={() => setTimelineDropActive(false)}
                title="Drag this part onto the timeline to create a highlight cue"
              >
                <button className="part-main" onClick={() => selectPart(index)}>
                  <kbd>{index < 9 ? index + 1 : "·"}</kbd>
                  <span className="part-icon"><Layers3 size={14} /></span>
                  <span className="part-name">
                    <strong title={part.name}>{part.name.replaceAll("_", " ")}</strong>
                    <small>{formatTriangles(part.triangles)} tris</small>
                  </span>
                </button>
                <button
                  className="visibility"
                  aria-label={`${part.visible ? "Hide" : "Show"} ${part.name}`}
                  onClick={() => togglePartVisibility(index)}
                >
                  {part.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                {selectedPart === index && (
                  <button
                    className="delete-geometry"
                    aria-label={`Delete ${part.name}`}
                    onClick={() => requestDeletePart(index)}
                    title="Delete geometry (X)"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mesh-summary">
            <div><span>{copy.meshes}</span><strong>{parts.length.toString().padStart(2, "0")}</strong></div>
            <div><span>{copy.triangles}</span><strong>{formatTriangles(totalTriangles)}</strong></div>
          </div>
          <p className="local-note"><Sparkles size={13} /> {copy.localNote}</p>
        </aside>

        <section
          className={`viewport-stage ${dragging ? "is-dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void importModel(file);
          }}
        >
          <div className="viewport-topline">
            <div className="view-controls">
              <Crosshair size={14} />
              <div className="frame-format-switch" role="group" aria-label="Canvas aspect ratio">
                <span>{copy.frame}</span>
                {Object.keys(FORMATS).map((key) => {
                  const ratio = key.split(" ")[0];
                  return <button key={key} className={format === key ? "active" : ""} onClick={() => setFormat(key)}>{ratio}</button>;
                })}
              </div>
              <div className="view-mode-switch" role="group" aria-label="Camera projection">
                <button
                  className={viewMode === "perspective" ? "active" : ""}
                  onClick={() => setViewMode("perspective")}
                  aria-pressed={viewMode === "perspective"}
                >
                  {copy.perspective}
                </button>
                <button
                  className={viewMode === "axonometric" ? "active" : ""}
                  onClick={() => setViewMode("axonometric")}
                  aria-pressed={viewMode === "axonometric"}
                >
                  {copy.axonometric}
                </button>
              </div>
              <button
                className={`explode-quick ${explode > 0 ? "active" : ""}`}
                onClick={() => updateExplode(explode > 0 ? 0 : 1500)}
                aria-pressed={explode > 0}
              >
                {copy.explode} {explode}%
              </button>
              <button className="axis-quick" onClick={() => viewerRef.current?.openOrientation()}>
                {copy.axis}
              </button>
              <button
                className={`rotation-quick ${rotationMotion.enabled ? "active" : ""}`}
                onClick={() => setRotationEnabled(!rotationMotion.enabled)}
                aria-pressed={rotationMotion.enabled}
                title={rotationMotion.enabled ? "Pause turntable rotation" : "Start turntable rotation"}
              >
                <Orbit size={12} />
                <span>{copy.rotate}</span>
                <b>{rotationMotion.enabled ? "∞" : "OFF"}</b>
              </button>
              <span>{copy.lineDrawing}</span>
            </div>
            <div className="viewport-stats">
              <div className="language-switch" role="group" aria-label="Interface language">
                <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
                <button className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button>
              </div>
            </div>
          </div>

          <ModelViewport
            ref={viewerRef}
            explode={explode}
            frameAspect={frameAspect}
            viewMode={viewMode}
            showBounds={showBounds}
            contextMode={contextMode}
            transitionStyle={transitionStyle}
            strokeWeights={strokeWeights}
            strokeOpacities={strokeOpacities}
            explodeFrame={explodeFrame}
            rotationMotion={rotationMotion}
            language={language}
            uiScale={uiScale}
            onPartsChange={setParts}
            onSelectPart={selectPart}
            onOrientationApplied={(mode) => {
              setAwaitingOrientation(false);
              const label = mode.replace("positive", "+Z").replace("negative", "−Z").replace("-", " ").toUpperCase();
              setNotice(`Orientation set · ${label}`);
            }}
          />

          {explode > 0 && inspectorTab === "SCENE" && (
            <div
              className="explode-crop-frame"
              aria-hidden="true"
              style={{
                top: `${explodeFrame.top}%`,
                right: `${explodeFrame.right}%`,
                bottom: `${explodeFrame.bottom}%`,
                left: `${explodeFrame.left}%`,
              }}
            >
              <span className="crop-label top">TOP {explodeFrame.top}%</span>
              <span className="crop-label right">RIGHT {explodeFrame.right}%</span>
              <span className="crop-label bottom">BOTTOM {explodeFrame.bottom}%</span>
              <span className="crop-label left">LEFT {explodeFrame.left}%</span>
            </div>
          )}

          <div className="axis-widget" aria-hidden="true">
            <span className="axis x">X</span>
            <span className="axis y">Y</span>
            <span className="axis z">Z</span>
            <i />
          </div>

          <div className="selection-hud">
            <span>{copy.active}</span>
            <strong>{selectedPart >= 0 ? parts[selectedPart]?.name : copy.none}</strong>
          </div>

          {explode > 0 && <div className="canvas-drag-hint"><MousePointer2 size={12} /> {copy.dragHint}</div>}

          <div className="key-hint">
            <kbd>↑ ↓</kbd><span>PART</span>
            <i />
            <kbd>← →</kbd><span>TIME</span>
            <i />
            <kbd>X</kbd><span>DELETE</span>
            <i />
            <kbd>SPACE</kbd><span>PLAY</span>
          </div>

          {deleteCandidate !== null && parts[deleteCandidate] && (
            <div className="geometry-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-geometry-title">
              <div className="geometry-delete-panel">
                <span className="eyebrow">GEOMETRY / DELETE</span>
                <h3 id="delete-geometry-title">Delete {parts[deleteCandidate].name}?</h3>
                <p>This removes the geometry from the viewport, exploded layouts, timeline cues, stills, and MP4 exports for this session.</p>
                <div className="geometry-delete-actions">
                  <button onClick={() => setDeleteCandidate(null)}>CANCEL</button>
                  <button className="danger" onClick={confirmDeletePart}>DELETE GEOMETRY</button>
                </div>
              </div>
            </div>
          )}

          {dragging && (
            <div className="drop-overlay">
              <FileUp size={34} />
              <strong>DROP MODEL TO ANALYZE</strong>
              <span>OBJ / FBX / GLB · mesh groups preserved</span>
            </div>
          )}

          {loading && (
            <div className="loading-overlay">
              <LoaderCircle className="spin" size={28} />
              <strong role="status">{loadMessage}</strong>
              <span>Large assemblies can take a moment. Existing parts stay until loading succeeds.</span>
            </div>
          )}
        </section>

        <aside className="inspector-panel">
          <details className="example-library" aria-label="Example models">
            <summary>{language === "zh" ? "切换模型 · 3 个示例" : "Change model · 3 examples"}</summary>
            <div className="example-heading"><h2>{language === "zh" ? "选择示例模型" : "EXAMPLE MODELS"}</h2><span>GLB / 3</span></div>
            <p>{language === "zh" ? "选择模型 → 拆解 → 高亮部件 → 导出" : "Choose a model → explode → highlight → export"}</p>
            <div className="example-cards">
              {EXAMPLE_MODELS.map((example) => (
                <button key={example.id} className={activeExample === example.id ? "example-card active" : "example-card"}
                  aria-label={`Load ${example.name}`} aria-pressed={activeExample === example.id}
                  disabled={loading || exporting || awaitingOrientation || Boolean(replacement)} onClick={() => requestModel({ example })}>
                  <img src={example.thumbnail} alt="" width="160" height="100" />
                  <strong>{example.name}</strong><span>{example.parts} parts · {example.downloadLabel}</span>
                </button>
              ))}
            </div>
            <button className="example-upload" disabled={loading || exporting || awaitingOrientation || Boolean(replacement)} onClick={() => fileInputRef.current?.click()}><Upload size={14} />{language === "zh" ? "上传自己的 GLB" : "IMPORT YOUR OWN GLB"}</button>
            <p>{language === "zh" ? "也可将模型拖入画布。文件仅在浏览器内处理。" : "Or drop a model on the canvas. Your uploads stay in this browser."}</p>
            {loading && <p role="status">{loadMessage}</p>}
            {loadError && <p className="example-error" role="alert">{loadError}</p>}
          </details>
          <div className="inspector-tabs" role="tablist">
            {(["MOTION", "SCENE", "EXPORT"] as const).map((tab) => (
              <button
                key={tab}
                className={inspectorTab === tab ? "active" : ""}
                onClick={() => setInspectorTab(tab)}
              >
                {tab === "MOTION" ? copy.motion : tab === "SCENE" ? copy.scene : copy.output}
              </button>
            ))}
          </div>

          {inspectorTab === "MOTION" && (
            <div className="inspector-content">
              <div className="explode-feature">
                <div className="section-title"><span>01</span><h3>{copy.explodedStructure}</h3></div>
                <p>{language === "zh" ? "展开部件，读懂层级关系。拖动滑块对比完整与拆解状态。" : "Separate the parts. Reveal the hierarchy. Move the slider to compare assembled and exploded views."}</p>
                <div className="explode-compare"><button onClick={() => updateExplode(0)} aria-pressed={explode === 0}>{language === "zh" ? "完整模型" : "Assembled"}</button><button onClick={() => updateExplode(1500)} aria-pressed={explode > 0}>{language === "zh" ? "拆解视图" : "Exploded view ↗"}</button></div>
              </div>
              <label className="range-control">
                <span><b>EXPLODE</b><output>{explode}%</output></span>
                <input aria-label="Exploded structure amount" type="range" min="0" max="1500" step="10" value={explode} onChange={(event) => updateExplode(Number(event.target.value))} />
              </label>
              <div className="preset-grid">
                {[0, 250, 750, 1500].map((value) => (
                  <button key={value} onClick={() => updateExplode(value)} className={explode === value ? "active" : ""}>
                    {value === 0 ? copy.assembled : `${value}%`}
                  </button>
                ))}
              </div>
              <div className="explode-crop-controls">
                <div className="crop-control-heading">
                  <span>EXPLODE CROP / SAFE FRAME</span>
                  <button onClick={() => setExplodeFrame({ top: 8, right: 8, bottom: 12.5, left: 8 })}>RESET</button>
                </div>
                <div className="crop-edge-grid">
                  {(["top", "right", "bottom", "left"] as const).map((edge) => (
                    <label key={edge}>
                      <span>{edge.toUpperCase()}</span>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        step="0.5"
                        value={explodeFrame[edge]}
                        onChange={(event) => updateExplodeFrame(edge, Number(event.target.value))}
                      />
                      <b>%</b>
                    </label>
                  ))}
                </div>
                <p>{language === "zh"
                  ? "按实际高度由下至上分层，同层部件一起竖直展开，保留横向位置。1500% 适配画布安全边界；手动拖动可继续微调。"
                  : "Layers follow the model’s actual height. Same-level parts move vertically together, preserving their footprint. 1500% fits the safe frame. Drag to fine-tune."}</p>
              </div>
              <div className="rule" />
              <ToggleRow
                icon={<BoxSelect size={16} />}
                title={copy.selectionBounds}
                caption={copy.boundsCaption}
                value={showBounds}
                onChange={setShowBounds}
              />
              <div className="section-title compact"><span>02</span><h3>{copy.rotation}</h3></div>
              <div className={`rotation-motion-panel ${rotationMotion.enabled ? "active" : ""}`}>
                <ToggleRow
                  icon={<Orbit size={16} />}
                  title={copy.turntable}
                  caption={copy.rotationCaption}
                  value={rotationMotion.enabled}
                  onChange={setRotationEnabled}
                />
                <label className="rotation-speed-control">
                  <span><b>{copy.speed}</b><output>{rotationMotion.degreesPerSecond}°/S</output></span>
                  <input
                    aria-label="Turntable rotation speed"
                    type="range"
                    min="4"
                    max="60"
                    step="1"
                    value={rotationMotion.degreesPerSecond}
                    onChange={(event) => updateRotationSpeed(Number(event.target.value))}
                  />
                  <span className="rotation-speed-meta">
                    <small>{(360 / rotationMotion.degreesPerSecond).toFixed(1)} {copy.secondsPerRevolution}</small>
                    <strong>{copy.loop}</strong>
                  </span>
                </label>
                <div className="rotation-direction" role="group" aria-label="Turntable rotation direction">
                  <span>{copy.direction}</span>
                  <button
                    className={rotationMotion.direction === "clockwise" ? "active" : ""}
                    onClick={() => updateRotationDirection("clockwise")}
                  >CW</button>
                  <button
                    className={rotationMotion.direction === "counterclockwise" ? "active" : ""}
                    onClick={() => updateRotationDirection("counterclockwise")}
                  >CCW</button>
                </div>
                <div className="rotation-center-readout">
                  <Crosshair size={14} />
                  <span><strong>{copy.visualCenter}</strong><small>{copy.visualPivot}</small></span>
                  <b>{copy.locked}</b>
                </div>
              </div>
              <div className="section-title compact"><span>03</span><h3>{copy.highlight}</h3></div>
              <div className="transition-switch" role="group" aria-label="Highlight entrance style">
                <span>{copy.entrance}</span>
                {(["pop", "slice"] as const).map((style) => (
                  <button key={style} className={transitionStyle === style ? "active" : ""} onClick={() => setTransitionStyle(style)}>
                    {style.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="microcopy">Use ↑ / ↓ to browse every component, or drag any node directly onto the timeline.</p>
            </div>
          )}

          {inspectorTab === "SCENE" && (
            <div className="inspector-content">
              <h3>Line weights & readability</h3>
              <div className="stroke-controls" role="group" aria-label="Line layer stroke weights">
                {([
                  ["structure", "STRUCTURE"],
                  ["ellipse", "ELLIPSE"],
                  ["silhouette", "AIR EDGE"],
                  ["major", "MAJOR EDGE"],
                ] as const).map(([layer, label]) => (
                  <label className="stroke-select" key={layer}>
                    <span>{label}</span>
                    <span className="stroke-values">
                      <select
                        value={strokeWeights[layer]}
                        onChange={(event) => updateStrokeWeight(layer, Number(event.target.value) as StrokeWeight)}
                        aria-label={`${label.toLowerCase()} stroke weight`}
                      >
                        {STROKE_OPTIONS.map((weight) => (
                          <option value={weight} key={weight}>{weight} pt</option>
                        ))}
                      </select>
                      <select
                        value={Math.round(strokeOpacities[layer] * 100)}
                        onChange={(event) => updateStrokeOpacity(layer, Number(event.target.value))}
                        aria-label={`${label.toLowerCase()} opacity`}
                      >
                        {OPACITY_OPTIONS.map((opacity) => (
                          <option value={opacity} key={opacity}>{opacity}%</option>
                        ))}
                      </select>
                    </span>
                  </label>
                ))}
              </div>
              <label className="ui-scale-control">
                <span>{language === "zh" ? "字号" : "UI SIZE"}</span>
                <input type="range" min="0.85" max="1.65" step="0.05" value={uiScale} onChange={(event) => setUiScale(Number(event.target.value))} />
                <b>{Math.round(uiScale * 100)}%</b>
              </label>

              <div className="section-title"><span>01</span><h3>{copy.viewportScene}</h3></div>
              <div className="data-list">
                <div><span>Environment</span><strong>Wireframe void</strong></div>
                <div><span>Camera</span><strong>{viewMode === "axonometric" ? "Axonometric" : "Perspective 36°"}</strong></div>
                <div><span>Silhouette</span><strong>Air edge / crisp</strong></div>
                <div><span>Tone mapping</span><strong>ACES filmic</strong></div>
                <div><span>Lighting</span><strong>3-point + rim</strong></div>
              </div>
              <button className="wide-action" onClick={() => viewerRef.current?.focusModel()}><Maximize2 size={15} /> FRAME MODEL</button>
              <div className="section-title compact"><span>02</span><h3>{copy.modelData}</h3></div>
              <div className="metric-block">
                <div><small>PARTS</small><strong>{parts.length}</strong></div>
                <div><small>TRIS</small><strong>{formatTriangles(totalTriangles)}</strong></div>
              </div>
            </div>
          )}

          {inspectorTab === "EXPORT" && (
            <div className="inspector-content">
              <div className="section-title"><span>01</span><h3>{copy.videoOutput}</h3></div>
              <label className="select-control">
                <span>{copy.resolution}</span>
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  {Object.keys(FORMATS).map((key) => <option key={key}>{key}</option>)}
                </select>
              </label>
              <label className="select-control">
                <span>{copy.duration}</span>
                <input
                  type="number"
                  min="2"
                  max="30"
                  step="0.5"
                  value={duration}
                  onChange={(event) => updateDuration(Number(event.target.value))}
                  disabled={exporting}
                />
              </label>
              <div className="export-spec">
                <div><span>CANVAS</span><strong>{FORMATS[format].width} × {FORMATS[format].height}</strong></div>
                <div><span>CODEC</span><strong>H.264 / MP4</strong></div>
                <div><span>RATE</span><strong>{FORMATS[format].fps} FPS</strong></div>
              </div>
              <button className="render-button" onClick={exportVideo} disabled={exporting || loading || awaitingOrientation || Boolean(replacement)}>
                {exporting ? <LoaderCircle className="spin" size={17} /> : <Video size={17} />}
                {exporting ? `RENDERING ${Math.round(exportProgress)}%` : `RENDER ${format}`}
              </button>
              <button className="still-button" onClick={exportStill} disabled={exporting || loading || awaitingOrientation || Boolean(replacement)}>
                <Download size={15} /> {copy.currentFrame}
              </button>
              {exporting && <div className="progress-track"><span style={{ width: `${exportProgress}%` }} /></div>}
              <p className="microcopy">
                {language === "zh"
                  ? "视频会在你的电脑浏览器中逐帧离线渲染；导出期间可保持此页面在前台，以获得最稳定的速度。四种画幅都会保留当前镜头、Highlight、Bounding UI 与技术信息。"
                  : "Rendered frame-by-frame on this computer. Keep this tab in the foreground for the most stable speed. All four formats preserve the camera, highlight, bounding UI, and technical data."}
              </p>
            </div>
          )}
        </aside>

        <div className="timeline">
          <div className="timeline-toolbar">
            <button
              className="play-button"
              onClick={togglePlayback}
              disabled={exporting}
              aria-label={playing ? "Pause timeline" : "Play timeline"}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <div className="time-readout">
              <span>PLAYHEAD</span>
              <strong>{currentTime.toFixed(1)}s</strong>
            </div>
            <label className="duration-control">
              <span>DURATION</span>
              <input
                type="number"
                min="2"
                max="30"
                step="0.5"
                value={duration}
                onChange={(event) => updateDuration(Number(event.target.value))}
                disabled={exporting}
              />
              <b>SEC</b>
            </label>
            <div className="segments-control">
              <span>SECTIONS</span>
              <button onClick={() => setSegmentCount((count) => Math.max(1, count - 1))} aria-label="Remove timeline section">−</button>
              <strong>{segmentCount.toString().padStart(2, "0")}</strong>
              <button onClick={() => setSegmentCount((count) => Math.min(12, count + 1))} aria-label="Add timeline section">+</button>
            </div>
            <label className="dissolve-control">
              <span>{transitionStyle.toUpperCase()}</span>
              <input
                type="number"
                min="0.1"
                max="2.5"
                step="0.1"
                value={dissolveDuration}
                onChange={(event) => updateDissolveDuration(Number(event.target.value))}
                disabled={exporting}
              />
              <b>SEC</b>
            </label>
            <div className="timeline-summary">
              <span>CUES</span>
              <strong>{keyframes.length.toString().padStart(2, "0")}</strong>
            </div>
            <div className="timeline-summary explode-state">
              <span>LAYER EXPLODE</span>
              <strong>{explode}%</strong>
            </div>
            <button
              type="button"
              className="layout-key-button"
              onClick={addLayoutKeyframe}
              disabled={exporting}
              title="Record current explode amount and every dragged part position"
            >
              <kbd>K</kbd>
              <span>{language === "zh" ? "记录布局" : "KEY LAYOUT"}</span>
            </button>
            <div className="context-bank">
              <span>OTHER PARTS</span>
              <button className={contextMode === "line" ? "active" : ""} onClick={() => updateContextMode("line")}>LINE</button>
              <button className={contextMode === "dim" ? "active" : ""} onClick={() => updateContextMode("dim")}>DASH</button>
            </div>
            <button
              type="button"
              className="cue-delete"
              onClick={removeSelectedTimelineKey}
              disabled={(!selectedCueId && !selectedLayoutId) || exporting}
              aria-label="Remove selected timeline key"
            >
              <X size={11} /> REMOVE KEY
            </button>
            <div className="numpad-bank">
              <span>ADD REVEAL KEY</span>
              {[1, 2, 3, 4, 5].map((key) => (
                <button
                  key={key}
                  onClick={() => addKeyframe(key - 1)}
                  disabled={exporting || key > parts.length}
                  aria-label={`Add part ${key} keyframe at ${currentTime.toFixed(1)} seconds`}
                >
                  <small>NUM</small>{key}
                </button>
              ))}
            </div>
          </div>
          <div className="timeline-editor">
            <span className="track-label">HIGHLIGHT / REVEAL</span>
            <div
              ref={timelineTrackRef}
              className={`timeline-track ${timelineDropActive ? "drop-active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setTimelineDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 0.9999);
                setTimelineHoverSegment(Math.floor(ratio * segmentCount));
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setTimelineDropActive(false);
                  setTimelineHoverSegment(-1);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setTimelineDropActive(false);
                setTimelineHoverSegment(-1);
                const rect = event.currentTarget.getBoundingClientRect();
                const requestedTime = ((event.clientX - rect.left) / rect.width) * duration;
                const nextTime = Math.min(
                  Math.max(0, duration - 1 / 30),
                  Math.max(0, Math.round(requestedTime * 30) / 30),
                );
                const rawIndex = event.dataTransfer.getData("application/x-meshroom-part") || event.dataTransfer.getData("text/plain");
                const partIndex = Number(rawIndex);
                if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= parts.length) return;
                setPlaying(false);
                currentTimeRef.current = nextTime;
                setCurrentTime(nextTime);
                addKeyframeAt(partIndex, nextTime);
              }}
              onPointerDown={beginTimelineScrub}
              onPointerMove={moveTimelineScrub}
              onPointerUp={endTimelineScrub}
              onPointerCancel={endTimelineScrub}
            >
              <div className="segment-grid" aria-hidden="true">
                {Array.from({ length: segmentCount }, (_, segmentIndex) => (
                  <span
                    key={segmentIndex}
                    className={timelineHoverSegment === segmentIndex ? "active" : ""}
                    style={{ width: `${100 / segmentCount}%` }}
                  >
                    <b>SECTION {String(segmentIndex + 1).padStart(2, "0")}</b>
                  </span>
                ))}
              </div>
              <div className="track-fill" style={{ width: `${(currentTime / duration) * 100}%` }} />
              {layoutKeyframes.map((layout) => (
                <button
                  key={layout.id}
                  className={`layout-keyframe-marker ${selectedLayoutId === layout.id ? "selected" : ""} ${draggingLayoutId === layout.id ? "dragging" : ""}`}
                  style={{ left: `${(layout.time / duration) * 100}%` }}
                  onPointerDown={(event) => beginKeyframeDrag(event, "layout", layout.id, layout.time)}
                  onPointerMove={moveKeyframeDrag}
                  onPointerUp={endKeyframeDrag}
                  onPointerCancel={endKeyframeDrag}
                  onClick={() => {
                    if (suppressTimelineClickRef.current) {
                      suppressTimelineClickRef.current = false;
                      return;
                    }
                    setPlaying(false);
                    currentTimeRef.current = layout.time;
                    setCurrentTime(layout.time);
                    setSelectedLayoutId(layout.id);
                    setSelectedCueId(null);
                    setExplode(layout.explode);
                    viewerRef.current?.setLayoutState(layout.explode, layout.offsets);
                  }}
                  title={`${language === "zh" ? "布局关键帧" : "LAYOUT KEY"} · ${layout.explode}% · frame ${Math.round(layout.time * 30)} · drag to move · Delete to remove`}
                >
                  <b>K</b><span>{layout.explode}%</span>
                </button>
              ))}
              {Array.from({ length: segmentCount + 1 }, (_, index) => index / segmentCount).map((tick) => (
                <i key={tick} style={{ left: `${tick * 100}%` }}><em>{Math.round(tick * duration * 30)}</em></i>
              ))}
              {keyframes.map((frame) => (
                <span className="cue-group" key={frame.id}>
                  <span
                    className="dissolve-window"
                    style={{
                      left: `${(frame.time / duration) * 100}%`,
                      width: `${Math.min(100 - (frame.time / duration) * 100, (frame.dissolve / duration) * 100)}%`,
                    }}
                  />
                  <button
                    className={`keyframe-marker ${selectedCueId === frame.id ? "selected" : ""} ${frame.contextMode === "dim" ? "dim-context" : ""} ${draggingCueId === frame.id ? "dragging" : ""}`}
                    style={{ left: `${(frame.time / duration) * 100}%` }}
                    onPointerDown={(event) => beginKeyframeDrag(event, "cue", frame.id, frame.time)}
                    onPointerMove={moveKeyframeDrag}
                    onPointerUp={endKeyframeDrag}
                    onPointerCancel={endKeyframeDrag}
                    onDragOver={(event) => {
                      if (!Array.from(event.dataTransfer.types).includes("application/x-meshroom-part")) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(event) => {
                      const rawIndex = event.dataTransfer.getData("application/x-meshroom-part");
                      if (!rawIndex) return;
                      const partIndex = Number(rawIndex);
                      if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= parts.length) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setKeyframes((frames) => frames.map((item) =>
                        item.id === frame.id ? { ...item, partIndex, key: partIndex + 1 } : item
                      ));
                      setSelectedCueId(frame.id);
                      selectPart(partIndex, frame.dissolve);
                      setNotice(`Cue replaced · ${parts[partIndex].name}`);
                    }}
                    onClick={() => {
                      if (suppressTimelineClickRef.current) {
                        suppressTimelineClickRef.current = false;
                        return;
                      }
                      setPlaying(false);
                      currentTimeRef.current = frame.time;
                      setCurrentTime(frame.time);
                      applyTimelineFrame(frame);
                    }}
                    title={`PART ${frame.key} · frame ${Math.round(frame.time * 30)} · drag to move · drop another part to replace · Delete to remove`}
                  >
                    <b>{frame.key}</b>
                    <span>{parts[frame.partIndex]?.name ?? `PART_${frame.key}`}</span>
                  </button>
                </span>
              ))}
              <span className="playhead" style={{ left: `${(currentTime / duration) * 100}%` }}>
                <b>{Math.round(currentTime * 30)}</b>
              </span>
            </div>
            <span className="timeline-help">{language === "zh" ? "左键拖动预览 · 关键帧吸附到帧 · K 记录布局 · DELETE 删除" : "LMB SCRUB · KEYS SNAP TO FRAMES · K RECORDS LAYOUT · DELETE REMOVES"}</span>
          </div>
        </div>
      </section>

      {notice && <div role="status" className={`notice ${notice.includes("Unsupported") || notice.includes("failed") ? "error" : ""}`}>
        <CircleDot size={12} /> {notice}
        <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={12} /></button>
      </div>}
    </main>
  );
}

function ToggleRow({
  icon,
  title,
  caption,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <span className="toggle-icon">{icon}</span>
      <div><strong>{title}</strong><small>{caption}</small></div>
      <button className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <span />
      </button>
    </div>
  );
}
