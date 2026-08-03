import type { SceneNode, VibeScene } from "./scene-schema.ts";

export type SceneNodeReference = {
  ref: string;
  nodeId: string;
  name: string;
  type: SceneNode["type"];
  parentRef: string | null;
  path: string;
  depth: number;
};

export function nodeRef(nodeId: string): string {
  return `node:${nodeId}`;
}

export function nodeIdFromRef(ref: string): string | undefined {
  const value = String(ref || "").trim();
  return value.startsWith("node:") && value.length > 5 ? value.slice(5) : undefined;
}

function nodeMap(scene: VibeScene) {
  return new Map(scene.nodes.map((node) => [node.id, node]));
}

export function buildNodeReference(scene: VibeScene, node: SceneNode): SceneNodeReference {
  const byId = nodeMap(scene);
  const names: string[] = [node.name];
  const visited = new Set([node.id]);
  let parentId = node.parentId;
  let depth = 0;
  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    depth += 1;
    parentId = parent.parentId;
  }
  return {
    ref: nodeRef(node.id),
    nodeId: node.id,
    name: node.name,
    type: node.type,
    parentRef: node.parentId ? nodeRef(node.parentId) : null,
    path: names.join(" / "),
    depth,
  };
}

export function buildSceneNodeReferences(scene: VibeScene): SceneNodeReference[] {
  return scene.nodes.map((node) => buildNodeReference(scene, node));
}

export function resolveNodeReference(scene: VibeScene, ref: string): SceneNode | undefined {
  const id = nodeIdFromRef(ref) || ref;
  return scene.nodes.find((node) => node.id === id);
}
