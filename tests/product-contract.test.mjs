import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isLocale, translate } from "../lib/i18n.ts";

const root = new URL("../", import.meta.url);

test("studio exposes manual, AI, schema, preview, and export surfaces", async () => {
  const [studio, toolbar, ai, viewport, code, definitions, quality, diff, benchmarks, workflow, assets, pipeline, buildInfo, storage] = await Promise.all([
    readFile(new URL("components/editor/ModelingStudio.tsx", root), "utf8"),
    readFile(new URL("components/editor/TopToolbar.tsx", root), "utf8"),
    readFile(new URL("components/editor/AiPanel.tsx", root), "utf8"),
    readFile(new URL("components/editor/SceneViewport.tsx", root), "utf8"),
    readFile(new URL("components/editor/CodePanel.tsx", root), "utf8"),
    readFile(new URL("lib/node-definitions.ts", root), "utf8"),
    readFile(new URL("lib/scene-quality.ts", root), "utf8"),
    readFile(new URL("lib/scene-diff.ts", root), "utf8"),
    readFile(new URL("lib/scene-benchmarks.ts", root), "utf8"),
    readFile(new URL("lib/scene-workflow.ts", root), "utf8"),
    readFile(new URL("lib/scene-assets.ts", root), "utf8"),
    readFile(new URL("components/editor/PipelinePanel.tsx", root), "utf8"),
    readFile(new URL("lib/build-info.ts", root), "utf8"),
    readFile(new URL("lib/project-storage.ts", root), "utf8"),
  ]);
  assert.match(studio, /<SceneTree \/>/);
  assert.match(studio, /<InspectorPanel \/>/);
  assert.match(studio, /<AiPanel /);
  assert.match(studio, /<PipelinePanel /);
  assert.match(studio, /<AssetLibraryPanel /);
  assert.match(studio, /<CodePanel /);
  assert.match(toolbar, /"glb" \| "obj" \| "stl"/);
  assert.match(ai, /buildAiSceneContext/);
  assert.match(ai, /applySceneOperations/);
  assert.match(ai, /ai-preview-card/);
  assert.match(ai, /applyPreview/);
  assert.match(ai, /diffScenes/);
  assert.match(ai, /evaluateSceneQuality/);
  assert.match(viewport, /GLTFExporter/);
  assert.match(viewport, /OBJExporter/);
  assert.match(viewport, /STLExporter/);
  assert.match(code, /normalizeScene/);
  assert.match(definitions, /NODE_DEFINITIONS/);
  assert.match(definitions, /GEOMETRY_DEFINITIONS/);
  assert.match(quality, /repairScene/);
  assert.match(quality, /potential-overlap/);
  assert.match(diff, /nodeRef/);
  assert.match(benchmarks, /SCENE_BENCHMARKS/);
  assert.match(benchmarks, /runSceneBenchmark/);
  assert.match(workflow, /preflightSceneWorkflow/);
  assert.match(workflow, /optimizeSceneGeometry/);
  assert.match(assets, /sceneAssetRecordSchema/);
  assert.match(pipeline, /repairScenePipeline/);
  assert.match(buildInfo, /NEXT_PUBLIC_VIBE_3D_BUILD_VERSION/);
  assert.match(studio, /vibe-3d\/project-backup\/1/);
  assert.match(storage, /listProjectScenes/);
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
  assert.match(page, /hero-proof/);
  assert.match(page, /检查与优化/);
  assert.match(layout, /Vibe 3D/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /prefers-reduced-motion/);
});

test("AI proxy does not return or log raw credentials", async () => {
  const route = await readFile(new URL("app/api/ai/route.ts", root), "utf8");
  assert.match(route, /safeBaseUrl/);
  assert.match(route, /requestAbortSignal/);
  assert.match(route, /90000/);
  assert.doesNotMatch(route, /console\.(?:log|error).*apiKey/);
  assert.doesNotMatch(route, /Response\.json\([^)]*apiKey/);
  assert.match(route, /repairScene/);
  assert.match(route, /sceneSchema/);
  assert.match(route, /buildSceneWorkflowPlan/);
});

test("editor exposes persisted Chinese and English localization", async () => {
  const [studio, toolbar, tree, inspector, ai, settings, route, toolbarFile] = await Promise.all([
    readFile(new URL("components/editor/ModelingStudio.tsx", root), "utf8"),
    readFile(new URL("components/editor/TopToolbar.tsx", root), "utf8"),
    readFile(new URL("components/editor/SceneTree.tsx", root), "utf8"),
    readFile(new URL("components/editor/InspectorPanel.tsx", root), "utf8"),
    readFile(new URL("components/editor/AiPanel.tsx", root), "utf8"),
    readFile(new URL("components/editor/ModelSettings.tsx", root), "utf8"),
    readFile(new URL("app/api/ai/route.ts", root), "utf8"),
    readFile(new URL("components/editor/TopToolbar.tsx", root), "utf8"),
  ]);
  assert.equal(isLocale("zh"), true);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("fr"), false);
  assert.equal(translate("zh", "toolbar.languageShort"), "EN");
  assert.equal(translate("en", "toolbar.languageShort"), "中");
  assert.equal(translate("en", "ai.contextScene", { count: 6 }), "Scene: 6 nodes");
  assert.match(studio, /LOCALE_STORAGE_KEY/);
  assert.match(studio, /setLocale/);
  assert.match(toolbar, /language-button/);
  assert.match(toolbar, /save-state/);
  assert.match(tree, /scene\.directory/);
  assert.match(inspector, /inspector\.material/);
  assert.match(ai, /locale/);
  assert.match(settings, /ai\.connection/);
  assert.match(route, /outputLanguageHint/);
  assert.match(route, /localizeErrorMessage/);
  assert.match(toolbarFile, /onOpenAssets/);
});
