import assert from "node:assert/strict";
import test from "node:test";
import { createStarterScene } from "../lib/starter-scene.ts";
import {
  applySceneOperations,
  createLightNode,
  createPrimitiveNode,
  normalizeScene,
  parseScene,
} from "../lib/scene-operations.ts";
import { aiResponseSchema, sceneSchema } from "../lib/scene-schema.ts";
import { estimateGeometryTriangles, getGeometryDefinition, getNodeDefinition } from "../lib/node-definitions.ts";
import { buildSceneNodeReferences } from "../lib/scene-references.ts";
import { diffScenes } from "../lib/scene-diff.ts";
import { evaluateSceneQuality, repairScene } from "../lib/scene-quality.ts";
import { analyzeScene, buildSceneWorkflowPlan, optimizeSceneGeometry, preflightSceneWorkflow, repairScenePipeline } from "../lib/scene-workflow.ts";
import { createSceneAssetRecord, filterSceneAssets, parseSceneAssets, upsertSceneAsset } from "../lib/scene-assets.ts";
import { loadProjectState } from "../lib/project-storage.ts";

test("starter scene satisfies the public VibeScene contract", () => {
  const scene = sceneSchema.parse(createStarterScene());
  assert.equal(scene.format, "vibe-3d/1");
  assert.ok(scene.nodes.length >= 6);
  assert.ok(scene.nodes.some((node) => node.type === "mesh"));
  assert.ok(scene.nodes.some((node) => node.type === "light"));
});

test("persisted scene parsing validates without rewriting its timestamp", () => {
  const scene = createStarterScene();
  assert.equal(parseScene(scene).updatedAt, scene.updatedAt);
  assert.notEqual(normalizeScene(scene).updatedAt, scene.updatedAt);
});

test("patch operations merge transforms and PBR materials without erasing fields", () => {
  const scene = createStarterScene();
  const body = scene.nodes.find((node) => node.id === "body");
  assert.equal(body.type, "mesh");
  const next = applySceneOperations(scene, [{
    op: "patch_node",
    nodeId: "body",
    patch: {
      transform: { position: [1, 2, 3] },
      material: { roughness: 0.61 },
    },
  }]);
  const patched = next.nodes.find((node) => node.id === "body");
  assert.equal(patched.type, "mesh");
  assert.deepEqual(patched.transform.position, [1, 2, 3]);
  assert.deepEqual(patched.transform.scale, body.transform.scale);
  assert.equal(patched.material.roughness, 0.61);
  assert.equal(patched.material.color, body.material.color);
});

