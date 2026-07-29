import assert from "node:assert/strict";
import test from "node:test";
import { createStarterScene } from "../lib/starter-scene.ts";
import {
  applySceneOperations,
  createPrimitiveNode,
  normalizeScene,
} from "../lib/scene-operations.ts";
import { aiResponseSchema, sceneSchema } from "../lib/scene-schema.ts";

test("starter scene satisfies the public VibeScene contract", () => {
  const scene = sceneSchema.parse(createStarterScene());
  assert.equal(scene.format, "vibe-3d/1");
  assert.ok(scene.nodes.length >= 6);
  assert.ok(scene.nodes.some((node) => node.type === "mesh"));
  assert.ok(scene.nodes.some((node) => node.type === "light"));
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
