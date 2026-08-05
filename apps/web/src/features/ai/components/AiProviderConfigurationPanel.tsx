import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { AI_PROVIDER_OPTIONS, isAiApiConfigurationComplete, type AiProviderPreset } from "../aiProvider";
import type { AiConstraintAssistantController } from "../useAiConstraintAssistant";

interface AiProviderConfigurationPanelProps {
  controller: AiConstraintAssistantController;
  disabled: boolean;
}

export function AiProviderConfigurationPanel({ controller, disabled }: AiProviderConfigurationPanelProps) {
  const [open, setOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const configuration = controller.configuration;

  return (
    <section className="auto-placement-ai-section">
      <button
        className="auto-placement-ai-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
      >
        <span className="auto-placement-ai-toggle-title">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          AI 指令配置
        </span>
        <span className={isAiApiConfigurationComplete(configuration) ? "ai-config-status ready" : "ai-config-status"}>
          {isAiApiConfigurationComplete(configuration) ? "已填写" : "未配置"}
        </span>
      </button>

      {open && (
        <div className="auto-placement-ai-fields">
          {controller.configurationStorageMessage && (
            <p className="auto-placement-ai-storage-status" role="status">{controller.configurationStorageMessage}</p>
          )}
          <label>
            <span>AI 服务</span>
            <select
              value={configuration.provider}
              disabled={disabled}
              onChange={(event) => {
                const provider = event.target.value as AiProviderPreset;
                const option = AI_PROVIDER_OPTIONS.find((candidate) => candidate.id === provider);
                controller.setConfiguration({
                  ...configuration,
                  provider,
                  requestUrl: option?.defaultRequestUrl ?? configuration.requestUrl,
                  model: option?.defaultModel ?? configuration.model
                });
              }}
            >
              {AI_PROVIDER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <p className="auto-placement-ai-hint">
            {AI_PROVIDER_OPTIONS.find((option) => option.id === configuration.provider)?.protocolHint}
          </p>
          <label>
            <span>请求 URL</span>
            <input
              type="url"
              value={configuration.requestUrl}
              placeholder="https://..."
              autoComplete="url"
              spellCheck={false}
              disabled={disabled}
              onChange={(event) => controller.setConfiguration({ ...configuration, requestUrl: event.target.value })}
            />
          </label>
          <label>
            <span>API Key</span>
            <span className="ai-api-key-field">
              <input
                type={showApiKey ? "text" : "password"}
                value={configuration.apiKey}
                placeholder="输入你自己的 API Key"
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => controller.setConfiguration({ ...configuration, apiKey: event.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((current) => !current)}
                title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                disabled={disabled}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          <label>
            <span>
              模型或部署名称
              {AI_PROVIDER_OPTIONS.find((option) => option.id === configuration.provider)?.requiresModel ? "（必填）" : "（可选）"}
            </span>
            <input
              type="text"
              value={configuration.model}
              placeholder="按服务商要求填写"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              onChange={(event) => controller.setConfiguration({ ...configuration, model: event.target.value })}
            />
          </label>
          <button
            className="tool-button auto-placement-ai-test"
            type="button"
            disabled={disabled || controller.instructionRunning || !isAiApiConfigurationComplete(configuration)}
            onClick={controller.testConnection}
          >
            测试连接
          </button>
        </div>
      )}
    </section>
  );
}

