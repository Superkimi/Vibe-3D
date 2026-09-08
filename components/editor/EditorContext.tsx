"use client";

import { createContext, useContext } from "react";
import type { SceneNode, Transform, VibeScene } from "@/lib/scene-schema";
import type { Locale } from "@/lib/i18n";

export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

export type SceneCommitResult =
  | { ok: true }
  | { ok: false; error: string };

export interface EditorContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: string, values?: Record<string, string | number>): string;
  scene: VibeScene;
  sceneRevision: number;
  getSceneRevision(): number;
  selectedNodeId?: string;
  selectedNodeIds: string[];
  selectedNode?: SceneNode;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  canUndo: boolean;
  canRedo: boolean;
  gridVisible: boolean;
  wireframeAll: boolean;
  materialPreview: boolean;
  materialPreviewIntensity: number;
  transparentPng: boolean;
  snapEnabled: boolean;
  editorError?: string;
  selectNode(id?: string, additive?: boolean): void;
  setTransformMode(mode: TransformMode): void;
  setTransformSpace(space: TransformSpace): void;
  setGridVisible(value: boolean): void;
  setWireframeAll(value: boolean): void;
  setMaterialPreview(value: boolean): void;
  setMaterialPreviewIntensity(value: number): void;
  setTransparentPng(value: boolean): void;
  setSnapEnabled(value: boolean): void;
  updateScene(scene: VibeScene): SceneCommitResult;
  patchScene(patch: Partial<VibeScene>): SceneCommitResult;
  patchNode(id: string, patch: Record<string, unknown>): SceneCommitResult;
  updateNodeTransform(id: string, transform: Transform): SceneCommitResult;
  reparentNode(id: string, parentId: string | null): SceneCommitResult;
  addPrimitive(kind: "box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "plane"): void;
  addGroup(): void;
  addLight(kind: "ambient" | "directional" | "point" | "spot"): void;
  groupSelected(): void;
  ungroupSelected(): void;
  duplicateSelected(): void;
  deleteSelected(): void;
  undo(): void;
  redo(): void;
  clearEditorError(): void;
  restoreLastValidScene(): void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ value, children }: { value: EditorContextValue; children: React.ReactNode }) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error("useEditor must be used inside EditorProvider");
  return context;
}
