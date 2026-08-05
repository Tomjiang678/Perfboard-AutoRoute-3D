import type { AiConstraintAssistantController } from "../useAiConstraintAssistant";
import { AiConstraintLists } from "./AiConstraintLists";
import { AiInstructionComposer } from "./AiInstructionComposer";
import { AiProviderConfigurationPanel } from "./AiProviderConfigurationPanel";

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

