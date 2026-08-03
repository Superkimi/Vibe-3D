import type { SceneNode, VibeScene } from "./scene-schema.ts";
import { buildNodeReference, nodeRef } from "./scene-references.ts";

export type SceneDiffKind = "added" | "removed" | "updated";

export type SceneDiffChange = {
  path: string;
  before?: unknown;
  after?: unknown;
};

export type SceneDiffEntry = {
  kind: SceneDiffKind;
  ref: string;
  nodeId: string;
  name: string;
  type: SceneNode["type"];
  path: string;
  changes: SceneDiffChange[];
};

export type SceneDiff = {
  entries: SceneDiffEntry[];
  sceneChanges: SceneDiffChange[];
  added: number;
  removed: number;
  updated: number;
  changedNodeCount: number;
  isEmpty: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function flattenChanges(before: unknown, after: unknown, path: string, changes: SceneDiffChange[]) {
  if (equal(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      flattenChanges(before[key], after[key], path ? `${path}.${key}` : key, changes);
    }
    return;
  }
  changes.push({ path, before, after });
}

function nodePath(scene: VibeScene, node: SceneNode): string {
  return buildNodeReference(scene, node).path;
}

function sceneMetadata(scene: VibeScene) {
  return {
    name: scene.name,
    unit: scene.unit,
    background: scene.background,
    environment: scene.environment,
    quality: scene.quality,
  };
}

export function diffScenes(before: VibeScene, after: VibeScene): SceneDiff {
  const beforeById = new Map(before.nodes.map((node) => [node.id, node]));
  const afterById = new Map(after.nodes.map((node) => [node.id, node]));
  const entries: SceneDiffEntry[] = [];

  for (const node of after.nodes) {
    const previous = beforeById.get(node.id);
    if (!previous) {
      entries.push({
        kind: "added",
        ref: nodeRef(node.id),
        nodeId: node.id,
        name: node.name,
        type: node.type,
        path: nodePath(after, node),
        changes: [],
      });
      continue;
    }
    const changes: SceneDiffChange[] = [];
    flattenChanges(previous, node, "", changes);
    if (changes.length) {
      entries.push({
        kind: "updated",
        ref: nodeRef(node.id),
        nodeId: node.id,
        name: node.name,
        type: node.type,
        path: nodePath(after, node),
        changes: changes.filter((change) => change.path !== "id"),
      });
    }
  }

  for (const node of before.nodes) {
    if (afterById.has(node.id)) continue;
    entries.push({
      kind: "removed",
      ref: nodeRef(node.id),
      nodeId: node.id,
      name: node.name,
      type: node.type,
      path: nodePath(before, node),
      changes: [],
    });
  }

  const sceneChanges: SceneDiffChange[] = [];
  flattenChanges(sceneMetadata(before), sceneMetadata(after), "", sceneChanges);
  const added = entries.filter((entry) => entry.kind === "added").length;
  const removed = entries.filter((entry) => entry.kind === "removed").length;
  const updated = entries.filter((entry) => entry.kind === "updated").length;
  return {
    entries,
    sceneChanges,
    added,
    removed,
    updated,
    changedNodeCount: entries.length,
    isEmpty: entries.length === 0 && sceneChanges.length === 0,
  };
}
