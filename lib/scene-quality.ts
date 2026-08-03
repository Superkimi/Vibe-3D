import type {
  SceneNode,
  SceneOperation,
  SceneQualityReport,
  VibeScene,
} from "./scene-schema.ts";
import { sceneSchema } from "./scene-schema.ts";
import { applySceneOperations, assertSceneIntegrity } from "./scene-operations.ts";
import { estimateGeometryTriangles } from "./node-definitions.ts";
import { nodeRef } from "./scene-references.ts";

type Vec3 = [number, number, number];
type Bounds = { min: Vec3; max: Vec3 };

const NODE_WARNING_LIMIT = 300;
const TRIANGLE_WARNING_LIMIT = 160_000;
const TRIANGLE_ERROR_LIMIT = 300_000;

function issue(code: string, severity: "error" | "warning" | "info", nodeRefs: string[] = []) {
  return { code, severity, nodeRefs };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function multiply(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function absolute(value: Vec3): Vec3 {
  return [Math.abs(value[0]), Math.abs(value[1]), Math.abs(value[2])];
}

function isAncestor(nodeId: string, possibleAncestorId: string | null, byId: Map<string, SceneNode>) {
  const visited = new Set<string>();
  let current = possibleAncestorId;
  while (current) {
    if (current === nodeId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

function worldTransform(node: SceneNode, byId: Map<string, SceneNode>) {
  let position = [...node.transform.position] as Vec3;
  let scale = [...node.transform.scale] as Vec3;
  const visited = new Set([node.id]);
  let parentId = node.parentId;
  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    position = add(parent.transform.position, multiply(position, parent.transform.scale));
    scale = multiply(scale, absolute(parent.transform.scale));
    parentId = parent.parentId;
  }
  return { position, scale };
}

function localHalfExtents(node: Extract<SceneNode, { type: "mesh" }>): Vec3 {
  const geometry = node.geometry;
  switch (geometry.kind) {
    case "box":
      return [geometry.width / 2, geometry.height / 2, geometry.depth / 2];
    case "sphere":
      return [geometry.radius, geometry.radius, geometry.radius];
    case "cylinder": {
      const radius = Math.max(geometry.radiusTop, geometry.radiusBottom);
      return [radius, geometry.height / 2, radius];
    }
    case "cone":
      return [geometry.radius, geometry.height / 2, geometry.radius];
    case "torus":
      return [geometry.radius + geometry.tube, geometry.tube, geometry.radius + geometry.tube];
    case "capsule":
      return [geometry.radius, geometry.radius + geometry.length / 2, geometry.radius];
    case "plane":
      return [geometry.width / 2, 0.01, geometry.height / 2];
  }
}

function boundsForNode(node: Extract<SceneNode, { type: "mesh" }>, byId: Map<string, SceneNode>): Bounds {
  const { position, scale } = worldTransform(node, byId);
  const extents = multiply(localHalfExtents(node), absolute(scale));
  return {
    min: [position[0] - extents[0], position[1] - extents[1], position[2] - extents[2]],
    max: [position[0] + extents[0], position[1] + extents[1], position[2] + extents[2]],
  };
}

function overlapRatio(a: Bounds, b: Bounds): number {
  const overlap = [0, 1, 2].map((axis) => Math.max(0, Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])));
  if (overlap.some((value) => value <= 0)) return 0;
  const overlapVolume = overlap[0] * overlap[1] * overlap[2];
  const volume = (boundsVolume(a) + boundsVolume(b)) / 2;
  return volume > 0 ? overlapVolume / volume : 0;
}

function boundsVolume(bounds: Bounds): number {
  return Math.max(0, bounds.max[0] - bounds.min[0])
    * Math.max(0, bounds.max[1] - bounds.min[1])
    * Math.max(0, bounds.max[2] - bounds.min[2]);
}

function duplicateNameRefs(scene: VibeScene): string[][] {
  const groups = new Map<string, string[]>();
  for (const node of scene.nodes) {
    const key = node.name.trim().toLowerCase();
    const refs = groups.get(key) || [];
    refs.push(nodeRef(node.id));
    groups.set(key, refs);
  }
  return [...groups.values()].filter((refs) => refs.length > 1);
}

function safeParseScene(input: unknown): { scene?: VibeScene; issues: ReturnType<typeof issue>[] } {
  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success) return { issues: [issue("schema-invalid", "error")] };
  try {
    assertSceneIntegrity(parsed.data);
  } catch {
    return { scene: parsed.data, issues: [issue("integrity-invalid", "error")] };
  }
  return { scene: parsed.data, issues: [] };
}

export function evaluateSceneQuality(input: unknown): SceneQualityReport {
  const parsed = safeParseScene(input);
  if (!parsed.scene) {
    return { status: "fail", score: 0, issues: parsed.issues, repaired: false };
  }
  const scene = parsed.scene;
  const issues = [...parsed.issues];
  const meshNodes = scene.nodes.filter((node): node is Extract<SceneNode, { type: "mesh" }> => node.type === "mesh");
  const lightNodes = scene.nodes.filter((node) => node.type === "light");
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const triangleEstimate = meshNodes.reduce((total, node) => total + estimateGeometryTriangles(node.geometry), 0);

  if (scene.nodes.length > NODE_WARNING_LIMIT) issues.push(issue("node-budget", "warning"));
  if (triangleEstimate > TRIANGLE_ERROR_LIMIT) issues.push(issue("complexity-budget", "error"));
  else if (triangleEstimate > TRIANGLE_WARNING_LIMIT) issues.push(issue("complexity-budget", "warning"));
  if (!meshNodes.length) issues.push(issue("no-mesh", "info"));
  if (meshNodes.length && !lightNodes.length) issues.push(issue("no-authored-light", "warning"));

  for (const refs of duplicateNameRefs(scene).slice(0, 8)) {
    issues.push(issue("duplicate-name", "info", refs));
  }

  for (const node of meshNodes) {
    if (node.material.opacity < 0.999 && !node.material.transparent) {
      issues.push(issue("transparent-material", "warning", [nodeRef(node.id)]));
    }
    const maxScale = Math.max(...node.transform.scale.map((value) => Math.abs(value)));
    const minScale = Math.min(...node.transform.scale.map((value) => Math.abs(value)));
    if (maxScale / Math.max(minScale, 0.001) > 50) {
      issues.push(issue("scale-outlier", "warning", [nodeRef(node.id)]));
    }
  }

  const bounds = new Map(meshNodes.map((node) => [node.id, boundsForNode(node, byId)]));
  for (let leftIndex = 0; leftIndex < meshNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < meshNodes.length; rightIndex += 1) {
      const left = meshNodes[leftIndex];
      const right = meshNodes[rightIndex];
      if (isAncestor(left.id, right.parentId, byId) || isAncestor(right.id, left.parentId, byId)) continue;
      const ratio = overlapRatio(bounds.get(left.id)!, bounds.get(right.id)!);
      if (ratio < 0.3) continue;
      const severity = scene.quality.target === "production" ? "warning" : "info";
      issues.push(issue("potential-overlap", severity, [nodeRef(left.id), nodeRef(right.id)]));
      if (issues.filter((item) => item.code === "potential-overlap").length >= 8) break;
    }
    if (issues.filter((item) => item.code === "potential-overlap").length >= 8) break;
  }

  const score = Math.max(0, Math.min(100, 100 - issues.reduce((total, item) => total + (item.severity === "error" ? 40 : item.severity === "warning" ? 10 : 2), 0)));
  return {
    status: issues.some((item) => item.severity === "error") ? "fail" : issues.some((item) => item.severity === "warning") ? "review" : "pass",
    score,
    issues,
    repaired: false,
  };
}

