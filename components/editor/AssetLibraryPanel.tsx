"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle, ClockCounterClockwise, Trash, X } from "@phosphor-icons/react";
import { filterSceneAssets, type SceneAssetRecord } from "@/lib/scene-assets";
import type { VibeScene } from "@/lib/scene-schema";

export function AssetLibraryPanel({
  assets,
  projects,
  scene,
  locale,
  onSave,
  onRestore,
  onDelete,
  onExportBackup,
  onNewProject,
  onSaveAsProject,
  onOpenProject,
  onClose,
}: {
  assets: SceneAssetRecord[];
  projects: VibeScene[];
  scene: VibeScene;
  locale: "zh" | "en";
  onSave(): void;
  onRestore(asset: SceneAssetRecord): void;
  onDelete(asset: SceneAssetRecord): void;
  onExportBackup(): void;
  onNewProject(): void;
  onSaveAsProject(): void;
  onOpenProject(project: VibeScene): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const filteredAssets = useMemo(() => filterSceneAssets(assets, query), [assets, query]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const copy = locale === "zh" ? {
    title: "项目资产库",
    copy: "项目与版本都保存在此浏览器；跨设备交付可导出整项目备份或模型文件。",
    save: "保存当前版本",
    empty: "还没有保存的版本。",
    restore: "恢复",
    delete: "删除版本",
    quality: "质量",
    nodes: "节点",
    prompt: "来源 Prompt",
    projects: "项目",
    open: "打开",
    currentProject: "当前项目",
    newProject: "新建项目",
    saveAs: "另存为",
    backup: "导出整项目备份",
    search: "搜索项目或版本",
  } : {
    title: "Project assets",
    copy: "Projects and versions stay in this browser; export a full project backup or model files for handoff.",
    save: "Save current version",
    empty: "No saved versions yet.",
    restore: "Restore",
    delete: "Delete version",
    quality: "Quality",
    nodes: "nodes",
    prompt: "Source prompt",
    projects: "Projects",
    open: "Open",
    currentProject: "Current project",
    newProject: "New project",
    saveAs: "Save as",
    backup: "Export full project backup",
    search: "Search projects or versions",
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="asset-library-modal">
        <header>
          <div>
            <h2><Archive /> {copy.title}</h2>
            <p>{copy.copy}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"}><X /></button>
        </header>
        <div className="asset-library-actions">
          <span>{copy.currentProject}: {scene.name}</span>
          <div>
            <button type="button" onClick={onNewProject}>{copy.newProject}</button>
            <button type="button" onClick={onSaveAsProject}>{copy.saveAs}</button>
            <button type="button" onClick={onExportBackup}>{copy.backup}</button>
            <button type="button" className="primary-button" onClick={onSave}><Archive /> {copy.save}</button>
          </div>
        </div>
        {projects.length > 0 && <section className="project-list">
          <header><strong>{copy.projects}</strong><span>{projects.length}</span></header>
          <div>
            {projects.map((project) => (
              <article key={project.id} className={`project-card ${project.id === scene.id ? "is-current" : ""}`}>
                <div className="project-thumbnail" style={{ background: `linear-gradient(145deg, ${project.background}, #17131f)` }}><b>{project.nodes.filter((node) => node.type === "mesh").length}</b><span>mesh</span></div>
                <div><strong title={project.name}>{project.name}</strong><small>{project.nodes.length} {copy.nodes} · {new Date(project.updatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}</small></div>
                <button type="button" disabled={project.id === scene.id} onClick={() => onOpenProject(project)}>{project.id === scene.id ? copy.currentProject : copy.open}</button>
              </article>
            ))}
          </div>
        </section>}
        <label className="asset-search"><span>{copy.search}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} /></label>
        <div className="asset-library-list">
          {filteredAssets.length === 0 && <p className="asset-library-empty">{copy.empty}</p>}
          {filteredAssets.map((asset) => (
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
