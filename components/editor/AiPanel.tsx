"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle,
  GearSix,
  MagicWand,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { buildAiSceneContext } from "@/lib/ai-system-prompt";
import { aiResultSchema, type AiResult, type SceneWorkflowPlan, type VibeScene } from "@/lib/scene-schema";
import { applySceneOperations } from "@/lib/scene-operations";
import { diffScenes, type SceneDiff } from "@/lib/scene-diff";
import { evaluateSceneQuality, repairScene } from "@/lib/scene-quality";
import { buildSceneWorkflowPlan, preflightSceneWorkflow, type WorkflowPreflightResult } from "@/lib/scene-workflow";
import { nodeIdFromRef } from "@/lib/scene-references";
import { useEditor } from "./EditorContext";
import type { ModelConfig } from "./ModelSettings";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  summary?: string;
  rationale?: string[];
  error?: boolean;
}

type PendingChange = {
  baseRevision: number;
  scene: VibeScene;
  diff: SceneDiff;
  quality: ReturnType<typeof evaluateSceneQuality>;
  result: AiResult;
  repairCount: number;
  workflowPlan: SceneWorkflowPlan;
  preflight: WorkflowPreflightResult;
  prompt: string;
};

export type AiPreviewChange = {
  scene: VibeScene;
  nodeIds: string[];
  baseRevision: number;
};

function qualityLabel(status: PendingChange["quality"]["status"], t: (key: string, values?: Record<string, string | number>) => string) {
  return t(`ai.quality.${status}`);
}

