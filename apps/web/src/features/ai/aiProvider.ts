export type AiProviderPreset =
  | "custom"
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "zhipu"
  | "doubao"
  | "kimi";

export interface AiApiConfiguration {
  provider: AiProviderPreset;
  requestUrl: string;
  apiKey: string;
  model: string;
}

export interface AiProviderOption {
  id: AiProviderPreset;
  label: string;
  protocolHint: string;
  defaultRequestUrl?: string;
  defaultModel?: string;
  requiresModel?: boolean;
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  { id: "custom", label: "自定义 API", protocolHint: "根据目标服务填写请求 URL" },
  { id: "openai", label: "OpenAI", protocolHint: "OpenAI API" },
  { id: "anthropic", label: "Anthropic Claude", protocolHint: "Anthropic Messages API" },
  { id: "gemini", label: "Google Gemini", protocolHint: "Gemini API" },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocolHint: "DeepSeek Chat Completions API",
    defaultRequestUrl: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-v4-flash",
    requiresModel: true
  },
  { id: "qwen", label: "阿里云百炼 / 通义千问", protocolHint: "DashScope API" },
  { id: "zhipu", label: "智谱 GLM", protocolHint: "智谱开放平台 API" },
  { id: "doubao", label: "火山引擎 / 豆包", protocolHint: "火山方舟 API" },
  { id: "kimi", label: "月之暗面 Kimi", protocolHint: "Moonshot API" }
];

export const EMPTY_AI_API_CONFIGURATION: AiApiConfiguration = {
  provider: "custom",
  requestUrl: "",
  apiKey: "",
  model: ""
};

export function isAiApiConfigurationComplete(configuration: AiApiConfiguration) {
  const provider = AI_PROVIDER_OPTIONS.find((option) => option.id === configuration.provider);
  return configuration.requestUrl.trim().length > 0 &&
    configuration.apiKey.trim().length > 0 &&
    (!provider?.requiresModel || configuration.model.trim().length > 0);
}
