import { nanoid } from "nanoid";
import {
  sceneOperationSchema,
  sceneSchema,
  type SceneNode,
  type SceneOperation,
  type VibeScene,
} from "./scene-schema.ts";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

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

export function parseScene(input: unknown): VibeScene {
  const scene = sceneSchema.parse(input);
  const next = clone(scene);
  assertSceneIntegrity(next);
  return sceneSchema.parse(next);
}

export function normalizeScene(input: unknown): VibeScene {
  const next = parseScene(input);
  next.updatedAt = new Date().toISOString();
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

function collectSubtreeIds(nodes: SceneNode[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

function lockedAncestor(nodes: SceneNode[], node: SceneNode): SceneNode | undefined {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let current: SceneNode | undefined = node;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.locked) return current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

function assertNodeCanChange(nodes: SceneNode[], node: SceneNode, action: "patch" | "delete" | "duplicate") {
  const locked = lockedAncestor(nodes, node);
  if (locked) throw new Error(`节点 ${locked.name} 已锁定，无法${action === "patch" ? "修改" : action === "delete" ? "删除" : "复制"}`);
}

function assertLockedSubtreePreserved(previous: VibeScene, replacement: VibeScene) {
  const previousById = new Map(previous.nodes.map((node) => [node.id, node]));
  const replacementById = new Map(replacement.nodes.map((node) => [node.id, node]));
  const protectedIds = new Set<string>();
  for (const node of previous.nodes) {
    if (!node.locked) continue;
    for (const id of collectSubtreeIds(previous.nodes, node.id)) protectedIds.add(id);
  }
  for (const id of protectedIds) {
    const before = previousById.get(id);
    const after = replacementById.get(id);
    if (!after || JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`节点 ${before?.name ?? id} 已锁定，无法通过整体替换修改`);
    }
  }
  for (const node of replacement.nodes) {
    if (!node.parentId || protectedIds.has(node.id)) continue;
    let parentId: string | null = node.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (protectedIds.has(parentId) && !protectedIds.has(node.id)) {
        throw new Error(`节点 ${previousById.get(parentId)?.name ?? parentId} 已锁定，无法插入新子节点`);
      }
      visited.add(parentId);
      parentId = replacementById.get(parentId)?.parentId ?? null;
    }
  }
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function localMatrix(node: SceneNode) {
  return new Matrix4().compose(
    new Vector3(...node.transform.position),
    new Quaternion().setFromEuler(new Euler(
      node.transform.rotation[0] * DEG_TO_RAD,
      node.transform.rotation[1] * DEG_TO_RAD,
      node.transform.rotation[2] * DEG_TO_RAD,
    )),
    new Vector3(...node.transform.scale),
  );
}

function worldMatrix(node: SceneNode, byId: Map<string, SceneNode>, visiting = new Set<string>()): Matrix4 {
  if (visiting.has(node.id)) return localMatrix(node);
  visiting.add(node.id);
  const matrix = localMatrix(node);
  const parent = node.parentId ? byId.get(node.parentId) : undefined;
  if (parent) matrix.premultiply(worldMatrix(parent, byId, visiting));
  visiting.delete(node.id);
  return matrix;
}

export function applySceneOperations(scene: VibeScene, operations: SceneOperation[]): VibeScene {
  let next = clone(scene);
  for (const raw of operations) {
    const operation = sceneOperationSchema.parse(raw);
    if (operation.op === "replace_scene") {
      assertLockedSubtreePreserved(next, operation.scene);
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
        {
          const target = next.nodes[index];
          const patchKeys = Object.keys(operation.patch);
          if (Object.prototype.hasOwnProperty.call(operation.patch, "parentId")) {
            throw new Error("请使用 reparent_node 操作修改父级，以保持世界姿态");
          }
          const unlockOnly = target.locked && patchKeys.length === 1 && operation.patch.locked === false;
          const visibilityOnly = patchKeys.length > 0 && patchKeys.every((key) => key === "visible");
          if (!unlockOnly && !visibilityOnly) assertNodeCanChange(next.nodes, target, "patch");
          const subtreeIds = collectSubtreeIds(next.nodes, target.id);
          const lockedChild = next.nodes.find((node) => subtreeIds.has(node.id) && node.id !== target.id && node.locked);
          if (lockedChild && !visibilityOnly && !unlockOnly) {
            throw new Error(`节点 ${lockedChild.name} 已锁定，无法修改其所在层级`);
          }
          if (target.locked && patchKeys.some((key) => !["locked", "visible"].includes(key))) {
            throw new Error(`节点 ${target.name} 已锁定`);
          }
          next.nodes[index] = mergeNode(target, operation.patch);
        }
        break;
      case "delete_node": {
        const target = next.nodes[index];
        assertNodeCanChange(next.nodes, target, "delete");
        const deleteIds = collectSubtreeIds(next.nodes, operation.nodeId);
        const lockedChild = next.nodes.find((node) => deleteIds.has(node.id) && node.locked);
        if (lockedChild) {
          throw new Error(`节点 ${lockedChild.name} 已锁定，无法删除其所在层级`);
        }
        next.nodes = next.nodes.filter((node) => !deleteIds.has(node.id));
        break;
      }
      case "duplicate_node": {
        const target = next.nodes[index];
        assertNodeCanChange(next.nodes, target, "duplicate");
        const subtreeIds = collectSubtreeIds(next.nodes, target.id);
        const lockedDescendant = next.nodes.find((node) => subtreeIds.has(node.id) && node.id !== target.id && node.locked);
        if (lockedDescendant) throw new Error(`节点 ${lockedDescendant.name} 已锁定，无法移动其所在层级`);
        const lockedChild = next.nodes.find((node) => subtreeIds.has(node.id) && node.locked);
        if (lockedChild) throw new Error(`节点 ${lockedChild.name} 已锁定，无法复制其所在层级`);
        if (next.nodes.some((node) => node.id === operation.newId)) throw new Error(`节点 ID ${operation.newId} 已存在`);
        const idMap = new Map<string, string>([[target.id, operation.newId]]);
        for (const node of next.nodes) {
          if (subtreeIds.has(node.id) && node.id !== target.id) {
            let id = `${node.type}-${nanoid(7)}`;
            while (next.nodes.some((item) => item.id === id) || [...idMap.values()].includes(id)) id = `${node.type}-${nanoid(7)}`;
            idMap.set(node.id, id);
          }
        }
        const duplicates = next.nodes
          .filter((node) => subtreeIds.has(node.id))
          .map((node) => {
            const duplicate = clone(node);
            duplicate.id = idMap.get(node.id)!;
            duplicate.name = node.id === target.id ? operation.name : node.name;
            duplicate.parentId = node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId)! : node.parentId;
            if (node.id === target.id) {
              duplicate.transform.position = [
                duplicate.transform.position[0] + 0.2,
                duplicate.transform.position[1] + 0.2,
                duplicate.transform.position[2],
              ];
            }
            return duplicate;
          });
        next.nodes.push(...duplicates);
        break;
      }
      case "reparent_node": {
        const target = next.nodes[index];
        assertNodeCanChange(next.nodes, target, "patch");
        if (operation.parentId === target.id) throw new Error(`节点 ${target.name} 不能成为自己的父级`);
        const subtreeIds = collectSubtreeIds(next.nodes, target.id);
        if (operation.parentId && subtreeIds.has(operation.parentId)) {
          throw new Error(`节点 ${target.name} 不能移动到自己的后代下`);
        }
        const parent = operation.parentId ? next.nodes.find((node) => node.id === operation.parentId) : undefined;
        if (operation.parentId && !parent) throw new Error(`找不到父级 ${operation.parentId}`);
        if (parent) {
          if (parent.type !== "group") throw new Error("只有组节点可以作为父级");
          assertNodeCanChange(next.nodes, parent, "patch");
        }
        const byId = new Map(next.nodes.map((node) => [node.id, node]));
        const currentWorld = worldMatrix(target, byId);
        const parentWorld = parent ? worldMatrix(parent, byId) : new Matrix4();
        const local = parentWorld.invert().multiply(currentWorld);
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        local.decompose(position, quaternion, scale);
        const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
        next.nodes[index] = {
          ...target,
          parentId: operation.parentId,
          transform: {
            position: [position.x, position.y, position.z],
            rotation: [rotation.x * RAD_TO_DEG, rotation.y * RAD_TO_DEG, rotation.z * RAD_TO_DEG],
            scale: [Math.max(0.001, scale.x), Math.max(0.001, scale.y), Math.max(0.001, scale.z)],
          },
        };
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

export function createLightNode(kind: "ambient" | "directional" | "point" | "spot"): Extract<SceneNode, { type: "light" }> {
  const names = { ambient: "Ambient light", directional: "Directional light", point: "Point light", spot: "Spot light" };
  return {
    id: `light-${nanoid(7)}`,
    name: names[kind],
    type: "light",
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "macro",
    transform: { position: [2, 4, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
    lightKind: kind,
    color: "#fff8ef",
    intensity: kind === "ambient" ? 0.5 : kind === "directional" ? 2.4 : 3,
    distance: kind === "point" || kind === "spot" ? 10 : 0,
    angle: kind === "spot" ? Math.PI / 6 : 0.5,
    penumbra: kind === "spot" ? 0.25 : 0.2,
    castShadow: kind !== "ambient",
  };
}
