import type {
  SceneOperation,
  SceneQualityReport,
  SceneWorkflowPlan,
  SceneWorkflowStep,
  VibeScene,
} from "./scene-schema.ts";
import { applySceneOperations } from "./scene-operations.ts";
import { evaluateSceneQuality, repairScene } from "./scene-quality.ts";
import { nodeRef } from "./scene-references.ts";
import { estimateGeometryTriangles } from "./node-definitions.ts";

export type WorkflowLocale = "zh" | "en";

export type WorkflowPreflightIssue = {
  code: "duplicate-step" | "empty-plan" | "operation-count" | "invalid-operation" | "quality-fail" | "quality-review";
  severity: "error" | "warning";
  stepId?: string;
  message: string;
};

export type WorkflowPreflightResult = {
  ok: boolean;
  issues: WorkflowPreflightIssue[];
  scene: VibeScene;
  quality: SceneQualityReport;
};

export type SceneAnalysis = {
  nodeCount: number;
  meshCount: number;
  lightCount: number;
  estimatedTriangles: number;
  quality: SceneQualityReport;
};

export type ScenePipelineResult = {
  scene: VibeScene;
  operations: SceneOperation[];
  analysis: SceneAnalysis;
  quality: SceneQualityReport;
};

function operationRefs(operation: SceneOperation): string[] {
  switch (operation.op) {
    case "add_node":
      return [nodeRef(operation.node.id)];
    case "patch_node":
    case "delete_node":
    case "duplicate_node":
      return [nodeRef(operation.nodeId)];
    case "replace_scene":
    case "patch_scene":
      return [];
  }
}

function mergeRefs(operations: SceneOperation[]): string[] {
  return [...new Set(operations.flatMap(operationRefs))].slice(0, 40);
}

function groupStep(
  kind: SceneWorkflowStep["kind"],
  operations: SceneOperation[],
  locale: WorkflowLocale,
): SceneWorkflowStep | null {
  if (operations.length === 0) return null;
  const copy = {
    zh: {
      generate: ["生成结构", "创建或复制节点，建立模型的主体和细节。"],
      edit: ["编辑场景", "应用节点、材质、变换或层级修改。"],
      repair: ["安全修复", "修复质量门禁发现的确定性问题。"],
      optimize: ["优化几何", "减少几何复杂度并保留可编辑结构。"],
      export: ["准备导出", "整理场景并准备目标格式。"],
      inspect: ["检查场景", "验证节点引用、操作契约和场景完整性。"],
    },
    en: {
      generate: ["Generate structure", "Create or duplicate nodes for the model silhouette and details."],
      edit: ["Edit scene", "Apply node, material, transform, or hierarchy changes."],
      repair: ["Safe repair", "Fix deterministic issues reported by the quality gate."],
      optimize: ["Optimize geometry", "Reduce geometry complexity while preserving editability."],
      export: ["Prepare export", "Finalize the scene for the target format."],
      inspect: ["Inspect scene", "Validate references, operation contracts, and scene integrity."],
    },
  }[locale][kind];
  return {
    id: `step-${kind}`,
    kind,
    label: copy[0],
    description: copy[1],
    nodeRefs: mergeRefs(operations),
    operationCount: operations.length,
  };
}

/**
 * Turns the validated operation stream into a typed, explainable plan. The
 * provider does not need to invent a second protocol: operations remain the
 * source of truth and this plan is deterministic on both server and client.
 */
export function buildSceneWorkflowPlan(
  scene: VibeScene,
  operations: SceneOperation[],
  repairOperations: SceneOperation[] = [],
  locale: WorkflowLocale = "zh",
): SceneWorkflowPlan {
  const baseOperations = operations;
  const generated = baseOperations.filter((operation) => operation.op === "add_node" || operation.op === "duplicate_node" || operation.op === "replace_scene");
  const edited = baseOperations.filter((operation) => ["patch_node", "patch_scene", "delete_node"].includes(operation.op));
  const steps: SceneWorkflowStep[] = [{
    id: "step-inspect",
    kind: "inspect",
    label: locale === "zh" ? "检查场景" : "Inspect scene",
    description: locale === "zh" ? "验证节点引用、操作契约和场景完整性。" : "Validate references, operation contracts, and scene integrity.",
    nodeRefs: mergeRefs(operations),
    operationCount: 0,
  }];
  const generatedStep = groupStep("generate", generated, locale);
  const editedStep = groupStep("edit", edited, locale);
  const repairStep = groupStep("repair", repairOperations, locale);
  if (generatedStep) steps.push(generatedStep);
  if (editedStep) steps.push(editedStep);
  if (repairStep) steps.push(repairStep);
  return {
    id: `${scene.id}-workflow`,
    title: locale === "zh" ? "AI 场景变更计划" : "AI scene change plan",
    goal: locale === "zh" ? "先检查，再按步骤预览并确认场景变更。" : "Inspect first, then preview and confirm the scene changes step by step.",
    steps,
    requiresConfirmation: true,
  };
}

