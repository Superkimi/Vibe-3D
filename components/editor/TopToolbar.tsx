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
  ImageSquare,
  Selection,
  SunDim,
  UploadSimple,
  VectorThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import { BUILD_TIME, BUILD_VERSION } from "@/lib/build-info";
import { useEditor } from "./EditorContext";

export function TopToolbar({
  saveState,
  saveStatus = "saved",
  codeOpen,
  onToggleCode,
  onExport,
  onCapture,
  onFocus,
  onResetView,
  onToggleProjection,
  projection,
  onImport,
  onOpenAssets,
  onExportJson,
  previewActive = false,
}: {
  saveState: string;
  saveStatus?: "saved" | "saving" | "error";
  codeOpen: boolean;
  onToggleCode(): void;
  onExport(format: "glb" | "obj" | "stl"): void | Promise<void>;
  onCapture(): void;
  onFocus(): void;
  onResetView(): void;
  onToggleProjection(): void;
  projection: "perspective" | "orthographic";
  onImport(): void;
  onOpenAssets(): void;
  onExportJson(): void | Promise<void>;
  previewActive?: boolean;
}) {
  const {
    scene, patchScene, transformMode, setTransformMode, canUndo, canRedo, undo, redo,
    gridVisible, setGridVisible, wireframeAll, setWireframeAll, materialPreview, setMaterialPreview, materialPreviewIntensity, setMaterialPreviewIntensity, transparentPng, setTransparentPng, snapEnabled, setSnapEnabled, transformSpace, setTransformSpace, locale, setLocale, t,
  } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState(false);

  async function runExport(action: () => void | Promise<void>) {
    setExporting(true);
    setExportError("");
    setExportSuccess(false);
    try {
      await action();
      setExportSuccess(true);
      window.setTimeout(() => setExportSuccess(false), 1800);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("toolbar.exportFailed"));
    } finally {
      setExporting(false);
    }
  }
  return (
    <header className="studio-toolbar">
      <div className="toolbar-brand">
        <Link href="/" aria-label={t("toolbar.home")}><span><Cube weight="fill" /></span><b>Vibe 3D</b></Link>
        <i />
        <input value={scene.name} onChange={(event) => patchScene({ name: event.target.value || scene.name })} aria-label={t("toolbar.sceneName")} />
        <small className={`save-state is-${saveStatus}`} aria-live="polite">{saveState}</small>
        <small className="build-badge" title={`${BUILD_VERSION} · ${BUILD_TIME}`}>build {BUILD_VERSION}</small>
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
        <button type="button" className={snapEnabled ? "is-active" : ""} onClick={() => setSnapEnabled(!snapEnabled)} title={t("toolbar.snap")} aria-label={t("toolbar.snap")}><span className="snap-label">⌗</span></button>
        <button type="button" className="space-button" onClick={() => setTransformSpace(transformSpace === "world" ? "local" : "world")} title={t("toolbar.transformSpace")} aria-label={t("toolbar.transformSpace")}><span>{transformSpace === "world" ? t("toolbar.world") : t("toolbar.local")}</span></button>
        <button type="button" onClick={onFocus} title={t("toolbar.focus")} aria-label={t("toolbar.focus")}><span className="snap-label">⌖</span></button>
        <button type="button" onClick={onResetView} title={t("toolbar.resetView")} aria-label={t("toolbar.resetView")}><span className="snap-label">↺</span></button>
        <button type="button" onClick={onToggleProjection} title={t("toolbar.projection")} aria-label={t("toolbar.projection")}><span className="projection-label">{projection === "perspective" ? "透" : "正"}</span></button>
        <button type="button" className={wireframeAll ? "is-active" : ""} onClick={() => setWireframeAll(!wireframeAll)} title={t("toolbar.wireframe")}><DotsThree /></button>
        <button type="button" className={materialPreview ? "is-active" : ""} onClick={() => setMaterialPreview(!materialPreview)} title={t("toolbar.materialPreview")} aria-label={t("toolbar.materialPreview")}><SunDim /></button>
        {materialPreview && <label className="environment-intensity" title={t("toolbar.environmentIntensity")}><SunDim /><input type="range" min="0" max="2" step="0.01" value={materialPreviewIntensity} onChange={(event) => setMaterialPreviewIntensity(Number(event.target.value))} aria-label={t("toolbar.environmentIntensity")} /></label>}
        <button type="button" className={codeOpen ? "is-active" : ""} onClick={onToggleCode}><BracketsCurly /> {t("toolbar.schema")}</button>
        <button type="button" className={transparentPng ? "is-active" : ""} onClick={() => setTransparentPng(!transparentPng)} title={t("toolbar.transparentPng")} aria-label={t("toolbar.transparentPng")}><ImageSquare /></button>
        <button type="button" onClick={onCapture} disabled={previewActive || exporting}><Camera /> {t("toolbar.screenshot")}</button>
        <button type="button" onClick={onImport} title={t("toolbar.import")}><UploadSimple /></button>
        <div className="export-menu">
          <button type="button" className="export-trigger" onClick={() => setExportOpen((value) => !value)} disabled={previewActive || exporting}><DownloadSimple /> {exporting ? t("toolbar.exporting") : t("toolbar.export")} <CaretDown /></button>
          {exportOpen && <div className="export-popover">
            <button type="button" disabled={previewActive || exporting} onClick={() => { void runExport(() => onExport("glb")); setExportOpen(false); }}><b>GLB</b><span>{t("toolbar.exportWeb")} · {t("toolbar.unitMeters")}</span></button>
            <button type="button" disabled={previewActive || exporting} onClick={() => { void runExport(() => onExport("obj")); setExportOpen(false); }}><b>OBJ</b><span>{t("toolbar.exportExchange")} · {t("toolbar.unitScene", { unit: scene.unit })}</span></button>
            <button type="button" disabled={previewActive || exporting} onClick={() => { void runExport(() => onExport("stl")); setExportOpen(false); }}><b>STL</b><span>{t("toolbar.exportPrint")} · {t("toolbar.unitMillimeters")}</span></button>
            <button type="button" disabled={previewActive || exporting} onClick={() => { void runExport(onExportJson); setExportOpen(false); }}><b>JSON</b><span>{t("toolbar.exportSource")}</span></button>
          </div>}
        </div>
        {exportError && <span className="toolbar-feedback" role="status" title={exportError}>{t("toolbar.exportFailed")}</span>}
        {!exportError && exportSuccess && <span className="toolbar-feedback is-success" role="status">{t("toolbar.exportReady")}</span>}
        <button type="button" className="more-button" title={t("toolbar.openAssets")} onClick={onOpenAssets}><Archive /></button>
        <button type="button" className="language-button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")} title={t("toolbar.language")} aria-label={t("toolbar.language")}><Globe /><span>{t("toolbar.languageShort")}</span></button>
      </div>
    </header>
  );
}
