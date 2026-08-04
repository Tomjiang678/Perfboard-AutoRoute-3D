import { FormEvent, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, X } from "lucide-react";
import {
  AI_PROVIDER_OPTIONS,
  isAiApiConfigurationComplete,
  type AiApiConfiguration,
  type AiProviderPreset
} from "../features/ai/aiProvider";
import type { PlacementRegion } from "../features/layout/autoPlacement";
import type { DesignConstraint } from "../types/project";

interface AutoPlacementDialogProps {
  boardWidth: number;
  boardHeight: number;
  warnings: string[];
  running: boolean;
  aiConfiguration: AiApiConfiguration;
  aiConfigurationStorageMessage?: string;
  aiInstructionRunning: boolean;
  aiInstructionStatus?: string;
  draftConstraints: DesignConstraint[];
  activeConstraints: DesignConstraint[];
  onAiConfigurationChange: (configuration: AiApiConfiguration) => void;
  onTestAiConnection: () => void | Promise<void>;
  onParseAiInstruction: (text: string) => void | Promise<void>;
  onConfirmAiDrafts: () => void;
  onDiscardAiDrafts: () => void;
  onToggleConstraint: (constraintId: string) => void;
  onDeleteConstraint: (constraintId: string) => void;
  onCancel: () => void;
  onPlace: (region: PlacementRegion) => void | Promise<void>;
}

