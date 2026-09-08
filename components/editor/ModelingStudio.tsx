"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { MagicWand, SlidersHorizontal } from "@phosphor-icons/react";
import type { Transform, VibeScene } from "@/lib/scene-schema";
import { applySceneOperations, createLightNode, createPrimitiveNode, normalizeScene, parseScene } from "@/lib/scene-operations";
import { createStarterScene } from "@/lib/starter-scene";
import { downloadBlob, safeFilename } from "@/lib/download";
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, localizeSceneError, translate, type Locale } from "@/lib/i18n";
import { createSceneAssetRecord, parseSceneAssets, upsertSceneAsset, type SceneAssetRecord } from "@/lib/scene-assets";
import { listProjectScenes, loadProjectState, saveProjectScene, saveProjectSnapshots } from "@/lib/project-storage";
import { evaluateSceneQuality } from "@/lib/scene-quality";
import { AiPanel } from "./AiPanel";
import { AssetLibraryPanel } from "./AssetLibraryPanel";
import { CodePanel } from "./CodePanel";
import { EditorProvider, type EditorContextValue, type SceneCommitResult, type TransformMode, type TransformSpace } from "./EditorContext";
import { InspectorPanel } from "./InspectorPanel";
import { PipelinePanel } from "./PipelinePanel";
import { DEFAULT_MODEL_CONFIG, ModelSettings, type ModelConfig } from "./ModelSettings";
import { SceneTree } from "./SceneTree";
import { SceneViewport, type SceneViewportHandle, type SceneViewportPreview } from "./SceneViewport";
import { TopToolbar } from "./TopToolbar";

const SCENE_STORAGE_KEY = "vibe-3d-scene-v2";
const MODEL_STORAGE_KEY = "vibe-3d-model-config";
const SESSION_KEY = "vibe-3d-session-api-key";
const ASSET_STORAGE_KEY = "vibe-3d-assets-v1";
const DISPLAY_STORAGE_KEY = "vibe-3d-display-settings-v1";

function EditorErrorNotice({
  message,
  onDismiss,
  onRestore,
  onBackup,
  t,
}: {
  message: string;
  onDismiss(): void;
  onRestore(): void;
  onBackup(): void;
  t(key: string, values?: Record<string, string | number>): string;
}) {
  return (
    <div className="editor-error-notice" role="alert">
      <div><strong>{t("editor.operationFailed")}</strong><span>{message}</span></div>
      <div>
        <button type="button" onClick={onRestore}>{t("editor.restoreValid")}</button>
        <button type="button" onClick={onBackup}>{t("editor.exportBackup")}</button>
        <button type="button" onClick={onDismiss}>{t("editor.dismissError")}</button>
      </div>
    </div>
  );
}

class EditorErrorBoundary extends Component<{
  children: React.ReactNode;
  t(key: string): string;
  onBackup(): void;
  onRestore(): void;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="editor-crash-recovery" role="alert">
        <strong>{this.props.t("editor.crashTitle")}</strong>
        <p>{this.props.t("editor.crashCopy")}</p>
        <div>
          <button type="button" onClick={this.props.onBackup}>{this.props.t("editor.exportBackup")}</button>
          <button type="button" onClick={() => { this.setState({ error: null }); this.props.onRestore(); }}>{this.props.t("editor.restoreValid")}</button>
          <button type="button" onClick={() => window.location.reload()}>{this.props.t("editor.reload")}</button>
        </div>
      </div>
    );
  }
}

type AiPreviewState = SceneViewportPreview;

function sceneSignature(scene: VibeScene) {
  const content = JSON.parse(JSON.stringify(scene)) as Record<string, unknown>;
  delete content.updatedAt;
  return JSON.stringify(content);
}

