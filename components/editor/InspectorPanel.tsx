"use client";

import { useEffect, useState } from "react";
import { Copy, Cube, Folder, Lock, Trash } from "@phosphor-icons/react";
import type { GeometrySpec, MaterialSpec, Vector3Tuple, VibeScene } from "@/lib/scene-schema";
import { getGeometryDefinition, getNodeDefinition } from "@/lib/node-definitions";
import { type SceneCommitResult, useEditor } from "./EditorContext";

function formatNumber(value: number) {
  return Number(value.toFixed(4)).toString();
}

function isNodeLocked(scene: VibeScene, nodeId: string) {
  const byId = new Map(scene.nodes.map((item) => [item.id, item]));
  let current = byId.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.locked) return true;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

function NumericInput({
  value,
  onCommit,
  ariaLabel,
  step = 0.01,
  min,
  max,
  integer = false,
  disabled = false,
}: {
  value: number;
  onCommit(value: number): void | SceneCommitResult;
  ariaLabel?: string;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  disabled?: boolean;
}) {
  const { t } = useEditor();
  const [draft, setDraft] = useState(formatNumber(value));
  const [error, setError] = useState("");

  useEffect(() => {
    // Keep the local draft aligned with committed scene changes (undo, redo, selection).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(formatNumber(value));
    setError("");
  }, [value]);

  function commitDraft() {
    if (disabled) return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setError(t("editor.invalidNumber"));
      return;
    }
    if (min !== undefined && parsed < min) {
      setError(t("editor.valueTooSmall", { value: min }));
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(t("editor.valueTooLarge", { value: max }));
      return;
    }
    const normalized = integer ? Math.round(parsed) : parsed;
    const result = onCommit(normalized);
    if (result && !result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setDraft(formatNumber(normalized));
  }

  return (
    <span className={`numeric-input ${error ? "is-invalid" : ""}`}>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        title={error || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(formatNumber(value));
            setError("");
            event.currentTarget.blur();
          }
        }}
      />
      {error && <small>{error}</small>}
    </span>
  );
}

function NumberField({ label, value, onChange, step = 0.01, min, max, integer, disabled }: {
  label: string;
  value: number;
  onChange(value: number): void | SceneCommitResult;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`number-field ${disabled ? "is-disabled" : ""}`}>
      <span>{label}</span>
      <NumericInput value={value} onCommit={onChange} step={step} min={min} max={max} integer={integer} disabled={disabled} />
    </label>
  );
}