export function AutoPlacementDialog({
  boardWidth,
  boardHeight,
  warnings,
  running,
  aiConfiguration,
  aiConfigurationStorageMessage,
  aiInstructionRunning,
  aiInstructionStatus,
  draftConstraints,
  activeConstraints,
  onAiConfigurationChange,
  onTestAiConnection,
  onParseAiInstruction,
  onConfirmAiDrafts,
  onDiscardAiDrafts,
  onToggleConstraint,
  onDeleteConstraint,
  onCancel,
  onPlace
}: AutoPlacementDialogProps) {
  const [x, setX] = useState(1);
  const [y, setY] = useState(1);
  const [width, setWidth] = useState(Math.max(1, boardWidth - 2));
  const [height, setHeight] = useState(Math.max(1, boardHeight - 2));
  const [isAiConfigurationOpen, setIsAiConfigurationOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [instruction, setInstruction] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) {
      return;
    }
    onPlace({ x, y, width, height });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="auto-place-title">
        <div className="dialog-header">
          <h2 id="auto-place-title">自动放置</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="关闭" disabled={running}>
            <X size={18} />
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          {running && (
            <div className="auto-placement-progress" role="status" aria-live="polite">
              <div className="auto-placement-progress-bar" aria-hidden="true">
                <span />
              </div>
              <p>正在评估放置候选和布线质量...</p>
            </div>
          )}

          <div className="field-grid">
            <label>
              <span>起点 X</span>
              <input type="number" min={0} max={boardWidth - 1} value={x} disabled={running} onChange={(event) => setX(toNumber(event.target.value))} />
            </label>
            <label>
              <span>起点 Y</span>
              <input type="number" min={0} max={boardHeight - 1} value={y} disabled={running} onChange={(event) => setY(toNumber(event.target.value))} />
            </label>
            <label>
              <span>区域宽</span>
              <input type="number" min={1} max={boardWidth} value={width} disabled={running} onChange={(event) => setWidth(toNumber(event.target.value))} />
            </label>
            <label>
              <span>区域高</span>
              <input type="number" min={1} max={boardHeight} value={height} disabled={running} onChange={(event) => setHeight(toNumber(event.target.value))} />
            </label>
          </div>

          <section className="auto-placement-ai-section">
            <button
              className="auto-placement-ai-toggle"
              type="button"
              aria-expanded={isAiConfigurationOpen}
              onClick={() => setIsAiConfigurationOpen((current) => !current)}
              disabled={running}
            >
              <span className="auto-placement-ai-toggle-title">
                {isAiConfigurationOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                AI 指令配置
              </span>
              <span className={isAiApiConfigurationComplete(aiConfiguration) ? "ai-config-status ready" : "ai-config-status"}>
                {isAiApiConfigurationComplete(aiConfiguration) ? "已填写" : "未配置"}
              </span>
            </button>

            {isAiConfigurationOpen && (
              <div className="auto-placement-ai-fields">
                {aiConfigurationStorageMessage && (
                  <p className="auto-placement-ai-storage-status" role="status">{aiConfigurationStorageMessage}</p>
                )}

                <label>
                  <span>AI 服务</span>
                  <select
                    value={aiConfiguration.provider}
                    disabled={running}
                    onChange={(event) => {
                      const provider = event.target.value as AiProviderPreset;
                      const option = AI_PROVIDER_OPTIONS.find((candidate) => candidate.id === provider);
                      onAiConfigurationChange({
                        ...aiConfiguration,
                        provider,
                        requestUrl: option?.defaultRequestUrl ?? aiConfiguration.requestUrl,
                        model: option?.defaultModel ?? aiConfiguration.model
                      });
                    }}
                  >
                    {AI_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <p className="auto-placement-ai-hint">
                  {AI_PROVIDER_OPTIONS.find((option) => option.id === aiConfiguration.provider)?.protocolHint}
                </p>

                <label>
                  <span>请求 URL</span>
                  <input
                    type="url"
                    value={aiConfiguration.requestUrl}
                    placeholder="https://..."
                    autoComplete="url"
                    spellCheck={false}
                    disabled={running}
                    onChange={(event) => onAiConfigurationChange({ ...aiConfiguration, requestUrl: event.target.value })}
                  />
                </label>

                <label>
                  <span>API Key</span>
                  <span className="ai-api-key-field">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={aiConfiguration.apiKey}
                      placeholder="输入你自己的 API Key"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={running}
                      onChange={(event) => onAiConfigurationChange({ ...aiConfiguration, apiKey: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((current) => !current)}
                      title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                      aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                      disabled={running}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </span>
                </label>

                <label>
                  <span>
                    模型或部署名称
                    {AI_PROVIDER_OPTIONS.find((option) => option.id === aiConfiguration.provider)?.requiresModel ? "（必填）" : "（可选）"}
                  </span>
                  <input
                    type="text"
                    value={aiConfiguration.model}
                    placeholder="按服务商要求填写"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={running}
                    onChange={(event) => onAiConfigurationChange({ ...aiConfiguration, model: event.target.value })}
                  />
                </label>

                <button
                  className="tool-button auto-placement-ai-test"
                  type="button"
                  disabled={running || aiInstructionRunning || !isAiApiConfigurationComplete(aiConfiguration)}
                  onClick={onTestAiConnection}
                >
                  测试连接
                </button>
              </div>
            )}
          </section>

          <section className="ai-instruction-section">
            <div className="ai-instruction-heading">
              <h3>自然语言工程要求</h3>
            </div>
            <textarea
              value={instruction}
              rows={3}
              disabled={running || aiInstructionRunning}
              placeholder="描述希望自动放置和布线遵守的工程要求。"
              onChange={(event) => setInstruction(event.target.value)}
            />
            <button
              className="tool-button"
              type="button"
              disabled={running || aiInstructionRunning || !instruction.trim()}
              onClick={() => onParseAiInstruction(instruction.trim())}
            >
              {aiInstructionRunning ? "正在解析…" : "解析为工程指令"}
            </button>
            {aiInstructionStatus && <p className="ai-instruction-status" role="status">{aiInstructionStatus}</p>}
          </section>

          {draftConstraints.length > 0 && (
            <section className="constraint-list-section draft">
              <h3>待确认指令</h3>
              {draftConstraints.map((constraint) => (
                <ConstraintRow key={constraint.id} constraint={constraint} />
              ))}
              <div className="constraint-list-actions">
                <button className="tool-button" type="button" onClick={onDiscardAiDrafts}>放弃</button>
                <button className="tool-button primary" type="button" onClick={onConfirmAiDrafts}>确认添加</button>
              </div>
            </section>
          )}

          {activeConstraints.length > 0 && (
            <section className="constraint-list-section">
              <h3>本工程约束</h3>
              {activeConstraints.map((constraint) => (
                <ConstraintRow
                  key={constraint.id}
                  constraint={constraint}
                  actions={(
                    <>
                      <button type="button" onClick={() => onToggleConstraint(constraint.id)}>
                        {constraint.enabled ? "禁用" : "启用"}
                      </button>
                      <button type="button" onClick={() => onDeleteConstraint(constraint.id)}>删除</button>
                    </>
                  )}
                />
              ))}
            </section>
          )}

          {warnings.length > 0 && (
            <div className="warning-list">
              {warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </div>
          )}

          <footer className="dialog-actions">
            <button className="tool-button" type="button" onClick={onCancel} disabled={running}>
              取消
            </button>
            <button className="tool-button primary" type="submit" disabled={running}>
              {running ? "运行中" : "放置"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ConstraintRow({ constraint, actions }: { constraint: DesignConstraint; actions?: React.ReactNode }) {
  return (
    <article className={constraint.enabled ? "constraint-row" : "constraint-row disabled"}>
      <div>
        <strong>{constraint.strength === "hard" ? "硬约束" : "软约束"}</strong>
        <span>{constraint.explanation}</span>
      </div>
      <small>{constraintSummary(constraint)}</small>
      {actions && <footer>{actions}</footer>}
    </article>
  );
}

function constraintSummary(constraint: DesignConstraint) {
  switch (constraint.kind) {
    case "component_in_region":
      return `${constraint.componentRefs.join("、")} → (${constraint.region.x}, ${constraint.region.y}) ${constraint.region.width}×${constraint.region.height}`;
    case "component_on_board_edge":
      return `${constraint.componentRefs.join("、")} → ${edgeLabel(constraint.edge)}，深度 ${constraint.depth ?? "自动"}`;
    case "component_near_component":
      return `${constraint.componentRef} ↔ ${constraint.anchorComponentRef}，最大 ${constraint.maxDistance} 孔`;
    case "component_lock":
      return `${constraint.componentRef}：${constraint.lockPosition ? "锁位置" : ""}${constraint.lockRotation ? " 锁方向" : ""}`;
    case "component_orientation":
      return `${constraint.componentRef}：${constraint.rotationDegrees}°`;
    case "region_keepout":
      return `区域 (${constraint.region.x}, ${constraint.region.y}) ${constraint.region.width}×${constraint.region.height}`;
    case "power_rail":
      return `${constraint.net}：${constraint.axis === "row" ? "第 " + constraint.index + " 行" : "第 " + constraint.index + " 列"}，${constraint.from}..${constraint.to}`;
    case "net_jumper_limit":
      return `${constraint.net}：最多 ${constraint.maxJumpers} 根跳线`;
  }
}

function edgeLabel(edge: DesignConstraint extends infer _ ? "top" | "bottom" | "left" | "right" | "short_side" | "long_side" | "any" : never) {
  const labels = {
    top: "上边缘",
    bottom: "下边缘",
    left: "左边缘",
    right: "右边缘",
    short_side: "任一短边边缘",
    long_side: "任一长边边缘",
    any: "任一板边"
  };
  return labels[edge];
}

function toNumber(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
}
