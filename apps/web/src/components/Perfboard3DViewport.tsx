import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  componentLibraryByKey,
  type LibraryComponentDefinition
} from "../features/project/componentLibrary.ts";
import type { BoardSize } from "../types/project.ts";
import type { DragMoveModifier } from "../types/project.ts";
import type { JumperRoute } from "../types/project.ts";
import type { PlacedComponent } from "../types/project.ts";
import type { RoutedNetEndpoint } from "../types/project.ts";
import type { RoutingState } from "../types/project.ts";
import type { ThemeMode } from "../types/project.ts";
import { createParametricComponent, setComponentTheme } from "../renderer3d/parametricComponents.ts";
import { bendComponentPin, isManuallyBendable, pinGridPosition } from "../features/layout/manualPlacement.ts";
import { createBreadboardDefinition } from "../features/board/breadboard.ts";
import { getBoardModel } from "../features/board/factory.ts";
import { rotateGridOffset } from "../features/board/placement.ts";
import { segmentsIntersect, shareEndpoint } from "../features/routing/routingGeometry.ts";
import { createBoardObject } from "../features/board/rendering.ts";

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

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(80, 110, 95);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.radius = 4;
    keyLightRef.current = keyLight;
    scene.add(keyLight);

    // Soft fill light from below so the back side of the board is not much darker than the front.
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
    fillLight.position.set(-70, -45, -80);
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
            移除
          </button>
          <button type="button" disabled={isSelectedMounted()} onClick={() => { onRotateSelected(); setContextMenu(undefined); }}>
            旋转
          </button>
          <button type="button" onClick={() => { onDeleteSelected(); setContextMenu(undefined); }}>
            删除
          </button>
        </div>
      )}
      <div className="view-controls" aria-label="3D 视角">
        <label className="board-size-control">
          <span>W</span>
          <input
            type="number"
            min={5}
            max={150}
            value={board.width}
            disabled={!boardModel.capabilities.canResizeWidth}
            title={!boardModel.capabilities.canResizeWidth ? "Board width is determined by its definition" : undefined}
            onChange={(event) => onUpdateBoard({ ...board, width: toBoardSize(event.target.value) })}
          />
        </label>
        <label className="board-size-control">
          <span>H</span>
          <input
            type="number"
            min={5}
            max={150}
            value={board.height}
            onChange={(event) => onUpdateBoard(board.kind === "breadboard"
              ? createBreadboardDefinition(toBoardSize(event.target.value), board.breadboard?.modules ?? 1)
              : { ...board, height: toBoardSize(event.target.value) })}
          />
        </label>
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

    const anchor = getPinAnchor(component.pinOffsets);
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

function toBoardSize(value: string) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return 20;
  }
  return Math.max(5, Math.min(150, Math.round(next)));
}

function createPlacedComponents(components: PlacedComponent[], board: BoardSize, selectedComponentId: string | undefined, theme: ThemeMode) {
  const dark = theme === "dark";
  setComponentTheme(dark);
  const group = new THREE.Group();
  components.forEach((placed) => {
    const component = createParametricComponent({
      kind: placed.kind,
      label: placed.label,
      pinCount: placed.pinCount,
      pinOffsets: placed.pinOffsets,
      isFallback: placed.isFallback
    });
    component.position.copy(getComponentWorldPosition(placed, board));
    component.rotation.y = placed.rotation;
    if (placed.mounted) {
      createPinLandingRings(component, placed, board);
    }
    component.userData.componentId = placed.id;
    component.userData.componentRootMarker = true;
    component.traverse((child) => {
      child.userData.componentId = placed.id;
      child.userData.componentRoot = component;
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    if (placed.id === selectedComponentId) {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.5, 36),
        new THREE.MeshBasicMaterial({ color: 0x235bdb, side: THREE.DoubleSide })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = -0.05;
      component.add(marker);

      createPinHighlights(placed, board).forEach((highlight) => group.add(highlight));
    }
    group.add(component);

    if (placed.mounted) {
      createBacksidePins(placed, board).forEach((pin) => group.add(pin));
    }
  });

  applyThemeToGroup(group, dark);
  return group;
}

function createPinLandingRings(group: THREE.Group, placed: PlacedComponent, board: BoardSize) {
  const anchor = getPinAnchor(placed.pinOffsets);
  const boardModel = getBoardModel(board);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: board.kind === "breadboard" ? 0x8b969d : 0xb9c2c8,
    roughness: 0.3,
    metalness: 0.68,
    side: THREE.DoubleSide
  });

  placed.pinOffsets.forEach((offset, index) => {
    const hole = pinGridPosition(placed, index + 1);
    if (!boardModel.isValidHole(hole)) return;

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.18, 24), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(offset[0] - anchor[0], 0.378, offset[1] - anchor[1]);
    ring.userData.componentId = placed.id;
    group.add(ring);
  });
}

