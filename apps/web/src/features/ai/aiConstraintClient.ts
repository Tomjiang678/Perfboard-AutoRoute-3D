import type { PerfboardProject } from "../../types/project.ts";
import { AI_PROVIDER_OPTIONS, type AiApiConfiguration } from "./aiProvider.ts";
import { buildConstraintPrompt, buildConstraintRepairPrompt } from "./constraintPrompt.ts";
import { parseAiConstraintResponse } from "../constraints/schema.ts";

export async function requestConstraintDrafts(
  configuration: AiApiConfiguration,
  userText: string,
  project: PerfboardProject,
  signal?: AbortSignal
) {
  const url = configuration.requestUrl.trim();
  if (!url || !configuration.apiKey.trim()) {
    throw new Error("请先填写 API 请求 URL 和 API Key。");
  }
  const provider = AI_PROVIDER_OPTIONS.find((option) => option.id === configuration.provider);
  if (provider?.requiresModel && !configuration.model.trim()) {
    throw new Error(`请填写 ${provider.label} 的模型名称。`);
  }
  const prompt = buildConstraintPrompt(userText, project);
  const firstOutput = await requestRawConstraintOutput(configuration, prompt, signal);
  try {
    return parseAiConstraintResponse(parseJsonContent(firstOutput));
  } catch (error) {
    const validationError = error instanceof Error ? error.message : "未知 Schema 错误";
    const repairPrompt = buildConstraintRepairPrompt(prompt, firstOutput, validationError);
    const repairedOutput = await requestRawConstraintOutput(configuration, repairPrompt, signal);
    try {
      return parseAiConstraintResponse(parseJsonContent(repairedOutput));
    } catch (repairError) {
      const detail = repairError instanceof Error ? repairError.message : "未知 Schema 错误";
      throw new Error(`AI 两次返回的指令都不符合受支持的结构：${detail}`);
    }
  }
}

async function requestRawConstraintOutput(
  configuration: AiApiConfiguration,
  prompt: string,
  signal?: AbortSignal
) {
  const { requestUrl, init, extract } = buildProviderRequest(configuration, prompt, signal);
  const response = await performRequest(requestUrl, init);
  if (!response.ok) {
    throw new Error(`AI API 请求失败（${response.status}）：${response.body.slice(0, 500) || response.statusText}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body) as unknown;
  } catch {
    throw new Error("AI API 返回的响应不是 JSON。");
  }
  const content = extract(payload);
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

async function performRequest(url: string, init: RequestInit) {
  if (window.perfboardDesktop) {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    return window.perfboardDesktop.aiApi.request({
      url,
      method: init.method,
      headers,
      body: typeof init.body === "string" ? init.body : undefined
    });
  }
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: await response.text()
  };
}

export async function testAiApiConnection(configuration: AiApiConfiguration, signal?: AbortSignal) {
  const fakeProject = {
    board: { width: 1, height: 1 }, components: [], importState: { nets: [] }
  } as unknown as PerfboardProject;
  await requestConstraintDrafts(configuration, "返回 no_action，不生成任何工程指令。", fakeProject, signal);
}

function buildProviderRequest(
  configuration: AiApiConfiguration,
  prompt: string,
  signal?: AbortSignal
): { requestUrl: string; init: RequestInit; extract: (value: unknown) => unknown } {
  const apiKey = configuration.apiKey.trim();
  const model = configuration.model.trim();
  const common: Pick<RequestInit, "method" | "signal"> = { method: "POST", signal };
  if (configuration.provider === "anthropic") {
    return {
      requestUrl: configuration.requestUrl.trim(),
      init: {
        ...common,
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1800, messages: [{ role: "user", content: prompt }] })
      },
      extract: (value: unknown) => record(value).content && Array.isArray(record(value).content)
        ? record(record(value).content[0]).text
        : undefined
    };
  }
  if (configuration.provider === "gemini") {
    const separator = configuration.requestUrl.includes("?") ? "&" : "?";
    return {
      requestUrl: `${configuration.requestUrl.trim()}${separator}key=${encodeURIComponent(apiKey)}`,
      init: {
        ...common,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      },
      extract: (value: unknown) => {
        const candidates = record(value).candidates;
        const candidate = Array.isArray(candidates) ? record(candidates[0]) : {};
        const parts = record(candidate.content).parts;
        return Array.isArray(parts) ? record(parts[0]).text : undefined;
      }
    };
  }

  return {
    requestUrl: configuration.requestUrl.trim(),
    init: {
      ...common,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || undefined,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0
      })
    },
    extract: (value: unknown) => {
      const choices = record(value).choices;
      if (Array.isArray(choices)) return record(record(choices[0]).message).content;
      if (typeof record(value).output_text === "string") return record(value).output_text;
      return value;
    }
  };
}

function parseJsonContent(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("AI 没有返回有效的结构化 JSON 指令。");
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}
