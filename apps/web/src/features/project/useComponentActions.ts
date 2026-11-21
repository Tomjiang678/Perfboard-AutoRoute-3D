import { useState } from "react";
import type { AdapterSpec, PerfboardProject, PlacedComponent } from "../../types/project.ts";
import { bendComponentPin } from "../layout/manualPlacement.ts";
import { checkComponentPlacement } from "../layout/placementValidity.ts";
import { adapterContainsPoint } from "./adapter.ts";
import { clampSpacing } from "./componentTraits.ts";
import { buildPinOffsetsForComponent } from "./componentLibrary.ts";
import { invalidateComponentRouting } from "../routing/invalidateComponentRouting.ts";
import { updateComponentGeometry } from "./updateComponentGeometry.ts";

interface ProjectRef {
  current: PerfboardProject | undefined;
}

interface Options {
  projectRef: ProjectRef;
  commitProject: (updater: (current: PerfboardProject) => PerfboardProject) => void;
  selectedComponentId: string | undefined;
  setSelectedComponentId: (id: string | undefined) => void;
  setSelectedPin: (pin: undefined) => void;
}

export function useComponentActions({
  projectRef,
  commitProject,
  selectedComponentId,
  setSelectedComponentId,
  setSelectedPin
}: Options) {
  function updateComponent(
    componentId: string,
    transform: (component: PlacedComponent) => PlacedComponent | undefined
  ) {
    commitProject((current) => updateComponentGeometry(current, componentId, transform));
  }

  function handleMoveComponent(componentId: string, position: [number, number]) {
    commitProject((current) => {
      const moving = current.components.find((component) => component.id === componentId);
      if (!moving) return current;

      const host =
        moving.kind === "adapter"
          ? undefined
          : current.components.find(
              (component) =>
                component.kind === "adapter" &&
                component.id !== componentId &&
                component.adapter !== undefined &&
                component.adapter.pinCount === moving.pinOffsets.length &&
                adapterContainsPoint(component.position, component.adapter, position)
            );

      if (!host?.adapter) {
        const check = checkComponentPlacement(current, { ...moving, position });
        if (!check.valid) return current;
        return updateComponentGeometry(current, componentId, (component) => ({ ...component, position }));
      }

      const merged = {
        ...moving,
        adapter: host.adapter,
        position: host.position,
        rotation: host.rotation
      };
      return {
        ...current,
        components: current.components
          .filter((component) => component.id !== host.id)
          .map((component) => (component.id === componentId ? merged : component)),
        routing: invalidateComponentRouting(current, moving.name)
      };
    });
  }

  function handleMovePin(componentId: string, pin: number, position: [number, number]) {
    updateComponent(componentId, (component) => bendComponentPin(component, pin, position));
  }

  function handleRotateSelected() {
    if (!selectedComponentId) return;
    updateComponent(selectedComponentId, (component) => ({ ...component, rotation: component.rotation + Math.PI / 2 }));
  }

  function handleDeleteSelected() {
    if (!selectedComponentId) return;
    commitProject((current) => {
      const selected = current.components.find((component) => component.id === selectedComponentId);
      if (!selected) return current;
      return {
        ...current,
        components: current.components.filter((component) => component.id !== selectedComponentId),
        routing: invalidateComponentRouting(current, selected.name)
      };
    });
    setSelectedComponentId(undefined);
  }

  function handleMountSelected() {
    if (selectedComponentId) updateComponent(selectedComponentId, (component) => ({ ...component, mounted: true }));
  }

  function handleUnmountSelected() {
    if (selectedComponentId) updateComponent(selectedComponentId, (component) => ({ ...component, mounted: false }));
  }

  function handleUpdateSelected(patch: {
    name?: string;
    value?: string;
    leadSpacing?: number;
    rowSpacing?: number;
    sameSidePitch?: number;
    adapter?: AdapterSpec;
  }) {
    if (!selectedComponentId) return;
    commitProject((current) => updateComponentGeometry(current, selectedComponentId, (component) => {
      if (patch.adapter !== undefined && component.mounted) return component;
      const next = {
        ...component,
        ...patch,
        leadSpacing: patch.leadSpacing !== undefined ? clampSpacing(component.kind, patch.leadSpacing, "leadSpacing") : component.leadSpacing,
        rowSpacing: patch.rowSpacing !== undefined ? clampSpacing(component.kind, patch.rowSpacing, "rowSpacing") : component.rowSpacing,
        sameSidePitch: patch.sameSidePitch !== undefined ? clampSpacing(component.kind, patch.sameSidePitch, "sameSidePitch") : component.sameSidePitch
      };
      return { ...next, pinOffsets: buildPinOffsetsForComponent(next) };
    }));
  }

  function handleDetachAdapter() {
    if (!selectedComponentId) return;
    const selected = projectRef.current?.components.find((component) => component.id === selectedComponentId);
    if (selected?.kind === "adapter") {
      commitProject((current) => ({
        ...current,
        components: current.components.filter((component) => component.id !== selectedComponentId),
        routing: invalidateComponentRouting(current, selected.name)
      }));
      setSelectedComponentId(undefined);
      return;
    }
    updateComponent(selectedComponentId, (component) =>
      component.mounted ? component : { ...component, adapter: undefined }
    );
  }

  return {
    updateComponent,
    handleMoveComponent,
    handleMovePin,
    handleRotateSelected,
    handleDeleteSelected,
    handleMountSelected,
    handleUnmountSelected,
    handleUpdateSelected,
    handleDetachAdapter
  };
}
