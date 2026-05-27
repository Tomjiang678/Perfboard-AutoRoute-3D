import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  componentLibraryByKey,
  type LibraryComponentDefinition
} from "../features/project/componentLibrary";
import type { BoardSize } from "../types/project";
import type { DragMoveModifier } from "../types/project";
import type { PlacedComponent } from "../types/project";
import type { RoutedNetEndpoint } from "../types/project";
import type { RoutingState } from "../types/project";
import { createParametricComponent } from "../renderer3d/parametricComponents";

interface Perfboard3DViewportProps {
  board: BoardSize;
  components: PlacedComponent[];
  selectedComponentId?: string;
  onPlaceComponent: (component: LibraryComponentDefinition, position: [number, number]) => void;
  onSelectComponent: (componentId: string | undefined) => void;
  onMoveComponent: (componentId: string, position: [number, number]) => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onMountSelected: () => void;
  onUnmountSelected: () => void;
  onUpdateBoard: (board: BoardSize) => void;
  highlightedEndpoints: RoutedNetEndpoint[];
  routing: RoutingState;
  transparentBoard: boolean;
  routeEditMode?: "select" | "solder" | "jumper" | "erase";
  isPlacingComponent?: boolean;
  dragMoveModifier: DragMoveModifier;
  onRouteEditPoint?: (point: [number, number]) => void;
}

