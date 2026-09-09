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
  focusSelected(): void;
  resetView(): void;
  toggleProjection(): void;
  projection: "perspective" | "orthographic";
}

export type SceneViewportPreview = {
  scene: VibeScene;
  nodeIds: readonly string[];
  baseRevision: number;
};

const rad = (degrees: number) => THREE.MathUtils.degToRad(degrees);
const deg = (radians: number) => Math.round(THREE.MathUtils.radToDeg(radians) * 1000) / 1000;
const sceneUnitToMeters: Record<VibeScene["unit"], number> = { m: 1, cm: 0.01, mm: 0.001 };
type OrbitControlsInstance = React.ElementRef<typeof OrbitControls>;

function localMatrixForSceneNode(node: SceneNode) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...node.transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      rad(node.transform.rotation[0]),
      rad(node.transform.rotation[1]),
      rad(node.transform.rotation[2]),
    )),
    new THREE.Vector3(...node.transform.scale),
  );
}

function sceneWorldPosition(scene: VibeScene, nodeId?: string) {
  if (!nodeId) return new THREE.Vector3();
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const chain: SceneNode[] = [];
  let current = byId.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    chain.unshift(current);
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  const matrix = new THREE.Matrix4();
  for (const node of chain) matrix.multiply(localMatrixForSceneNode(node));
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

function visibleMeshCount(scene: VibeScene) {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return scene.nodes.filter((node) => {
    if (node.type !== "mesh") return false;
    const visited = new Set<string>();
    let current: SceneNode | undefined = node;
    while (current && !visited.has(current.id)) {
      if (!current.visible) return false;
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return true;
  }).length;
}

function isNodeLocked(scene: VibeScene, nodeId: string) {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  let current = byId.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.locked) return true;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

function createRoundedBoxGeometry(width: number, height: number, depth: number, radius0: number) {
  const epsilon = 0.00001;
  const radius = Math.min(width / 2, height / 2, depth / 2, radius0);
  const shape = new THREE.Shape();
  const shapeRadius = radius - epsilon;
  shape.absarc(epsilon, epsilon, epsilon, -Math.PI / 2, -Math.PI, true);
  shape.absarc(epsilon, height - shapeRadius * 2, epsilon, Math.PI, Math.PI / 2, true);
  shape.absarc(width - shapeRadius * 2, height - shapeRadius * 2, epsilon, Math.PI / 2, 0, true);
  shape.absarc(width - shapeRadius * 2, epsilon, epsilon, 0, -Math.PI / 2, true);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 1,
    bevelSize: radius - epsilon,
    bevelThickness: radius,
    curveSegments: 4,
  });
  geometry.center();
  return geometry;
}

function createExportGeometry(node: Extract<SceneNode, { type: "mesh" }>) {
  const geometry = node.geometry;
  switch (geometry.kind) {
    case "box":
      return geometry.bevel > 0
        ? createRoundedBoxGeometry(geometry.width, geometry.height, geometry.depth, geometry.bevel)
        : new THREE.BoxGeometry(geometry.width, geometry.height, geometry.depth);
    case "sphere":
      return new THREE.SphereGeometry(geometry.radius, geometry.widthSegments, geometry.heightSegments);
    case "cylinder":
      return new THREE.CylinderGeometry(geometry.radiusTop, geometry.radiusBottom, geometry.height, geometry.radialSegments, 1, geometry.openEnded);
    case "cone":
      return new THREE.ConeGeometry(geometry.radius, geometry.height, geometry.radialSegments);
    case "torus":
      return new THREE.TorusGeometry(geometry.radius, geometry.tube, geometry.radialSegments, geometry.tubularSegments);
    case "capsule":
      return new THREE.CapsuleGeometry(geometry.radius, geometry.length, geometry.capSegments, geometry.radialSegments);
    case "plane":
      return new THREE.PlaneGeometry(geometry.width, geometry.height);
  }
}

function createExportMaterial(material: Extract<SceneNode, { type: "mesh" }>["material"]) {
  return new THREE.MeshPhysicalMaterial({
    color: material.color,
    metalness: material.metalness,
    roughness: material.roughness,
    opacity: material.opacity,
    transparent: material.transparent,
    wireframe: material.wireframe,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
  });
}

function createExportLight(node: Extract<SceneNode, { type: "light" }>) {
  const common = { color: node.color, intensity: node.intensity };
  if (node.lightKind === "ambient") return new THREE.AmbientLight(common.color, common.intensity);
  if (node.lightKind === "point") return new THREE.PointLight(common.color, common.intensity, node.distance);
  if (node.lightKind === "spot") return new THREE.SpotLight(common.color, common.intensity, node.distance, node.angle, node.penumbra);
  return new THREE.DirectionalLight(common.color, common.intensity);
}

