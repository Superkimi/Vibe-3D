import type { SceneOperation, VibeScene } from "./scene-schema.ts";
import { applySceneOperations } from "./scene-operations.ts";
import { diffScenes, type SceneDiff } from "./scene-diff.ts";
import { evaluateSceneQuality, repairScene, type SceneRepairResult } from "./scene-quality.ts";
import type { SceneQualityReport } from "./scene-schema.ts";

export type BenchmarkPrompt = {
  zh: string;
  en: string;
};

export type SceneBenchmark = {
  id: string;
  prompt: BenchmarkPrompt;
  expectedOperationKinds: SceneOperation["op"][];
  expectedRefs: string[];
  minQualityScore: number;
  prepareScene?: (scene: VibeScene) => VibeScene;
  buildOperations: (scene: VibeScene) => SceneOperation[];
};

export type SceneBenchmarkResult = {
  benchmarkId: string;
  preparedScene: VibeScene;
  previewScene: VibeScene;
  finalScene: VibeScene;
  operations: SceneOperation[];
  repair: SceneRepairResult;
  diff: SceneDiff;
  quality: SceneQualityReport;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function benchmarkKnobNode() {
  return {
    id: "benchmark-control-knob",
    name: "Control knob",
    type: "mesh" as const,
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "meso" as const,
    transform: {
      position: [0, 0.9, -0.08] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    },
    geometry: {
      kind: "cylinder" as const,
      radiusTop: 0.16,
      radiusBottom: 0.19,
      height: 0.12,
      radialSegments: 24,
      openEnded: false,
    },
    material: {
      color: "#6650a4",
      metalness: 0.74,
      roughness: 0.3,
      opacity: 1,
      transparent: false,
      wireframe: false,
      emissive: "#000000",
      emissiveIntensity: 0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.3,
    },
    castShadow: true,
    receiveShadow: true,
  };
}

function removeAuthoredLights(scene: VibeScene): VibeScene {
  return {
    ...scene,
    nodes: scene.nodes.filter((node) => node.type !== "light").map((node) => ({
      ...node,
      ...(node.type === "mesh" && node.id === "body"
        ? { material: { ...node.material, opacity: 0.72, transparent: false } }
        : {}),
    })),
  };
}

/**
 * Deterministic prompt/scene fixtures catch regressions in the AI preview
 * pipeline without provider calls or dependence on model output.
 */
export const SCENE_BENCHMARKS: SceneBenchmark[] = [
  {
    id: "macro-silhouette",
    prompt: {
      zh: "把机身高度缩短到原来的 85%，保留镜头和灯光。",
      en: "Shorten the body height to 85% while keeping the lens and lights unchanged.",
    },
    expectedOperationKinds: ["patch_node"],
    expectedRefs: ["node:body"],
    minQualityScore: 90,
    buildOperations: () => [{
      op: "patch_node",
      nodeId: "body",
      patch: { transform: { scale: [1, 0.85, 1] } },
    }],
  },
  {
    id: "meso-detail",
    prompt: {
      zh: "在机身顶部增加一个紫色金属控制旋钮，并让它可以继续被编辑。",
      en: "Add an editable purple metal control knob on top of the body.",
    },
    expectedOperationKinds: ["add_node"],
    expectedRefs: ["node:benchmark-control-knob"],
    minQualityScore: 90,
    buildOperations: () => [{ op: "add_node", node: benchmarkKnobNode() }],
  },
  {
    id: "stable-reference-edit",
    prompt: {
      zh: "把 node:lens-ring 的金属粗糙度改为 0.42，不要改动其他节点。",
      en: "Set node:lens-ring metal roughness to 0.42 without changing other nodes.",
    },
    expectedOperationKinds: ["patch_node"],
    expectedRefs: ["node:lens-ring"],
    minQualityScore: 90,
    buildOperations: () => [{
      op: "patch_node",
      nodeId: "lens-ring",
      patch: { material: { roughness: 0.42 } },
    }],
  },
  {
    id: "quality-repair",
    prompt: {
      zh: "修复这份草稿的透明材质标记，并补一盏确定性的主光。",
      en: "Repair the draft's transparent material flag and add a deterministic key light.",
    },
    expectedOperationKinds: ["patch_node"],
    expectedRefs: ["node:body"],
    minQualityScore: 90,
    prepareScene: removeAuthoredLights,
    buildOperations: () => [{
      op: "patch_node",
      nodeId: "body",
      patch: { material: { roughness: 0.34 } },
    }],
  },
];

export function runSceneBenchmark(benchmark: SceneBenchmark, input: VibeScene): SceneBenchmarkResult {
  const preparedScene = benchmark.prepareScene ? benchmark.prepareScene(clone(input)) : clone(input);
  const operations = benchmark.buildOperations(clone(preparedScene));
  // Scene operations intentionally stamp a fresh updatedAt for the editor.
  // Benchmarks remove that wall-clock value so repeated runs compare content,
  // diffs, and quality outcomes rather than timing noise.
  const previewScene = {
    ...applySceneOperations(preparedScene, operations),
    updatedAt: preparedScene.updatedAt,
  };
  const rawRepair = repairScene(previewScene);
  const repair = {
    ...rawRepair,
    scene: { ...rawRepair.scene, updatedAt: preparedScene.updatedAt },
  };
  const finalScene = repair.scene;
  return {
    benchmarkId: benchmark.id,
    preparedScene,
    previewScene,
    finalScene,
    operations,
    repair,
    diff: diffScenes(preparedScene, finalScene),
    quality: evaluateSceneQuality(finalScene),
  };
}