export function Perfboard3DViewport({
  board,
  components,
  selectedComponentId,
  onPlaceComponent,
  onSelectComponent,
  onMoveComponent,
  onRotateSelected,
  onDeleteSelected,
  onMountSelected,
  onUnmountSelected,
  onUpdateBoard,
  highlightedEndpoints,
  routing,
  transparentBoard,
  routeEditMode = "select",
  isPlacingComponent = false,
  dragMoveModifier,
  onRouteEditPoint
}: Perfboard3DViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardPlaneRef = useRef<THREE.Plane | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | undefined>();
  const sceneObjectsRef = useRef<{
    camera: THREE.PerspectiveCamera;
    componentsGroup: THREE.Group;
  } | null>(null);
  const viewStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const draggingComponentIdRef = useRef<string | undefined>(undefined);
  const draggingGridRef = useRef<[number, number] | undefined>(undefined);
  const pointerDownRef = useRef<{ x: number; y: number; editing: boolean } | undefined>(undefined);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
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

    const boardObject = createBoardObject(board, transparentBoard);
    scene.add(boardObject);
    const componentsGroup = createPlacedComponents(components, board, selectedComponentId);
    scene.add(componentsGroup);
    const netHighlights = createNetEndpointHighlights(highlightedEndpoints, board);
    scene.add(netHighlights);
    const routeObject = createRouteObjects(routing, board);
    scene.add(routeObject);
    const routingIssueHighlights = createRoutingIssueHighlights(routing, board);
    scene.add(routingIssueHighlights);
    boardPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.28);
    sceneObjectsRef.current = { camera, componentsGroup };

    const boardMax = Math.max(board.width, board.height);
    const distance = Math.max(55, boardMax * 1.25);
    const savedView = viewStateRef.current;
    controls.target.copy(savedView?.target ?? new THREE.Vector3(0, 0, 0));
    camera.position.copy(savedView?.position ?? new THREE.Vector3(distance * 0.9, distance * 0.75, distance * 0.9));
    camera.lookAt(0, 0, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(80, 110, 95);
    scene.add(keyLight);

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
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      viewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone()
      };
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      disposeObject(boardObject);
      disposeObject(componentsGroup);
      disposeObject(netHighlights);
      disposeObject(routeObject);
      disposeObject(routingIssueHighlights);
      sceneObjectsRef.current = null;
      host.removeChild(renderer.domElement);
    };
  }, [board, components, selectedComponentId, highlightedEndpoints, routing, transparentBoard]);

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
        } else {
          draggingComponentIdRef.current = undefined;
          draggingGridRef.current = undefined;
          onSelectComponent(undefined);
        }
      }}
      onPointerMove={(event) => {
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
        draggingGridRef.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setOrbitEnabled(true);
      }}
      onPointerLeave={() => {
        pointerDownRef.current = undefined;
        draggingComponentIdRef.current = undefined;
        draggingGridRef.current = undefined;
        setOrbitEnabled(true);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const hit = pickComponentFromClient(event.clientX, event.clientY);
        if (hit) {
          onSelectComponent(hit);
          setContextMenu({ x: event.clientX, y: event.clientY });
        } else {
          setContextMenu(undefined);
          onSelectComponent(undefined);
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
            onChange={(event) => onUpdateBoard({ width: toBoardSize(event.target.value), height: board.height })}
          />
        </label>
        <label className="board-size-control">
          <span>H</span>
          <input
            type="number"
            min={5}
            max={150}
            value={board.height}
            onChange={(event) => onUpdateBoard({ width: board.width, height: toBoardSize(event.target.value) })}
          />
        </label>
        <button className="view-button" type="button" onClick={() => setView("top")}>
          正面
        </button>
        <button className="view-button" type="button" onClick={() => setView("bottom")}>
          背面
        </button>
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

    return [
      Math.max(0, Math.min(board.width - 1, gridX)),
      Math.max(0, Math.min(board.height - 1, gridY))
    ];
  }

  function pickComponent(event: React.PointerEvent<HTMLDivElement>) {
    return pickComponentFromClient(event.clientX, event.clientY);
  }

  function pickComponentFromClient(clientX: number, clientY: number) {
    const host = hostRef.current;
    const sceneObjects = sceneObjectsRef.current;
    if (!host || !sceneObjects) {
      return undefined;
    }

    const rect = host.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, sceneObjects.camera);
    const intersections = raycaster.intersectObjects(sceneObjects.componentsGroup.children, true);
    const picked = intersections
      .map((intersection) => findComponentRoot(intersection.object))
      .find((object): object is THREE.Object3D => Boolean(object?.userData.componentId));
    return picked?.userData.componentId as string | undefined;
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

function createPlacedComponents(components: PlacedComponent[], board: BoardSize, selectedComponentId?: string) {
  const group = new THREE.Group();
  components.forEach((placed) => {
    const component = createParametricComponent({
      kind: placed.kind,
      label: placed.label,
      pinCount: placed.pinCount,
      pinOffsets: placed.pinOffsets
    });
    component.position.copy(getComponentWorldPosition(placed, board));
    component.rotation.y = placed.rotation;
    component.userData.componentId = placed.id;
    component.userData.componentRootMarker = true;
    component.traverse((child) => {
      child.userData.componentId = placed.id;
      child.userData.componentRoot = component;
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

  return group;
}

function getComponentWorldPosition(component: PlacedComponent, board: BoardSize) {
  const anchor = getPinAnchor(component.pinOffsets);
  const rotatedAnchor = rotateOffset(anchor, component.rotation);
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
    const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
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
  return component.pinOffsets.map((offset) => {
    const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
    const gridX = component.position[0] + rx;
    const gridY = component.position[1] + ry;
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.38, 14),
      new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.2, metalness: 0.75 })
    );
    pin.position.set(gridX - board.width / 2 + 0.5, -0.5, gridY - board.height / 2 + 0.5);
    pin.userData.componentId = component.id;
    return pin;
  });
}

function createNetEndpointHighlights(endpoints: RoutedNetEndpoint[], board: BoardSize) {
  const group = new THREE.Group();
  endpoints.forEach((endpoint) => {
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
    ring.position.set(endpoint.grid[0] - board.width / 2 + 0.5, 0.36, endpoint.grid[1] - board.height / 2 + 0.5);
    group.add(ring);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.75, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff8a, transparent: true, opacity: 0.55 })
    );
    post.position.set(endpoint.grid[0] - board.width / 2 + 0.5, 0.62, endpoint.grid[1] - board.height / 2 + 0.5);
    group.add(post);
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

function createRouteObjects(routing: RoutingState, board: BoardSize) {
  const group = new THREE.Group();
  const traceMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    emissive: 0x777777,
    emissiveIntensity: 0.45,
    roughness: 0.08,
    metalness: 0.65
  });
  const jumperMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc857,
    emissive: 0x6b3f00,
    emissiveIntensity: 0.2,
    roughness: 0.28,
    metalness: 0.35
  });

  routing.traces.forEach((trace) => {
    for (let index = 1; index < trace.points.length; index += 1) {
      const from = trace.points[index - 1];
      const to = trace.points[index];
      group.add(createSegment(from, to, board, -0.58, traceMaterial, 0.13));
    }
  });

  routing.jumpers.forEach((jumper) => {
    group.add(createBottomJumper(jumper.from, jumper.to, board, jumperMaterial));
  });

  return group;
}

function createBottomJumper(
  from: [number, number],
  to: [number, number],
  board: BoardSize,
  material: THREE.Material
) {
  const start = new THREE.Vector3(from[0] - board.width / 2 + 0.5, -0.7, from[1] - board.height / 2 + 0.5);
  const end = new THREE.Vector3(to[0] - board.width / 2 + 0.5, -0.7, to[1] - board.height / 2 + 0.5);
  const span = start.distanceTo(end);
  const lift = Math.max(1.2, Math.min(5.2, span * 0.22));
  const middle = start.clone().lerp(end, 0.5);
  middle.y -= lift;

  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([start, middle, end]);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.075, 10, false), material);
  const startJoint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), material);
  const endJoint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), material);

  startJoint.position.copy(start);
  endJoint.position.copy(end);
  group.add(wire, startJoint, endJoint);
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

