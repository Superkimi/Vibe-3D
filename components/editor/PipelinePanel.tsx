"use client";

import { useMemo, useState } from "react";
import { CheckCircle, MagicWand, WarningCircle, X } from "@phosphor-icons/react";
import { diffScenes, type SceneDiff } from "@/lib/scene-diff";
import { evaluateSceneQuality } from "@/lib/scene-quality";
import {
  analyzeScene,
  optimizeSceneGeometry,
  repairScenePipeline,
  type SceneAnalysis,
} from "@/lib/scene-workflow";
import type { VibeScene } from "@/lib/scene-schema";
import { useEditor } from "./EditorContext";

type PendingPipeline = {
  baseUpdatedAt: string;
  scene: VibeScene;
  diff: SceneDiff;
  quality: ReturnType<typeof evaluateSceneQuality>;
  operationsCount: number;
  label: string;
};

export function PipelinePanel() {
  const { scene, updateScene, t } = useEditor();
  const analysis = useMemo<SceneAnalysis>(() => analyzeScene(scene), [scene]);
  const [targetTriangles, setTargetTriangles] = useState(String(Math.max(5000, Math.floor(analysis.estimatedTriangles * 0.55))));
  const [pending, setPending] = useState<PendingPipeline | null>(null);

  function prepareRepair() {
    const result = repairScenePipeline(scene);
    setPending({
      baseUpdatedAt: scene.updatedAt,
      scene: result.scene,
      diff: diffScenes(scene, result.scene),
      quality: result.quality,
      operationsCount: result.operations.length,
      label: t("pipeline.repair"),
    });
  }

  function prepareOptimize() {
    const parsed = Number.parseInt(targetTriangles, 10);
    if (!Number.isFinite(parsed) || parsed < 500) return;
    const result = optimizeSceneGeometry(scene, parsed);
    setPending({
      baseUpdatedAt: scene.updatedAt,
      scene: result.scene,
      diff: diffScenes(scene, result.scene),
      quality: result.quality,
      operationsCount: result.operations.length,
      label: t("pipeline.optimize"),
    });
  }

  function applyPending() {
    if (!pending || pending.quality.status === "fail") return;
    if (scene.updatedAt !== pending.baseUpdatedAt) {
      setPending(null);
      return;
    }
    updateScene(pending.scene);
    setPending(null);
  }

  const qualityLabel = t(`ai.quality.${analysis.quality.status}`);
  return (
    <div className="pipeline-panel">
      <div className="pipeline-header">
        <div><MagicWand size={17} /><span>{t("panel.pipeline")}</span></div>
        <span className={`quality-badge is-${analysis.quality.status}`}>{qualityLabel} · {analysis.quality.score}</span>
      </div>
      <div className="pipeline-stats">
        <div><strong>{analysis.nodeCount}</strong><span>{t("pipeline.nodes")}</span></div>
        <div><strong>{analysis.meshCount}</strong><span>{t("pipeline.meshes")}</span></div>
        <div><strong>{analysis.estimatedTriangles.toLocaleString()}</strong><span>{t("pipeline.triangles")}</span></div>
      </div>
      <section className="pipeline-card">
        <header><strong>{t("pipeline.title")}</strong><span>{t("pipeline.copy")}</span></header>
        <div className="pipeline-actions">
          <button type="button" onClick={prepareRepair}><CheckCircle /> {t("pipeline.repair")}</button>
          <label><span>{t("pipeline.target")}</span><input value={targetTriangles} onChange={(event) => setTargetTriangles(event.target.value)} inputMode="numeric" /></label>
          <button type="button" onClick={prepareOptimize}><MagicWand /> {t("pipeline.optimize")}</button>
        </div>
      </section>
      {analysis.quality.issues.length > 0 && (
        <div className="pipeline-issues">
          <strong><WarningCircle /> {t("ai.qualityIssues", { count: analysis.quality.issues.length })}</strong>
          {analysis.quality.issues.slice(0, 4).map((issue) => <span key={`${issue.code}-${issue.nodeRefs.join("-")}`}>{t(`ai.qualityIssue.${issue.code}`)}</span>)}
        </div>
      )}
      {pending && (
        <section className="pipeline-preview">
          <header><strong>{pending.label}</strong><span>{pending.operationsCount} {t("pipeline.operations")}</span></header>
          <div className="diff-summary">
            <span className="is-added">+{pending.diff.added} {t("ai.diffAdded")}</span>
            <span className="is-updated">~{pending.diff.updated} {t("ai.diffUpdated")}</span>
            <span className="is-removed">-{pending.diff.removed} {t("ai.diffRemoved")}</span>
          </div>
          <span className={`quality-badge is-${pending.quality.status}`}>{t(`ai.quality.${pending.quality.status}`)} · {pending.quality.score}</span>
          <footer>
            <button type="button" onClick={() => setPending(null)}><X /> {t("ai.discardPreview")}</button>
            <button type="button" className="primary-button" disabled={pending.quality.status === "fail"} onClick={applyPending}><CheckCircle weight="fill" /> {t("ai.applyPreview")}</button>
          </footer>
        </section>
      )}
    </div>
  );
}