const THEME_DARK_LIGHTNESS_FLOOR = 0.4;

function applyThemeToGroup(group: THREE.Group, dark: boolean) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || !("color" in material)) {
        continue;
      }
      if (dark) {
        if (material.userData.themeOriginalColor === undefined) {
          material.userData.themeOriginalColor = material.color.getHex();
        }
        const hsl = { h: 0, s: 0, l: 0 };
        new THREE.Color(material.userData.themeOriginalColor as number).getHSL(hsl);
        if (hsl.l < THEME_DARK_LIGHTNESS_FLOOR) {
          // Only lift dark bodies (IC housings, black plastic, dark shells) so they
          // stay visible against the dark background; colorful parts keep their
          // hue and saturation instead of being washed out toward white.
          hsl.l = 0.42 + (THEME_DARK_LIGHTNESS_FLOOR - hsl.l) * 0.45;
          hsl.s = Math.min(1, hsl.s * 1.15);
          material.color.setHSL(hsl.h, hsl.s, hsl.l);
        } else {
          material.color.setHex(material.userData.themeOriginalColor as number);
        }
      } else if (material.userData.themeOriginalColor !== undefined) {
        material.color.setHex(material.userData.themeOriginalColor as number);
      }
    }
  });
}

function getComponentWorldPosition(component: PlacedComponent, board: BoardSize) {
  const anchor = getPinAnchor(component.pinOffsets);
  const rotatedAnchor = rotateGridOffset(anchor, component.rotation);
  const [gridX, gridY] = component.position;
  return new THREE.Vector3(
    gridX - board.width / 2 + 0.5 - rotatedAnchor[0],
    component.mounted ? -0.1 : 3.5,
    gridY - board.height / 2 + 0.5 - rotatedAnchor[1]
  );
}

function sameGridPosition(a: [number, number] | undefined, b: [number, number] | undefined) {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

function createPinHighlights(component: PlacedComponent, board: BoardSize) {
  const anchor = getPinAnchor(component.pinOffsets);
  return component.pinOffsets.map((offset, index) => {
    const [rx, ry] = rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
    const gridX = component.position[0] + rx;
    const gridY = component.position[1] + ry;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.46, 32),
      new THREE.MeshBasicMaterial({
        color: 0x235bdb,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(gridX - board.width / 2 + 0.5, 0.305, gridY - board.height / 2 + 0.5);
    ring.userData.componentId = component.id;
    ring.userData.pinIndex = index;
    return ring;
  });
}

function createBacksidePins(component: PlacedComponent, board: BoardSize) {
  const anchor = getPinAnchor(component.pinOffsets);
  return component.pinOffsets.map((offset, index) => {
    const [rx, ry] = rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
    const gridX = component.position[0] + rx;
    const gridY = component.position[1] + ry;
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.38, 14),
      new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.2, metalness: 0.75 })
    );
    pin.position.set(gridX - board.width / 2 + 0.5, -0.5, gridY - board.height / 2 + 0.5);
    pin.userData.componentId = component.id;
    pin.userData.pinIndex = index;
    return pin;
  });
}

function createNetEndpointHighlights(endpoints: RoutedNetEndpoint[], board: BoardSize) {
  const group = new THREE.Group();
  endpoints.forEach((endpoint) => {
    const x = endpoint.grid[0] - board.width / 2 + 0.5;
    const z = endpoint.grid[1] - board.height / 2 + 0.5;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.64, 36),
      new THREE.MeshBasicMaterial({
        color: 0x00ff8a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.36, z);
    group.add(ring);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.75, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff8a, transparent: true, opacity: 0.55 })
    );
    post.position.set(x, 0.62, z);
    group.add(post);

    const bottomRing = ring.clone();
    bottomRing.position.set(x, -0.78, z);
    group.add(bottomRing);

    const bottomPost = post.clone();
    bottomPost.position.set(x, -0.88, z);
    group.add(bottomPost);
  });
  return group;
}

