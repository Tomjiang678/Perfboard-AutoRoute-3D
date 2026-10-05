import { AI_PROVIDER_OPTIONS, EMPTY_AI_API_CONFIGURATION, type AiApiConfiguration } from "./aiProvider.ts";

const BROWSER_AI_CONFIG_KEY = "perfboard-ai-api-configuration";

export async function loadAiApiConfiguration(): Promise<AiApiConfiguration> {
  if (window.perfboardDesktop) {
    return normalizeConfiguration(await window.perfboardDesktop.aiConfig.load());
  }

  try {
    const saved = window.localStorage.getItem(BROWSER_AI_CONFIG_KEY);
    return normalizeConfiguration(saved ? JSON.parse(saved) : undefined);
  } catch {
    window.localStorage.removeItem(BROWSER_AI_CONFIG_KEY);
    return { ...EMPTY_AI_API_CONFIGURATION };
  }
}

export async function saveAiApiConfiguration(configuration: AiApiConfiguration) {
  const normalized = normalizeConfiguration(configuration);
  if (window.perfboardDesktop) {
    await window.perfboardDesktop.aiConfig.save(normalized);
    return "electron-safe-storage" as const;
  }

  window.localStorage.setItem(BROWSER_AI_CONFIG_KEY, JSON.stringify(normalized));
  return "browser-local-storage" as const;
}

function normalizeConfiguration(value: Partial<AiApiConfiguration> | undefined): AiApiConfiguration {
  const provider = value?.provider ?? EMPTY_AI_API_CONFIGURATION.provider;
  const option = AI_PROVIDER_OPTIONS.find((candidate) => candidate.id === provider);
  return {
    provider,
    requestUrl: typeof value?.requestUrl === "string" && value.requestUrl.trim() ? value.requestUrl : option?.defaultRequestUrl ?? "",
    apiKey: typeof value?.apiKey === "string" ? value.apiKey : "",
    model: typeof value?.model === "string" && value.model.trim() ? value.model : option?.defaultModel ?? ""
  };
}
