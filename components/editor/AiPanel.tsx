"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  CheckCircle,
  GearSix,
  MagicWand,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { buildAiSceneContext } from "@/lib/ai-system-prompt";
import { aiResponseSchema, type AiSceneResponse } from "@/lib/scene-schema";
import { applySceneOperations } from "@/lib/scene-operations";
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
          locale,
          config,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t("ai.requestFailed"));
      const result: AiSceneResponse = aiResponseSchema.parse(payload);
      updateScene(applySceneOperations(scene, result.operations));
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
      {messages.length === 1 && (
        <div className="prompt-chips">{starterPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}</div>
      )}
      <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={configured ? t("ai.placeholder") : t("ai.setupPlaceholder")}
          disabled={!configured || running}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div><span>{selectedNodeId ? t("ai.contextSelection", { id: selectedNodeId }) : t("ai.contextScene", { count: scene.nodes.length })}</span><button type="submit" disabled={!configured || running || !draft.trim()} aria-label={t("ai.send")}><ArrowUp weight="bold" /></button></div>
      </form>
    </div>
  );
}