export type SceneRepairResult = {
  scene: VibeScene;
  operations: SceneOperation[];
  repairCodes: string[];
};

export function repairScene(scene: VibeScene): SceneRepairResult {
  const operations: SceneOperation[] = [];
  const repairCodes: string[] = [];
  const meshNodes = scene.nodes.filter((node): node is Extract<SceneNode, { type: "mesh" }> => node.type === "mesh");
  const existingIds = new Set(scene.nodes.map((node) => node.id));

  for (const node of meshNodes) {
    if (node.material.opacity < 0.999 && !node.material.transparent) {
      operations.push({ op: "patch_node", nodeId: node.id, patch: { material: { transparent: true } } });
      repairCodes.push("transparent-material");
    }
  }

  if (meshNodes.length && !scene.nodes.some((node) => node.type === "light")) {
    let id = "quality-key-light";
    let suffix = 2;
    while (existingIds.has(id)) id = `quality-key-light-${suffix++}`;
    operations.push({
      op: "add_node",
      node: {
        id,
        name: "Quality key light",
        type: "light",
        parentId: null,
        visible: true,
        locked: false,
        fidelity: "macro",
        transform: { position: [4, 6, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        lightKind: "directional",
        color: "#fff8ef",
        intensity: 2.4,
        distance: 0,
        angle: 0.5,
        penumbra: 0.2,
        castShadow: true,
      },
    });
    repairCodes.push("no-authored-light");
  }

  const repaired = operations.length ? applySceneOperations(scene, operations) : scene;
  return { scene: repaired, operations, repairCodes };
}
