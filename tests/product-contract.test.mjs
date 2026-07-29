import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("studio exposes manual, AI, schema, preview, and export surfaces", async () => {
  const [studio, toolbar, ai, viewport, code] = await Promise.all([
    readFile(new URL("components/editor/ModelingStudio.tsx", root), "utf8"),
    readFile(new URL("components/editor/TopToolbar.tsx", root), "utf8"),
    readFile(new URL("components/editor/AiPanel.tsx", root), "utf8"),
    readFile(new URL("components/editor/SceneViewport.tsx", root), "utf8"),
    readFile(new URL("components/editor/CodePanel.tsx", root), "utf8"),
  ]);
  assert.match(studio, /<SceneTree \/>/);
  assert.match(studio, /<InspectorPanel \/>/);
  assert.match(studio, /<AiPanel /);
  assert.match(studio, /<CodePanel /);
  assert.match(toolbar, /"glb" \| "obj" \| "stl"/);
  assert.match(ai, /buildAiSceneContext/);
  assert.match(ai, /applySceneOperations/);
  assert.match(viewport, /GLTFExporter/);
  assert.match(viewport, /OBJExporter/);
  assert.match(viewport, /STLExporter/);
  assert.match(code, /normalizeScene/);
});

test("landing page contains product-specific copy and no starter preview marker", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(page, /像聊天一样塑造三维/);
  assert.match(page, /VibeScene JSON/);
  assert.match(layout, /Vibe 3D/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /prefers-reduced-motion/);
});

test("AI proxy does not return or log raw credentials", async () => {
  const route = await readFile(new URL("app/api/ai/route.ts", root), "utf8");
  assert.match(route, /safeBaseUrl/);
  assert.match(route, /AbortSignal\.timeout/);
  assert.doesNotMatch(route, /console\.(?:log|error).*apiKey/);
  assert.doesNotMatch(route, /Response\.json\([^)]*apiKey/);
});
