"use client";

import { Cube, Lock, Trash } from "@phosphor-icons/react";
import type { GeometrySpec, MaterialSpec, Vector3Tuple } from "@/lib/scene-schema";
import { useEditor } from "./EditorContext";

function NumberField({ label, value, onChange, step = 0.01, min, max }: {
  label: string;
  value: number;
  onChange(value: number): void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" value={Number(value.toFixed(4))} step={step} min={min} max={max} onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }} />
    </label>
  );
}

function VectorFields({ label, value, onChange, step = 0.01 }: {
  label: string;
  value: Vector3Tuple;
  onChange(value: Vector3Tuple): void;
  step?: number;
}) {
  return (
    <div className="vector-block">
      <span>{label}</span>
      <div>
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label key={axis}><i>{axis}</i><input type="number" step={step} value={Number(value[index].toFixed(4))} onChange={(event) => {
            const next = [...value] as Vector3Tuple;
            next[index] = Number(event.target.value) || 0;
            onChange(next);
          }} /></label>
        ))}
      </div>
    </div>
  );
}

function GeometryFields({ geometry, onChange }: { geometry: GeometrySpec; onChange(value: GeometrySpec): void }) {
  const update = (key: string, value: number | boolean) => onChange({ ...geometry, [key]: value } as GeometrySpec);
  return (
    <div className="field-grid">
      {geometry.kind === "box" && <>
        <NumberField label="宽" value={geometry.width} onChange={(value) => update("width", value)} min={0.01} />
        <NumberField label="高" value={geometry.height} onChange={(value) => update("height", value)} min={0.01} />
        <NumberField label="深" value={geometry.depth} onChange={(value) => update("depth", value)} min={0.01} />
        <NumberField label="圆角" value={geometry.bevel} onChange={(value) => update("bevel", value)} min={0} max={1} />
      </>}
      {geometry.kind === "sphere" && <>
        <NumberField label="半径" value={geometry.radius} onChange={(value) => update("radius", value)} min={0.01} />
        <NumberField label="横向分段" value={geometry.widthSegments} onChange={(value) => update("widthSegments", Math.round(value))} step={1} min={8} max={128} />
        <NumberField label="纵向分段" value={geometry.heightSegments} onChange={(value) => update("heightSegments", Math.round(value))} step={1} min={6} max={128} />
      </>}
      {geometry.kind === "cylinder" && <>
        <NumberField label="顶部半径" value={geometry.radiusTop} onChange={(value) => update("radiusTop", value)} min={0} />
        <NumberField label="底部半径" value={geometry.radiusBottom} onChange={(value) => update("radiusBottom", value)} min={0.01} />
        <NumberField label="高度" value={geometry.height} onChange={(value) => update("height", value)} min={0.01} />
        <NumberField label="分段" value={geometry.radialSegments} onChange={(value) => update("radialSegments", Math.round(value))} step={1} min={3} max={128} />
      </>}
      {geometry.kind === "cone" && <>
        <NumberField label="半径" value={geometry.radius} onChange={(value) => update("radius", value)} min={0.01} />
        <NumberField label="高度" value={geometry.height} onChange={(value) => update("height", value)} min={0.01} />
        <NumberField label="分段" value={geometry.radialSegments} onChange={(value) => update("radialSegments", Math.round(value))} step={1} min={3} max={128} />
      </>}
      {geometry.kind === "torus" && <>
        <NumberField label="主半径" value={geometry.radius} onChange={(value) => update("radius", value)} min={0.01} />
        <NumberField label="管半径" value={geometry.tube} onChange={(value) => update("tube", value)} min={0.005} />
        <NumberField label="环分段" value={geometry.tubularSegments} onChange={(value) => update("tubularSegments", Math.round(value))} step={1} min={8} max={256} />
      </>}
      {geometry.kind === "capsule" && <>
        <NumberField label="半径" value={geometry.radius} onChange={(value) => update("radius", value)} min={0.01} />
        <NumberField label="主体长度" value={geometry.length} onChange={(value) => update("length", value)} min={0.01} />
        <NumberField label="圆周分段" value={geometry.radialSegments} onChange={(value) => update("radialSegments", Math.round(value))} step={1} min={3} max={64} />
      </>}
      {geometry.kind === "plane" && <>
        <NumberField label="宽" value={geometry.width} onChange={(value) => update("width", value)} min={0.01} />
        <NumberField label="高" value={geometry.height} onChange={(value) => update("height", value)} min={0.01} />
      </>}
    </div>
  );
}

