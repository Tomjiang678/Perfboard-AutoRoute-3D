import { useState } from "react";
import type { AiConstraintAssistantController } from "../useAiConstraintAssistant.ts";

interface AiInstructionComposerProps {
  controller: AiConstraintAssistantController;
  disabled: boolean;
}

export function AiInstructionComposer({ controller, disabled }: AiInstructionComposerProps) {
  const [instruction, setInstruction] = useState("");
  const busy = disabled || controller.instructionRunning;
  return (
    <section className="ai-instruction-section">
      <div className="ai-instruction-heading"><h3>自然语言工程要求</h3></div>
      <textarea
        value={instruction}
        rows={3}
        disabled={busy}
        placeholder="描述希望自动放置和布线遵守的工程要求。"
        onChange={(event) => setInstruction(event.target.value)}
      />
      <button
        className="tool-button"
        type="button"
        disabled={busy || !instruction.trim()}
        onClick={() => controller.parseInstruction(instruction.trim())}
      >
        {controller.instructionRunning ? "正在解析…" : "解析为工程指令"}
      </button>
      {controller.instructionStatus && <p className="ai-instruction-status" role="status">{controller.instructionStatus}</p>}
    </section>
  );
}

