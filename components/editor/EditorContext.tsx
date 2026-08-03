"use client";

import { createContext, useContext } from "react";
import type { SceneNode, Transform, VibeScene } from "@/lib/scene-schema";
import type { Locale } from "@/lib/i18n";

export type TransformMode = "translate" | "rotate" | "scale";

export interface EditorContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: string, values?: Record<string, string | number>): string;
  scene: VibeScene;
  selectedNodeId?: string;
  selectedNode?: SceneNode;
  transformMode: TransformMode;
  canUndo: boolean;
  canRedo: boolean;
  gridVisible: boolean;
  wireframeAll: boolean;
  selectNode(id?: string): void;
  setTransformMode(mode: TransformMode): void;
  setGridVisible(value: boolean): void;
  setWireframeAll(value: boolean): void;
  updateScene(scene: VibeScene): void;
  patchScene(patch: Partial<VibeScene>): void;
  patchNode(id: string, patch: Record<string, unknown>): void;
  updateNodeTransform(id: string, transform: Transform): void;
  addPrimitive(kind: "box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "plane"): void;
  addGroup(): void;
  duplicateSelected(): void;
  deleteSelected(): void;
  undo(): void;
  redo(): void;
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
