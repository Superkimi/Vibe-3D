"use client";

import { useState } from "react";
import { Check, Copy, WarningCircle, X } from "@phosphor-icons/react";
import { ZodError } from "zod";
import { normalizeScene } from "@/lib/scene-operations";
import { useEditor } from "./EditorContext";

export function CodePanel({ onClose }: { onClose(): void }) {
  const { scene, updateScene } = useEditor();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const code = draft ?? JSON.stringify(scene, null, 2);

  function apply() {
    try {
      updateScene(normalizeScene(JSON.parse(code)));
      setDraft(null);
      setError("");
    } catch (cause) {
      if (cause instanceof ZodError) {
        const issue = cause.issues[0];
        setError(`${issue.path.join(".") || "scene"}：${issue.message}`);
      } else {
        setError(cause instanceof Error ? cause.message : "Schema 校验失败");
      }
    }
  }

  return (
    <section className="code-panel" aria-label="VibeScene 代码编辑器">
      <header>
        <div><b>VibeScene JSON</b><span>代码即模型</span></div>
        <div>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check /> : <Copy />} {copied ? "已复制" : "复制"}</button>
          <button type="button" aria-label="关闭代码面板" onClick={onClose}><X /></button>
        </div>
      </header>
      <textarea spellCheck={false} value={code} onChange={(event) => setDraft(event.target.value)} aria-label="VibeScene JSON 代码" />
      <footer>
        <span className={error ? "is-error" : ""}>{error ? <><WarningCircle /> {error}</> : "修改后应用，场景会通过完整 schema 校验。"}</span>
        <button type="button" className="primary-button" onClick={apply}>应用代码</button>
      </footer>
    </section>
  );
}
