# Vibe 3D

Vibe 3D is a schema-first, AI-native 3D modeling studio for the browser. A scene can be edited from the canvas, the parameter inspector, live JSON, or natural-language conversation. Every path writes to the same validated `VibeScene` document.

**Live product:** [aihubhub.com/vibe-3d](https://aihubhub.com/vibe-3d)

## Product surface

- Browser-native Three.js viewport with orbit and transform controls
- Scene directory with hierarchy, search, visibility, locking, and primitive creation
- Numeric transforms, geometry parameters, PBR materials, and lighting controls
- AI conversation using OpenAI-compatible or Anthropic Messages endpoints
- Strict AI operation schema with integrity checks, preview/confirm, undo, redo, and local autosave
- Stable `node:<id>` references, explainable scene diffs, quality scoring, safe auto-repair, and deterministic bilingual prompt benchmarks
- Live `VibeScene` JSON editor with round-trip validation
- GLB, OBJ, STL, editable JSON, and PNG export
- Responsive product launch page with Open Graph artwork

## Architecture

```text
Canvas gestures ─┐
Inspector edits ─┼─> Scene operations ─> Zod validation ─> VibeScene JSON
Live JSON ───────┤                              │
AI conversation ┘                              ├─> Three.js renderer
                                                ├─> undo / redo / autosave
                                                └─> GLB / OBJ / STL / PNG
```

The AI never mutates Three.js objects directly. It returns small operations such as `patch_node`, `add_node`, or `replace_scene`. `applySceneOperations()` validates IDs, parent references, hierarchy cycles, transforms, geometry limits, and material ranges before the renderer receives a new scene.

Every AI response is shown as a preview first. The editor computes a stable-reference diff, runs the scene quality gate, and applies only safe deterministic repairs (for example, fixing an inconsistent transparent-material flag or adding a named key light). The change becomes one undoable history entry only after the user confirms it. `SCENE_BENCHMARKS` provides reproducible Chinese/English prompt fixtures for the macro silhouette, meso detail, stable-reference edit, and quality-repair paths.

This is informed by the staged ideas in [img2threejs](https://github.com/img2threejs/img2threejs): establish the macro silhouette, add meso structure, finish with micro details, and keep every change traceable. Vibe 3D adapts that offline pipeline into an interactive browser editor.

## AI model configuration

The settings dialog includes presets for OpenAI, OpenRouter, DeepSeek, Anthropic, and local OpenAI-compatible servers. Custom base URLs and model names are supported.

- A non-local base URL must use HTTPS.
- Keys are never logged or returned by the proxy.
- By default the key is held for the browser session only.
- “Remember Key” is an explicit device-local opt-in.
- The server proxy validates every model response again before returning it.

## Development

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The local app runs at `http://localhost:3000`.

## Main files

- `lib/scene-schema.ts`: VibeScene, node, geometry, material, and AI operation contracts
- `lib/scene-operations.ts`: deterministic scene mutation and integrity gates
- `lib/ai-system-prompt.ts`: modeling discipline and structured response contract
- `app/api/ai/route.ts`: provider adapter and response validation
- `components/editor/SceneViewport.tsx`: Three.js renderer and exporters
- `components/editor/ModelingStudio.tsx`: editor state, history, autosave, and import/export

## License

MIT