export function AiPanel({ config, onOpenSettings, onSaveVersion, onPreviewChange }: {
  config: ModelConfig;
  onOpenSettings(): void;
  onSaveVersion?: (scene: VibeScene, prompt: string) => void;
  onPreviewChange?: (preview: AiPreviewChange | null) => void;
}) {
  const { scene, sceneRevision, getSceneRevision, selectedNodeId, updateScene, selectNode, t, locale } = useEditor();
  const starterPrompts = [
    t("ai.promptSpeaker"),
    t("ai.promptCompact"),
    t("ai.promptLighting"),
    t("ai.promptQuality"),
  ];
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: t("ai.welcome"),
  }]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(sceneRevision);
  const configured = Boolean(config.model && (config.apiKey || config.baseUrl.includes("localhost")));
  const recent = useMemo(() => messages.filter((message) => message.id !== "welcome").slice(-12), [messages]);

  useEffect(() => {
    revisionRef.current = sceneRevision;
  }, [sceneRevision]);

  useEffect(() => {
    if (!pending || pending.baseRevision === sceneRevision) return;
    // A committed edit invalidates the candidate immediately. Keeping the
    // stale preview visible would make an old AI result look actionable.
    setPending(null);
    onPreviewChange?.(null);
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: t("ai.previewStale"),
      error: true,
    }]);
  }, [onPreviewChange, pending, sceneRevision, t]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    onPreviewChange?.(null);
  }, [onPreviewChange]);

  useEffect(() => {
    setMessages((current) => current.length === 1 && current[0]?.id === "welcome"
      ? [{ ...current[0], content: t("ai.welcome") }]
      : current);
  }, [t]);

  async function send(content = draft) {
    const prompt = content.trim();
    if (!prompt || running) return;
    if (!configured) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: t("ai.setupRequired"),
        error: true,
      }]);
      onOpenSettings();
      return;
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setRunning(true);
    const baseRevision = getSceneRevision();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const basePath = process.env.NEXT_PUBLIC_VIBE_3D_BASE_PATH || "";
      const response = await fetch(`${basePath}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...recent, userMessage].map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          context: buildAiSceneContext(scene, selectedNodeId),
          scene,
          locale,
          config,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t("ai.requestFailed"));
      const result: AiResult = aiResultSchema.parse(payload);
      const operations = [...result.operations, ...result.repairOperations];
      let previewScene = applySceneOperations(scene, operations);
      const localRepair = repairScene(previewScene);
      if (localRepair.operations.length) {
        previewScene = localRepair.scene;
      }
      const allRepairOperations = [...result.repairOperations, ...localRepair.operations];
      const workflowPlan = buildSceneWorkflowPlan(scene, result.operations, allRepairOperations, locale);
      const preflight = preflightSceneWorkflow(workflowPlan, scene, [...result.operations, ...allRepairOperations]);
      const quality = evaluateSceneQuality(previewScene);
      quality.repaired = allRepairOperations.length > 0;
      const diff = diffScenes(scene, previewScene);
      if (getSceneRevision() !== baseRevision || revisionRef.current !== baseRevision) {
        onPreviewChange?.(null);
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("ai.previewStale"),
          error: true,
        }]);
        return;
      }
      if (diff.isEmpty) {
        onPreviewChange?.(null);
        setPending(null);
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("editor.noChanges"),
        }]);
        return;
      }
      setPending({
        baseRevision,
        scene: previewScene,
        diff,
        quality,
        result,
        repairCount: allRepairOperations.length,
        workflowPlan,
        preflight,
        prompt,
      });
      onPreviewChange?.({
        scene: previewScene,
        nodeIds: diff.entries.filter((entry) => entry.kind !== "removed").map((entry) => entry.nodeId),
        baseRevision,
      });
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.assistantMessage,
        summary: result.summary,
        rationale: result.rationale,
      }]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("ai.cancelled"),
        }]);
        return;
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : t("ai.retry"),
        error: true,
      }]);
    } finally {
      controllerRef.current = null;
      setRunning(false);
    }
  }

  function cancelRun() {
    controllerRef.current?.abort();
  }

  function discardPreview() {
    onPreviewChange?.(null);
    setPending(null);
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: t("ai.previewDiscarded"),
    }]);
  }

  function applyPreview() {
    if (!pending) return;
    if (getSceneRevision() !== pending.baseRevision || sceneRevision !== pending.baseRevision) {
      onPreviewChange?.(null);
      setPending(null);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: t("ai.previewStale"),
        error: true,
      }]);
      return;
    }
    if (pending.quality.status === "fail") return;
    const result = updateScene(pending.scene);
    if (!result.ok) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.error,
        error: true,
      }]);
      return;
    }
    onPreviewChange?.(null);
    onSaveVersion?.(pending.scene, pending.prompt);
    setPending(null);
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: t("ai.previewApplied"),
      summary: t("ai.previewAppliedSummary", { count: pending.diff.changedNodeCount }),
    }]);
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div><Sparkle size={17} weight="fill" /><span>Vibe AI</span></div>
        <button type="button" onClick={onOpenSettings} title={t("ai.settings")} aria-label={t("ai.settings")}><GearSix /></button>
      </div>
      <button type="button" className="model-strip" onClick={onOpenSettings}>
        <span>{config.model || t("ai.notConfigured")}</span><i>{configured ? t("ai.connected") : t("ai.needsSetup")}</i>
      </button>
      <div className="chat-thread" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`chat-message is-${message.role} ${message.error ? "is-error" : ""}`}>
            {message.role === "assistant" && <span className="message-avatar">{message.error ? <WarningCircle /> : <MagicWand />}</span>}
            <div>
              <p>{message.content}</p>
              {message.rationale?.length ? <ul>{message.rationale.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {message.summary && <small><CheckCircle weight="fill" /> {message.summary}</small>}
            </div>
          </article>
        ))}
        {running && (
          <article className="chat-message is-assistant">
            <span className="message-avatar"><MagicWand /></span>
            <div className="thinking-line"><i /><i /><i /><span>{t("ai.running")}</span><button type="button" onClick={cancelRun}>{t("ai.cancelRun")}</button></div>
          </article>
        )}
      </div>
      {pending && (
        <section className="ai-preview-card" aria-label={t("ai.previewTitle")}>
          <header>
            <div><MagicWand /><strong>{t("ai.previewTitle")}</strong></div>
            <span className={`quality-badge is-${pending.quality.status}`}>{qualityLabel(pending.quality.status, t)} · {pending.quality.score}</span>
          </header>
          <div className="workflow-plan">
            <div className="workflow-plan-heading"><strong>{t("ai.workflowPlan")}</strong><span>{pending.workflowPlan.steps.length} {t("ai.workflowSteps")}</span></div>
            <ol>
              {pending.workflowPlan.steps.map((step, index) => (
                <li key={step.id}>
                  <span className="workflow-step-index">{index + 1}</span>
                  <div><strong>{step.label}</strong><small>{step.description}</small></div>
                  <code>{step.operationCount}</code>
                </li>
              ))}
            </ol>
          </div>
          {pending.preflight.issues.length > 0 && (
            <div className="workflow-preflight">
              <strong>{t("ai.preflightIssues", { count: pending.preflight.issues.length })}</strong>
              {pending.preflight.issues.slice(0, 3).map((issue) => <span key={`${issue.code}-${issue.stepId ?? "plan"}`}>{issue.message}</span>)}
            </div>
          )}
          <p className="ai-preview-copy">{t("ai.previewCopy", { count: pending.diff.changedNodeCount })}</p>
          <div className="diff-summary">
            <span className="is-added">+{pending.diff.added} {t("ai.diffAdded")}</span>
            <span className="is-updated">~{pending.diff.updated} {t("ai.diffUpdated")}</span>
            <span className="is-removed">-{pending.diff.removed} {t("ai.diffRemoved")}</span>
          </div>
          <ul className="diff-list">
            {pending.diff.entries.slice(0, 6).map((entry) => (
              <li key={`${entry.kind}-${entry.ref}`}>
                <span className={`diff-marker is-${entry.kind}`}>{entry.kind === "added" ? "+" : entry.kind === "removed" ? "−" : "~"}</span>
                <div><strong>{entry.name}</strong><code>{entry.ref}</code><small>{entry.changes[0]?.path || entry.path}</small></div>
              </li>
            ))}
          </ul>
          {pending.quality.issues.length > 0 && (
            <div className="quality-issues">
              <strong><WarningCircle /> {t("ai.qualityIssues", { count: pending.quality.issues.length })}</strong>
              {pending.quality.issues.slice(0, 4).map((item) => (
                <div className="quality-issue-row" key={`${item.code}-${item.nodeRefs.join("-")}`}>
                  <span>{t(`ai.qualityIssue.${item.code}`)}</span>
                  {item.nodeRefs.map((ref) => {
                    const nodeId = nodeIdFromRef(ref);
                    const node = nodeId ? scene.nodes.find((candidate) => candidate.id === nodeId) : undefined;
                    return nodeId && node ? <button type="button" key={ref} onClick={() => selectNode(nodeId)}>{node.name}</button> : null;
                  })}
                </div>
              ))}
            </div>
          )}
          {pending.repairCount > 0 && <div className="repair-note"><CheckCircle weight="fill" /> {t("ai.autoRepair", { count: pending.repairCount })}</div>}
          <footer>
            <button type="button" onClick={discardPreview}><X /> {t("ai.discardPreview")}</button>
            <button type="button" className="primary-button" onClick={applyPreview} disabled={!pending.preflight.ok || pending.quality.status === "fail"}><CheckCircle weight="fill" /> {t("ai.applyPreview")}</button>
          </footer>
        </section>
      )}
      {messages.length === 1 && (
        <div className="prompt-chips">{starterPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}</div>
      )}
      <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={configured ? t("ai.placeholder") : t("ai.setupPlaceholder")}
          disabled={!configured || running || Boolean(pending)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div><span>{selectedNodeId ? t("ai.contextSelection", { id: `node:${selectedNodeId}` }) : t("ai.contextScene", { count: scene.nodes.length })}</span><button type="submit" disabled={!configured || running || Boolean(pending) || !draft.trim()} aria-label={t("ai.send")}><ArrowUp weight="bold" /></button></div>
      </form>
    </div>
  );
}
