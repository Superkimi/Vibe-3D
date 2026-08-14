import { z } from "zod";

const finite = z.number().finite();
const safeNumber = finite.min(-10000).max(10000);
const unit = finite.min(0).max(1);
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const vector3Schema = z.tuple([safeNumber, safeNumber, safeNumber]);

export const transformSchema = z.object({
  position: vector3Schema.default([0, 0, 0]),
  rotation: vector3Schema.default([0, 0, 0]),
  scale: z.tuple([finite.min(0.001).max(1000), finite.min(0.001).max(1000), finite.min(0.001).max(1000)]).default([1, 1, 1]),
}).strict();

const boxGeometry = z.object({
  kind: z.literal("box"),
  width: finite.min(0.01).max(1000).default(1),
  height: finite.min(0.01).max(1000).default(1),
  depth: finite.min(0.01).max(1000).default(1),
  bevel: finite.min(0).max(1).default(0),
}).strict();

const sphereGeometry = z.object({
  kind: z.literal("sphere"),
  radius: finite.min(0.01).max(1000).default(0.5),
  widthSegments: z.number().int().min(8).max(128).default(48),
  heightSegments: z.number().int().min(6).max(128).default(32),
}).strict();

const cylinderGeometry = z.object({
  kind: z.literal("cylinder"),
  radiusTop: finite.min(0).max(1000).default(0.5),
  radiusBottom: finite.min(0.01).max(1000).default(0.5),
  height: finite.min(0.01).max(1000).default(1),
  radialSegments: z.number().int().min(3).max(128).default(48),
  openEnded: z.boolean().default(false),
}).strict();

const coneGeometry = z.object({
  kind: z.literal("cone"),
  radius: finite.min(0.01).max(1000).default(0.5),
  height: finite.min(0.01).max(1000).default(1),
  radialSegments: z.number().int().min(3).max(128).default(48),
}).strict();

const torusGeometry = z.object({
  kind: z.literal("torus"),
  radius: finite.min(0.01).max(1000).default(0.6),
  tube: finite.min(0.005).max(1000).default(0.16),
  radialSegments: z.number().int().min(3).max(64).default(24),
  tubularSegments: z.number().int().min(8).max(256).default(72),
}).strict();

const capsuleGeometry = z.object({
  kind: z.literal("capsule"),
  radius: finite.min(0.01).max(1000).default(0.35),
  length: finite.min(0.01).max(1000).default(0.8),
  capSegments: z.number().int().min(2).max(32).default(12),
  radialSegments: z.number().int().min(3).max(64).default(24),
}).strict();

const planeGeometry = z.object({
  kind: z.literal("plane"),
  width: finite.min(0.01).max(1000).default(1),
  height: finite.min(0.01).max(1000).default(1),
}).strict();

export const geometrySchema = z.discriminatedUnion("kind", [
  boxGeometry,
  sphereGeometry,
  cylinderGeometry,
  coneGeometry,
  torusGeometry,
  capsuleGeometry,
  planeGeometry,
]);

export const materialSchema = z.object({
  color: hex.default("#a78bfa"),
  metalness: unit.default(0.15),
  roughness: unit.default(0.38),
  opacity: unit.default(1),
  transparent: z.boolean().default(false),
  wireframe: z.boolean().default(false),
  emissive: hex.default("#000000"),
  emissiveIntensity: finite.min(0).max(20).default(0),
  clearcoat: unit.default(0.12),
  clearcoatRoughness: unit.default(0.22),
}).strict();

const nodeBase = {
  id,
  name: z.string().min(1).max(120),
  parentId: id.nullable().default(null),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  transform: transformSchema,
  fidelity: z.enum(["macro", "meso", "micro"]).default("macro"),
};

export const meshNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("mesh"),
  geometry: geometrySchema,
  material: materialSchema,
  castShadow: z.boolean().default(true),
  receiveShadow: z.boolean().default(true),
}).strict();

export const groupNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("group"),
}).strict();

export const lightNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("light"),
  lightKind: z.enum(["ambient", "directional", "point", "spot"]),
  color: hex.default("#ffffff"),
  intensity: finite.min(0).max(100).default(2),
  distance: finite.min(0).max(10000).default(0),
  angle: finite.min(0.01).max(Math.PI / 2).default(Math.PI / 6),
  penumbra: unit.default(0.2),
  castShadow: z.boolean().default(true),
}).strict();

export const sceneNodeSchema = z.discriminatedUnion("type", [
  meshNodeSchema,
  groupNodeSchema,
  lightNodeSchema,
]);