export function preflightSceneWorkflow(
  plan: SceneWorkflowPlan,
  scene: VibeScene,
  operations: SceneOperation[],
): WorkflowPreflightResult {
  const issues: WorkflowPreflightIssue[] = [];
  if (plan.steps.length === 0) issues.push({ code: "empty-plan", severity: "error", message: "Workflow plan has no steps." });
  const ids = new Set<string>();
  for (const step of plan.steps) {
    if (ids.has(step.id)) issues.push({ code: "duplicate-step", severity: "error", stepId: step.id, message: `Duplicate workflow step ${step.id}.` });
    ids.add(step.id);
  }
  const operationCount = plan.steps.reduce((total, step) => total + step.operationCount, 0);
  if (operationCount !== operations.length) {
    issues.push({ code: "operation-count", severity: "error", message: "Workflow steps do not account for every scene operation." });
  }
  let next = scene;
  try {
    next = applySceneOperations(scene, operations);
  } catch (error) {
    issues.push({ code: "invalid-operation", severity: "error", message: error instanceof Error ? error.message : "Invalid scene operation." });
  }
  const quality = evaluateSceneQuality(next);
  if (quality.status === "fail") issues.push({ code: "quality-fail", severity: "error", message: "The workflow result fails the scene quality gate." });
  else if (quality.status === "review") issues.push({ code: "quality-review", severity: "warning", message: "The workflow result needs a quality review." });
  return { ok: !issues.some((issue) => issue.severity === "error"), issues, scene: next, quality };
}

export function analyzeScene(scene: VibeScene): SceneAnalysis {
  const meshes = scene.nodes.filter((node) => node.type === "mesh");
  return {
    nodeCount: scene.nodes.length,
    meshCount: meshes.length,
    lightCount: scene.nodes.filter((node) => node.type === "light").length,
    estimatedTriangles: meshes.reduce((total, node) => total + estimateGeometryTriangles(node.geometry), 0),
    quality: evaluateSceneQuality(scene),
  };
}

function reduceSegments(value: number, minimum: number, ratio: number): number {
  return Math.max(minimum, Math.floor(value * ratio));
}

/**
 * A safe primitive-only optimizer. It never changes topology semantics or
 * overwrites the source; it emits normal scene operations for preview/undo.
 */
export function optimizeSceneGeometry(scene: VibeScene, targetTriangles: number): ScenePipelineResult {
  const analysis = analyzeScene(scene);
  const target = Math.max(500, Math.floor(targetTriangles));
  const ratio = analysis.estimatedTriangles > target
    ? Math.max(0.2, Math.sqrt(target / analysis.estimatedTriangles))
    : 1;
  const operations: SceneOperation[] = [];
  for (const node of scene.nodes) {
    if (node.type !== "mesh" || ratio >= 1) continue;
    const geometry = structuredClone(node.geometry);
    switch (geometry.kind) {
      case "sphere":
        geometry.widthSegments = reduceSegments(geometry.widthSegments, 8, ratio);
        geometry.heightSegments = reduceSegments(geometry.heightSegments, 6, ratio);
        break;
      case "cylinder":
      case "cone":
        geometry.radialSegments = reduceSegments(geometry.radialSegments, 3, ratio);
        break;
      case "torus":
        geometry.radialSegments = reduceSegments(geometry.radialSegments, 3, ratio);
        geometry.tubularSegments = reduceSegments(geometry.tubularSegments, 8, ratio);
        break;
      case "capsule":
        geometry.capSegments = reduceSegments(geometry.capSegments, 2, ratio);
        geometry.radialSegments = reduceSegments(geometry.radialSegments, 3, ratio);
        break;
      case "box":
      case "plane":
        break;
    }
    if (JSON.stringify(geometry) !== JSON.stringify(node.geometry)) {
      operations.push({ op: "patch_node", nodeId: node.id, patch: { geometry } });
    }
  }
  const next = operations.length ? applySceneOperations(scene, operations) : scene;
  return { scene: next, operations, analysis, quality: evaluateSceneQuality(next) };
}

export function repairScenePipeline(scene: VibeScene): ScenePipelineResult {
  const analysis = analyzeScene(scene);
  const repair = repairScene(scene);
  return { scene: repair.scene, operations: repair.operations, analysis, quality: evaluateSceneQuality(repair.scene) };
}
