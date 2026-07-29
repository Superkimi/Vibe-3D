"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  RoundedBox,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import type { SceneNode, Transform, VibeScene } from "@/lib/scene-schema";
import { downloadBlob, safeFilename } from "@/lib/download";
import { useEditor } from "./EditorContext";

export interface SceneViewportHandle {
  exportModel(format: "glb" | "obj" | "stl"): Promise<void>;
  capturePng(): void;
}

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

function MeshContent({ node, wireframeAll }: { node: Extract<SceneNode, { type: "mesh" }>; wireframeAll: boolean }) {
  const material = node.material;
  if (node.geometry.kind === "box" && node.geometry.bevel > 0) {
    return (
      <RoundedBox args={[node.geometry.width, node.geometry.height, node.geometry.depth]} radius={Math.min(node.geometry.bevel, Math.min(node.geometry.width, node.geometry.height, node.geometry.depth) / 2)} smoothness={4} castShadow={node.castShadow} receiveShadow={node.receiveShadow}>
        <meshPhysicalMaterial {...material} wireframe={wireframeAll || material.wireframe} />
      </RoundedBox>
    );
  }
  return (
    <mesh castShadow={node.castShadow} receiveShadow={node.receiveShadow}>
      <Geometry node={node} />
      <meshPhysicalMaterial {...material} wireframe={wireframeAll || material.wireframe} />
    </mesh>
  );
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
}: {
  node: SceneNode;
  scene: VibeScene;
  selectedNodeId?: string;
  wireframeAll: boolean;
  onSelect(id: string): void;
  onTransform(id: string, transform: Transform): void;
  mode: "translate" | "rotate" | "scale";
}) {
  const objectRef = useRef<THREE.Group>(null);
  const children = scene.nodes.filter((item) => item.parentId === node.id);
  const transform = node.transform;
  const object = (
    <group
      ref={objectRef}
      name={node.name}
      userData={{ vibeNodeId: node.id, vibeType: node.type }}
      visible={node.visible}
      position={transform.position}
      rotation={[rad(transform.rotation[0]), rad(transform.rotation[1]), rad(transform.rotation[2])]}
      scale={transform.scale}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
    >
      {node.type === "mesh" && <MeshContent node={node} wireframeAll={wireframeAll} />}
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
        />
      ))}
    </group>
  );

  if (node.id !== selectedNodeId || node.locked) return object;
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

function SceneContent({ rootRef }: { rootRef: React.RefObject<THREE.Group | null> }) {
  const {
    scene,
    selectedNodeId,
    selectNode,
    transformMode,
    updateNodeTransform,
    gridVisible,
    wireframeAll,
  } = useEditor();
  const roots = useMemo(() => scene.nodes.filter((node) => !node.parentId), [scene.nodes]);
  return (
    <>
      <color attach="background" args={[scene.background]} />
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

export const SceneViewport = forwardRef<SceneViewportHandle>(function SceneViewport(_, ref) {
  const { scene, selectNode } = useEditor();
  const rootRef = useRef<THREE.Group>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const exportModel = useCallback(async (format: "glb" | "obj" | "stl") => {
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
  }, [scene.name]);

  useImperativeHandle(ref, () => ({
    exportModel,
    capturePng() {
      const dataUrl = canvasRef.current?.toDataURL("image/png");
      if (!dataUrl) return;
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${safeFilename(scene.name)}.png`;
      anchor.click();
    },
  }), [exportModel, scene.name]);

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
        <SceneContent rootRef={rootRef} />
      </Canvas>
      <div className="viewport-status">
        <span>Perspective</span><i /> <span>{scene.nodes.filter((node) => node.type === "mesh" && node.visible).length} meshes</span>
      </div>
    </div>
  );
});
