import { useState } from "react";
import type { LibraryComponentDefinition } from "./componentLibrary.ts";
import type { PerfboardProject } from "../../types/project.ts";
import { replaceComponentPackage } from "./replaceComponentPackage.ts";
import { notify } from "../storage/notify.ts";

interface ProjectRef {
  current: PerfboardProject | undefined;
}

export function usePackageAssignment(
  projectRef: ProjectRef,
  commitProject: (updater: (current: PerfboardProject) => PerfboardProject) => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>();

  const target = projectRef.current?.components.find((component) => component.id === targetId);

  function openPicker() {
    setTargetId(undefined);
    setIsOpen(true);
  }

  function openAssign(componentId: string) {
    setTargetId(componentId);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    setTargetId(undefined);
  }

  function canAssign(componentId: string) {
    const project = projectRef.current;
    const component = project?.components.find((item) => item.id === componentId);
    if (!component) return false;
    if (component.origin === "import") return true;
    return Boolean(project?.importState.components.some((item) => item.ref === component.name));
  }

  function assign(definition: LibraryComponentDefinition) {
    const project = projectRef.current;
    const component = project?.components.find((item) => item.id === targetId);
    if (!component) return false;
    const pinCount = definition.pinCount ?? component.pinCount;
    if (!pinCount || pinCount !== component.pinCount) {
      notify(`封装是 ${pinCount ?? "?"} 脚，当前元件是 ${component.pinCount ?? "?"} 脚，不能直接替换。`);
      return false;
    }
    commitProject((current) => replaceComponentPackage(current, component.id, definition));
    setTargetId(undefined);
    return true;
  }

  return {
    isOpen,
    assignTargetId: targetId,
    targetPinCount: target?.pinCount,
    openPicker,
    openAssign,
    close,
    canAssign,
    assign
  };
}

