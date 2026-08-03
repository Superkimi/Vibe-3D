"use client";

import { Cube, Lock, Trash } from "@phosphor-icons/react";
import type { GeometrySpec, MaterialSpec, Vector3Tuple } from "@/lib/scene-schema";
import { getGeometryDefinition, getNodeDefinition } from "@/lib/node-definitions";
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
  const { t } = useEditor();
  const definition = getGeometryDefinition(geometry.kind);
  const update = (key: string, value: number | boolean) => onChange({ ...geometry, [key]: value } as GeometrySpec);
  return (
    <div className="field-grid">
      {definition.fields.map((field) => {
        const value = geometry[field.key as keyof GeometrySpec];
        if (field.kind === "boolean") {
          return (
            <label className="geometry-toggle" key={field.key}>
              <input type="checkbox" checked={Boolean(value)} onChange={(event) => update(field.key, event.target.checked)} />
              <span>{t(field.labelKey)}</span>
            </label>
          );
        }
        return (
          <NumberField
            key={field.key}
            label={t(field.labelKey)}
            value={typeof value === "number" ? value : 0}
            onChange={(next) => update(field.key, field.integer ? Math.round(next) : next)}
            step={field.step ?? 0.01}
            min={field.min}
            max={field.max}
          />
        );
      })}
    </div>
  );
}

function MaterialFields({ material, onChange }: { material: MaterialSpec; onChange(patch: Partial<MaterialSpec>): void }) {
  const { t } = useEditor();
  return (
    <>
      <label className="color-field"><span>{t("inspector.baseColor")}</span><div><input type="color" value={material.color} onChange={(event) => onChange({ color: event.target.value })} /><code>{material.color}</code></div></label>
      <div className="slider-list">
        {([
          [t("inspector.metalness"), "metalness"], [t("inspector.roughness"), "roughness"], [t("inspector.opacity"), "opacity"],
          [t("inspector.clearcoat"), "clearcoat"], [t("inspector.clearcoatRoughness"), "clearcoatRoughness"],
        ] as const).map(([label, key]) => (
          <label key={key}><span>{label}<output>{material[key].toFixed(2)}</output></span>
            <input type="range" min="0" max="1" step="0.01" value={material[key]} onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
          </label>
        ))}
      </div>
      <div className="toggle-row">
        <label><input type="checkbox" checked={material.transparent} onChange={(event) => onChange({ transparent: event.target.checked })} /> {t("inspector.transparent")}</label>
        <label><input type="checkbox" checked={material.wireframe} onChange={(event) => onChange({ wireframe: event.target.checked })} /> {t("inspector.wireframe")}</label>
      </div>
    </>
  );
}

export function InspectorPanel() {
  const { selectedNode, patchNode, deleteSelected, t } = useEditor();
  if (!selectedNode) {
    return <div className="empty-panel inspector-empty"><Cube /><p>{t("inspector.selectNode")}</p><span>{t("inspector.selectNodeCopy")}</span></div>;
  }
  const node = selectedNode;
  const definition = getNodeDefinition(node.type);
  return (
    <div className="inspector">
      <section>
        <div className="inspector-title">
          <input value={node.name} onChange={(event) => patchNode(node.id, { name: event.target.value || node.name })} aria-label={t("inspector.nodeName")} />
          <button type="button" className={node.locked ? "is-active" : ""} onClick={() => patchNode(node.id, { locked: !node.locked })} title={node.locked ? t("inspector.unlock") : t("inspector.lock")}><Lock weight={node.locked ? "fill" : "regular"} /></button>
        </div>
        <p className="node-meta"><code>node:{node.id}</code><span>{t(definition.labelKey)}</span><span>{node.fidelity}</span></p>
      </section>
      <section>
        <h3>{t("inspector.transform")}</h3>
        <VectorFields label={t("inspector.position")} value={node.transform.position} onChange={(position) => patchNode(node.id, { transform: { position } })} />
        <VectorFields label={t("inspector.rotation")} value={node.transform.rotation} step={1} onChange={(rotation) => patchNode(node.id, { transform: { rotation } })} />
        <VectorFields label={t("inspector.scale")} value={node.transform.scale} onChange={(scale) => patchNode(node.id, { transform: { scale } })} />
      </section>
      {node.type === "mesh" && <>
        <section><h3>{t("inspector.geometry")} <span>{node.geometry.kind}</span></h3><GeometryFields geometry={node.geometry} onChange={(geometry) => patchNode(node.id, { geometry })} /></section>
        <section><h3>{t("inspector.material")}</h3><MaterialFields material={node.material} onChange={(material) => patchNode(node.id, { material })} /></section>
      </>}
      {node.type === "light" && (
        <section>
          <h3>{t("inspector.light")}</h3>
          <label className="color-field"><span>{t("inspector.color")}</span><div><input type="color" value={node.color} onChange={(event) => patchNode(node.id, { color: event.target.value })} /><code>{node.color}</code></div></label>
          <NumberField label={t("inspector.intensity")} value={node.intensity} onChange={(intensity) => patchNode(node.id, { intensity })} min={0} max={100} />
        </section>
      )}
      <button className="danger-button" type="button" onClick={deleteSelected}><Trash /> {t("inspector.delete")}</button>
    </div>
  );
}
