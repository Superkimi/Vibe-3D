"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  Outlines,
  RoundedBox,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { SceneNode, Transform, VibeScene } from "@/lib/scene-schema";
import { downloadBlob, safeFilename } from "@/lib/download";
import { useEditor } from "./EditorContext";

export interface SceneViewportHandle {
  exportModel(format: "glb" | "obj" | "stl"): Promise<void>;
  capturePng(): void;
}

export type SceneViewportPreview = {
  scene: VibeScene;
  nodeIds: readonly string[];
  baseUpdatedAt: string;
};

const rad = (degrees: number) => THREE.MathUtils.degToRad(degrees);
const deg = (radians: number) => Math.round(THREE.MathUtils.radToDeg(radians) * 1000) / 1000;

function Geometry({ node }: { node: Extract<SceneNode, { type: "mesh" }> }) {
  const geometry = node.geometry;
  switch (geometry.kind) {
    case "box":
      if (geometry.bevel > 0) {
        return <RoundedBox args={[geometry.width, geometry.height, geometry.depth]} radius={Math.min(geometry.bevel, Math.min(geometry.width, geometry.height, geometry.depth) / 2)} smoothness={4} />;
      }
      return <boxGeometry args={[geometry.width, geometry.height, geometry.depth]} />;
    case "sphere":
      return <sphereGeometry args={[geometry.radius, geometry.widthSegments, geometry.heightSegments]} />;
    case "cylinder":
      return <cylinderGeometry args={[geometry.radiusTop, geometry.radiusBottom, geometry.height, geometry.radialSegments, 1, geometry.openEnded]} />;
    case "cone":
      return <coneGeometry args={[geometry.radius, geometry.height, geometry.radialSegments]} />;
    case "torus":
      return <torusGeometry args={[geometry.radius, geometry.tube, geometry.radialSegments, geometry.tubularSegments]} />;
    case "capsule":
      return <capsuleGeometry args={[geometry.radius, geometry.length, geometry.capSegments, geometry.radialSegments]} />;
    case "plane":
      return <planeGeometry args={[geometry.width, geometry.height]} />;
  }
}

function MeshContent({ node, wireframeAll, highlighted }: {
  node: Extract<SceneNode, { type: "mesh" }>;
  wireframeAll: boolean;
  highlighted: boolean;
}) {
  const material = node.material;
  const displayMaterial = highlighted
    ? { ...material, emissive: "#c7b5ff", emissiveIntensity: Math.max(material.emissiveIntensity, 0.42) }
    : material;
  if (node.geometry.kind === "box" && node.geometry.bevel > 0) {
    return (
      <RoundedBox args={[node.geometry.width, node.geometry.height, node.geometry.depth]} radius={Math.min(node.geometry.bevel, Math.min(node.geometry.width, node.geometry.height, node.geometry.depth) / 2)} smoothness={4} castShadow={node.castShadow} receiveShadow={node.receiveShadow}>
        <meshPhysicalMaterial {...displayMaterial} wireframe={wireframeAll || material.wireframe} />
        {highlighted && <Outlines color="#d7c7ff" thickness={0.045} screenspace />}
      </RoundedBox>
    );
  }
  return (
    <mesh castShadow={node.castShadow} receiveShadow={node.receiveShadow}>
      <Geometry node={node} />
      <meshPhysicalMaterial {...displayMaterial} wireframe={wireframeAll || material.wireframe} />
      {highlighted && <Outlines color="#d7c7ff" thickness={0.045} screenspace />}
    </mesh>
  );
}

function NeutralMaterialEnvironment({ enabled }: { enabled: boolean }) {
  const { gl, scene } = useThree();
  const environmentTarget = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room);
    room.dispose();
    pmrem.dispose();
    return target;
  }, [gl]);
  const environment = environmentTarget.texture;

  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    setSceneEnvironment(scene, enabled ? environment : null, enabled ? 0.72 : 1);
    return () => {
      setSceneEnvironment(scene, previousEnvironment, previousIntensity);
    };
  }, [enabled, environment, scene]);

  useEffect(() => () => environmentTarget.dispose(), [environmentTarget]);
  return null;
}

