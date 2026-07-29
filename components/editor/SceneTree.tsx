"use client";

import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  Cube,
  Eye,
  EyeSlash,
  Folder,
  Lightbulb,
  Lock,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import type { SceneNode } from "@/lib/scene-schema";
import { useEditor } from "./EditorContext";

const primitiveLabels = {
  box: "立方体",
  sphere: "球体",
  cylinder: "圆柱",
  cone: "圆锥",
  torus: "圆环",
  capsule: "胶囊",
  plane: "平面",
} as const;

function NodeIcon({ node }: { node: SceneNode }) {
  if (node.type === "group") return <Folder weight="fill" />;
  if (node.type === "light") return <Lightbulb weight="fill" />;
  return <Cube weight="fill" />;
}

export function SceneTree() {
  const { scene, selectedNodeId, selectNode, patchNode, addPrimitive, addGroup } = useEditor();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(scene.nodes.filter((node) => node.type === "group").map((node) => node.id)));
  const [addOpen, setAddOpen] = useState(false);

  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return scene.nodes;
    return scene.nodes.filter((node) => node.name.toLowerCase().includes(normalized) || node.id.toLowerCase().includes(normalized));
  }, [query, scene.nodes]);

  function renderNode(node: SceneNode, depth = 0): React.ReactNode {
    const children = visibleNodes.filter((item) => item.parentId === node.id);
    const hasChildren = children.length > 0;
    const open = expanded.has(node.id) || Boolean(query);
    return (
      <div key={node.id}>
        <div
          className={`tree-row ${selectedNodeId === node.id ? "is-selected" : ""}`}
          style={{ paddingLeft: 10 + depth * 15 }}
          onClick={() => selectNode(node.id)}
        >
          <button
            className="tree-caret"
            type="button"
            aria-label={open ? "折叠" : "展开"}
            disabled={!hasChildren}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                return next;
              });
            }}
          >
            {hasChildren ? (open ? <CaretDown /> : <CaretRight />) : null}
          </button>
          <NodeIcon node={node} />
          <span title={node.name}>{node.name}</span>
          {node.locked && <Lock className="tree-state" weight="fill" />}
          <button
            className="tree-visibility"
            type="button"
            aria-label={node.visible ? "隐藏节点" : "显示节点"}
            onClick={(event) => {
              event.stopPropagation();
              patchNode(node.id, { visible: !node.visible });
            }}
          >
            {node.visible ? <Eye /> : <EyeSlash />}
          </button>
        </div>
        {open && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const roots = visibleNodes.filter((node) => !node.parentId || !visibleNodes.some((item) => item.id === node.parentId));

  return (
    <aside className="scene-tree">
      <header className="panel-heading">
        <div><b>场景目录</b><span>{scene.nodes.length}</span></div>
        <button type="button" aria-label="添加节点" onClick={() => setAddOpen((value) => !value)}><Plus /></button>
      </header>
      {addOpen && (
        <div className="add-popover">
          <button type="button" onClick={() => { addGroup(); setAddOpen(false); }}><Folder /> 组</button>
          {(Object.keys(primitiveLabels) as Array<keyof typeof primitiveLabels>).map((kind) => (
            <button type="button" key={kind} onClick={() => { addPrimitive(kind); setAddOpen(false); }}>
              <Cube /> {primitiveLabels[kind]}
            </button>
          ))}
        </div>
      )}
      <label className="tree-search">
        <MagnifyingGlass />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" aria-label="搜索场景节点" />
      </label>
      <div className="tree-content">
        {roots.length ? roots.map((node) => renderNode(node)) : (
          <div className="empty-panel"><Cube /><p>没有匹配的节点</p><span>换个关键词，或添加一个基础体。</span></div>
        )}
      </div>
      <footer className="tree-footer"><span>VibeScene</span><code>v1</code></footer>
    </aside>
  );
}