function createRoutingIssueHighlights(routing: RoutingState, board: BoardSize) {
  const group = new THREE.Group();
  const seen = new Set<string>();
  const pinStatuses = routing.drc?.pinStatuses ?? [];

  pinStatuses.forEach((pin) => {
    const id = `${pin.ref}:${pin.pin}:${pin.grid[0]},${pin.grid[1]}:${pin.status}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    const color = pin.status === "CONNECTED"
      ? 0x22c55e
      : pin.status === "NO_NET_UNUSED"
        ? 0xf2c94c
        : 0xff2d20;
    const opacity = pin.status === "CONNECTED" ? 0.34 : 0.96;
    const radius = pin.status === "CONNECTED" ? [0.32, 0.44] : [0.5, 0.78];

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius[0], radius[1], 36),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthTest: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pin.grid[0] - board.width / 2 + 0.5, 0.42, pin.grid[1] - board.height / 2 + 0.5);
    ring.renderOrder = 30;
    group.add(ring);

    if (pin.status === "CONNECTED") {
      return;
    }

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.05, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, depthTest: false })
    );
    post.position.set(pin.grid[0] - board.width / 2 + 0.5, 0.78, pin.grid[1] - board.height / 2 + 0.5);
    post.renderOrder = 30;
    group.add(post);
  });

  return group;
}

function createRouteObjects(routing: RoutingState, board: BoardSize, components: PlacedComponent[]) {
  const group = new THREE.Group();
  const topOverlay = new THREE.Group();
  topOverlay.userData.routeSide = "top";
  const bottomOverlay = new THREE.Group();
  bottomOverlay.userData.routeSide = "bottom";
  group.add(topOverlay, bottomOverlay);

  if ((board.kind ?? "perfboard") === "breadboard") {
    const levels = computeJumperCrossLevels(routing.jumpers, components);
    routing.jumpers.forEach((jumper, index) => {
      topOverlay.add(createBreadboardJumper(jumper.from, jumper.to, board, createJumperMaterials(), levels[index]));
    });
  } else {
    routing.traces.forEach((trace) => {
      const materials = createJumperMaterials(0xc2c8ce);
      for (let index = 1; index < trace.points.length; index += 1) {
        bottomOverlay.add(createOutlinedRouteSegment(trace.points[index - 1], trace.points[index], board, -0.58, materials, 0.13, 40));
      }
    });
    const levels = computeJumperCrossLevels(routing.jumpers, components);
    routing.jumpers.forEach((jumper, index) => {
      bottomOverlay.add(createBottomJumper(jumper.from, jumper.to, board, createJumperMaterials(0xffc857), levels[index]));
    });
  }

  return group;
}

function updateRouteOverlayVisibility(routes: THREE.Group, camera: THREE.Camera, target: THREE.Vector3) {
  const isTopView = camera.position.y >= target.y;
  routes.children.forEach((overlay) => {
    const side = overlay.userData.routeSide;
    if (side === "top" || side === "bottom") {
      overlay.visible = side === (isTopView ? "top" : "bottom");
    }
  });
}

const BREADBOARD_JUMPER_COLOR = 0xf5c518;
const BREADBOARD_JUMPER_BASE_Y = 0.32;

function createJumperMaterials(coreColor = BREADBOARD_JUMPER_COLOR) {
  return {
    outline: new THREE.MeshBasicMaterial({ color: 0x17212b, depthTest: false, depthWrite: false }),
    halo: new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
    core: new THREE.MeshBasicMaterial({ color: coreColor, depthTest: false, depthWrite: false }),
    endpoint: new THREE.MeshBasicMaterial({ color: coreColor, depthTest: false, depthWrite: false })
  };
}

type JumperMaterials = ReturnType<typeof createJumperMaterials>;

function createOutlinedRouteSegment(
  from: [number, number],
  to: [number, number],
  board: BoardSize,
  y: number,
  materials: JumperMaterials,
  radius: number,
  renderOrder: number
) {
  const group = new THREE.Group();
  const outline = createSegment(from, to, board, y, materials.outline, radius + 0.075);
  const halo = createSegment(from, to, board, y, materials.halo, radius + 0.04);
  const core = createSegment(from, to, board, y, materials.core, radius);
  outline.renderOrder = renderOrder;
  halo.renderOrder = renderOrder + 1;
  core.renderOrder = renderOrder + 2;
  group.add(outline, halo, core);
  return group;
}

function computeJumperCrossLevels(jumpers: JumperRoute[], components: PlacedComponent[]) {
  const levels = new Array<number>(jumpers.length).fill(0);

  // Pass 1 — containment: a jumper that is completely covered by another one
  // bulges above its coverer (the coverer stays flat). Iterate to a fixpoint
  // so nested chains A⊃B⊃C stack one above the other.
  let changed = true;
  while (changed) {
    changed = false;
    for (let inner = 0; inner < jumpers.length; inner += 1) {
      let coverer = -1;
      for (let outer = 0; outer < jumpers.length; outer += 1) {
        if (outer === inner) continue;
        if (isContainedIn(jumpers[inner], jumpers[outer]) &&
          (coverer === -1 || jumperSpan(jumpers[outer]) < jumperSpan(jumpers[coverer]))) {
          coverer = outer;
        }
      }
      if (coverer >= 0) {
        const next = levels[coverer] + 1;
        if (next !== levels[inner]) {
          levels[inner] = next;
          changed = true;
        }
      }
    }
  }

  // Pass 1.5 — a wire running underneath a mounted component body (e.g. a
  // chip straddling the channel) must bulge so it stays visible.
  const footprintBoxes = components
    .filter((component) => component.mounted)
    .map(componentFootprintBox);
  for (let index = 0; index < jumpers.length; index += 1) {
    if (levels[index] === 0 && footprintBoxes.some((box) => jumperSegmentPassesThroughBox(jumpers[index], box))) {
      levels[index] = 1;
    }
  }

  // Pass 2 — remaining intersections (crossings, partial overlaps): ensure
  // different levels without disturbing the containment stacking.
  for (let later = 0; later < jumpers.length; later += 1) {
    const blocked = new Set<number>();
    for (let earlier = 0; earlier < later; earlier += 1) {
      if (jumperSegmentsCross(jumpers[earlier], jumpers[later])) {
        blocked.add(levels[earlier]);
      }
    }
    let level = levels[later];
    while (blocked.has(level)) level += 1;
    levels[later] = level;
  }
  return levels;
}

function componentFootprintBox(component: PlacedComponent) {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const holes = component.pinOffsets.map((offset) => rotateGridOffset(
    [offset[0] - anchor[0], offset[1] - anchor[1]],
    component.rotation
  ));
  const xs = holes.map(([x]) => x);
  const ys = holes.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const margin = component.pinOffsets.length <= 2 ? 0 : 0.5;
  return {
    minX: component.position[0] + minX - margin,
    maxX: component.position[0] + maxX + margin,
    minY: component.position[1] + minY - margin,
    maxY: component.position[1] + maxY + margin
  };
}

function jumperSegmentPassesThroughBox(jumper: JumperRoute, box: { minX: number; minY: number; maxX: number; maxY: number }) {
  const inside = ([x, y]: [number, number]) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
  if (inside(jumper.from) || inside(jumper.to)) {
    return false;
  }
  const [x1, y1] = jumper.from;
  const [x2, y2] = jumper.to;
  if (x1 === x2) {
    if (x1 < box.minX || x1 > box.maxX) return false;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    return hi > box.minY && lo < box.maxY;
  }
  if (y1 === y2) {
    if (y1 < box.minY || y1 > box.maxY) return false;
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    return hi > box.minX && lo < box.maxX;
  }
  return false;
}

function jumperSpan(jumper: JumperRoute) {
  return Math.abs(jumper.from[0] - jumper.to[0]) + Math.abs(jumper.from[1] - jumper.to[1]);
}

function isContainedIn(inner: JumperRoute, outer: JumperRoute) {
  if (outer.from[0] === outer.to[0] && inner.from[0] === inner.to[0] && outer.from[0] === inner.from[0]) {
    const outerStart = Math.min(outer.from[1], outer.to[1]);
    const outerEnd = Math.max(outer.from[1], outer.to[1]);
    const innerStart = Math.min(inner.from[1], inner.to[1]);
    const innerEnd = Math.max(inner.from[1], inner.to[1]);
    return innerStart >= outerStart && innerEnd <= outerEnd && (innerStart !== outerStart || innerEnd !== outerEnd);
  }
  if (outer.from[1] === outer.to[1] && inner.from[1] === inner.to[1] && outer.from[1] === inner.from[1]) {
    const outerStart = Math.min(outer.from[0], outer.to[0]);
    const outerEnd = Math.max(outer.from[0], outer.to[0]);
    const innerStart = Math.min(inner.from[0], inner.to[0]);
    const innerEnd = Math.max(inner.from[0], inner.to[0]);
    return innerStart >= outerStart && innerEnd <= outerEnd && (innerStart !== outerStart || innerEnd !== outerEnd);
  }
  return false;
}

function jumperSegmentsCross(first: JumperRoute, second: JumperRoute) {
  if (!segmentsIntersect(first.from, first.to, second.from, second.to)) {
    return false;
  }
  // A chain (A ends where B starts) only touches at one point and needs no
  // lift, but collinear wires that overlap — e.g. two jumpers running along
  // the same column where one hides the other — must be separated.
  return !shareEndpoint(first.from, first.to, second.from, second.to) || collinearOverlap(first, second);
}

function collinearOverlap(first: JumperRoute, second: JumperRoute) {
  if (first.from[0] === first.to[0] && second.from[0] === second.to[0] && first.from[0] === second.from[0]) {
    const firstStart = Math.min(first.from[1], first.to[1]);
    const firstEnd = Math.max(first.from[1], first.to[1]);
    const secondStart = Math.min(second.from[1], second.to[1]);
    const secondEnd = Math.max(second.from[1], second.to[1]);
    return Math.max(firstStart, secondStart) < Math.min(firstEnd, secondEnd);
  }
  if (first.from[1] === first.to[1] && second.from[1] === second.to[1] && first.from[1] === second.from[1]) {
    const firstStart = Math.min(first.from[0], first.to[0]);
    const firstEnd = Math.max(first.from[0], first.to[0]);
    const secondStart = Math.min(second.from[0], second.to[0]);
    const secondEnd = Math.max(second.from[0], second.to[0]);
    return Math.max(firstStart, secondStart) < Math.min(firstEnd, secondEnd);
  }
  return false;
}

function createBreadboardJumper(
  from: [number, number],
  to: [number, number],
  board: BoardSize,
  materials: JumperMaterials,
  level: number
) {
  const start = new THREE.Vector3(from[0] - board.width / 2 + 0.5, BREADBOARD_JUMPER_BASE_Y, from[1] - board.height / 2 + 0.5);
  const end = new THREE.Vector3(to[0] - board.width / 2 + 0.5, BREADBOARD_JUMPER_BASE_Y, to[1] - board.height / 2 + 0.5);
  const group = new THREE.Group();
  const renderOrder = 40 + level * 3;

  if (level === 0) {
    group.add(createBreadboardJumperSegment(from, to, board, materials.outline, 0.14, renderOrder));
    group.add(createBreadboardJumperSegment(from, to, board, materials.halo, 0.105, renderOrder + 1));
    group.add(createBreadboardJumperSegment(from, to, board, materials.core, 0.072, renderOrder + 2));
  } else {
    // Visible bulge: the arch bows SIDEWAYS in the board plane (plus a small
    // rise), so it is obvious even from a top-down view; stacked levels bow
    // to alternating sides.
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    const lateral = Math.min(0.5 + (level - 1) * 0.35, Math.max(0.35, length * 0.25));
    const side = level % 2 === 1 ? 1 : -1;
    const lift = 0.22 + (level - 1) * 0.16;
    const perpendicular = new THREE.Vector3(-direction.z / length, 0, direction.x / length).multiplyScalar(lateral * side);
    const upward = new THREE.Vector3(0, lift, 0);
    const mid1 = start.clone().lerp(end, 1 / 3).add(perpendicular).add(upward);
    const mid2 = start.clone().lerp(end, 2 / 3).add(perpendicular).add(upward);
    const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, end]);
    group.add(createBreadboardJumperTube(curve, materials.outline, 0.14, renderOrder));
    group.add(createBreadboardJumperTube(curve, materials.halo, 0.105, renderOrder + 1));
    group.add(createBreadboardJumperTube(curve, materials.core, 0.072, renderOrder + 2));
  }

  const startJoint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), materials.outline);
  const endJoint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), materials.outline);
  startJoint.renderOrder = renderOrder;
  endJoint.renderOrder = renderOrder;
  startJoint.position.copy(start);
  endJoint.position.copy(end);
  group.add(startJoint, endJoint);

  const startCore = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), materials.endpoint);
  const endCore = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), materials.endpoint);
  startCore.renderOrder = renderOrder + 2;
  endCore.renderOrder = renderOrder + 2;
  startCore.position.copy(start);
  endCore.position.copy(end);
  group.add(startCore, endCore);
  return group;
}

function createBreadboardJumperSegment(
  from: [number, number],
  to: [number, number],
  board: BoardSize,
  material: THREE.Material,
  radius: number,
  renderOrder: number
) {
  const mesh = createSegment(from, to, board, BREADBOARD_JUMPER_BASE_Y, material, radius);
  mesh.renderOrder = renderOrder;
  return mesh;
}

function createBreadboardJumperTube(curve: THREE.CatmullRomCurve3, material: THREE.Material, radius: number, renderOrder: number) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 12, false), material);
  mesh.renderOrder = renderOrder;
  return mesh;
}

function createBottomJumper(
  from: [number, number],
  to: [number, number],
  board: BoardSize,
  materials: JumperMaterials,
  level: number
) {
  const isTopWire = getBoardModel(board).capabilities.jumperSide === "top";
  const wireY = isTopWire ? 0.48 : -0.7;
  const start = new THREE.Vector3(from[0] - board.width / 2 + 0.5, wireY, from[1] - board.height / 2 + 0.5);
  const end = new THREE.Vector3(to[0] - board.width / 2 + 0.5, wireY, to[1] - board.height / 2 + 0.5);
  const span = start.distanceTo(end);
  const lift = isTopWire ? Math.max(0.16, Math.min(0.52, span * 0.035)) : Math.max(1.2, Math.min(5.2, span * 0.22));
  const middle = start.clone().lerp(end, 0.5);
  const side = level % 2 === 0 ? 1 : -1;
  middle.y += (isTopWire ? 1 : -1) * (lift + level * 0.3);
  const direction = end.clone().sub(start);
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize()
    .multiplyScalar(side * Math.min(0.45 + Math.max(0, level - 1) * 0.2, Math.max(0.3, span * 0.12)));

  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([start, middle.clone().add(perpendicular), end]);
  const renderOrder = 40 + level * 3;
  const radii = [isTopWire ? 0.14 : 0.19, isTopWire ? 0.105 : 0.15, isTopWire ? 0.072 : 0.11];
  const materialsByLayer = [materials.outline, materials.halo, materials.core];
  materialsByLayer.forEach((material, layer) => {
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, radii[layer], 12, false), material);
    wire.renderOrder = renderOrder + layer;
    group.add(wire);
  });
  const jointRadius = isTopWire ? 0.16 : 0.22;
  const startJoint = new THREE.Mesh(new THREE.SphereGeometry(jointRadius, 16, 12), materials.outline);
  const endJoint = new THREE.Mesh(new THREE.SphereGeometry(jointRadius, 16, 12), materials.outline);
  startJoint.renderOrder = renderOrder;
  endJoint.renderOrder = renderOrder;

  startJoint.position.copy(start);
  endJoint.position.copy(end);
  group.add(startJoint, endJoint);
  const startCore = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 0.66, 16, 12), materials.endpoint);
  const endCore = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 0.66, 16, 12), materials.endpoint);
  startCore.renderOrder = renderOrder + 2;
  endCore.renderOrder = renderOrder + 2;
  startCore.position.copy(start);
  endCore.position.copy(end);
  group.add(startCore, endCore);
  return group;
}

function createSegment(
  from: [number, number],
  to: [number, number],
  board: BoardSize,
  y: number,
  material: THREE.Material,
  radius: number
) {
  const start = new THREE.Vector3(from[0] - board.width / 2 + 0.5, y, from[1] - board.height / 2 + 0.5);
  const end = new THREE.Vector3(to[0] - board.width / 2 + 0.5, y, to[1] - board.height / 2 + 0.5);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(0.01, length), 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function getPinAnchor(pinOffsets: Array<[number, number]>): [number, number] {
  if (pinOffsets.length === 0) {
    return [0, 0];
  }

  return pinOffsets[0];
}

function findComponentRoot(object: THREE.Object3D): THREE.Object3D | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.componentRoot) {
      return current.userData.componentRoot as THREE.Object3D;
    }
    if (current.userData.componentId) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function findPinObject(object: THREE.Object3D): THREE.Object3D | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.pinIndex === "number" && current.userData.componentId) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Sprite) {
      const mesh = child as THREE.Mesh | THREE.LineSegments | THREE.Sprite;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (material.userData.shared) {
          return;
        }
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        });
        material.dispose();
      });

      if ("geometry" in mesh && mesh.geometry) {
        mesh.geometry.dispose();
      }
    }
  });
}
