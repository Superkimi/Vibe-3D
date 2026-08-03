"use client";

import { useState } from "react";
import { Check, Copy, WarningCircle, X } from "@phosphor-icons/react";
import { ZodError } from "zod";
import { normalizeScene } from "@/lib/scene-operations";
import { localizeSceneError } from "@/lib/i18n";
import { useEditor } from "./EditorContext";

export function CodePanel({ onClose }: { onClose(): void }) {
  const { scene, updateScene, t, locale } = useEditor();
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
        setError(`${issue.path.join(".") || "scene"}: ${issue.message}`);
      } else {
        setError(localizeSceneError(locale, cause instanceof Error ? cause.message : t("error.schema")));
      }
    }
  }

  return (
    <section className="code-panel" aria-label={t("code.aria")}>
      <header>
        <div><b>VibeScene JSON</b><span>{t("code.isModel")}</span></div>
        <div>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check /> : <Copy />} {copied ? t("code.copied") : t("code.copy")}</button>
          <button type="button" aria-label={t("code.close")} onClick={onClose}><X /></button>
        </div>
      </header>
      <textarea spellCheck={false} value={code} onChange={(event) => setDraft(event.target.value)} aria-label={t("code.ariaInput")} />
      <footer>
        <span className={error ? "is-error" : ""}>{error ? <><WarningCircle /> {error}</> : t("code.hint")}</span>
        <button type="button" className="primary-button" onClick={apply}>{t("code.apply")}</button>
      </footer>
    </section>
  );
}
