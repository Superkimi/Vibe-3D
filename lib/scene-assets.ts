import { z } from "zod";
import type { SceneQualityReport, VibeScene } from "./scene-schema.ts";
import { sceneSchema } from "./scene-schema.ts";

const assetId = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);

export const sceneAssetRecordSchema = z.object({
  id: assetId,
  sceneId: assetId,
  sceneName: z.string().min(1).max(160),
  version: z.number().int().min(1).max(10000),
  createdAt: z.string().datetime(),
  prompt: z.string().max(12000).optional(),
  model: z.string().max(160).optional(),
  locale: z.enum(["zh", "en"]),
  quality: z.object({
    status: z.enum(["pass", "review", "fail"]),
    score: z.number().int().min(0).max(100),
    issueCount: z.number().int().min(0).max(80),
  }).strict(),
  scene: sceneSchema,
}).strict();

export type SceneAssetRecord = z.infer<typeof sceneAssetRecordSchema>;

export function createSceneAssetRecord(
  scene: VibeScene,
  options: {
    version: number;
    locale: "zh" | "en";
    quality: SceneQualityReport;
    prompt?: string;
    model?: string;
    createdAt?: string;
  },
): SceneAssetRecord {
  const validatedScene = sceneSchema.parse(structuredClone(scene));
  const createdAt = options.createdAt ?? new Date().toISOString();
  return sceneAssetRecordSchema.parse({
    id: `asset-${validatedScene.id}-${options.version}`,
    sceneId: validatedScene.id,
    sceneName: validatedScene.name,
    version: options.version,
    createdAt,
    prompt: options.prompt?.trim() || undefined,
    model: options.model?.trim() || undefined,
    locale: options.locale,
    quality: {
      status: options.quality.status,
      score: options.quality.score,
      issueCount: options.quality.issues.length,
    },
    scene: validatedScene,
  });
}

export function upsertSceneAsset(records: SceneAssetRecord[], record: SceneAssetRecord, limit = 60): SceneAssetRecord[] {
  const next = [record, ...records.filter((item) => item.id !== record.id)];
  return next
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function parseSceneAssets(input: unknown): SceneAssetRecord[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    const parsed = sceneAssetRecordSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function filterSceneAssets(records: SceneAssetRecord[], query: string): SceneAssetRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return records;
  return records.filter((record) => [record.sceneName, record.sceneId, record.prompt ?? "", record.model ?? ""]
    .some((value) => value.toLocaleLowerCase().includes(needle)));
}
