"use client";

import { useEffect, useMemo, useState } from "react";
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
import { aiResultSchema, type AiResult, type VibeScene } from "@/lib/scene-schema";
import { applySceneOperations } from "@/lib/scene-operations";
import { diffScenes, type SceneDiff } from "@/lib/scene-diff";
import { evaluateSceneQuality, repairScene } from "@/lib/scene-quality";
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
  baseUpdatedAt: string;
  scene: VibeScene;
  diff: SceneDiff;
  quality: ReturnType<typeof evaluateSceneQuality>;
  result: AiResult;
  repairCount: number;
};

function qualityLabel(status: PendingChange["quality"]["status"], t: (key: string, values?: Record<string, string | number>) => string) {
  return t(`ai.quality.${status}`);
}

export function AiPanel({ config, onOpenSettings }: { config: ModelConfig; onOpenSettings(): void }) {
  const { scene, selectedNodeId, updateScene, t, locale } = useEditor();
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
  const configured = Boolean(config.model && (config.apiKey || config.baseUrl.includes("localhost")));
  const recent = useMemo(() => messages.filter((message) => message.id !== "welcome").slice(-12), [messages]);

  useEffect(() => {
    setMessages((current) => current.length === 1 && current[0]?.id === "welcome"
      ? [{ ...current[0], content: t("ai.welcome") }]
      : current);
  }, [t]);

  async function send(content = draft) {
    const prompt = content.trim();
    if (!prompt || running) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setRunning(true);
    try {
      const basePath = process.env.NEXT_PUBLIC_VIBE_3D_BASE_PATH || "";
      const response = await fetch(`${basePath}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const quality = evaluateSceneQuality(previewScene);
      quality.repaired = operations.length > result.operations.length || localRepair.operations.length > 0;
      const diff = diffScenes(scene, previewScene);
      setPending({
        baseUpdatedAt: scene.updatedAt,
        scene: previewScene,
        diff,
        quality,
        result,
        repairCount: result.repairOperations.length + localRepair.operations.length,
      });
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.assistantMessage,
        summary: result.summary,
        rationale: result.rationale,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : t("ai.retry"),
        error: true,
      }]);
    } finally {
      setRunning(false);
    }
  }

  function discardPreview() {
    setPending(null);
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: t("ai.previewDiscarded"),
    }]);
  }

  function applyPreview() {
    if (!pending) return;
    if (scene.updatedAt !== pending.baseUpdatedAt) {
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
    updateScene(pending.scene);
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
            <div className="thinking-line"><i /><i /><i /><span>{t("ai.running")}</span></div>
          </article>
        )}
      </div>
      {pending && (
        <section className="ai-preview-card" aria-label={t("ai.previewTitle")}>
          <header>
            <div><MagicWand /><strong>{t("ai.previewTitle")}</strong></div>
            <span className={`quality-badge is-${pending.quality.status}`}>{qualityLabel(pending.quality.status, t)} · {pending.quality.score}</span>
          </header>
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
              {pending.quality.issues.slice(0, 4).map((item) => <span key={`${item.code}-${item.nodeRefs.join("-")}`}>{t(`ai.qualityIssue.${item.code}`)}</span>)}
            </div>
          )}
          {pending.repairCount > 0 && <div className="repair-note"><CheckCircle weight="fill" /> {t("ai.autoRepair", { count: pending.repairCount })}</div>}
          <footer>
            <button type="button" onClick={discardPreview}><X /> {t("ai.discardPreview")}</button>
            <button type="button" className="primary-button" onClick={applyPreview} disabled={pending.quality.status === "fail"}><CheckCircle weight="fill" /> {t("ai.applyPreview")}</button>
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