export const sceneSchema = z.object({
  format: z.literal("vibe-3d/1"),
  version: z.literal(1),
  id,
  name: z.string().min(1).max(160),
  unit: z.enum(["m", "cm", "mm"]).default("m"),
  background: hex.default("#111014"),
  environment: z.enum(["studio", "city", "warehouse", "sunset", "none"]).default("studio"),
  nodes: z.array(sceneNodeSchema).max(400),
  quality: z.object({
    target: z.enum(["draft", "balanced", "production"]).default("balanced"),
    notes: z.array(z.string().max(240)).max(20).default([]),
  }).strict(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const qualityIssueSchema = z.object({
  code: z.string().min(1).max(80),
  severity: z.enum(["error", "warning", "info"]),
  nodeRefs: z.array(z.string().min(1).max(120)).max(20).default([]),
}).strict();

export const sceneQualityReportSchema = z.object({
  status: z.enum(["pass", "review", "fail"]),
  score: z.number().int().min(0).max(100),
  issues: z.array(qualityIssueSchema).max(80),
  repaired: z.boolean().default(false),
}).strict();

export const sceneWorkflowStepSchema = z.object({
  id,
  kind: z.enum(["inspect", "generate", "edit", "repair", "optimize", "export"]),
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(240),
  nodeRefs: z.array(z.string().min(1).max(120)).max(40).default([]),
  operationCount: z.number().int().min(0).max(80).default(0),
}).strict();

export const sceneWorkflowPlanSchema = z.object({
  id,
  title: z.string().min(1).max(160),
  goal: z.string().min(1).max(240),
  steps: z.array(sceneWorkflowStepSchema).min(1).max(12),
  requiresConfirmation: z.boolean().default(true),
}).strict();

const transformPatchSchema = z.object({
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: z.tuple([
    finite.min(0.001).max(1000),
    finite.min(0.001).max(1000),
    finite.min(0.001).max(1000),
  ]).optional(),
}).strict();

const materialPatchSchema = z.object({
  color: hex.optional(),
  metalness: unit.optional(),
  roughness: unit.optional(),
  opacity: unit.optional(),
  transparent: z.boolean().optional(),
  wireframe: z.boolean().optional(),
  emissive: hex.optional(),
  emissiveIntensity: finite.min(0).max(20).optional(),
  clearcoat: unit.optional(),
  clearcoatRoughness: unit.optional(),
}).strict();

const nodePatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: id.nullable().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  transform: transformPatchSchema.optional(),
  fidelity: z.enum(["macro", "meso", "micro"]).optional(),
  geometry: geometrySchema.optional(),
  material: materialPatchSchema.optional(),
  castShadow: z.boolean().optional(),
  receiveShadow: z.boolean().optional(),
  color: hex.optional(),
  intensity: finite.min(0).max(100).optional(),
  distance: finite.min(0).max(10000).optional(),
  angle: finite.min(0.01).max(Math.PI / 2).optional(),
  penumbra: unit.optional(),
}).strict();

export const sceneOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_scene"), scene: sceneSchema }).strict(),
  z.object({ op: z.literal("patch_scene"), patch: z.object({
    name: z.string().min(1).max(160).optional(),
    unit: z.enum(["m", "cm", "mm"]).optional(),
    background: hex.optional(),
    environment: z.enum(["studio", "city", "warehouse", "sunset", "none"]).optional(),
    quality: sceneSchema.shape.quality.partial().optional(),
  }).strict() }).strict(),
  z.object({ op: z.literal("add_node"), node: sceneNodeSchema }).strict(),
  z.object({ op: z.literal("patch_node"), nodeId: id, patch: nodePatchSchema }).strict(),
  z.object({ op: z.literal("delete_node"), nodeId: id }).strict(),
  z.object({ op: z.literal("duplicate_node"), nodeId: id, newId: id, name: z.string().min(1).max(120) }).strict(),
]);

export const aiResponseSchema = z.object({
  assistantMessage: z.string().min(1).max(3000),
  summary: z.string().min(1).max(240),
  rationale: z.array(z.string().min(1).max(240)).max(8).default([]),
  operations: z.array(sceneOperationSchema).min(1).max(80),
}).strict();

export const aiResultSchema = aiResponseSchema.extend({
  quality: sceneQualityReportSchema,
  repairOperations: z.array(sceneOperationSchema).max(20).default([]),
  workflowPlan: sceneWorkflowPlanSchema,
}).strict();

export type Vector3Tuple = z.infer<typeof vector3Schema>;
export type Transform = z.infer<typeof transformSchema>;
export type GeometrySpec = z.infer<typeof geometrySchema>;
export type MaterialSpec = z.infer<typeof materialSchema>;
export type MeshNode = z.infer<typeof meshNodeSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type VibeScene = z.infer<typeof sceneSchema>;
export type SceneOperation = z.infer<typeof sceneOperationSchema>;
export type AiSceneResponse = z.infer<typeof aiResponseSchema>;
export type QualityIssue = z.infer<typeof qualityIssueSchema>;
export type SceneQualityReport = z.infer<typeof sceneQualityReportSchema>;
export type SceneWorkflowStep = z.infer<typeof sceneWorkflowStepSchema>;
export type SceneWorkflowPlan = z.infer<typeof sceneWorkflowPlanSchema>;
export type AiResult = z.infer<typeof aiResultSchema>;
