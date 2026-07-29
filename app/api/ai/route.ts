import { z } from "zod";
import { VIBE_3D_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { aiResponseSchema } from "@/lib/scene-schema";

export const runtime = "edge";

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(12000),
  })).min(1).max(30),
  context: z.string().min(1).max(240000),
  config: z.object({
    provider: z.enum(["openai-compatible", "anthropic"]).default("openai-compatible"),
    baseUrl: z.string().url().max(500),
    model: z.string().min(1).max(160),
    apiKey: z.string().max(500),
    temperature: z.number().min(0).max(1.5).default(0.35),
  }),
}).strict();

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
      { role: "system", content: `${VIBE_3D_SYSTEM_PROMPT}\n\n当前场景上下文：\n${input.context}` },
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
      system: `${VIBE_3D_SYSTEM_PROMPT}\n\n当前场景上下文：\n${input.context}`,
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
  try {
    const input = requestSchema.parse(await request.json());
    if (!input.config.apiKey && !safeBaseUrl(input.config.baseUrl).includes("localhost")) {
      return Response.json({ error: "请先配置 API Key" }, { status: 400 });
    }
    const result = input.config.provider === "anthropic"
      ? await callAnthropic(input)
      : await callOpenAiCompatible(input);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";
    return Response.json({ error: message }, { status: 422 });
  }
}