function VectorFields({ label, value, onChange, step = 0.01, min, max, disabled }: {
  label: string;
  value: Vector3Tuple;
  onChange(value: Vector3Tuple): void | SceneCommitResult;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div className="vector-block">
      <span>{label}</span>
      <div>
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label key={axis} className={disabled ? "is-disabled" : ""}>
            <i>{axis}</i>
            <NumericInput
              ariaLabel={axis}
              value={value[index]}
              step={step}
              min={min}
              max={max}
              disabled={disabled}
              onCommit={(next) => {
                const updated = [...value] as Vector3Tuple;
                updated[index] = next;
                return onChange(updated);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function GeometryFields({ geometry, onChange, disabled }: { geometry: GeometrySpec; onChange(value: GeometrySpec): void | SceneCommitResult; disabled: boolean }) {
  const { t } = useEditor();
  const definition = getGeometryDefinition(geometry.kind);
  const update = (key: string, value: number | boolean) => onChange({ ...geometry, [key]: value } as GeometrySpec);
  return (
    <div className="field-grid">
      {definition.fields.map((field) => {
        const value = geometry[field.key as keyof GeometrySpec];
        if (field.kind === "boolean") {
          return (
            <label className={`geometry-toggle ${disabled ? "is-disabled" : ""}`} key={field.key}>
              <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => update(field.key, event.target.checked)} />
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
            max={field.max ?? 1000}
            integer={field.integer}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}

type MaterialSliderKey = "metalness" | "roughness" | "opacity" | "clearcoat" | "clearcoatRoughness";

function MaterialFields({ material, onChange, disabled }: { material: MaterialSpec; onChange(patch: Partial<MaterialSpec>): void | SceneCommitResult; disabled: boolean }) {
  const { t } = useEditor();
  const [draft, setDraft] = useState(material);

  useEffect(() => {
    // Sliders keep a local draft while dragging; resync it after an external scene change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(material);
  }, [material]);

  function commitSlider(key: MaterialSliderKey) {
    if (disabled || draft[key] === material[key]) return;
    onChange({ [key]: draft[key] });
  }

  return (
    <>
      <label className={`color-field ${disabled ? "is-disabled" : ""}`}>
        <span>{t("inspector.baseColor")}</span>
        <div><input type="color" value={material.color} disabled={disabled} onChange={(event) => onChange({ color: event.target.value })} /><code>{material.color}</code></div>
      </label>
      <div className="slider-list">
        {([
          [t("inspector.metalness"), "metalness"], [t("inspector.roughness"), "roughness"], [t("inspector.opacity"), "opacity"],
          [t("inspector.clearcoat"), "clearcoat"], [t("inspector.clearcoatRoughness"), "clearcoatRoughness"],
        ] as const).map(([label, key]) => (
          <label key={key} className={disabled ? "is-disabled" : ""}>
            <span>{label}<output>{draft[key].toFixed(2)}</output></span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              disabled={disabled}
              value={draft[key]}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))}
              onPointerUp={() => commitSlider(key)}
              onKeyUp={() => commitSlider(key)}
              onBlur={() => commitSlider(key)}
            />
          </label>
        ))}
      </div>
      <div className="toggle-row">
        <label className={disabled ? "is-disabled" : ""}><input type="checkbox" checked={material.transparent} disabled={disabled} onChange={(event) => onChange({ transparent: event.target.checked })} /> {t("inspector.transparent")}</label>
        <label className={disabled ? "is-disabled" : ""}><input type="checkbox" checked={material.wireframe} disabled={disabled} onChange={(event) => onChange({ wireframe: event.target.checked })} /> {t("inspector.wireframe")}</label>
      </div>
    </>
  );
}

export function InspectorPanel() {
  const { scene, selectedNode, selectedNodeIds, patchNode, reparentNode, groupSelected, ungroupSelected, duplicateSelected, deleteSelected, t } = useEditor();
  if (!selectedNode) {
    return <div className="empty-panel inspector-empty"><Cube /><p>{selectedNodeIds.length > 1 ? t("inspector.multiSelect") : t("inspector.selectNode")}</p><span>{selectedNodeIds.length > 1 ? t("inspector.multiSelectCopy") : t("inspector.selectNodeCopy")}</span>{selectedNodeIds.length > 1 && <button type="button" className="secondary-button inspector-group-action" onClick={groupSelected}><Folder /> {t("inspector.groupSelected")}</button>}</div>;
  }
  const node = selectedNode;
  const definition = getNodeDefinition(node.type);
  const disabled = isNodeLocked(scene, node.id);
  const descendantIds = new Set<string>();
  const pendingDescendants = [node.id];
  while (pendingDescendants.length) {
    const parentId = pendingDescendants.pop();
    for (const candidate of scene.nodes) {
      if (candidate.parentId === parentId && !descendantIds.has(candidate.id)) {
        descendantIds.add(candidate.id);
        pendingDescendants.push(candidate.id);
      }
    }
  }
  return (
    <div className="inspector">
      <section>
        <div className="inspector-title">
          <input value={node.name} disabled={disabled} onChange={(event) => patchNode(node.id, { name: event.target.value || node.name })} aria-label={t("inspector.nodeName")} />
          <button type="button" className={node.locked ? "is-active" : ""} disabled={disabled && !node.locked} onClick={() => patchNode(node.id, { locked: !node.locked })} title={node.locked ? t("inspector.unlock") : t("inspector.lock")} aria-label={node.locked ? t("inspector.unlock") : t("inspector.lock")}><Lock weight={node.locked ? "fill" : "regular"} /></button>
        </div>
        <p className="node-meta"><code>node:{node.id}</code><span>{t(definition.labelKey)}</span><span>{node.fidelity}</span></p>
      </section>
      <section>
        <h3>{t("inspector.transform")} <code className="unit-badge">{scene.unit}</code></h3>
        <label className={`parent-field ${disabled ? "is-disabled" : ""}`}>
          <span>{t("inspector.parent")}</span>
          <select
            value={node.parentId ?? ""}
            disabled={disabled}
            onChange={(event) => { reparentNode(node.id, event.target.value || null); }}
          >
            <option value="">{t("inspector.root")}</option>
            {scene.nodes.filter((candidate) => candidate.type === "group" && candidate.id !== node.id && !descendantIds.has(candidate.id)).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>
        <VectorFields label={t("inspector.position")} value={node.transform.position} min={-10000} max={10000} disabled={disabled} onChange={(position) => patchNode(node.id, { transform: { position } })} />
        <VectorFields label={t("inspector.rotation")} value={node.transform.rotation} min={-10000} max={10000} step={1} disabled={disabled} onChange={(rotation) => patchNode(node.id, { transform: { rotation } })} />
        <VectorFields label={t("inspector.scale")} value={node.transform.scale} min={0.001} max={1000} disabled={disabled} onChange={(scale) => patchNode(node.id, { transform: { scale } })} />
      </section>
      {node.type === "mesh" && <>
        <section><h3>{t("inspector.geometry")} <span>{node.geometry.kind}</span></h3><GeometryFields geometry={node.geometry} disabled={disabled} onChange={(geometry) => patchNode(node.id, { geometry })} /></section>
        <section><h3>{t("inspector.material")}</h3><MaterialFields material={node.material} disabled={disabled} onChange={(material) => patchNode(node.id, { material })} /></section>
      </>}
      {node.type === "light" && (
        <section>
          <h3>{t("inspector.light")}</h3>
          <label className={`color-field ${disabled ? "is-disabled" : ""}`}><span>{t("inspector.color")}</span><div><input type="color" value={node.color} disabled={disabled} onChange={(event) => patchNode(node.id, { color: event.target.value })} /><code>{node.color}</code></div></label>
          <NumberField label={t("inspector.intensity")} value={node.intensity} onChange={(intensity) => patchNode(node.id, { intensity })} min={0} max={100} disabled={disabled} />
          {(node.lightKind === "point" || node.lightKind === "spot") && <NumberField label={t("inspector.distance")} value={node.distance} onChange={(distance) => patchNode(node.id, { distance })} min={0} max={10000} disabled={disabled} />}
          {node.lightKind === "spot" && <>
            <NumberField label={t("inspector.spotAngle")} value={node.angle * 180 / Math.PI} onChange={(angle) => patchNode(node.id, { angle: angle * Math.PI / 180 })} min={0.6} max={90} step={0.1} disabled={disabled} />
            <NumberField label={t("inspector.penumbra")} value={node.penumbra} onChange={(penumbra) => patchNode(node.id, { penumbra })} min={0} max={1} disabled={disabled} />
          </>}
          <label className={`geometry-toggle ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={node.castShadow} disabled={disabled} onChange={(event) => patchNode(node.id, { castShadow: event.target.checked })} /> <span>{t("inspector.castShadow")}</span></label>
        </section>
      )}
      <div className="inspector-actions">
        {node.type === "group" && <button className="secondary-button" type="button" disabled={disabled || [...descendantIds].some((id) => scene.nodes.find((candidate) => candidate.id === id)?.locked)} onClick={ungroupSelected}><Folder /> {t("inspector.ungroup")}</button>}
        <button className="secondary-button" type="button" disabled={disabled} onClick={duplicateSelected}><Copy /> {t("inspector.duplicate")}</button>
        <button className="danger-button" type="button" disabled={disabled} onClick={deleteSelected}><Trash /> {t("inspector.delete")}</button>
      </div>
    </div>
  );
}
