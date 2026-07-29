"use client";

import Link from "next/link";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  BracketsCurly,
  Camera,
  CaretDown,
  Cube,
  DownloadSimple,
  DotsThree,
  FolderOpen,
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
  onExportJson,
}: {
  saveState: string;
  codeOpen: boolean;
  onToggleCode(): void;
  onExport(format: "glb" | "obj" | "stl"): void;
  onCapture(): void;
  onImport(): void;
  onExportJson(): void;
}) {
  const {
    scene, patchScene, transformMode, setTransformMode, canUndo, canRedo, undo, redo,
    gridVisible, setGridVisible, wireframeAll, setWireframeAll,
  } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <header className="studio-toolbar">
      <div className="toolbar-brand">
        <Link href="/" aria-label="返回 Vibe 3D 首页"><span><Cube weight="fill" /></span><b>Vibe 3D</b></Link>
        <i />
        <input value={scene.name} onChange={(event) => patchScene({ name: event.target.value || scene.name })} aria-label="场景名称" />
        <small>{saveState}</small>
      </div>
      <div className="tool-cluster" aria-label="变换工具">
        <button type="button" className={transformMode === "translate" ? "is-active" : ""} onClick={() => setTransformMode("translate")} title="移动 (W)"><Hand /></button>
        <button type="button" className={transformMode === "rotate" ? "is-active" : ""} onClick={() => setTransformMode("rotate")} title="旋转 (E)"><Selection /></button>
        <button type="button" className={transformMode === "scale" ? "is-active" : ""} onClick={() => setTransformMode("scale")} title="缩放 (R)"><VectorThree /></button>
        <i />
        <button type="button" onClick={undo} disabled={!canUndo} title="撤销"><ArrowCounterClockwise /></button>
        <button type="button" onClick={redo} disabled={!canRedo} title="重做"><ArrowClockwise /></button>
      </div>
      <div className="toolbar-actions">
        <button type="button" className={gridVisible ? "is-active" : ""} onClick={() => setGridVisible(!gridVisible)} title="网格"><GridFour /></button>
        <button type="button" className={wireframeAll ? "is-active" : ""} onClick={() => setWireframeAll(!wireframeAll)} title="全局线框"><DotsThree /></button>
        <button type="button" className={codeOpen ? "is-active" : ""} onClick={onToggleCode}><BracketsCurly /> Schema</button>
        <button type="button" onClick={onCapture}><Camera /> 截图</button>
        <button type="button" onClick={onImport} title="导入 VibeScene JSON"><UploadSimple /></button>
        <div className="export-menu">
          <button type="button" className="export-trigger" onClick={() => setExportOpen((value) => !value)}><DownloadSimple /> 导出 <CaretDown /></button>
          {exportOpen && <div className="export-popover">
            <button type="button" onClick={() => { onExport("glb"); setExportOpen(false); }}><b>GLB</b><span>网页与实时引擎</span></button>
            <button type="button" onClick={() => { onExport("obj"); setExportOpen(false); }}><b>OBJ</b><span>通用网格交换</span></button>
            <button type="button" onClick={() => { onExport("stl"); setExportOpen(false); }}><b>STL</b><span>3D 打印</span></button>
            <button type="button" onClick={() => { onExportJson(); setExportOpen(false); }}><b>JSON</b><span>可继续编辑的源码</span></button>
          </div>}
        </div>
        <button type="button" className="more-button" title="打开项目"><FolderOpen /></button>
      </div>
    </header>
  );
}
