import type { AiConstraintAssistantController } from "../useAiConstraintAssistant.ts";
import { AiConstraintLists } from "./AiConstraintLists.tsx";
import { AiInstructionComposer } from "./AiInstructionComposer.tsx";
import { AiProviderConfigurationPanel } from "./AiProviderConfigurationPanel.tsx";

interface AiConstraintAssistantPanelProps {
  controller: AiConstraintAssistantController;
  disabled: boolean;
}

export function AiConstraintAssistantPanel({ controller, disabled }: AiConstraintAssistantPanelProps) {
  return (
    <>
      <AiProviderConfigurationPanel controller={controller} disabled={disabled} />
      <AiInstructionComposer controller={controller} disabled={disabled} />
      <AiConstraintLists controller={controller} />
    </>
  );
}

