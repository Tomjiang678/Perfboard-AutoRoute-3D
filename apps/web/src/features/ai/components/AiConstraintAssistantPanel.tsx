import type { AiConstraintAssistantController } from "../useAiConstraintAssistant.ts";
import { AiConstraintLists } from "./AiConstraintLists.tsx";
import { AiInstructionComposer } from "./AiInstructionComposer.tsx";
import { AiProviderConfigurationPanel } from "./AiProviderConfigurationPanel.tsx";

interface AiConstraintAssistantPanelProps {
  controller: AiConstraintAssistantController;
}

export function AiConstraintAssistantPanel({ controller }: AiConstraintAssistantPanelProps) {
  return (
    <>
      <AiProviderConfigurationPanel controller={controller} />
      <AiInstructionComposer controller={controller} />
      <AiConstraintLists controller={controller} />
    </>
  );
}