test("deleting a group cascades to its descendants", () => {
  const scene = createStarterScene();
  const group = {
    id: "assembly",
    name: "Assembly",
    type: "group",
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "macro",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  scene.nodes.push(group);
  scene.nodes[0].parentId = "assembly";
  const next = applySceneOperations(scene, [{ op: "delete_node", nodeId: "assembly" }]);
  assert.ok(!next.nodes.some((node) => node.id === "assembly"));
  assert.ok(!next.nodes.some((node) => node.id === "body"));
});

test("locked nodes and locked ancestors protect edits while visibility remains explicit", () => {
  const scene = createStarterScene();
  scene.nodes.push({
    id: "locked-assembly",
    name: "Locked assembly",
    type: "group",
    parentId: null,
    visible: true,
    locked: true,
    fidelity: "macro",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  });
  scene.nodes.find((node) => node.id === "body").parentId = "locked-assembly";
  assert.throws(() => applySceneOperations(scene, [{ op: "patch_node", nodeId: "body", patch: { transform: { position: [1, 0, 0] } } }]), /已锁定/);
  const hidden = applySceneOperations(scene, [{ op: "patch_node", nodeId: "body", patch: { visible: false } }]);
  assert.equal(hidden.nodes.find((node) => node.id === "body").visible, false);
  assert.throws(() => applySceneOperations(scene, [{ op: "delete_node", nodeId: "locked-assembly" }]), /已锁定/);
  const replacement = structuredClone(scene);
  replacement.nodes.find((node) => node.id === "body").transform.position[0] += 1;
  assert.throws(() => applySceneOperations(scene, [{ op: "replace_scene", scene: replacement }]), /整体替换/);
  assert.throws(() => applySceneOperations(scene, [{ op: "patch_node", nodeId: "body", patch: { parentId: null } }]), /reparent_node/);
});

test("duplicating a group keeps descendants together with new IDs", () => {
  const scene = createStarterScene();
  scene.nodes.push({
    id: "assembly",
    name: "Assembly",
    type: "group",
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "macro",
    transform: { position: [0, 0, 0], rotation: [0, 20, 0], scale: [1, 1, 1] },
  });
  scene.nodes.find((node) => node.id === "body").parentId = "assembly";
  const next = applySceneOperations(scene, [{ op: "duplicate_node", nodeId: "assembly", newId: "assembly-copy", name: "Assembly copy" }]);
  const copy = next.nodes.find((node) => node.id === "assembly-copy");
  assert.equal(copy?.name, "Assembly copy");
  const descendants = next.nodes.filter((node) => node.parentId === "assembly-copy");
  assert.equal(descendants.length, 1);
  assert.notEqual(descendants[0].id, "body");
  assert.equal(descendants[0].parentId, "assembly-copy");
  assert.equal(next.nodes.length, scene.nodes.length + 2);
});

test("reparenting preserves world position and rejects cycles", () => {
  const scene = createStarterScene();
  scene.nodes.push(
    {
      id: "parent-a",
      name: "Parent A",
      type: "group",
      parentId: null,
      visible: true,
      locked: false,
      fidelity: "macro",
      transform: { position: [2, 1, 0], rotation: [0, 30, 0], scale: [1.5, 1.5, 1.5] },
    },
    {
      id: "parent-b",
      name: "Parent B",
      type: "group",
      parentId: null,
      visible: true,
      locked: false,
      fidelity: "macro",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  );
  scene.nodes.find((node) => node.id === "body").parentId = "parent-a";
  const before = applySceneOperations(scene, [{ op: "reparent_node", nodeId: "body", parentId: "parent-a" }]);
  const after = applySceneOperations(before, [{ op: "reparent_node", nodeId: "body", parentId: "parent-b" }]);
  const body = after.nodes.find((node) => node.id === "body");
  assert.equal(body.parentId, "parent-b");
  assert.ok(Math.abs(body.transform.position[0] - 2) < 0.0001);
  assert.ok(Math.abs(body.transform.position[1] - 1.18) < 0.0001);
  assert.throws(() => applySceneOperations(after, [{ op: "reparent_node", nodeId: "parent-b", parentId: "body" }]), /后代/);
});

test("grouping and ungrouping selected roots preserves world transforms", () => {
  const scene = createStarterScene();
  const group = {
    id: "selection-group",
    name: "Selection group",
    type: "group",
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "macro",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  };
  const beforeBody = scene.nodes.find((node) => node.id === "body");
  const beforeLens = scene.nodes.find((node) => node.id === "lens");
  const grouped = applySceneOperations(scene, [
    { op: "add_node", node: group },
    { op: "reparent_node", nodeId: "body", parentId: group.id },
    { op: "reparent_node", nodeId: "lens", parentId: group.id },
  ]);
  assert.equal(grouped.nodes.find((node) => node.id === "body").parentId, group.id);
  assert.equal(grouped.nodes.find((node) => node.id === "lens").parentId, group.id);
  const ungrouped = applySceneOperations(grouped, [
    { op: "reparent_node", nodeId: "body", parentId: null },
    { op: "reparent_node", nodeId: "lens", parentId: null },
    { op: "delete_node", nodeId: group.id },
  ]);
  assert.equal(ungrouped.nodes.some((node) => node.id === group.id), false);
  for (const id of ["body", "lens"]) {
    const before = id === "body" ? beforeBody : beforeLens;
    const after = ungrouped.nodes.find((node) => node.id === id);
    for (const key of ["position", "rotation", "scale"]) {
      after.transform[key].forEach((value, index) => assert.ok(Math.abs(value - before.transform[key][index]) < 0.0001));
    }
  }
});

test("integrity gate rejects dangling parents and cyclic hierarchies", () => {
  const dangling = createStarterScene();
  dangling.nodes[0].parentId = "missing";
  assert.throws(() => normalizeScene(dangling), /父级不存在/);

  const cycle = createStarterScene();
  cycle.nodes[0].parentId = "lens-ring";
  cycle.nodes[1].parentId = "body";
  assert.throws(() => normalizeScene(cycle), /循环层级/);
});

test("manual primitive factory supports every advertised geometry", () => {
  for (const kind of ["box", "sphere", "cylinder", "cone", "torus", "capsule", "plane"]) {
    const node = createPrimitiveNode(kind);
    assert.equal(node.type, "mesh");
    assert.equal(node.geometry.kind, kind);
    assert.ok(node.id.startsWith(`${kind}-`));
  }
});

test("manual light factory exposes editable light types with safe defaults", () => {
  for (const kind of ["ambient", "directional", "point", "spot"]) {
    const node = createLightNode(kind);
    assert.equal(node.type, "light");
    assert.equal(node.lightKind, kind);
    assert.ok(node.intensity >= 0);
    assert.ok(node.id.startsWith("light-"));
  }
});

test("AI response contract requires validated scene operations", () => {
  const valid = aiResponseSchema.parse({
    assistantMessage: "已调整机身比例。",
    summary: "缩短机身并提高材质粗糙度",
    rationale: ["保留镜头尺寸以维持视觉重心"],
    operations: [{
      op: "patch_node",
      nodeId: "body",
      patch: { transform: { scale: [1.1, 0.9, 0.8] } },
    }],
  });
  assert.equal(valid.operations.length, 1);
  assert.throws(() => aiResponseSchema.parse({
    assistantMessage: "无操作",
    summary: "无",
    rationale: [],
    operations: [],
  }));
});

test("node definitions expose shared capabilities and parameter metadata", () => {
  assert.deepEqual(getNodeDefinition("mesh").capabilities, ["select", "transform", "patch", "duplicate", "delete"]);
  assert.equal(getGeometryDefinition("cylinder").fields.some((field) => field.key === "openEnded"), true);
  assert.equal(getGeometryDefinition("torus").fields.some((field) => field.key === "tubularSegments"), true);
});

test("stable node references preserve hierarchy paths for AI context", () => {
  const scene = createStarterScene();
  scene.nodes.push({
    id: "assembly",
    name: "Assembly",
    type: "group",
    parentId: null,
    visible: true,
    locked: false,
    fidelity: "macro",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  });
  scene.nodes[0].parentId = "assembly";
  const refs = buildSceneNodeReferences(scene);
  const body = refs.find((item) => item.nodeId === "body");
  assert.equal(body?.ref, "node:body");
  assert.equal(body?.parentRef, "node:assembly");
  assert.equal(body?.path, "Assembly / Body shell");
});

test("scene diff explains stable node-level changes", () => {
  const before = createStarterScene();
  const after = applySceneOperations(before, [{
    op: "patch_node",
    nodeId: "body",
    patch: { transform: { scale: [1.2, 1, 1] } },
  }]);
  const diff = diffScenes(before, after);
  assert.equal(diff.updated, 1);
  assert.equal(diff.entries[0].ref, "node:body");
  assert.equal(diff.entries[0].changes[0].path, "transform.scale");
});

test("quality gate reports issues and applies safe automatic repairs", () => {
  const scene = createStarterScene();
  scene.nodes = scene.nodes.filter((node) => node.type !== "light");
  scene.nodes[0].material.transparent = false;
  scene.nodes[0].material.opacity = 0.72;
  const report = evaluateSceneQuality(scene);
  assert.equal(report.status, "review");
  assert.ok(report.issues.some((item) => item.code === "no-authored-light"));
  assert.ok(report.issues.some((item) => item.code === "transparent-material"));
  const repaired = repairScene(scene);
  assert.equal(repaired.operations.length, 2);
  const repairedReport = evaluateSceneQuality(repaired.scene);
  assert.equal(repairedReport.issues.some((item) => item.code === "transparent-material"), false);
  assert.equal(repaired.scene.nodes.some((node) => node.type === "light"), true);
});

test("typed workflow plans account for every operation and pass preflight", () => {
  const scene = createStarterScene();
  const operations = [{
    op: "patch_node",
    nodeId: "body",
    patch: { transform: { scale: [1, 0.85, 1] } },
  }];
  const plan = buildSceneWorkflowPlan(scene, operations, [], "en");
  const preflight = preflightSceneWorkflow(plan, scene, operations);
  assert.equal(plan.steps[0].kind, "inspect");
  assert.equal(plan.steps.some((step) => step.kind === "edit"), true);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.issues.length, 0);
});

test("scene pipeline analyzes, repairs, and reduces primitive geometry safely", () => {
  const scene = createStarterScene();
  const analysis = analyzeScene(scene);
  const optimized = optimizeSceneGeometry(scene, Math.floor(analysis.estimatedTriangles * 0.45));
  assert.ok(optimized.operations.length > 0);
  assert.ok(analyzeScene(optimized.scene).estimatedTriangles < analysis.estimatedTriangles);
  assert.ok(optimized.scene.nodes.some((node) => node.type === "mesh" && node.geometry.kind === "torus" && node.geometry.tubularSegments < 72));

  const draft = structuredClone(scene);
  draft.nodes = draft.nodes.filter((node) => node.type !== "light");
  const repaired = repairScenePipeline(draft);
  assert.equal(repaired.operations.some((operation) => operation.op === "add_node"), true);
  assert.equal(repaired.scene.nodes.some((node) => node.type === "light"), true);

  const hidden = structuredClone(scene);
  hidden.nodes.find((node) => node.id === "body").visible = false;
  const hiddenAnalysis = analyzeScene(hidden);
  assert.equal(hiddenAnalysis.meshCount, analysis.meshCount - 1);
  assert.ok(hiddenAnalysis.estimatedTriangles < analysis.estimatedTriangles);
});

test("geometry statistics use the same Three.js primitives as the renderer", () => {
  assert.equal(estimateGeometryTriangles({ kind: "box", width: 2.35, height: 1.15, depth: 1.08, bevel: 0.16 }), 1292);
  assert.equal(estimateGeometryTriangles({ kind: "capsule", radius: 0.35, length: 0.8, capSegments: 12, radialSegments: 24 }), 1200);
});

test("asset records preserve versions and reject malformed persisted entries", () => {
  const scene = createStarterScene();
  const quality = evaluateSceneQuality(scene);
  const first = createSceneAssetRecord(scene, { version: 1, locale: "zh", quality, prompt: "创建产品模型", model: "test-model", createdAt: "2026-01-01T00:00:00.000Z" });
  const second = createSceneAssetRecord(scene, { version: 2, locale: "en", quality, prompt: "Refine the silhouette", createdAt: "2026-01-02T00:00:00.000Z" });
  const records = upsertSceneAsset(upsertSceneAsset([], first), second);
  assert.deepEqual(records.map((record) => record.version), [2, 1]);
  assert.equal(filterSceneAssets(records, "silhouette").length, 1);
  assert.equal(parseSceneAssets([...records, { invalid: true }]).length, 2);
});

test("project storage falls back safely when IndexedDB is unavailable", async () => {
  const scene = createStarterScene();
  const assets = [createSceneAssetRecord(scene, { version: 1, locale: "zh", quality: evaluateSceneQuality(scene) })];
  const state = await loadProjectState(scene, assets);
  assert.equal(state.indexedDb, false);
  assert.equal(state.scene.id, scene.id);
  assert.equal(state.assets.length, 1);
});
