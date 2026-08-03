import { nanoid } from "nanoid";
import {
  sceneOperationSchema,
  sceneSchema,
  type SceneNode,
  type SceneOperation,
  type VibeScene,
} from "./scene-schema.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function assertSceneIntegrity(scene: VibeScene) {
  const ids = new Set(scene.nodes.map((node) => node.id));
  if (ids.size !== scene.nodes.length) throw new Error("场景中存在重复节点 ID");
  for (const node of scene.nodes) {
    if (node.parentId && !ids.has(node.parentId)) throw new Error(`节点 ${node.name} 的父级不存在`);
    if (node.parentId === node.id) throw new Error(`节点 ${node.name} 不能成为自己的父级`);
    let parentId = node.parentId;
    const visited = new Set([node.id]);
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`节点 ${node.name} 形成了循环层级`);
      visited.add(parentId);
      parentId = scene.nodes.find((item) => item.id === parentId)?.parentId ?? null;
    }
  }
}

export function normalizeScene(input: unknown): VibeScene {
  const scene = sceneSchema.parse(input);
  const next = clone(scene);
  next.updatedAt = new Date().toISOString();
  assertSceneIntegrity(next);
  return sceneSchema.parse(next);
}

function mergeNode(current: SceneNode, patch: Record<string, unknown>): SceneNode {
  const next = { ...current, ...patch } as SceneNode;
  if (patch.transform) {
    next.transform = { ...current.transform, ...(patch.transform as Partial<SceneNode["transform"]>) };
  }
  if (current.type === "mesh" && next.type === "mesh" && patch.material) {
    next.material = { ...current.material, ...(patch.material as Partial<typeof current.material>) };
  }
  return next;
}

export function applySceneOperations(scene: VibeScene, operations: SceneOperation[]): VibeScene {
  let next = clone(scene);
  for (const raw of operations) {
    const operation = sceneOperationSchema.parse(raw);
    if (operation.op === "replace_scene") {
      next = normalizeScene(operation.scene);
      continue;
    }
    if (operation.op === "patch_scene") {
      next = {
        ...next,
        ...operation.patch,
        quality: operation.patch.quality ? { ...next.quality, ...operation.patch.quality } : next.quality,
      };
      continue;
    }
    const index = "nodeId" in operation ? next.nodes.findIndex((node) => node.id === operation.nodeId) : -1;
    if ("nodeId" in operation && index < 0) throw new Error(`找不到节点 ${operation.nodeId}`);
    switch (operation.op) {
      case "add_node":
        if (next.nodes.some((node) => node.id === operation.node.id)) throw new Error(`节点 ID ${operation.node.id} 已存在`);
        next.nodes.push(operation.node);
        break;
      case "patch_node":
        next.nodes[index] = mergeNode(next.nodes[index], operation.patch);
        break;
      case "delete_node": {
        const deleteIds = new Set([operation.nodeId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of next.nodes) {
            if (node.parentId && deleteIds.has(node.parentId) && !deleteIds.has(node.id)) {
              deleteIds.add(node.id);
              changed = true;
            }
          }
        }
        next.nodes = next.nodes.filter((node) => !deleteIds.has(node.id));
        break;
      }
      case "duplicate_node": {
        if (next.nodes.some((node) => node.id === operation.newId)) throw new Error(`节点 ID ${operation.newId} 已存在`);
        const duplicate = clone(next.nodes[index]);
        duplicate.id = operation.newId;
        duplicate.name = operation.name;
        duplicate.transform.position = [
          duplicate.transform.position[0] + 0.2,
          duplicate.transform.position[1] + 0.2,
          duplicate.transform.position[2],
        ];
        next.nodes.push(duplicate);
        break;
      }
    }
  }
  return normalizeScene(next);
}

export function createPrimitiveNode(kind: "box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "plane"): SceneNode {
  const geometries = {
    box: { kind: "box" as const, width: 1, height: 1, depth: 1, bevel: 0.08 },
    sphere: { kind: "sphere" as const, radius: 0.5, widthSegments: 48, heightSegments: 32 },
    cylinder: { kind: "cylinder" as const, radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 48, openEnded: false },
    cone: { kind: "cone" as const, radius: 0.5, height: 1, radialSegments: 48 },
    torus: { kind: "torus" as const, radius: 0.6, tube: 0.16, radialSegments: 24, tubularSegments: 72 },
    capsule: { kind: "capsule" as const, radius: 0.35, length: 0.8, capSegments: 12, radialSegments: 24 },
    plane: { kind: "plane" as const, width: 2, height: 2 },
  };
  return {
    id: `${kind}-${nanoid(7)}`,
    name: kind[0].toUpperCase() + kind.slice(1),
    type: "mesh",
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "macro",
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    geometry: geometries[kind],
    material: {
      color: "#a996dc", metalness: 0.12, roughness: 0.38, opacity: 1, transparent: false,
      wireframe: false, emissive: "#000000", emissiveIntensity: 0, clearcoat: 0.18, clearcoatRoughness: 0.24,
    },
    castShadow: true,
    receiveShadow: true,
  };
}