function rotateOffset([x, y]: [number, number], rotation: number): [number, number] {
  const quarterTurns = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarterTurns === 1) {
    return [y, -x];
  }
  if (quarterTurns === 2) {
    return [-x, -y];
  }
  if (quarterTurns === 3) {
    return [-y, x];
  }
  return [x, y];
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

function createBoardObject(board: BoardSize, transparent: boolean) {
  const group = new THREE.Group();
  const pitch = 1;
  const width = board.width * pitch;
  const height = board.height * pitch;
  const thickness = 0.55;

  const boardGeometry = new THREE.BoxGeometry(width, thickness, height);
  const topTexture = createHoleTexture(board.width, board.height, false);
  const bottomTexture = createHoleTexture(board.width, board.height, true);
  topTexture.colorSpace = THREE.SRGBColorSpace;
  bottomTexture.colorSpace = THREE.SRGBColorSpace;

  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d6b48,
    roughness: 0.28,
    metalness: 0.02,
    transparent,
    opacity: transparent ? 0.22 : 1,
    depthWrite: !transparent
  });
  const topMaterial = new THREE.MeshStandardMaterial({
    map: topTexture,
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0.02,
    transparent,
    opacity: transparent ? 0.18 : 1,
    depthWrite: !transparent
  });
  const bottomMaterial = new THREE.MeshStandardMaterial({
    map: bottomTexture,
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0.02,
    transparent,
    opacity: transparent ? 0.18 : 1,
    depthWrite: !transparent
  });

  const boardMesh = new THREE.Mesh(boardGeometry, [
    sideMaterial,
    sideMaterial,
    topMaterial,
    bottomMaterial,
    sideMaterial,
    sideMaterial
  ]);
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  group.add(boardMesh);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(boardGeometry),
    new THREE.LineBasicMaterial({ color: 0x08432f, transparent: true, opacity: 0.42 })
  );
  group.add(edge);
  group.add(createGridIndexLabels(board));

  return group;
}

function createGridIndexLabels(board: BoardSize) {
  const group = new THREE.Group();
  const xStep = getIndexLabelStep(board.width);
  const yStep = getIndexLabelStep(board.height);
  const topY = 0.58;
  const xFrontZ = -board.height / 2 - 0.68;
  const xBackZ = board.height / 2 + 0.68;
  const yLeftX = -board.width / 2 - 0.68;
  const yRightX = board.width / 2 + 0.68;

  for (let x = 0; x < board.width; x += 1) {
    if (!shouldShowIndexLabel(x, board.width, xStep)) {
      continue;
    }

    const worldX = x - board.width / 2 + 0.5;
    group.add(createGridIndexSprite(String(x + 1), worldX, topY, xFrontZ));
    group.add(createGridIndexSprite(String(x + 1), worldX, topY, xBackZ));
  }

  for (let y = 0; y < board.height; y += 1) {
    if (!shouldShowIndexLabel(y, board.height, yStep)) {
      continue;
    }

    const worldZ = y - board.height / 2 + 0.5;
    group.add(createGridIndexSprite(String(y + 1), yLeftX, topY, worldZ));
    group.add(createGridIndexSprite(String(y + 1), yRightX, topY, worldZ));
  }

  return group;
}

function createGridIndexSprite(text: string, x: number, y: number, z: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundRect(ctx, 12, 10, 72, 44, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(8,67,47,0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, 12, 10, 72, 44, 8);
    ctx.stroke();
    ctx.fillStyle = "#10201b";
    ctx.font = "700 28px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 48, 33);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(0.72, 0.48, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function getIndexLabelStep(count: number) {
  if (count <= 40) {
    return 1;
  }
  if (count <= 80) {
    return 2;
  }
  return 5;
}

function shouldShowIndexLabel(index: number, count: number, step: number) {
  return index === 0 || index === count - 1 || index % step === 0;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createHoleTexture(width: number, height: number, isBottom: boolean) {
  const maxCanvas = 2048;
  const cells = Math.max(width, height);
  const cellPx = Math.max(2, Math.min(18, Math.floor(maxCanvas / cells)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, width * cellPx);
  canvas.height = Math.max(64, height * cellPx);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = isBottom ? "#0d6b48" : "#0f7c53";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "rgba(255,255,255,0.20)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.03)");
  gradient.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const radius = Math.max(0.75, cellPx * 0.2);
  const ringRadius = Math.max(radius + 0.9, cellPx * 0.39);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = x * cellPx + cellPx / 2;
      const cy = y * cellPx + cellPx / 2;

      if (isBottom && cellPx >= 4) {
        ctx.beginPath();
        ctx.fillStyle = "#d7a43d";
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.38)";
        ctx.lineWidth = Math.max(0.6, cellPx * 0.055);
        ctx.arc(cx, cy, ringRadius * 0.72, -0.9, 0.8);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.fillStyle = "#111918";
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Sprite) {
      const mesh = child as THREE.Mesh | THREE.LineSegments | THREE.Sprite;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
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