function selectionRoots(scene: VibeScene, ids: string[]) {
  const selected = new Set(ids);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return ids.filter((id) => {
    let parentId = byId.get(id)?.parentId ?? null;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (selected.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

export function ModelingStudio() {
  const [scene, setScene] = useState<VibeScene>(() => createStarterScene());
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [transformSpace, setTransformSpace] = useState<TransformSpace>("world");
  const [rightPanel, setRightPanel] = useState<"design" | "ai" | "pipeline">("ai");
  const [gridVisible, setGridVisible] = useState(true);
  const [wireframeAll, setWireframeAll] = useState(false);
  const [materialPreview, setMaterialPreview] = useState(true);
  const [materialPreviewIntensity, setMaterialPreviewIntensity] = useState(0.72);
  const [transparentPng, setTransparentPng] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [projection, setProjection] = useState<"perspective" | "orthographic">("perspective");
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [editorError, setEditorError] = useState<string>();
  const [codeOpen, setCodeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assets, setAssets] = useState<SceneAssetRecord[]>([]);
  const [projects, setProjects] = useState<VibeScene[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [saveState, setSaveState] = useState("toolbar.saved");
  const [hydrated, setHydrated] = useState(false);
  const pastRef = useRef<VibeScene[]>([]);
  const futureRef = useRef<VibeScene[]>([]);
  const sceneRef = useRef(scene);
  const lastValidSceneRef = useRef(scene);
  const revisionRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const previewOwnerRef = useRef<"ai" | "pipeline" | "code" | null>(null);
  const viewportRef = useRef<SceneViewportHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const bumpSceneRevision = useCallback(() => {
    revisionRef.current += 1;
    setSceneRevision(revisionRef.current);
  }, []);
  const getSceneRevision = useCallback(() => revisionRef.current, []);
  const selectedNodeId = selectedNodeIds.at(-1);

  const acceptLoadedScene = useCallback((next: VibeScene) => {
    sceneRef.current = next;
    lastValidSceneRef.current = next;
    setScene(next);
    bumpSceneRevision();
  }, [bumpSceneRevision]);

  const restoreLastValidScene = useCallback(() => {
    const next = structuredClone(lastValidSceneRef.current);
    sceneRef.current = next;
    previewOwnerRef.current = null;
    setAiPreview(null);
    setSelectedNodeIds([]);
    setScene(next);
    setEditorError(undefined);
    bumpSceneRevision();
  }, [bumpSceneRevision]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(savedLocale)) setLocale(savedLocale);

    const savedScene = localStorage.getItem(SCENE_STORAGE_KEY);
    let legacyScene: VibeScene | undefined;
    if (savedScene) {
      try {
        const persisted = parseScene(JSON.parse(savedScene));
        const legacyStarter = persisted.id === "scene-product-study"
          && persisted.nodes.some((node) => node.id === "body" && node.type === "mesh" && node.geometry.kind === "capsule");
        legacyScene = legacyStarter ? createStarterScene() : persisted;
        acceptLoadedScene(legacyScene);
      } catch {
        setEditorError("保存的场景无法读取，已保留当前有效场景。");
      }
    }

    try {
      const savedConfig = localStorage.getItem(MODEL_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig) as Partial<ModelConfig>;
        const sessionKey = sessionStorage.getItem(SESSION_KEY) || "";
        setModelConfig({ ...DEFAULT_MODEL_CONFIG, ...parsed, apiKey: parsed.apiKey || sessionKey });
      }
    } catch {
      setEditorError("模型连接设置无法读取，请重新配置。");
    }

    let legacyAssets: SceneAssetRecord[] = [];
    try {
      const savedAssets = localStorage.getItem(ASSET_STORAGE_KEY);
      if (savedAssets) {
        legacyAssets = parseSceneAssets(JSON.parse(savedAssets));
        setAssets(legacyAssets);
      }
    } catch {
      setEditorError("本地版本库无法读取，当前场景仍可继续编辑。");
    }
    try {
      const savedDisplay = localStorage.getItem(DISPLAY_STORAGE_KEY);
      if (savedDisplay) {
        const parsed = JSON.parse(savedDisplay) as Partial<{ materialPreview: boolean; materialPreviewIntensity: number; transparentPng: boolean; snapEnabled: boolean }>;
        if (typeof parsed.materialPreview === "boolean") setMaterialPreview(parsed.materialPreview);
        if (typeof parsed.materialPreviewIntensity === "number" && Number.isFinite(parsed.materialPreviewIntensity)) {
          setMaterialPreviewIntensity(Math.min(2, Math.max(0, parsed.materialPreviewIntensity)));
        }
        if (typeof parsed.transparentPng === "boolean") setTransparentPng(parsed.transparentPng);
        if (typeof parsed.snapEnabled === "boolean") setSnapEnabled(parsed.snapEnabled);
      }
    } catch {
      setEditorError("显示设置无法读取，已使用默认材质预览环境。");
    }
    const hydrationRevision = revisionRef.current;
    try {
      const projectState = await loadProjectState(legacyScene, legacyAssets);
      if (!cancelled) {
        // IndexedDB can resolve after the user has already started editing. In
        // that case the late persisted value is stale and must not overwrite
        // the live scene.
        if (projectState.scene && revisionRef.current === hydrationRevision && (!legacyScene || projectState.scene.updatedAt !== legacyScene.updatedAt)) acceptLoadedScene(projectState.scene);
        if (revisionRef.current === hydrationRevision && projectState.assets.length) setAssets(projectState.assets);
        if (revisionRef.current === hydrationRevision) setProjects(projectState.projects);
      }
    } catch {
      if (!cancelled) setEditorError("项目数据库无法读取，已继续使用浏览器备份。");
    }
    if (!cancelled) {
      // Mark hydration complete only after all persisted values have been queued,
      // so persistence effects cannot overwrite them with initial defaults.
      setHydrated(true);
    }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [acceptLoadedScene]);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = locale === "zh" ? "在线 3D 建模工作台 | Vibe 3D" : "Online 3D Modeling Studio | Vibe 3D";
  }, [locale]);

  useEffect(() => {
    if (!hydrated) return;
    // Saving status mirrors the external localStorage synchronization lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveState("toolbar.saving");
    const saveSequence = ++saveSequenceRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
          await saveProjectScene(scene);
          if (saveSequence === saveSequenceRef.current) {
            setProjects((current) => [scene, ...current.filter((project) => project.id !== scene.id)]);
            setSaveState("toolbar.saved");
          }
        } catch {
          if (saveSequence === saveSequenceRef.current) setSaveState("toolbar.saveFailed");
          setEditorError("场景无法保存到此设备，请导出 JSON 备份。");
        }
      })();
    }, 420);
    return () => window.clearTimeout(timer);
  }, [hydrated, scene]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(assets));
      void saveProjectSnapshots(assets).catch(() => setEditorError("项目版本无法保存，请导出当前场景备份。"));
    } catch {
      // Persistence errors are surfaced in the editor banner so users can export a backup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditorError("版本库无法保存到此设备，请导出当前场景备份。");
    }
  }, [assets, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ materialPreview, materialPreviewIntensity, transparentPng, snapEnabled }));
    } catch {
      // Display preferences are optional; keep editing and provide a recoverable warning.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditorError("显示设置无法保存，请检查浏览器存储权限。");
    }
  }, [hydrated, materialPreview, materialPreviewIntensity, snapEnabled, transparentPng]);

  const commit = useCallback((updater: (current: VibeScene) => VibeScene): SceneCommitResult => {
    const current = sceneRef.current;
    let next: VibeScene;
    try {
      next = normalizeScene(updater(structuredClone(current)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "场景修改未通过校验。";
      setEditorError(message);
      return { ok: false, error: message };
    }
    if (sceneSignature(current) === sceneSignature(next)) {
      setEditorError(undefined);
      return { ok: true };
    }
    sceneRef.current = next;
    lastValidSceneRef.current = next;
    pastRef.current.push(current);
    if (pastRef.current.length > 100) pastRef.current.shift();
    futureRef.current = [];
    setHistoryState({ canUndo: pastRef.current.length > 0, canRedo: false });
    previewOwnerRef.current = null;
    setAiPreview(null);
    setEditorError(undefined);
    setScene(next);
    bumpSceneRevision();
    return { ok: true };
  }, [bumpSceneRevision]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    const current = sceneRef.current;
    futureRef.current.push(current);
    sceneRef.current = previous;
    lastValidSceneRef.current = previous;
    setScene(previous);
    previewOwnerRef.current = null;
    setAiPreview(null);
    setEditorError(undefined);
    setHistoryState({ canUndo: pastRef.current.length > 0, canRedo: true });
    bumpSceneRevision();
  }, [bumpSceneRevision]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    const current = sceneRef.current;
    pastRef.current.push(current);
    sceneRef.current = next;
    lastValidSceneRef.current = next;
    setScene(next);
    previewOwnerRef.current = null;
    setAiPreview(null);
    setEditorError(undefined);
    setHistoryState({ canUndo: true, canRedo: futureRef.current.length > 0 });
    bumpSceneRevision();
  }, [bumpSceneRevision]);

  const patchNode = useCallback((id: string, patch: Record<string, unknown>): SceneCommitResult => {
    return commit((current) => applySceneOperations(current, [{ op: "patch_node", nodeId: id, patch }]));
  }, [commit]);

  const deleteSelected = useCallback(() => {
    if (!selectedNodeIds.length) return;
    const result = commit((current) => applySceneOperations(current, selectionRoots(current, selectedNodeIds).map((nodeId) => ({ op: "delete_node" as const, nodeId }))));
    if (result.ok) setSelectedNodeIds([]);
  }, [commit, selectedNodeIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if (typing) return;
      if (event.key.toLowerCase() === "w") setTransformMode("translate");
      if (event.key.toLowerCase() === "e") setTransformMode("rotate");
      if (event.key.toLowerCase() === "r") setTransformMode("scale");
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeIds.length) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, redo, selectedNodeIds.length, undo]);

  const selectedNode = selectedNodeIds.length === 1 ? scene.nodes.find((node) => node.id === selectedNodeId) : undefined;
  const selectNode = useCallback((id?: string, additive = false) => {
    if (!id) {
      setSelectedNodeIds([]);
      return;
    }
    setSelectedNodeIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    });
  }, []);
  useEffect(() => {
    const validIds = selectedNodeIds.filter((id) => scene.nodes.some((node) => node.id === id));
    if (validIds.length !== selectedNodeIds.length) {
      // Selection is derived from the current scene after undo, delete, import, or restore.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedNodeIds(validIds);
    }
  }, [scene.nodes, selectedNodeIds]);
  const t = useCallback((key: string, values?: Record<string, string | number>) => translate(locale, key, values), [locale]);
  const context = useMemo<EditorContextValue>(() => ({
    locale,
    setLocale,
    t,
    scene,
    sceneRevision,
    getSceneRevision,
    selectedNodeId,
    selectedNodeIds,
    selectedNode,
    transformMode,
    transformSpace,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    gridVisible,
    wireframeAll,
    materialPreview,
    transparentPng,
    snapEnabled,
    editorError,
    selectNode,
    setTransformMode,
    setTransformSpace,
    setGridVisible,
    setWireframeAll,
    setMaterialPreview,
    materialPreviewIntensity,
    setMaterialPreviewIntensity,
    setTransparentPng,
    setSnapEnabled,
    updateScene: (next) => commit(() => next),
    patchScene: (patch) => commit((current) => ({ ...current, ...patch })),
    patchNode,
    updateNodeTransform: (id: string, transform: Transform) => patchNode(id, { transform }),
    reparentNode: (id: string, parentId: string | null) => commit((current) => applySceneOperations(current, [{ op: "reparent_node", nodeId: id, parentId }])),
    addPrimitive: (kind) => {
      const node = createPrimitiveNode(kind);
      const result = commit((current) => applySceneOperations(current, [{ op: "add_node", node }]));
      if (result.ok) selectNode(node.id);
    },
    addGroup: () => {
      const node = {
        id: `group-${nanoid(7)}`,
        name: t("editor.newGroup"),
        type: "group" as const,
        parentId: null,
        visible: true,
        locked: false,
        fidelity: "macro" as const,
        transform: { position: [0, 0, 0] as Transform["position"], rotation: [0, 0, 0] as Transform["rotation"], scale: [1, 1, 1] as Transform["scale"] },
      };
      const result = commit((current) => applySceneOperations(current, [{ op: "add_node", node }]));
      if (result.ok) selectNode(node.id);
    },
    addLight: (kind) => {
      const node = createLightNode(kind);
      const result = commit((current) => applySceneOperations(current, [{ op: "add_node", node }]));
      if (result.ok) selectNode(node.id);
    },
    groupSelected: () => {
      const roots = selectionRoots(sceneRef.current, selectedNodeIds);
      if (!roots.length) return;
      const group = {
        id: `group-${nanoid(7)}`,
        name: t("editor.selectionGroup"),
        type: "group" as const,
        parentId: null,
        visible: true,
        locked: false,
        fidelity: "macro" as const,
        transform: { position: [0, 0, 0] as Transform["position"], rotation: [0, 0, 0] as Transform["rotation"], scale: [1, 1, 1] as Transform["scale"] },
      };
      const operations = [
        { op: "add_node" as const, node: group },
        ...roots.map((nodeId) => ({ op: "reparent_node" as const, nodeId, parentId: group.id })),
      ];
      const result = commit((current) => applySceneOperations(current, operations));
      if (result.ok) selectNode(group.id);
    },
    ungroupSelected: () => {
      if (selectedNodeIds.length !== 1) return;
      const group = sceneRef.current.nodes.find((node) => node.id === selectedNodeIds[0]);
      if (!group || group.type !== "group") return;
      const children = sceneRef.current.nodes.filter((node) => node.parentId === group.id);
      const operations = [
        ...children.map((node) => ({ op: "reparent_node" as const, nodeId: node.id, parentId: group.parentId })),
        { op: "delete_node" as const, nodeId: group.id },
      ];
      const result = commit((current) => applySceneOperations(current, operations));
      if (result.ok) setSelectedNodeIds(children.map((node) => node.id));
    },
    duplicateSelected: () => {
      if (!selectedNodeId) return;
      const original = scene.nodes.find((node) => node.id === selectedNodeId);
      if (!original) return;
      const newId = `${original.type}-${nanoid(7)}`;
      const result = commit((current) => applySceneOperations(current, [{ op: "duplicate_node", nodeId: selectedNodeId, newId, name: `${original.name} ${t("editor.duplicateSuffix")}` }]));
      if (result.ok) selectNode(newId);
    },
    deleteSelected,
    undo,
    redo,
    clearEditorError: () => setEditorError(undefined),
    restoreLastValidScene,
  }), [
    commit, deleteSelected, editorError, getSceneRevision, gridVisible, historyState, locale, materialPreview, materialPreviewIntensity, patchNode, redo, scene,
    transparentPng,
    restoreLastValidScene, sceneRevision, selectedNode, selectedNodeId, selectedNodeIds, selectNode, snapEnabled, t, transformMode, transformSpace, undo, wireframeAll,
  ]);

  const handlePreviewChange = useCallback((preview: AiPreviewState | null, source: "ai" | "pipeline" | "code") => {
    if (!preview) {
      if (previewOwnerRef.current === source) {
        previewOwnerRef.current = null;
        setAiPreview(null);
      }
      return;
    }
    previewOwnerRef.current = source;
    setAiPreview(preview);
  }, []);
  const handleAiPreviewChange = useCallback((preview: AiPreviewState | null) => handlePreviewChange(preview, "ai"), [handlePreviewChange]);
  const handlePipelinePreviewChange = useCallback((preview: AiPreviewState | null) => handlePreviewChange(preview, "pipeline"), [handlePreviewChange]);
  const handleCodePreviewChange = useCallback((preview: AiPreviewState | null) => handlePreviewChange(preview, "code"), [handlePreviewChange]);

  function saveModelConfig(config: ModelConfig) {
    try {
      if (config.rememberKey) {
        localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(config));
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        const { apiKey, ...safeConfig } = config;
        localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(safeConfig));
        sessionStorage.setItem(SESSION_KEY, apiKey);
      }
      setModelConfig(config);
      setEditorError(undefined);
    } catch {
      setEditorError("模型连接设置无法保存，请检查浏览器存储权限。");
    }
  }

  function saveSceneVersionFor(snapshot: VibeScene, prompt?: string) {
    const quality = evaluateSceneQuality(snapshot);
    const nextVersion = assets.filter((asset) => asset.sceneId === snapshot.id).reduce((max, asset) => Math.max(max, asset.version), 0) + 1;
    const record = createSceneAssetRecord(snapshot, { version: nextVersion, locale, quality, model: modelConfig.model, prompt });
    setAssets((current) => upsertSceneAsset(current, record));
  }

  function saveSceneVersion() {
    saveSceneVersionFor(scene);
  }

  function exportSceneBackup() {
    const snapshot = sceneRef.current;
    downloadBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }), `${safeFilename(snapshot.name)}.vibe3d.backup.json`);
    setEditorError(undefined);
  }

  function exportProjectBackup() {
    const snapshot = sceneRef.current;
    const payload = {
      format: "vibe-3d/project-backup/1",
      exportedAt: new Date().toISOString(),
      scene: snapshot,
      assets,
      display: { materialPreview, materialPreviewIntensity, transparentPng, snapEnabled },
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${safeFilename(snapshot.name)}.vibe3d.project.json`);
    setEditorError(undefined);
  }

  function replaceProject(next: VibeScene) {
    sceneRef.current = next;
    lastValidSceneRef.current = next;
    pastRef.current = [];
    futureRef.current = [];
    setHistoryState({ canUndo: false, canRedo: false });
    previewOwnerRef.current = null;
    setAiPreview(null);
    setSelectedNodeIds([]);
    setScene(next);
    setProjects((current) => [next, ...current.filter((project) => project.id !== next.id)]);
    setEditorError(undefined);
    bumpSceneRevision();
  }

  function persistSceneImmediately(snapshot: VibeScene) {
    try {
      localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(snapshot));
      void saveProjectScene(snapshot).catch(() => setEditorError("项目数据库无法保存，请使用 JSON 备份。"));
    } catch {
      setEditorError("场景无法保存到此设备，请导出 JSON 备份。");
    }
  }

  function newProject() {
    const name = window.prompt(locale === "zh" ? "新项目名称" : "New project name", locale === "zh" ? "未命名项目" : "Untitled project");
    if (!name?.trim()) return;
    if (!window.confirm(locale === "zh" ? "切换项目后，当前编辑历史会重置；已保存的版本仍保留。继续？" : "Switching projects resets the current undo history; saved versions remain. Continue?")) return;
    persistSceneImmediately(sceneRef.current);
    const next = createStarterScene();
    next.id = `scene-${nanoid(7)}`;
    next.name = name.trim();
    next.createdAt = new Date().toISOString();
    replaceProject(normalizeScene(next));
    setAssetsOpen(false);
  }

  function saveAsProject() {
    const name = window.prompt(locale === "zh" ? "另存为项目名称" : "Save project as", `${scene.name} ${locale === "zh" ? "副本" : "copy"}`);
    if (!name?.trim()) return;
    persistSceneImmediately(sceneRef.current);
    const now = new Date().toISOString();
    const next = normalizeScene({ ...structuredClone(sceneRef.current), id: `scene-${nanoid(7)}`, name: name.trim(), createdAt: now, updatedAt: now });
    replaceProject(next);
    setAssetsOpen(false);
  }

  function openProject(project: VibeScene) {
    if (project.id === sceneRef.current.id) return;
    persistSceneImmediately(sceneRef.current);
    replaceProject(structuredClone(project));
    setAssetsOpen(false);
  }

  function restoreSceneVersion(asset: SceneAssetRecord) {
    const result = commit(() => asset.scene);
    if (result.ok) setSelectedNodeIds([]);
    setAssetsOpen(false);
  }

  function deleteSceneVersion(asset: SceneAssetRecord) {
    setAssets((current) => current.filter((item) => item.id !== asset.id));
  }

  async function importScene(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const backup = raw && typeof raw === "object" && "format" in raw && (raw as { format?: unknown }).format === "vibe-3d/project-backup/1"
        ? raw as unknown as { scene: unknown; assets?: unknown; display?: Partial<{ materialPreview: boolean; materialPreviewIntensity: number; transparentPng: boolean; snapEnabled: boolean }> }
        : undefined;
      const next = normalizeScene(backup?.scene ?? raw);
      const result = commit(() => next);
      if (result.ok) {
        setSelectedNodeIds([]);
        if (Array.isArray(backup?.assets)) setAssets(parseSceneAssets(backup.assets));
        if (backup?.display) {
          if (typeof backup.display.materialPreview === "boolean") setMaterialPreview(backup.display.materialPreview);
          if (typeof backup.display.materialPreviewIntensity === "number" && Number.isFinite(backup.display.materialPreviewIntensity)) setMaterialPreviewIntensity(Math.min(2, Math.max(0, backup.display.materialPreviewIntensity)));
          if (typeof backup.display.transparentPng === "boolean") setTransparentPng(backup.display.transparentPng);
          if (typeof backup.display.snapEnabled === "boolean") setSnapEnabled(backup.display.snapEnabled);
        }
      }
    } catch (error) {
      window.alert(error instanceof Error
        ? t("alert.importFailed", { message: localizeSceneError(locale, error.message) })
        : t("alert.importFailedGeneric"));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <EditorProvider value={context}>
      <EditorErrorBoundary t={t} onBackup={exportSceneBackup} onRestore={restoreLastValidScene}>
      <main className={`studio-shell ${codeOpen ? "has-code" : ""}`}>
        <TopToolbar
          saveState={t(saveState)}
          codeOpen={codeOpen}
          onToggleCode={() => setCodeOpen((value) => !value)}
          onExport={(format) => viewportRef.current?.exportModel(format) ?? Promise.resolve()}
          onCapture={() => viewportRef.current?.capturePng()}
          onFocus={() => viewportRef.current?.focusSelected()}
          onResetView={() => viewportRef.current?.resetView()}
          onToggleProjection={() => viewportRef.current?.toggleProjection()}
          projection={projection}
          onImport={() => importRef.current?.click()}
          onOpenAssets={() => {
            setAssetsOpen(true);
            void listProjectScenes().then((next) => [sceneRef.current, ...next.filter((project) => project.id !== sceneRef.current.id)]).then(setProjects).catch(() => setEditorError("项目列表无法读取，请继续使用当前项目。"));
          }}
          onExportJson={() => downloadBlob(new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" }), `${safeFilename(scene.name)}.vibe3d.json`)}
          previewActive={Boolean(aiPreview)}
        />
        <div className="mobile-editor-note" role="status">{t("toolbar.mobileNote")}</div>
        {editorError && <EditorErrorNotice message={editorError} onDismiss={() => setEditorError(undefined)} onRestore={restoreLastValidScene} onBackup={exportSceneBackup} t={t} />}
        <input ref={importRef} type="file" accept=".json,.vibe3d" hidden onChange={(event) => void importScene(event.target.files?.[0])} />
        <div className="studio-body">
          <SceneTree />
          <section className="canvas-column">
            <SceneViewport ref={viewportRef} preview={aiPreview} projection={projection} onProjectionChange={setProjection} />
            {codeOpen && <CodePanel onClose={() => setCodeOpen(false)} onPreviewChange={handleCodePreviewChange} />}
          </section>
          <aside className="right-panel">
            <div className="panel-tabs">
              <button type="button" className={rightPanel === "design" ? "is-active" : ""} onClick={() => setRightPanel("design")}><SlidersHorizontal /> {t("panel.parameters")}</button>
              <button type="button" className={rightPanel === "ai" ? "is-active" : ""} onClick={() => setRightPanel("ai")}><MagicWand /> {t("panel.ai")}</button>
              <button type="button" className={rightPanel === "pipeline" ? "is-active" : ""} onClick={() => setRightPanel("pipeline")}><MagicWand /> {t("panel.pipeline")}</button>
            </div>
            <div className="panel-view" hidden={rightPanel !== "design"}><InspectorPanel /></div>
            <div className="panel-view" hidden={rightPanel !== "pipeline"}><PipelinePanel onPreviewChange={handlePipelinePreviewChange} /></div>
            <div className="panel-view" hidden={rightPanel !== "ai"}><AiPanel config={modelConfig}
              onOpenSettings={() => setSettingsOpen(true)}
              onSaveVersion={saveSceneVersionFor}
              onPreviewChange={handleAiPreviewChange}
            /></div>
          </aside>
        </div>
      </main>
      {settingsOpen && <ModelSettings config={modelConfig} onSave={saveModelConfig} onClose={() => setSettingsOpen(false)} />}
      {assetsOpen && <AssetLibraryPanel assets={assets} projects={projects} scene={scene} locale={locale} onSave={saveSceneVersion} onRestore={restoreSceneVersion} onDelete={deleteSceneVersion} onExportBackup={exportProjectBackup} onNewProject={newProject} onSaveAsProject={saveAsProject} onOpenProject={openProject} onClose={() => setAssetsOpen(false)} />}
      </EditorErrorBoundary>
    </EditorProvider>
  );
}