function buildExportNode(node: SceneNode, childrenByParent: Map<string, SceneNode[]>, parent: THREE.Object3D) {
  if (!node.visible) return 0;
  const group = new THREE.Group();
  group.name = node.name;
  group.userData.vibeNodeId = node.id;
  group.position.set(...node.transform.position);
  group.rotation.set(rad(node.transform.rotation[0]), rad(node.transform.rotation[1]), rad(node.transform.rotation[2]));
  group.scale.set(...node.transform.scale);
  if (node.type === "mesh") {
    const mesh = new THREE.Mesh(createExportGeometry(node), createExportMaterial(node.material));
    mesh.name = node.name;
    mesh.castShadow = node.castShadow;
    mesh.receiveShadow = node.receiveShadow;
    group.add(mesh);
  } else if (node.type === "light") {
    const light = createExportLight(node);
    light.name = node.name;
    light.castShadow = node.castShadow;
    group.add(light);
  }
  parent.add(group);
  let meshCount = node.type === "mesh" ? 1 : 0;
  for (const child of childrenByParent.get(node.id) ?? []) meshCount += buildExportNode(child, childrenByParent, group);
  return meshCount;
}

function buildExportRoot(scene: VibeScene, format: "glb" | "obj" | "stl") {
  const root = new THREE.Group();
  root.name = scene.name;
  const childrenByParent = new Map<string, SceneNode[]>();
  for (const node of scene.nodes) {
    const children = childrenByParent.get(node.parentId ?? "") ?? [];
    children.push(node);
    childrenByParent.set(node.parentId ?? "", children);
  }
  let exportedCount = 0;
  for (const node of childrenByParent.get("") ?? []) exportedCount += buildExportNode(node, childrenByParent, root);
  if (exportedCount === 0) throw new Error("场景中没有可导出的可见对象");
  const scale = format === "glb"
    ? sceneUnitToMeters[scene.unit]
    : format === "stl"
      ? sceneUnitToMeters[scene.unit] * 1000
      : 1;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  return root;
}