function setSceneEnvironment(scene: THREE.Scene, environment: THREE.Texture | null, intensity: number) {
  scene.environment = environment;
  scene.environmentIntensity = intensity;
}

function LightContent({ node }: { node: Extract<SceneNode, { type: "light" }> }) {
  const common = { color: node.color, intensity: node.intensity };
  if (node.lightKind === "ambient") return <ambientLight {...common} />;
  if (node.lightKind === "point") return <pointLight {...common} distance={node.distance} castShadow={node.castShadow} />;
  if (node.lightKind === "spot") return <spotLight {...common} distance={node.distance} angle={node.angle} penumbra={node.penumbra} castShadow={node.castShadow} />;
  return <directionalLight {...common} castShadow={node.castShadow} shadow-mapSize={[2048, 2048]} />;
}

function NodeObject({
  node,
  scene,
  selectedNodeId,
  wireframeAll,
  onSelect,
  onTransform,
  mode,
  previewNodeIds,
  interactive,
}: {
  node: SceneNode;
  scene: VibeScene;
  selectedNodeId?: string;
  wireframeAll: boolean;
  onSelect(id: string): void;
  onTransform(id: string, transform: Transform): void;
  mode: "translate" | "rotate" | "scale";
  previewNodeIds: ReadonlySet<string>;
  interactive: boolean;
}) {
  const objectRef = useRef<THREE.Group>(null);
  const children = scene.nodes.filter((item) => item.parentId === node.id);
  const transform = node.transform;
  const highlighted = previewNodeIds.has(node.id) && node.type === "mesh";
  const object = (
    <group
      ref={objectRef}
      name={node.name}
      userData={{ vibeNodeId: node.id, vibeType: node.type }}
      visible={node.visible}
      position={transform.position}
      rotation={[rad(transform.rotation[0]), rad(transform.rotation[1]), rad(transform.rotation[2])]}
      scale={transform.scale}
      onClick={interactive ? (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(node.id);
      } : undefined}
    >
      {node.type === "mesh" && <MeshContent node={node} wireframeAll={wireframeAll} highlighted={highlighted} />}
      {node.type === "light" && <LightContent node={node} />}
      {children.map((child) => (
        <NodeObject
          key={child.id}
          node={child}
          scene={scene}
          selectedNodeId={selectedNodeId}
          wireframeAll={wireframeAll}
          onSelect={onSelect}
          onTransform={onTransform}
          mode={mode}
          previewNodeIds={previewNodeIds}
          interactive={interactive}
        />
      ))}
    </group>
  );

  if (!interactive || node.id !== selectedNodeId || node.locked) return object;
  return (
    <TransformControls
      mode={mode}
      size={0.72}
      onMouseUp={() => {
        const current = objectRef.current;
        if (!current) return;
        onTransform(node.id, {
          position: [current.position.x, current.position.y, current.position.z],
          rotation: [deg(current.rotation.x), deg(current.rotation.y), deg(current.rotation.z)],
          scale: [current.scale.x, current.scale.y, current.scale.z],
        });
      }}
    >
      {object}
    </TransformControls>
  );
}

