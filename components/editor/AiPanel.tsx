"use client";

import { useMemo, useState } from "react";
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

const starterPrompts = [
  "创建一个未来感桌面音箱，结构简洁但细节完整",
  "把当前模型改成更紧凑的消费电子产品",
  "增加一套专业摄影棚灯光",
  "检查比例、穿模和材质，并做一轮质量优化",
];

export function AiPanel({ config, onOpenSettings }: { config: ModelConfig; onOpenSettings(): void }) {
  const { scene, selectedNodeId, updateScene } = useEditor();
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: "告诉我想做什么模型，或直接描述当前模型需要怎样修改。我会先调整主轮廓，再补结构和材质。",
  }]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const configured = Boolean(config.model && (config.apiKey || config.baseUrl.includes("localhost")));
  const recent = useMemo(() => messages.filter((message) => message.id !== "welcome").slice(-12), [messages]);

  async function send(content = draft) {
    const prompt = content.trim();
    if (!prompt || running) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setRunning(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...recent, userMessage].map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          context: buildAiSceneContext(scene, selectedNodeId),
          config,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 请求失败");
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
        content: error instanceof Error ? error.message : "这次修改没有完成，请重试。",
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
        <button type="button" onClick={onOpenSettings} title="模型设置" aria-label="模型设置"><GearSix /></button>
      </div>
      <button type="button" className="model-strip" onClick={onOpenSettings}>
        <span>{config.model || "尚未配置模型"}</span><i>{configured ? "已连接" : "需要设置"}</i>
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
            <div className="thinking-line"><i /><i /><i /><span>正在拆解结构并校验 VibeScene</span></div>
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
          placeholder={configured ? "描述要创建或修改的 3D 模型" : "先配置模型和 API Key"}
          disabled={!configured || running}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div><span>{selectedNodeId ? `上下文：${selectedNodeId}` : `场景：${scene.nodes.length} 个节点`}</span><button type="submit" disabled={!configured || running || !draft.trim()} aria-label="发送"><ArrowUp weight="bold" /></button></div>
      </form>
    </div>
  );
}
