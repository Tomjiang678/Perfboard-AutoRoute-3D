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
  {
    id: "openai",
    label: "OpenAI",
    protocolHint: "OpenAI API",
    defaultRequestUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o",
    requiresModel: true
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    protocolHint: "Anthropic Messages API",
    defaultRequestUrl: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-4-5",
    requiresModel: true
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocolHint: "Gemini API（URL 里的 {model} 会自动替换）",
    defaultRequestUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    defaultModel: "gemini-2.0-flash",
    requiresModel: true
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocolHint: "DeepSeek Chat Completions API",
    defaultRequestUrl: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-flash",
    requiresModel: true
  },
  {
    id: "qwen",
    label: "阿里云百炼 / 通义千问",
    protocolHint: "DashScope OpenAI 兼容模式",
    defaultRequestUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus",
    requiresModel: true
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    protocolHint: "智谱开放平台 API",
    defaultRequestUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-plus",
    requiresModel: true
  },
  {
    id: "doubao",
    label: "火山引擎 / 豆包",
    protocolHint: "火山方舟 API（模型一栏填推理接入点 ID，ep- 开头）",
    defaultRequestUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    requiresModel: true
  },
  {
    id: "kimi",
    label: "月之暗面 Kimi",
    protocolHint: "Moonshot API（OpenAI 兼容）",
    defaultRequestUrl: "https://api.moonshot.cn/v1/chat/completions",
    defaultModel: "moonshot-v1-8k",
    requiresModel: true
  }
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