function SceneContent({
  rootRef,
  scene,
  previewNodeIds,
  interactive,
}: {
  rootRef: React.RefObject<THREE.Group | null>;
  scene: VibeScene;
  previewNodeIds: ReadonlySet<string>;
  interactive: boolean;
}) {
  const {
    selectedNodeId,
    selectNode,
    transformMode,
    updateNodeTransform,
    gridVisible,
    wireframeAll,
    materialPreview,
  } = useEditor();
  const roots = useMemo(() => scene.nodes.filter((node) => !node.parentId), [scene.nodes]);
  return (
    <>
      <color attach="background" args={[scene.background]} />
      <NeutralMaterialEnvironment enabled={materialPreview} />
      <ambientLight intensity={0.42} color="#f4efff" />
      {scene.environment !== "none" && (
        <>
          <hemisphereLight intensity={0.78} color="#e9e2ff" groundColor="#18131d" />
          <directionalLight position={[-3, 5, 4]} intensity={1.1} color="#d7caff" />
          <pointLight position={[4, 1, -3]} intensity={2.4} distance={12} color="#8c79c0" />
        </>
      )}
      <group ref={rootRef} name={scene.name}>
        {roots.map((node) => (
          <NodeObject
            key={node.id}
            node={node}
            scene={scene}
            selectedNodeId={selectedNodeId}
            wireframeAll={wireframeAll}
            onSelect={selectNode}
            onTransform={updateNodeTransform}
            mode={transformMode}
            previewNodeIds={previewNodeIds}
            interactive={interactive}
          />
        ))}
      </group>
      {gridVisible && (
        <Grid
          infiniteGrid
          fadeDistance={36}
          fadeStrength={5}
          cellSize={0.25}
          sectionSize={1}
          cellColor="#3f3b47"
          sectionColor="#6650a4"
          position={[0, -0.82, 0]}
        />
      )}
      <OrbitControls makeDefault minDistance={1} maxDistance={40} dampingFactor={0.08} />
      <GizmoHelper alignment="bottom-right" margin={[74, 68]}>
        <GizmoViewport axisColors={["#e86870", "#83bd88", "#7f92e8"]} labelColor="#f4f1f7" />
      </GizmoHelper>
    </>
  );
}

export const SceneViewport = forwardRef<SceneViewportHandle, { preview?: SceneViewportPreview | null }>(function SceneViewport({ preview }, ref) {
  const { scene, selectNode, t } = useEditor();
  const rootRef = useRef<THREE.Group>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayScene = preview?.scene ?? scene;
  const previewNodeIds = useMemo(() => new Set(preview?.nodeIds ?? []), [preview?.nodeIds]);

  const exportModel = useCallback(async (format: "glb" | "obj" | "stl") => {
    if (preview) return;
    const root = rootRef.current;
    if (!root) return;
    const filename = safeFilename(scene.name);
    if (format === "obj") {
      const output = new OBJExporter().parse(root);
      downloadBlob(new Blob([output], { type: "text/plain" }), `${filename}.obj`);
      return;
    }
    if (format === "stl") {
      const output = new STLExporter().parse(root, { binary: true });
      const bytes = output instanceof DataView
        ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
        : output;
      downloadBlob(new Blob([bytes], { type: "model/stl" }), `${filename}.stl`);
      return;
    }
    const output = await new GLTFExporter().parseAsync(root, {
      binary: true,
      onlyVisible: true,
      trs: false,
      maxTextureSize: 2048,
    });
    downloadBlob(new Blob([output as ArrayBuffer], { type: "model/gltf-binary" }), `${filename}.glb`);
  }, [preview, scene.name]);

  useImperativeHandle(ref, () => ({
    exportModel,
    capturePng() {
      if (preview) return;
      const dataUrl = canvasRef.current?.toDataURL("image/png");
      if (!dataUrl) return;
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${safeFilename(scene.name)}.png`;
      anchor.click();
    },
  }), [exportModel, preview, scene.name]);

  return (
    <div className="viewport-shell" onPointerDown={(event) => {
      if (event.target === event.currentTarget) selectNode(undefined);
    }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [4.4, 3.1, 5.4], fov: 38, near: 0.01, far: 1000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          canvasRef.current = gl.domElement;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => selectNode(undefined)}
      >
        <SceneContent rootRef={rootRef} scene={displayScene} previewNodeIds={previewNodeIds} interactive={!preview} />
      </Canvas>
      {preview && (
        <div className="viewport-preview-banner" role="status">
          <strong>{t("viewport.previewBadge")}</strong>
          <span>{t("viewport.previewCopy")}</span>
        </div>
      )}
      <div className="viewport-status">
        <span>{t("viewport.perspective")}</span><i /> <span>{t("viewport.meshes", { count: displayScene.nodes.filter((node) => node.type === "mesh" && node.visible).length })}</span>
      </div>
    </div>
  );
});