function MaterialFields({ material, onChange }: { material: MaterialSpec; onChange(patch: Partial<MaterialSpec>): void }) {
  return (
    <>
      <label className="color-field"><span>基础色</span><div><input type="color" value={material.color} onChange={(event) => onChange({ color: event.target.value })} /><code>{material.color}</code></div></label>
      <div className="slider-list">
        {([
          ["金属度", "metalness"], ["粗糙度", "roughness"], ["透明度", "opacity"],
          ["清漆", "clearcoat"], ["清漆粗糙度", "clearcoatRoughness"],
        ] as const).map(([label, key]) => (
          <label key={key}><span>{label}<output>{material[key].toFixed(2)}</output></span>
            <input type="range" min="0" max="1" step="0.01" value={material[key]} onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
          </label>
        ))}
      </div>
      <div className="toggle-row">
        <label><input type="checkbox" checked={material.transparent} onChange={(event) => onChange({ transparent: event.target.checked })} /> 透明混合</label>
        <label><input type="checkbox" checked={material.wireframe} onChange={(event) => onChange({ wireframe: event.target.checked })} /> 线框</label>
      </div>
    </>
  );
}

export function InspectorPanel() {
  const { selectedNode, patchNode, deleteSelected } = useEditor();
  if (!selectedNode) {
    return <div className="empty-panel inspector-empty"><Cube /><p>选择一个节点</p><span>在目录或画布中选择对象，参数会显示在这里。</span></div>;
  }
  const node = selectedNode;
  return (
    <div className="inspector">
      <section>
        <div className="inspector-title">
          <input value={node.name} onChange={(event) => patchNode(node.id, { name: event.target.value || node.name })} aria-label="节点名称" />
          <button type="button" className={node.locked ? "is-active" : ""} onClick={() => patchNode(node.id, { locked: !node.locked })} title="锁定节点"><Lock weight={node.locked ? "fill" : "regular"} /></button>
        </div>
        <p className="node-meta"><code>{node.id}</code><span>{node.type}</span><span>{node.fidelity}</span></p>
      </section>
      <section>
        <h3>空间变换</h3>
        <VectorFields label="位置" value={node.transform.position} onChange={(position) => patchNode(node.id, { transform: { position } })} />
        <VectorFields label="旋转" value={node.transform.rotation} step={1} onChange={(rotation) => patchNode(node.id, { transform: { rotation } })} />
        <VectorFields label="缩放" value={node.transform.scale} onChange={(scale) => patchNode(node.id, { transform: { scale } })} />
      </section>
      {node.type === "mesh" && <>
        <section><h3>几何体 <span>{node.geometry.kind}</span></h3><GeometryFields geometry={node.geometry} onChange={(geometry) => patchNode(node.id, { geometry })} /></section>
        <section><h3>PBR 材质</h3><MaterialFields material={node.material} onChange={(material) => patchNode(node.id, { material })} /></section>
      </>}
      {node.type === "light" && (
        <section>
          <h3>灯光</h3>
          <label className="color-field"><span>颜色</span><div><input type="color" value={node.color} onChange={(event) => patchNode(node.id, { color: event.target.value })} /><code>{node.color}</code></div></label>
          <NumberField label="强度" value={node.intensity} onChange={(intensity) => patchNode(node.id, { intensity })} min={0} max={100} />
        </section>
      )}
      <button className="danger-button" type="button" onClick={deleteSelected}><Trash /> 删除节点</button>
    </div>
  );
}
