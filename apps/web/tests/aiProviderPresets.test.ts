import assert from "node:assert/strict";
import test from "node:test";
import { AI_PROVIDER_OPTIONS, isAiApiConfigurationComplete } from "../src/features/ai/aiProvider.ts";
import type { AiApiConfiguration } from "../src/features/ai/aiProvider.ts";

test("除自定义外，每个服务商都带可用的默认 URL", () => {
  const presets = AI_PROVIDER_OPTIONS.filter((option) => option.id !== "custom");
  assert.ok(presets.length >= 8);
  for (const preset of presets) {
    assert.ok(preset.defaultRequestUrl, `${preset.label} 缺少默认 URL`);
    assert.match(preset.defaultRequestUrl, /^https:\/\//, `${preset.label} 的 URL 必须是 https`);
    assert.ok(preset.requiresModel, `${preset.label} 应该要求填模型`);
  }
});

test("Gemini 的 URL 用 {model} 占位，模型改名后地址会跟着变", () => {
  const gemini = AI_PROVIDER_OPTIONS.find((option) => option.id === "gemini");
  assert.ok(gemini?.defaultRequestUrl?.includes("{model}"));
});

test("没有默认模型的服务商只有豆包（要填接入点 ID）", () => {
  const missing = AI_PROVIDER_OPTIONS.filter((option) => option.id !== "custom" && !option.defaultModel);
  assert.deepEqual(missing.map((option) => option.id), ["doubao"]);
});

test("DeepSeek 的默认模型在官方枚举里", () => {
  const deepseek = AI_PROVIDER_OPTIONS.find((option) => option.id === "deepseek");
  assert.ok(["deepseek-flash", "deepseek-v4-pro"].includes(deepseek?.defaultModel ?? ""));
});

test("配置完整性：缺 key 或缺模型都算不完整", () => {
  const base: AiApiConfiguration = {
    provider: "openai",
    requestUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "sk-test",
    model: "gpt-4o"
  };
  assert.equal(isAiApiConfigurationComplete(base), true);
  assert.equal(isAiApiConfigurationComplete({ ...base, apiKey: "" }), false);
  assert.equal(isAiApiConfigurationComplete({ ...base, model: "" }), false);
});
