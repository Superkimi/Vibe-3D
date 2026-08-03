"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { MagicWand, SlidersHorizontal } from "@phosphor-icons/react";
import type { Transform, VibeScene } from "@/lib/scene-schema";
import { applySceneOperations, createPrimitiveNode, normalizeScene } from "@/lib/scene-operations";
import { createStarterScene } from "@/lib/starter-scene";
import { downloadBlob, safeFilename } from "@/lib/download";
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, localizeSceneError, translate, type Locale } from "@/lib/i18n";
import { AiPanel } from "./AiPanel";
import { CodePanel } from "./CodePanel";
import { EditorProvider, type EditorContextValue, type TransformMode } from "./EditorContext";
import { InspectorPanel } from "./InspectorPanel";
import { DEFAULT_MODEL_CONFIG, ModelSettings, type ModelConfig } from "./ModelSettings";
import { SceneTree } from "./SceneTree";
import { SceneViewport, type SceneViewportHandle } from "./SceneViewport";
import { TopToolbar } from "./TopToolbar";

const SCENE_STORAGE_KEY = "vibe-3d-scene-v2";
const MODEL_STORAGE_KEY = "vibe-3d-model-config";
const SESSION_KEY = "vibe-3d-session-api-key";

export function ModelingStudio() {
  const [scene, setScene] = useState<VibeScene>(() => createStarterScene());
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [rightPanel, setRightPanel] = useState<"design" | "ai">("ai");
  const [gridVisible, setGridVisible] = useState(true);
  const [wireframeAll, setWireframeAll] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [saveState, setSaveState] = useState("toolbar.saved");
  const pastRef = useRef<VibeScene[]>([]);
  const futureRef = useRef<VibeScene[]>([]);
  const hydratedRef = useRef(false);
  const viewportRef = useRef<SceneViewportHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      // Loading persisted browser preferences is the external synchronization owned by this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isLocale(savedLocale)) setLocale(savedLocale);
      const savedScene = localStorage.getItem(SCENE_STORAGE_KEY);
      if (savedScene) {
        const persisted = normalizeScene(JSON.parse(savedScene));
        const legacyStarter = persisted.id === "scene-product-study"
          && persisted.nodes.some((node) => node.id === "body" && node.type === "mesh" && node.geometry.kind === "capsule");
        setScene(legacyStarter ? createStarterScene() : persisted);
      }
      const savedConfig = localStorage.getItem(MODEL_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig) as Partial<ModelConfig>;
        const sessionKey = sessionStorage.getItem(SESSION_KEY) || "";
        setModelConfig({ ...DEFAULT_MODEL_CONFIG, ...parsed, apiKey: parsed.apiKey || sessionKey });
      }
    } catch {
      localStorage.removeItem(SCENE_STORAGE_KEY);
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = locale === "zh" ? "在线 3D 建模工作台 | Vibe 3D" : "Online 3D Modeling Studio | Vibe 3D";
  }, [locale]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    setSaveState("toolbar.saving");
    const timer = window.setTimeout(() => {
      localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
      setSaveState("toolbar.saved");
    }, 420);
    return () => window.clearTimeout(timer);
  }, [scene]);

  const commit = useCallback((updater: (current: VibeScene) => VibeScene) => {
    setScene((current) => {
      const next = normalizeScene(updater(structuredClone(current)));
      pastRef.current.push(current);
      if (pastRef.current.length > 100) pastRef.current.shift();
      futureRef.current = [];
      setHistoryState({ canUndo: true, canRedo: false });
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setScene((current) => {
      const previous = pastRef.current.pop();
      if (!previous) return current;
      futureRef.current.push(current);
      setHistoryState({ canUndo: pastRef.current.length > 0, canRedo: true });
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setScene((current) => {
      const next = futureRef.current.pop();
      if (!next) return current;
      pastRef.current.push(current);
      setHistoryState({ canUndo: true, canRedo: futureRef.current.length > 0 });
      return next;
    });
  }, []);

  const patchNode = useCallback((id: string, patch: Record<string, unknown>) => {
    commit((current) => applySceneOperations(current, [{ op: "patch_node", nodeId: id, patch }]));
  }, [commit]);

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    commit((current) => applySceneOperations(current, [{ op: "delete_node", nodeId: selectedNodeId }]));
    setSelectedNodeId(undefined);
  }, [commit, selectedNodeId]);

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
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeId) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, redo, selectedNodeId, undo]);

  const selectedNode = scene.nodes.find((node) => node.id === selectedNodeId);
  const t = useCallback((key: string, values?: Record<string, string | number>) => translate(locale, key, values), [locale]);
  const context = useMemo<EditorContextValue>(() => ({
    locale,
    setLocale,
    t,
    scene,
    selectedNodeId,
    selectedNode,
    transformMode,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    gridVisible,
    wireframeAll,
    selectNode: setSelectedNodeId,
    setTransformMode,
    setGridVisible,
    setWireframeAll,
    updateScene: (next) => commit(() => next),
    patchScene: (patch) => commit((current) => ({ ...current, ...patch })),
    patchNode,
    updateNodeTransform: (id: string, transform: Transform) => patchNode(id, { transform }),
    addPrimitive: (kind) => {
      const node = createPrimitiveNode(kind);
      commit((current) => applySceneOperations(current, [{ op: "add_node", node }]));
      setSelectedNodeId(node.id);
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
      commit((current) => applySceneOperations(current, [{ op: "add_node", node }]));
      setSelectedNodeId(node.id);
    },
    duplicateSelected: () => {
      if (!selectedNodeId) return;
      const original = scene.nodes.find((node) => node.id === selectedNodeId);
      if (!original) return;
      const newId = `${original.type}-${nanoid(7)}`;
      commit((current) => applySceneOperations(current, [{ op: "duplicate_node", nodeId: selectedNodeId, newId, name: `${original.name} ${t("editor.duplicateSuffix")}` }]));
      setSelectedNodeId(newId);
    },
    deleteSelected,
    undo,
    redo,
  }), [
    commit, deleteSelected, gridVisible, historyState, locale, patchNode, redo, scene,
    selectedNode, selectedNodeId, t, transformMode, undo, wireframeAll,
  ]);

  function saveModelConfig(config: ModelConfig) {
    setModelConfig(config);
    if (config.rememberKey) {
      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(config));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      const { apiKey, ...safeConfig } = config;
      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(safeConfig));
      sessionStorage.setItem(SESSION_KEY, apiKey);
    }
  }

  async function importScene(file?: File) {
    if (!file) return;
    try {
      const next = normalizeScene(JSON.parse(await file.text()));
      commit(() => next);
      setSelectedNodeId(undefined);
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
      <main className={`studio-shell ${codeOpen ? "has-code" : ""}`}>
        <TopToolbar
          saveState={t(saveState)}
          codeOpen={codeOpen}
          onToggleCode={() => setCodeOpen((value) => !value)}
          onExport={(format) => void viewportRef.current?.exportModel(format)}
          onCapture={() => viewportRef.current?.capturePng()}
          onImport={() => importRef.current?.click()}
          onExportJson={() => downloadBlob(new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" }), `${safeFilename(scene.name)}.vibe3d.json`)}
        />
        <input ref={importRef} type="file" accept=".json,.vibe3d" hidden onChange={(event) => void importScene(event.target.files?.[0])} />
        <div className="studio-body">
          <SceneTree />
          <section className="canvas-column">
            <SceneViewport ref={viewportRef} />
            {codeOpen && <CodePanel onClose={() => setCodeOpen(false)} />}
          </section>
          <aside className="right-panel">
            <div className="panel-tabs">
              <button type="button" className={rightPanel === "design" ? "is-active" : ""} onClick={() => setRightPanel("design")}><SlidersHorizontal /> {t("panel.parameters")}</button>
              <button type="button" className={rightPanel === "ai" ? "is-active" : ""} onClick={() => setRightPanel("ai")}><MagicWand /> {t("panel.ai")}</button>
            </div>
            {rightPanel === "design" ? <InspectorPanel /> : <AiPanel config={modelConfig} onOpenSettings={() => setSettingsOpen(true)} />}
          </aside>
        </div>
      </main>
      {settingsOpen && <ModelSettings config={modelConfig} onSave={saveModelConfig} onClose={() => setSettingsOpen(false)} />}
    </EditorProvider>
  );
}
