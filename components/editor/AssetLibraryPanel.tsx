"use client";

import { Archive, CheckCircle, ClockCounterClockwise, Trash, X } from "@phosphor-icons/react";
import type { SceneAssetRecord } from "@/lib/scene-assets";
import type { VibeScene } from "@/lib/scene-schema";

export function AssetLibraryPanel({
  assets,
  scene,
  locale,
  onSave,
  onRestore,
  onDelete,
  onClose,
}: {
  assets: SceneAssetRecord[];
  scene: VibeScene;
  locale: "zh" | "en";
  onSave(): void;
  onRestore(asset: SceneAssetRecord): void;
  onDelete(asset: SceneAssetRecord): void;
  onClose(): void;
}) {
  const copy = locale === "zh" ? {
    title: "项目资产库",
    copy: "保存可恢复的场景版本，保留模型、质量分数和来源信息。",
    save: "保存当前版本",
    empty: "还没有保存的版本。",
    restore: "恢复",
    delete: "删除版本",
    current: "当前场景",
    quality: "质量",
    nodes: "节点",
    prompt: "来源 Prompt",
  } : {
    title: "Project assets",
    copy: "Save restorable scene versions with model, quality, and source metadata.",
    save: "Save current version",
    empty: "No saved versions yet.",
    restore: "Restore",
    delete: "Delete version",
    current: "Current scene",
    quality: "Quality",
    nodes: "nodes",
    prompt: "Source prompt",
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy.title}>
      <section className="asset-library-modal">
        <header>
          <div>
            <h2><Archive /> {copy.title}</h2>
            <p>{copy.copy}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"}><X /></button>
        </header>
        <div className="asset-library-actions">
          <span>{copy.current}: {scene.name}</span>
          <button type="button" className="primary-button" onClick={onSave}><Archive /> {copy.save}</button>
        </div>
        <div className="asset-library-list">
          {assets.length === 0 && <p className="asset-library-empty">{copy.empty}</p>}
          {assets.map((asset) => (
            <article key={asset.id} className="asset-library-item">
              <div className="asset-library-item-main">
                <div className="asset-library-item-title"><strong>{asset.sceneName}</strong><code>v{asset.version}</code></div>
                <small><ClockCounterClockwise /> {new Date(asset.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")} · {asset.scene.nodes.length} {copy.nodes}</small>
                <span className={`asset-quality is-${asset.quality.status}`}><CheckCircle weight="fill" /> {copy.quality} {asset.quality.score}</span>
                {asset.prompt && <p><b>{copy.prompt}:</b> {asset.prompt}</p>}
              </div>
              <div className="asset-library-item-actions">
                <button type="button" onClick={() => onRestore(asset)}>{copy.restore}</button>
                <button type="button" className="danger-link" onClick={() => onDelete(asset)} aria-label={copy.delete}><Trash /></button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