function disposeExportRoot(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

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
  // Candidate previews use an outline only, so the preview never changes the
  // material response users are evaluating.
  const displayMaterial = material;
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

function NeutralMaterialEnvironment({ enabled, intensity }: { enabled: boolean; intensity: number }) {
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
    setSceneEnvironment(scene, enabled ? environment : null, enabled ? intensity : 1);
    return () => {
      setSceneEnvironment(scene, previousEnvironment, previousIntensity);
    };
  }, [enabled, environment, intensity, scene]);

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
  transformSpace,
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
  transformSpace: "world" | "local";
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
          transformSpace={transformSpace}
          previewNodeIds={previewNodeIds}
          interactive={interactive}
        />
      ))}
    </group>
  );

  if (!interactive || node.id !== selectedNodeId || isNodeLocked(scene, node.id)) return object;
  return (
    <TransformControls
      object={objectRef as React.RefObject<THREE.Object3D>}
      userData={{ vibeHelper: true }}
      mode={mode}
      space={transformSpace}
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
  controlsRef,
}: {
  rootRef: React.RefObject<THREE.Group | null>;
  scene: VibeScene;
  previewNodeIds: ReadonlySet<string>;
  interactive: boolean;
  controlsRef: React.RefObject<OrbitControlsInstance | null>;
}) {
  const {
    selectedNodeId,
    selectNode,
    transformMode,
    transformSpace,
    updateNodeTransform,
    gridVisible,
    wireframeAll,
    materialPreview,
    materialPreviewIntensity,
    snapEnabled,
  } = useEditor();
  const roots = useMemo(() => scene.nodes.filter((node) => !node.parentId), [scene.nodes]);
  return (
    <>
      <color attach="background" args={[scene.background]} />
      <NeutralMaterialEnvironment enabled={materialPreview} intensity={materialPreviewIntensity} />
      <ambientLight intensity={0.42} color="#f4efff" />
      {!materialPreview && scene.environment !== "none" && (
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
            onTransform={(id, next) => {
              const snapped = snapEnabled ? {
                position: next.position.map((value) => Math.round(value / 0.1) * 0.1) as Transform["position"],
                rotation: next.rotation.map((value) => Math.round(value / 15) * 15) as Transform["rotation"],
                scale: next.scale.map((value) => Math.max(0.001, Math.round(value / 0.1) * 0.1)) as Transform["scale"],
              } : next;
              updateNodeTransform(id, snapped);
            }}
            mode={transformMode}
            transformSpace={transformSpace}
            previewNodeIds={previewNodeIds}
            interactive={interactive}
          />
        ))}
      </group>
      {gridVisible && (
        <Grid
          userData={{ vibeHelper: true }}
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
      <OrbitControls ref={controlsRef} makeDefault minDistance={1} maxDistance={40} dampingFactor={0.08} />
      <GizmoHelper userData={{ vibeHelper: true }} alignment="bottom-right" margin={[74, 68]}>
        <GizmoViewport axisColors={["#e86870", "#83bd88", "#7f92e8"]} labelColor="#f4f1f7" />
      </GizmoHelper>
    </>
  );
}

export const SceneViewport = forwardRef<SceneViewportHandle, { preview?: SceneViewportPreview | null; projection: "perspective" | "orthographic"; onProjectionChange(projection: "perspective" | "orthographic"): void }>(function SceneViewport({ preview, projection, onProjectionChange }, ref) {
  const { scene, selectedNodeId, selectNode, t, transparentPng } = useEditor();
  const rootRef = useRef<THREE.Group>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const renderSceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControlsInstance>(null);
  const displayScene = preview?.scene ?? scene;
  const previewNodeIds = useMemo(() => new Set(preview?.nodeIds ?? []), [preview?.nodeIds]);

  const exportModel = useCallback(async (format: "glb" | "obj" | "stl") => {
    if (preview) return;
    const exportRoot = buildExportRoot(scene, format);
    const filename = safeFilename(scene.name);
    try {
      if (format === "obj") {
        const output = `# Vibe 3D export\n# Units: ${scene.unit}\n${new OBJExporter().parse(exportRoot)}`;
        downloadBlob(new Blob([output], { type: "text/plain" }), `${filename}.obj`);
        return;
      }
      if (format === "stl") {
        const output = new STLExporter().parse(exportRoot, { binary: true });
        const bytes = output instanceof DataView
          ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
          : output;
        downloadBlob(new Blob([bytes], { type: "model/stl" }), `${filename}.stl`);
        return;
      }
      const output = await new GLTFExporter().parseAsync(exportRoot, {
        binary: true,
        onlyVisible: true,
        trs: false,
        maxTextureSize: 2048,
      });
      downloadBlob(new Blob([output as ArrayBuffer], { type: "model/gltf-binary" }), `${filename}.glb`);
    } finally {
      disposeExportRoot(exportRoot);
    }
  }, [preview, scene]);

  const focusSelected = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !selectedNodeId) return;
    const target = sceneWorldPosition(scene, selectedNodeId);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(4.4, 3.1, 5.4));
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = 95;
    camera.lookAt(target);
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) camera.updateProjectionMatrix();
    controls.update();
  }, [scene, selectedNodeId]);

  const resetView = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    controls.target.set(0, 0, 0);
    camera.position.set(4.4, 3.1, 5.4);
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = 95;
    camera.lookAt(controls.target);
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) camera.updateProjectionMatrix();
    controls.update();
  }, []);

  useImperativeHandle(ref, () => ({
    exportModel,
    capturePng() {
      if (preview) return;
      const renderer = rendererRef.current;
      const renderScene = renderSceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !renderScene || !camera) return;
      const hiddenHelpers = new Map<THREE.Object3D, boolean>();
      renderScene.traverse((object) => {
        if (!object.userData.vibeHelper) return;
        hiddenHelpers.set(object, object.visible);
        object.visible = false;
      });
      const previousBackground = renderScene.background;
      const previousClearColor = renderer.getClearColor(new THREE.Color());
      const previousClearAlpha = renderer.getClearAlpha();
      let dataUrl = "";
      try {
        if (transparentPng) {
          renderScene.background = null;
          renderer.setClearColor(0x000000, 0);
        }
        renderer.render(renderScene, camera);
        dataUrl = renderer.domElement.toDataURL("image/png");
      } finally {
        renderScene.background = previousBackground;
        renderer.setClearColor(previousClearColor, previousClearAlpha);
        hiddenHelpers.forEach((visible, object) => { object.visible = visible; });
        renderer.render(renderScene, camera);
      }
      if (!dataUrl) return;
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${safeFilename(scene.name)}${transparentPng ? ".transparent" : ""}.png`;
      anchor.click();
    },
    focusSelected,
    resetView,
    toggleProjection: () => onProjectionChange(projection === "perspective" ? "orthographic" : "perspective"),
    projection,
  }), [exportModel, focusSelected, onProjectionChange, preview, projection, resetView, scene, transparentPng]);

  return (
    <div className="viewport-shell" onPointerDown={(event) => {
      if (event.target === event.currentTarget) selectNode(undefined);
    }}>
      <Canvas
        key={projection}
        shadows
        dpr={[1, 2]}
        orthographic={projection === "orthographic"}
        camera={projection === "orthographic"
          ? { position: [4.4, 3.1, 5.4], zoom: 95, near: -1000, far: 1000 }
          : { position: [4.4, 3.1, 5.4], fov: 38, near: 0.01, far: 1000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl, scene: renderScene, camera }) => {
          rendererRef.current = gl;
          renderSceneRef.current = renderScene;
          cameraRef.current = camera;
          gl.setClearColor(0x000000, 0);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => selectNode(undefined)}
      >
        <SceneContent rootRef={rootRef} scene={displayScene} previewNodeIds={previewNodeIds} interactive={!preview} controlsRef={controlsRef} />
      </Canvas>
      {preview && (
        <div className="viewport-preview-banner" role="status">
          <strong>{t("viewport.previewBadge")}</strong>
          <span>{t("viewport.previewCopy")}</span>
        </div>
      )}
      <div className="viewport-status">
        <span>{t(projection === "perspective" ? "viewport.perspective" : "viewport.orthographic")}</span><i /> <span>{t("viewport.meshes", { count: visibleMeshCount(displayScene) })}</span>
      </div>
    </div>
  );
});
