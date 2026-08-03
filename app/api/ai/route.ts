import { z } from "zod";
import { VIBE_3D_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { aiResultSchema, aiResponseSchema, sceneSchema } from "@/lib/scene-schema";
import { applySceneOperations } from "@/lib/scene-operations";
import { evaluateSceneQuality, repairScene } from "@/lib/scene-quality";

export const runtime = "edge";

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(12000),
  })).min(1).max(30),
  context: z.string().min(1).max(240000),
  scene: sceneSchema,
  locale: z.enum(["zh", "en"]).default("zh"),
  config: z.object({
    provider: z.enum(["openai-compatible", "anthropic"]).default("openai-compatible"),
    baseUrl: z.string().url().max(500),
    model: z.string().min(1).max(160),
    apiKey: z.string().max(500),
    temperature: z.number().min(0).max(1.5).default(0.35),
  }),
}).strict();

const outputLanguageHint = {
  zh: "请用中文返回 assistantMessage、summary 和 rationale。",
  en: "Return assistantMessage, summary, and rationale in English.",
} as const;

function localizeErrorMessage(message: string, locale: "zh" | "en") {
  if (locale === "zh") return message;
  const known: Record<string, string> = {
    "模型地址必须使用 HTTPS；本机 localhost 可使用 HTTP": "Model URL must use HTTPS; HTTP is allowed for localhost.",
    "模型没有返回 JSON 对象": "The model did not return a JSON object.",
    "模型没有返回内容": "The model returned no content.",
    "请先配置 API Key": "Configure an API key before sending a request.",
    "AI 请求失败": "The AI request failed.",
  };
  if (known[message]) return known[message];
  return message.replace(/^模型请求失败（([^）]+)）：/, "Model request failed ($1): ");
}

function safeBaseUrl(value: string) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("模型地址必须使用 HTTPS；本机 localhost 可使用 HTTP");
  }
  return url.toString().replace(/\/+$/, "");
}

function extractJson(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON 对象");
  return aiResponseSchema.parse(JSON.parse(trimmed.slice(start, end + 1)));
}

async function callOpenAiCompatible(input: z.infer<typeof requestSchema>) {
  const baseUrl = safeBaseUrl(input.config.baseUrl);
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.config.apiKey) headers.Authorization = `Bearer ${input.config.apiKey}`;
  const body = {
    model: input.config.model,
    temperature: input.config.temperature,
    messages: [
      { role: "system", content: `${VIBE_3D_SYSTEM_PROMPT}\n\n${outputLanguageHint[input.locale]}\n\n当前场景上下文：\n${input.context}` },
      ...input.messages,
    ],
    response_format: { type: "json_object" },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 500)}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型没有返回内容");
  return extractJson(content);
}

async function callAnthropic(input: z.infer<typeof requestSchema>) {
  const baseUrl = safeBaseUrl(input.config.baseUrl);
  const endpoint = baseUrl.endsWith("/messages") ? baseUrl : `${baseUrl}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.config.model,
      max_tokens: 8000,
      temperature: input.config.temperature,
      system: `${VIBE_3D_SYSTEM_PROMPT}\n\n${outputLanguageHint[input.locale]}\n\n当前场景上下文：\n${input.context}`,
      messages: input.messages,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 500)}`);
  }
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const content = payload.content?.find((item) => item.type === "text")?.text;
  if (!content) throw new Error("模型没有返回内容");
  return extractJson(content);
}

export async function POST(request: Request) {
  let locale: "zh" | "en" = "zh";
  try {
    const input = requestSchema.parse(await request.json());
    locale = input.locale;
    if (!input.config.apiKey && !safeBaseUrl(input.config.baseUrl).includes("localhost")) {
      return Response.json({ error: localizeErrorMessage("请先配置 API Key", locale) }, { status: 400 });
    }
    const result = input.config.provider === "anthropic"
      ? await callAnthropic(input)
      : await callOpenAiCompatible(input);
    const candidate = applySceneOperations(input.scene, result.operations);
    const repair = repairScene(candidate);
    const quality = evaluateSceneQuality(repair.scene);
    return Response.json(aiResultSchema.parse({
      ...result,
      quality: { ...quality, repaired: repair.operations.length > 0 },
      repairOperations: repair.operations,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";
    return Response.json({ error: localizeErrorMessage(message, locale) }, { status: 422 });
  }
}
