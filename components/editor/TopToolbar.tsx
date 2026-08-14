"use client";

import Link from "next/link";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  Archive,
  BracketsCurly,
  Camera,
  CaretDown,
  Cube,
  DownloadSimple,
  DotsThree,
  Globe,
  GridFour,
  Hand,
  Selection,
  UploadSimple,
  VectorThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useEditor } from "./EditorContext";

export function TopToolbar({
  saveState,
  codeOpen,
  onToggleCode,
  onExport,
  onCapture,
  onImport,
  onOpenAssets,
  onExportJson,
}: {
  saveState: string;
  codeOpen: boolean;
  onToggleCode(): void;
  onExport(format: "glb" | "obj" | "stl"): void;
  onCapture(): void;
  onImport(): void;
  onOpenAssets(): void;
  onExportJson(): void;
}) {
  const {
    scene, patchScene, transformMode, setTransformMode, canUndo, canRedo, undo, redo,
    gridVisible, setGridVisible, wireframeAll, setWireframeAll, locale, setLocale, t,
  } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <header className="studio-toolbar">
      <div className="toolbar-brand">
        <Link href="/" aria-label={t("toolbar.home")}><span><Cube weight="fill" /></span><b>Vibe 3D</b></Link>
        <i />
        <input value={scene.name} onChange={(event) => patchScene({ name: event.target.value || scene.name })} aria-label={t("toolbar.sceneName")} />
        <small>{saveState}</small>
      </div>
      <div className="tool-cluster" aria-label={t("toolbar.transformTools")}>
        <button type="button" className={transformMode === "translate" ? "is-active" : ""} onClick={() => setTransformMode("translate")} title={t("toolbar.move")}><Hand /></button>
        <button type="button" className={transformMode === "rotate" ? "is-active" : ""} onClick={() => setTransformMode("rotate")} title={t("toolbar.rotate")}><Selection /></button>
        <button type="button" className={transformMode === "scale" ? "is-active" : ""} onClick={() => setTransformMode("scale")} title={t("toolbar.scale")}><VectorThree /></button>
        <i />
        <button type="button" onClick={undo} disabled={!canUndo} title={t("toolbar.undo")}><ArrowCounterClockwise /></button>
        <button type="button" onClick={redo} disabled={!canRedo} title={t("toolbar.redo")}><ArrowClockwise /></button>
      </div>
      <div className="toolbar-actions">
        <button type="button" className={gridVisible ? "is-active" : ""} onClick={() => setGridVisible(!gridVisible)} title={t("toolbar.grid")}><GridFour /></button>
        <button type="button" className={wireframeAll ? "is-active" : ""} onClick={() => setWireframeAll(!wireframeAll)} title={t("toolbar.wireframe")}><DotsThree /></button>
        <button type="button" className={codeOpen ? "is-active" : ""} onClick={onToggleCode}><BracketsCurly /> {t("toolbar.schema")}</button>
        <button type="button" onClick={onCapture}><Camera /> {t("toolbar.screenshot")}</button>
        <button type="button" onClick={onImport} title={t("toolbar.import")}><UploadSimple /></button>
        <div className="export-menu">
          <button type="button" className="export-trigger" onClick={() => setExportOpen((value) => !value)}><DownloadSimple /> {t("toolbar.export")} <CaretDown /></button>
          {exportOpen && <div className="export-popover">
            <button type="button" onClick={() => { onExport("glb"); setExportOpen(false); }}><b>GLB</b><span>{t("toolbar.exportWeb")}</span></button>
            <button type="button" onClick={() => { onExport("obj"); setExportOpen(false); }}><b>OBJ</b><span>{t("toolbar.exportExchange")}</span></button>
            <button type="button" onClick={() => { onExport("stl"); setExportOpen(false); }}><b>STL</b><span>{t("toolbar.exportPrint")}</span></button>
            <button type="button" onClick={() => { onExportJson(); setExportOpen(false); }}><b>JSON</b><span>{t("toolbar.exportSource")}</span></button>
          </div>}
        </div>
        <button type="button" className="more-button" title={t("toolbar.openAssets")} onClick={onOpenAssets}><Archive /></button>
        <button type="button" className="language-button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")} title={t("toolbar.language")} aria-label={t("toolbar.language")}><Globe /><span>{t("toolbar.languageShort")}</span></button>
      </div>
    </header>
  );
}
