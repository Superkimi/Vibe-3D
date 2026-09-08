"use client";

import { useEffect, useState } from "react";
import { Check, Copy, WarningCircle, X } from "@phosphor-icons/react";
import { ZodError } from "zod";
import { normalizeScene } from "@/lib/scene-operations";
import { localizeSceneError } from "@/lib/i18n";
import { diffScenes } from "@/lib/scene-diff";
import { useEditor } from "./EditorContext";
import type { SceneViewportPreview } from "./SceneViewport";

export function CodePanel({ onClose, onPreviewChange }: { onClose(): void; onPreviewChange?: (preview: SceneViewportPreview | null) => void }) {
  const { scene, sceneRevision, getSceneRevision, updateScene, t, locale } = useEditor();
  const [draft, setDraft] = useState<string | null>(null);
  const [draftBaseRevision, setDraftBaseRevision] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const code = draft ?? JSON.stringify(scene, null, 2);

  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange]);

  useEffect(() => {
    if (draftBaseRevision === null || draftBaseRevision === sceneRevision) return;
    // Preserve the user's text, but invalidate the visual candidate as soon
    // as the formal scene changes underneath it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(t("editor.conflict"));
    onPreviewChange?.(null);
  }, [draftBaseRevision, onPreviewChange, sceneRevision, t]);

  function handleDraftChange(value: string) {
    const baseRevision = draftBaseRevision ?? getSceneRevision();
    if (draftBaseRevision === null) setDraftBaseRevision(baseRevision);
    setDraft(value);
    setError("");
    try {
      const candidate = normalizeScene(JSON.parse(value));
      const diff = diffScenes(scene, candidate);
      if (diff.isEmpty) {
        onPreviewChange?.(null);
        return;
      }
      onPreviewChange?.({
        scene: candidate,
        nodeIds: diff.entries.filter((entry) => entry.kind !== "removed").map((entry) => entry.nodeId),
        baseRevision,
      });
    } catch {
      onPreviewChange?.(null);
    }
  }

  function apply() {
    if (draftBaseRevision !== null && (draftBaseRevision !== getSceneRevision() || draftBaseRevision !== sceneRevision)) {
      setError(t("editor.conflict"));
      return;
    }
    try {
      const candidate = normalizeScene(JSON.parse(code));
      const diff = diffScenes(scene, candidate);
      if (diff.isEmpty) {
        setError(t("editor.noChanges"));
        return;
      }
      const result = updateScene(candidate);
      if (!result.ok) {
        setError(localizeSceneError(locale, result.error));
        return;
      }
      onPreviewChange?.(null);
      setDraft(null);
      setDraftBaseRevision(null);
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
      <textarea spellCheck={false} value={code} onChange={(event) => handleDraftChange(event.target.value)} aria-label={t("code.ariaInput")} />
      <footer>
        <span className={error ? "is-error" : ""}>{error ? <><WarningCircle /> {error}</> : t("code.hint")}</span>
        <button type="button" className="primary-button" onClick={apply}>{t("code.apply")}</button>
      </footer>
    </section>
  );
}
