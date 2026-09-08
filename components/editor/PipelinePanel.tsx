"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, MagicWand, WarningCircle, X } from "@phosphor-icons/react";
import { diffScenes, type SceneDiff } from "@/lib/scene-diff";
import { evaluateSceneQuality } from "@/lib/scene-quality";
import {
  analyzeScene,
  optimizeSceneGeometry,
  repairScenePipeline,
  type SceneAnalysis,
} from "@/lib/scene-workflow";
import { nodeIdFromRef } from "@/lib/scene-references";
import type { VibeScene } from "@/lib/scene-schema";
import type { SceneViewportPreview } from "./SceneViewport";
import { useEditor } from "./EditorContext";

type PendingPipeline = {
  baseRevision: number;
  scene: VibeScene;
  diff: SceneDiff;
  quality: ReturnType<typeof evaluateSceneQuality>;
  operationsCount: number;
  label: string;
  beforeTriangles: number;
  afterTriangles: number;
  targetTriangles?: number;
};

export type PipelinePreviewChange = SceneViewportPreview;

export function PipelinePanel({ onPreviewChange }: { onPreviewChange?: (preview: PipelinePreviewChange | null) => void }) {
  const { scene, sceneRevision, getSceneRevision, updateScene, selectNode, t } = useEditor();
  const analysis = useMemo<SceneAnalysis>(() => analyzeScene(scene), [scene]);
  const [targetTriangles, setTargetTriangles] = useState(String(Math.max(5000, Math.floor(analysis.estimatedTriangles * 0.55))));
  const [pending, setPending] = useState<PendingPipeline | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange]);

  useEffect(() => {
    if (!pending || pending.baseRevision === sceneRevision) return;
    // A pipeline candidate is tied to the exact revision it was generated
    // from; invalidate it before the user can accidentally apply stale data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    setNotice(t("editor.conflict"));
    onPreviewChange?.(null);
  }, [onPreviewChange, pending, sceneRevision, t]);

  function prepareRepair() {
    const baseRevision = getSceneRevision();
    const result = repairScenePipeline(scene);
    const diff = diffScenes(scene, result.scene);
    if (diff.isEmpty) {
      onPreviewChange?.(null);
      setPending(null);
      setNotice(t("editor.noChanges"));
      return;
    }
    setNotice("");
    setPending({
      baseRevision,
      scene: result.scene,
      diff,
      quality: result.quality,
      operationsCount: result.operations.length,
      label: t("pipeline.repair"),
      beforeTriangles: analysis.estimatedTriangles,
      afterTriangles: analyzeScene(result.scene).estimatedTriangles,
    });
    onPreviewChange?.({
      scene: result.scene,
      nodeIds: diff.entries.filter((entry) => entry.kind !== "removed").map((entry) => entry.nodeId),
      baseRevision,
    });
  }

  function prepareOptimize() {
    const baseRevision = getSceneRevision();
    const parsed = Number.parseInt(targetTriangles, 10);
    if (!Number.isFinite(parsed) || parsed < 500) {
      setNotice(t("pipeline.invalidTarget"));
      return;
    }
    const result = optimizeSceneGeometry(scene, parsed);
    const diff = diffScenes(scene, result.scene);
    if (diff.isEmpty) {
      onPreviewChange?.(null);
      setPending(null);
      setNotice(t("editor.noChanges"));
      return;
    }
    setNotice("");
    setPending({
      baseRevision,
      scene: result.scene,
      diff,
      quality: result.quality,
      operationsCount: result.operations.length,
      label: t("pipeline.optimize"),
      beforeTriangles: analysis.estimatedTriangles,
      afterTriangles: analyzeScene(result.scene).estimatedTriangles,
      targetTriangles: parsed,
    });
    onPreviewChange?.({
      scene: result.scene,
      nodeIds: diff.entries.filter((entry) => entry.kind !== "removed").map((entry) => entry.nodeId),
      baseRevision,
    });
  }

  function applyPending() {
    if (!pending || pending.quality.status === "fail") return;
    if (getSceneRevision() !== pending.baseRevision || sceneRevision !== pending.baseRevision) {
      onPreviewChange?.(null);
      setPending(null);
      setNotice(t("editor.conflict"));
      return;
    }
    const result = updateScene(pending.scene);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    onPreviewChange?.(null);
    setPending(null);
    setNotice("");
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
      {notice && <div className="pipeline-notice" role="status">{notice}</div>}
      {analysis.quality.issues.length > 0 && (
        <div className="pipeline-issues">
          <strong><WarningCircle /> {t("ai.qualityIssues", { count: analysis.quality.issues.length })}</strong>
          {analysis.quality.issues.slice(0, 4).map((issue) => (
            <div className="quality-issue-row" key={`${issue.code}-${issue.nodeRefs.join("-")}`}>
              <span>{t(`ai.qualityIssue.${issue.code}`)}</span>
              {issue.nodeRefs.map((ref) => {
                const nodeId = nodeIdFromRef(ref);
                const node = nodeId ? scene.nodes.find((item) => item.id === nodeId) : undefined;
                return nodeId && node ? <button type="button" key={ref} onClick={() => selectNode(nodeId)}>{node.name}</button> : null;
              })}
            </div>
          ))}
        </div>
      )}
      {pending && (
        <section className="pipeline-preview">
          <header><strong>{pending.label}</strong><span>{pending.operationsCount} {t("pipeline.operations")}</span></header>
          <div className="pipeline-triangle-result">
            <span>{pending.beforeTriangles.toLocaleString()} → {pending.afterTriangles.toLocaleString()} {t("pipeline.triangles")}</span>
            {pending.targetTriangles !== undefined && <>
              <span className={pending.afterTriangles <= pending.targetTriangles ? "is-met" : "is-unmet"}>{t("pipeline.targetResult", { target: pending.targetTriangles })} · {pending.afterTriangles <= pending.targetTriangles ? t("pipeline.targetMet") : t("pipeline.targetMissed")}</span>
              {pending.afterTriangles > pending.targetTriangles && <small>{t("pipeline.targetMissReason")}</small>}
            </>}
          </div>
          <div className="diff-summary">
            <span className="is-added">+{pending.diff.added} {t("ai.diffAdded")}</span>
            <span className="is-updated">~{pending.diff.updated} {t("ai.diffUpdated")}</span>
            <span className="is-removed">-{pending.diff.removed} {t("ai.diffRemoved")}</span>
          </div>
          <span className={`quality-badge is-${pending.quality.status}`}>{t(`ai.quality.${pending.quality.status}`)} · {pending.quality.score}</span>
          <footer>
            <button type="button" onClick={() => { onPreviewChange?.(null); setPending(null); }}><X /> {t("ai.discardPreview")}</button>
            <button type="button" className="primary-button" disabled={pending.quality.status === "fail"} onClick={applyPending}><CheckCircle weight="fill" /> {t("ai.applyPreview")}</button>
          </footer>
        </section>
      )}
    </div>
  );
}
