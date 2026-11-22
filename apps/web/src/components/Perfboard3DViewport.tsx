import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  componentLibraryByKey,
  type LibraryComponentDefinition
} from "../features/project/componentLibrary.ts";
import type { BoardSize } from "../types/project.ts";
import type { DragMoveModifier } from "../types/project.ts";
import type { PlacedComponent } from "../types/project.ts";
import type { RoutedNetEndpoint } from "../types/project.ts";
import type { RoutingState } from "../types/project.ts";
import type { ThemeMode } from "../types/project.ts";
import { bendComponentPin, isManuallyBendable, pinGridPosition } from "../features/layout/manualPlacement.ts";
import { createBreadboardDefinition } from "../features/board/breadboard.ts";
import { getBoardModel } from "../features/board/factory.ts";
import { rotateGridOffset } from "../features/board/placement.ts";
import { createBoardObject } from "../features/board/rendering.ts";
import { registerSharedRenderer } from "../renderer3d/sharedRenderer.ts";
import { VIEWPORT_LIGHTING } from "../renderer3d/lighting.ts";
import {
  createPlacedComponents,
  createNetEndpointHighlights,
  createRoutingIssueHighlights,
  createRouteObjects,
  updateRouteOverlayVisibility,
  getComponentWorldPosition,
  sameGridPosition,
  disposeObject,
  findComponentRoot,
  findPinObject,
  getComponentPinAnchor
} from "../renderer3d/boardObjects.ts";

interface Perfboard3DViewportProps {
  board: BoardSize;
  components: PlacedComponent[];
  selectedComponentId?: string;
  onPlaceComponent: (component: LibraryComponentDefinition, position: [number, number]) => void;
  onSelectComponent: (componentId: string | undefined) => void;
  onSelectPin: (pin: SelectedPin | undefined) => void;
  onMoveComponent: (componentId: string, position: [number, number]) => void;
  onMovePin: (componentId: string, pin: number, position: [number, number]) => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onAssignPackage?: (componentId: string) => void;
  canAssignPackage?: (componentId: string) => boolean;
  onDetachAdapter: () => void;
  onMountSelected: () => void;
  onUnmountSelected: () => void;
  onUpdateBoard: (board: BoardSize) => void;
  highlightedEndpoints: RoutedNetEndpoint[];
  routing: RoutingState;
  transparentBoard: boolean;
  theme: ThemeMode;
  routeEditMode?: "select" | "solder" | "jumper" | "erase";
  isPlacingComponent?: boolean;
  dragMoveModifier: DragMoveModifier;
  onRouteEditPoint?: (point: [number, number]) => void;
}

export interface SelectedPin {
  componentId: string;
  pin: number;
}

