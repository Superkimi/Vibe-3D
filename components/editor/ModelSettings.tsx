"use client";

import { useState } from "react";
import { Check, Eye, EyeSlash, X } from "@phosphor-icons/react";

export interface ModelConfig {
  provider: "openai-compatible" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  rememberKey: boolean;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.2",
  apiKey: "",
  temperature: 0.35,
  rememberKey: false,
};

const presets = [
  { label: "OpenAI", provider: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", model: "gpt-5.2" },
  { label: "OpenRouter", provider: "openai-compatible" as const, baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4.6" },
  { label: "DeepSeek", provider: "openai-compatible" as const, baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "Anthropic", provider: "anthropic" as const, baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6" },
  { label: "Local", provider: "openai-compatible" as const, baseUrl: "http://localhost:11434/v1", model: "qwen3-coder" },
];

export function ModelSettings({ config, onSave, onClose }: { config: ModelConfig; onSave(config: ModelConfig): void; onClose(): void }) {
  const [draft, setDraft] = useState(config);
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
        <header><div><h2 id="model-settings-title">模型连接</h2><p>选择任何兼容接口。Key 只随当前请求发往你的模型服务。</p></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header>
        <div className="provider-presets">
          {presets.map((preset) => (
            <button type="button" key={preset.label} className={draft.baseUrl === preset.baseUrl ? "is-active" : ""} onClick={() => setDraft({ ...draft, ...preset })}>
              {draft.baseUrl === preset.baseUrl && <Check weight="bold" />}{preset.label}
            </button>
          ))}
        </div>
        <div className="settings-fields">
          <label><span>接口类型</span><select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value as ModelConfig["provider"] })}><option value="openai-compatible">OpenAI Compatible</option><option value="anthropic">Anthropic Messages</option></select></label>
          <label><span>Base URL</span><input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /></label>
          <label><span>模型</span><input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="gpt-5.2" /></label>
          <label><span>API Key</span><div className="secret-input"><input type={showKey ? "text" : "password"} value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder="sk-..." autoComplete="off" /><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏 Key" : "显示 Key"}>{showKey ? <EyeSlash /> : <Eye />}</button></div></label>
          <label><span>造型发散度 <output>{draft.temperature.toFixed(2)}</output></span><input type="range" min="0" max="1.2" step="0.05" value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label>
          <label className="remember-key"><input type="checkbox" checked={draft.rememberKey} onChange={(event) => setDraft({ ...draft, rememberKey: event.target.checked })} /> 在此设备记住 Key</label>
        </div>
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="primary-button" disabled={!draft.baseUrl || !draft.model} onClick={() => { onSave(draft); onClose(); }}>保存连接</button></footer>
      </section>
    </div>
  );
}
