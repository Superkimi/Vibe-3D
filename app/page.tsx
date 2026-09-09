import Link from "next/link";
import {
  ArrowRight,
  BracketsCurly,
  ChatCircleDots,
  Cube,
  Export,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";

const capabilities = [
  { icon: ChatCircleDots, title: "说出形状，也说出修改", copy: "AI 只提出结构化操作，先预览、再确认；过期结果不会覆盖当前场景。" },
  { icon: SlidersHorizontal, title: "每个参数仍在你手里", copy: "树状目录、空间变换、PBR 材质、灯光与吸附都可以人工精调。" },
  { icon: BracketsCurly, title: "代码就是模型", copy: "VibeScene JSON 是唯一事实源。错误草稿不会污染场景，每次改动都可撤销。" },
  { icon: Export, title: "带走标准资产", copy: "导出 GLB（米）、OBJ（场景单位）、STL（毫米）、JSON 或透明 PNG。" },
];

const proofPoints = [
  { value: "VibeScene", label: "结构化场景" },
  { value: "预览 → 确认", label: "可审阅修改" },
  { value: "IndexedDB", label: "本地项目版本" },
  { value: "GLB · OBJ · STL", label: "标准资产导出" },
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="主导航">
        <Link href="/" className="brand-lockup" aria-label="Vibe 3D 首页">
          <span className="brand-mark"><Cube weight="fill" /></span><b>Vibe 3D</b>
        </Link>
        <div className="landing-nav-links">
          <a href="#workflow">工作方式</a><a href="#schema">VibeScene</a>
          <a href="https://github.com/Superkimi/Vibe-3D" target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <Link href="/studio" className="nav-cta">打开工作台 <ArrowRight /></Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">AI-NATIVE SPATIAL STUDIO</p>
          <h1>像聊天一样塑造三维。</h1>
          <p>让一句想法变成可编辑、可审阅、可导出的 3D 模型。</p>
          <div className="hero-actions">
            <Link href="/studio" className="primary-cta">开始建模 <ArrowRight weight="bold" /></Link>
            <a href="#workflow" className="secondary-cta">了解工作流</a>
          </div>
          <div className="hero-proof" aria-label="Vibe 3D 能力摘要">
            {proofPoints.map(({ value, label }) => (
              <div key={label}><strong>{value}</strong><span>{label}</span></div>
            ))}
          </div>
        </div>
        <div className="hero-product" aria-label="Vibe 3D 产品界面预览">
          <div className="product-topline"><span><i /> Product form study</span><span>已保存</span></div>
          <div className="product-layout">
            <div className="mock-tree">
              <b>场景</b><span className="active">◆ Body shell</span><span>◇ Control ring</span>
              <span>◇ Lens glass</span><span>⌁ Studio light</span>
            </div>
            <div className="mock-viewport">
              <div className="orbit orbit-a" /><div className="orbit orbit-b" />
              <div className="model-core"><div className="model-lens" /><div className="model-ring" /></div>
              <div className="axis-lines" /><small>Perspective · 60 fps</small>
            </div>
            <div className="mock-ai">
              <b>Vibe AI</b>
              <div className="ai-bubble">把机身做得更紧凑，镜头环改成拉丝金属。</div>
              <div className="ai-result">已更新 3 个节点<br /><span>轮廓、比例与材质已校验</span></div>
              <div className="ai-input">继续描述修改 <ArrowRight /></div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="capability-section">
        <h2>从想法到可交付资产</h2>
        <p className="section-intro">在画布里拖动，在右侧输入数值，或直接告诉 AI。每次变化都落到同一份可校验 schema。</p>
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, title, copy }, index) => (
            <article key={title} className={index === 2 ? "is-accent" : ""}>
              <Icon size={26} /><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="schema" className="schema-story">
        <div className="schema-copy">
          <h2>不是一次性的 AI 网格。</h2>
          <p>Vibe 3D 让 AI 生成结构化的节点、变换与材质。每轮修改可撤销、可比较，还能通过“检查与优化”确认几何预算和材质状态。</p>
          <Link href="/studio">查看实时 schema <ArrowRight /></Link>
        </div>
        <pre className="schema-code" aria-label="VibeScene JSON 示例"><code>{`{
  "format": "vibe-3d/1",
  "name": "Orbit camera",
  "nodes": [{
    "type": "mesh",
    "geometry": { "kind": "cylinder" },
    "material": {
      "metalness": 0.82,
      "roughness": 0.24
    }
  }]
}`}</code></pre>
      </section>

      <section className="final-cta">
        <div className="cta-object"><span /><span /><span /></div>
        <h2>从一句话，进入三维。</h2><p>打开即用。模型与 API Key 由你选择。</p>
        <Link href="/studio" className="primary-cta">创建第一个模型 <ArrowRight weight="bold" /></Link>
      </section>

      <footer className="landing-footer">
        <Link href="/" className="brand-lockup"><span className="brand-mark"><Cube weight="fill" /></span><b>Vibe 3D</b></Link>
        <p>Schema-first 3D creation for the browser.</p>
        <a href="https://github.com/Superkimi/Vibe-3D" target="_blank" rel="noreferrer">开放源代码</a>
      </footer>
    </main>
  );
}