export function Perfboard3DViewport({
  board,
  components,
  selectedComponentId,
  onPlaceComponent,
  onSelectComponent,
  onSelectPin,
  onMoveComponent,
  onMovePin,
  onRotateSelected,
  onDeleteSelected,
  onAssignPackage,
  canAssignPackage,
  onDetachAdapter,
  onMountSelected,
  onUnmountSelected,
  onUpdateBoard,
  highlightedEndpoints,
  routing,
  transparentBoard,
  theme,
  routeEditMode = "select",
  isPlacingComponent = false,
  dragMoveModifier,
  onRouteEditPoint
}: Perfboard3DViewportProps) {
  const boardModel = getBoardModel(board);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardPlaneRef = useRef<THREE.Plane | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | undefined>();
  const sceneObjectsRef = useRef<{
    camera: THREE.PerspectiveCamera;
    componentsGroup: THREE.Group;
    routeObject: THREE.Group;
  } | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const netHighlightsRef = useRef<THREE.Group | null>(null);
  const boardDefinitionRef = useRef<BoardSize | undefined>(undefined);
  const draggingComponentIdRef = useRef<string | undefined>(undefined);
  const draggingGridRef = useRef<[number, number] | undefined>(undefined);
  const draggingPinRef = useRef<SelectedPin | undefined>(undefined);
  const pointerDownRef = useRef<{ x: number; y: number; editing: boolean } | undefined>(undefined);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xeef2f6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    registerSharedRenderer(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 6000);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 15;
    controls.maxDistance = 4200;
    controlsRef.current = controls;

    const netHighlights = new THREE.Group();
    netHighlightsRef.current = netHighlights;
    scene.add(netHighlights);
    boardPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.28);
    camera.position.set(100, 80, 100);
    controls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0xffffff, VIEWPORT_LIGHTING.ambientIntensity);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, VIEWPORT_LIGHTING.keyIntensity);
    keyLight.position.set(...VIEWPORT_LIGHTING.keyPosition);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.radius = 4;
    keyLightRef.current = keyLight;
    scene.add(keyLight);

    // Soft fill light from below so the back side of the board is not much darker than the front.
    const fillLight = new THREE.DirectionalLight(
      VIEWPORT_LIGHTING.fillColor,
      VIEWPORT_LIGHTING.fillIntensity
    );
    fillLight.position.set(...VIEWPORT_LIGHTING.fillPosition);
    scene.add(fillLight);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      const routeObject = sceneObjectsRef.current?.routeObject;
      if (routeObject) updateRouteOverlayVisibility(routeObject, camera, controls.target);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      registerSharedRenderer(undefined);
      renderer.dispose();
      disposeObject(netHighlights);
      sceneRef.current = null;
      keyLightRef.current = null;
      netHighlightsRef.current = null;
      sceneObjectsRef.current = null;
      boardDefinitionRef.current = undefined;
      host.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    scene.background = new THREE.Color(theme === "dark" ? 0x161b21 : 0xeef2f6);
    const keyLight = keyLightRef.current;
    if (keyLight) {
      const boardMax = Math.max(board.width, board.height);
      keyLight.shadow.camera.left = -boardMax;
      keyLight.shadow.camera.right = boardMax;
      keyLight.shadow.camera.top = boardMax;
      keyLight.shadow.camera.bottom = -boardMax;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = boardMax * 5;
      keyLight.shadow.camera.updateProjectionMatrix();
    }
    const boardObject = createBoardObject(board, transparentBoard, theme);
    const componentsGroup = createPlacedComponents(components, board, selectedComponentId, theme);
    const routeObject = createRouteObjects(routing, board, components);
    const routingIssueHighlights = createRoutingIssueHighlights(routing, board);
    scene.add(boardObject, componentsGroup, routeObject, routingIssueHighlights);
    sceneObjectsRef.current = { camera, componentsGroup, routeObject };

    if (boardDefinitionRef.current !== board) {
      const distance = Math.max(55, Math.max(board.width, board.height) * 1.25);
      camera.position.set(distance * 0.9, distance * 0.75, distance * 0.9);
      controls.target.set(0, 0, 0);
      camera.lookAt(0, 0, 0);
      controls.update();
      boardDefinitionRef.current = board;
    }

    return () => {
      scene.remove(boardObject, componentsGroup, routeObject, routingIssueHighlights);
      disposeObject(boardObject);
      disposeObject(componentsGroup);
      disposeObject(routeObject);
      disposeObject(routingIssueHighlights);
      if (sceneObjectsRef.current?.componentsGroup === componentsGroup) {
        sceneObjectsRef.current = null;
      }
    };
  }, [board, components, selectedComponentId, routing, transparentBoard, theme]);

  useEffect(() => {
    const scene = sceneRef.current;
    const current = netHighlightsRef.current;
    if (!scene || !current) {
      return;
    }

    const next = createNetEndpointHighlights(highlightedEndpoints, board);
    scene.remove(current);
    disposeObject(current);
    scene.add(next);
    netHighlightsRef.current = next;
  }, [board, highlightedEndpoints]);

  function setView(view: "top" | "bottom" | "iso") {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const boardMax = Math.max(board.width, board.height);
    const distance = Math.max(55, boardMax * 1.25);

    if (view === "top") {
      camera.position.set(0, distance, 0.1);
    } else if (view === "bottom") {
      camera.position.set(0, -distance, 0.1);
    } else {
      camera.position.set(distance * 0.9, distance * 0.75, distance * 0.9);
    }

    controls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.update();
  }

  return (
    <div
      className="three-viewport"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/perfboard-component")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const componentKey = event.dataTransfer.getData("application/perfboard-component");
        const component = componentLibraryByKey.get(componentKey);
        const gridPosition = getGridPositionFromDrop(event);
        if (component && gridPosition) {
          onPlaceComponent(component, gridPosition);
        }
      }}
      onPointerDown={(event) => {
        if (event.button === 2) {
          return;
        }
        pointerDownRef.current = {
          x: event.clientX,
          y: event.clientY,
          editing: routeEditMode !== "select" || isPlacingComponent
        };
        setContextMenu(undefined);
        const pinHit = routeEditMode === "select" && !isPlacingComponent ? pickPin(event) : undefined;
        if (pinHit) {
          const component = components.find((item) => item.id === pinHit.componentId);
          const moveWholeComponent = isMoveShortcutPressed(event, dragMoveModifier);
          draggingComponentIdRef.current = moveWholeComponent ? pinHit.componentId : undefined;
          draggingPinRef.current = !moveWholeComponent && component && isManuallyBendable(component) && !component.mounted ? pinHit : undefined;
          draggingGridRef.current = draggingPinRef.current
            ? pinGridPosition(component!, pinHit.pin)
            : moveWholeComponent
              ? component?.position
              : undefined;
          if (draggingPinRef.current || draggingComponentIdRef.current) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setOrbitEnabled(false);
          }
          onSelectComponent(pinHit.componentId);
          onSelectPin(pinHit);
          return;
        }

        const hit = pickComponent(event);
        if (hit) {
          const canDrag = isMoveShortcutPressed(event, dragMoveModifier);
          draggingComponentIdRef.current = canDrag ? hit : undefined;
          draggingGridRef.current = canDrag
            ? components.find((component) => component.id === hit)?.position
            : undefined;
          if (canDrag) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setOrbitEnabled(false);
          }
          onSelectComponent(hit);
          onSelectPin(undefined);
        } else {
          draggingComponentIdRef.current = undefined;
          draggingGridRef.current = undefined;
          onSelectComponent(undefined);
          onSelectPin(undefined);
        }
      }}
      onPointerMove={(event) => {
        if (draggingPinRef.current) {
          const gridPosition = getGridPositionFromPointer(event);
          const component = components.find((item) => item.id === draggingPinRef.current?.componentId);
          if (gridPosition && component && !sameGridPosition(gridPosition, draggingGridRef.current)) {
            const preview = bendComponentPin(component, draggingPinRef.current.pin, gridPosition);
            if (!preview) {
              return;
            }
            replaceComponentPreview(preview);
            draggingGridRef.current = gridPosition;
          }
          return;
        }
        const componentId = draggingComponentIdRef.current;
        if (!componentId) {
          return;
        }

        const component = components.find((item) => item.id === componentId);
        const gridPosition = getGridPositionFromPointer(event);
        if (gridPosition && component && !component.mounted && !sameGridPosition(gridPosition, draggingGridRef.current)) {
          moveComponentObject(component, gridPosition);
          draggingGridRef.current = gridPosition;
        }
      }}
      onPointerUp={(event) => {
        const draggedPin = draggingPinRef.current;
        const pinGrid = draggingGridRef.current;
        if (draggedPin && pinGrid) {
          const component = components.find((item) => item.id === draggedPin.componentId);
          if (component && !sameGridPosition(pinGridPosition(component, draggedPin.pin), pinGrid)) {
            onMovePin(draggedPin.componentId, draggedPin.pin, pinGrid);
          }
        }
        const componentId = draggingComponentIdRef.current;
        const dragGrid = draggingGridRef.current;
        const component = components.find((item) => item.id === componentId);
        if (componentId && dragGrid && component && !component.mounted && !sameGridPosition(component.position, dragGrid)) {
          onMoveComponent(componentId, dragGrid);
        }

        const pointerDown = pointerDownRef.current;
        if (pointerDown?.editing && event.button === 0) {
          const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
          if (moved < 4) {
            const gridPosition = getGridPositionFromPointer(event);
            if (gridPosition) {
              onRouteEditPoint?.(gridPosition);
            }
          }
        }
        pointerDownRef.current = undefined;
        draggingComponentIdRef.current = undefined;
        draggingPinRef.current = undefined;
        draggingGridRef.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setOrbitEnabled(true);
      }}
      onPointerLeave={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        pointerDownRef.current = undefined;
        draggingComponentIdRef.current = undefined;
        draggingPinRef.current = undefined;
        draggingGridRef.current = undefined;
        setOrbitEnabled(true);
      }}
      onPointerCancel={(event) => {
        const draggedPin = draggingPinRef.current;
        const component = components.find((item) => item.id === draggedPin?.componentId);
        if (component) {
          replaceComponentPreview(component);
        }
        pointerDownRef.current = undefined;
        draggingComponentIdRef.current = undefined;
        draggingPinRef.current = undefined;
        draggingGridRef.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setOrbitEnabled(true);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const hit = pickComponentFromClient(event.clientX, event.clientY);
        if (hit) {
          onSelectComponent(hit);
          onSelectPin(undefined);
          setContextMenu({ x: event.clientX, y: event.clientY });
        } else {
          setContextMenu(undefined);
          onSelectComponent(undefined);
          onSelectPin(undefined);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onMountSelected();
          setContextMenu(undefined);
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          onDeleteSelected();
          setContextMenu(undefined);
        }
      }}
      tabIndex={0}
    >
      <div ref={hostRef} className="three-host" />
      {contextMenu && (
        <div
          className="component-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" disabled={isSelectedMounted()} onClick={() => { onMountSelected(); setContextMenu(undefined); }}>
            放置
          </button>
          <button type="button" disabled={!isSelectedMounted()} onClick={() => { onUnmountSelected(); setContextMenu(undefined); }}>
            拿起
          </button>
          <button type="button" disabled={isSelectedMounted()} onClick={() => { onRotateSelected(); setContextMenu(undefined); }}>
            旋转
          </button>
          {components.find((component) => component.id === selectedComponentId && component.kind !== "adapter")?.adapter && (
            <button
              type="button"
              disabled={isSelectedMounted()}
              title={isSelectedMounted() ? "放置后不能移除转接板" : undefined}
              onClick={() => { onDetachAdapter(); setContextMenu(undefined); }}
            >
              移除转接板
            </button>
          )}
          {selectedComponentId && canAssignPackage?.(selectedComponentId) && (
            <button
              type="button"
              onClick={() => {
                onAssignPackage?.(selectedComponentId);
                setContextMenu(undefined);
              }}
            >
              使用元件库封装…
            </button>
          )}
          <button type="button" onClick={() => { onDeleteSelected(); setContextMenu(undefined); }}>
            删除
          </button>
        </div>
      )}
      <div className="view-controls" aria-label="3D 视角">
        <BoardSizeInput
          label="W"
          value={board.width}
          disabled={!boardModel.capabilities.canResizeWidth}
          title={!boardModel.capabilities.canResizeWidth ? "Board width is determined by its definition" : undefined}
          onCommit={(width) => onUpdateBoard({ ...board, width })}
        />
        <BoardSizeInput
          label="H"
          value={board.height}
          onCommit={(height) => onUpdateBoard(board.kind === "breadboard"
            ? createBreadboardDefinition(height, board.breadboard?.modules ?? 1)
            : { ...board, height })}
        />
        <button className="view-button" type="button" onClick={() => setView("top")}>
          正面
        </button>
        {boardModel.capabilities.canRenderBottomView && (
          <button className="view-button" type="button" onClick={() => setView("bottom")}>
            背面
          </button>
        )}
        <button className="view-button" type="button" onClick={() => setView("iso")}>
          斜视
        </button>
      </div>
    </div>
  );

  function getGridPositionFromDrop(event: React.DragEvent<HTMLDivElement>): [number, number] | undefined {
    return getGridPosition(event.clientX, event.clientY);
  }

  function getGridPositionFromPointer(event: React.PointerEvent<HTMLDivElement>): [number, number] | undefined {
    return getGridPosition(event.clientX, event.clientY);
  }

  function getGridPosition(clientX: number, clientY: number): [number, number] | undefined {
    const host = hostRef.current;
    const camera = cameraRef.current;
    const plane = boardPlaneRef.current;
    if (!host || !camera || !plane) {
      return undefined;
    }

    const rect = host.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    const didHit = raycaster.ray.intersectPlane(plane, hit);
    if (!didHit) {
      return undefined;
    }

    const gridX = Math.round(hit.x + board.width / 2 - 0.5);
    const gridY = Math.round(hit.z + board.height / 2 - 0.5);

    const snapped = getBoardModel(board).snapToHole([gridX, gridY]);
    return snapped ?? [
      Math.max(0, Math.min(board.width - 1, gridX)),
      Math.max(0, Math.min(board.height - 1, gridY))
    ];
  }

  function pickComponent(event: React.PointerEvent<HTMLDivElement>) {
    return pickComponentFromClient(event.clientX, event.clientY);
  }

  function pickPin(event: React.PointerEvent<HTMLDivElement>) {
    return pickPinFromClient(event.clientX, event.clientY) ?? pickPinNearGrid(event.clientX, event.clientY);
  }

  function pickPinFromClient(clientX: number, clientY: number): SelectedPin | undefined {
    const intersections = intersectComponentObjects(clientX, clientY);
    for (const intersection of intersections) {
      const pinObject = findPinObject(intersection.object);
      const componentId = pinObject?.userData.componentId;
      const pinIndex = pinObject?.userData.pinIndex;
      if (typeof componentId === "string" && typeof pinIndex === "number") {
        return { componentId, pin: pinIndex + 1 };
      }
    }
    return undefined;
  }

  function pickPinNearGrid(clientX: number, clientY: number): SelectedPin | undefined {
    if (!selectedComponentId) {
      return undefined;
    }
    const gridPosition = getGridPosition(clientX, clientY);
    const component = components.find((item) => item.id === selectedComponentId);
    if (!gridPosition || !component) {
      return undefined;
    }

    const anchor = getComponentPinAnchor(component);
    const matchedPinIndex = component.pinOffsets.findIndex((offset) => {
      const [rx, ry] = rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
      return component.position[0] + rx === gridPosition[0] && component.position[1] + ry === gridPosition[1];
    });
    return matchedPinIndex >= 0 ? { componentId: component.id, pin: matchedPinIndex + 1 } : undefined;
  }

  function pickComponentFromClient(clientX: number, clientY: number) {
    const intersections = intersectComponentObjects(clientX, clientY);
    const picked = intersections
      .map((intersection) => findComponentRoot(intersection.object))
      .find((object): object is THREE.Object3D => Boolean(object?.userData.componentId));
    return picked?.userData.componentId as string | undefined;
  }

  function intersectComponentObjects(clientX: number, clientY: number) {
    const host = hostRef.current;
    const sceneObjects = sceneObjectsRef.current;
    if (!host || !sceneObjects) {
      return [];
    }

    const rect = host.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, sceneObjects.camera);
    return raycaster.intersectObjects(sceneObjects.componentsGroup.children, true);
  }

  function isSelectedMounted() {
    return Boolean(components.find((component) => component.id === selectedComponentId)?.mounted);
  }

  function setOrbitEnabled(enabled: boolean) {
    const controls = controlsRef.current;
    if (controls) {
      controls.enabled = enabled;
    }
  }

  function moveComponentObject(component: PlacedComponent, position: [number, number]) {
    const sceneObjects = sceneObjectsRef.current;
    if (!sceneObjects) {
      return;
    }

    const object = sceneObjects.componentsGroup.children.find((child) => child.userData.componentRootMarker && child.userData.componentId === component.id);
    if (!object) {
      return;
    }

    const nextPosition = getComponentWorldPosition({ ...component, position }, board);
    const delta = nextPosition.clone().sub(object.position);
    object.position.copy(nextPosition);
    sceneObjects.componentsGroup.children.forEach((child) => {
      if (child !== object && child.userData.componentId === component.id) {
        child.position.add(delta);
      }
    });
  }

  function replaceComponentPreview(component: PlacedComponent) {
    const sceneObjects = sceneObjectsRef.current;
    if (!sceneObjects) {
      return;
    }

    const existing = sceneObjects.componentsGroup.children.filter((child) => child.userData.componentId === component.id);
    existing.forEach((child) => {
      sceneObjects.componentsGroup.remove(child);
      disposeObject(child);
    });

    const previewGroup = createPlacedComponents([component], board, selectedComponentId, theme);
    while (previewGroup.children.length > 0) {
      sceneObjects.componentsGroup.add(previewGroup.children[0]);
    }
  }
}

function isMoveShortcutPressed(event: React.PointerEvent<HTMLDivElement>, modifier: DragMoveModifier) {
  if (modifier === "none") {
    return true;
  }
  if (modifier === "shift") {
    return event.shiftKey;
  }
  if (modifier === "alt") {
    return event.altKey;
  }
  return event.ctrlKey || event.metaKey;
}

/**
 * 板子尺寸输入框：输入过程中保留原始文本（输入 "30" 时不会在打出 "3" 的瞬间被夹到 5），
 * 只有在失焦或回车时才做取整与上下限修正。
 */
function BoardSizeInput({
  label,
  value,
  disabled,
  title,
  onCommit
}: {
  label: string;
  value: number;
  disabled?: boolean;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const parsed = Number(draft);
    const next = draft.trim() !== "" && Number.isFinite(parsed)
      ? Math.max(5, Math.min(150, Math.round(parsed)))
      : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <label className="board-size-control">
      <span>{label}</span>
      <input
        type="number"
        min={5}
        max={150}
        value={draft}
        disabled={disabled}
        title={title}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}
