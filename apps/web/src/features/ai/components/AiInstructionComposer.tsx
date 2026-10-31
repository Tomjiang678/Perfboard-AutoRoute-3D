import { useState } from "react";
import type { AiConstraintAssistantController } from "../useAiConstraintAssistant.ts";

interface AiInstructionComposerProps {
  controller: AiConstraintAssistantController;
}

export function AiInstructionComposer({ controller }: AiInstructionComposerProps) {
  // 打字只更新这里的局部 state：不会牵连 3D 工作区重渲染。
  // 内容同时写进 controller 的 ref，组件被重建也不会丢。
  const [instruction, setInstruction] = useState(() => controller.instructionDraft.current);
  return (
    <section className="ai-instruction-section">
      <div className="ai-instruction-heading"><h3>自然语言工程要求</h3></div>
      <textarea
        value={instruction}
        rows={3}
        placeholder="描述希望自动放置和布线遵守的工程要求。"
        onChange={(event) => {
          setInstruction(event.target.value);
          controller.instructionDraft.current = event.target.value;
        }}
      />
      <button
        className="tool-button"
        type="button"
        disabled={!instruction.trim()}
        onClick={() => controller.parseInstruction(instruction.trim())}
      >
        {controller.instructionRunning ? "正在解析…" : "解析为工程指令"}
      </button>
      {controller.instructionStatus && <p className="ai-instruction-status" role="status">{controller.instructionStatus}</p>}
    </section>
  );
}

