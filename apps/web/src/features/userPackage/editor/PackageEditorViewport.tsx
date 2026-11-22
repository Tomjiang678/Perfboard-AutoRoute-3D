import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createEditorBoard } from "../scene/boardScene.ts";
import { createShapeObject, worldToGrid } from "../scene/shapeMeshes.ts";
import { VIEWPORT_LIGHTING } from "../../../renderer3d/lighting.ts";
import {
  USER_PACKAGE_BOARD_HEIGHT,
  USER_PACKAGE_BOARD_WIDTH,
  type UserPackageDraft,
  type UserPackageShapeKind
} from "../model/types.ts";
import type { UserPackageEditorTool } from "./useUserPackageEditor.ts";

interface PackageEditorViewportProps {
  draft: UserPackageDraft;
  selectedId?: string;
  tool: UserPackageEditorTool;
  onSelect: (id: string | undefined) => void;
  onPlacePin: (hole: [number, number]) => void;
  onPlaceShape: (kind: Exclude<UserPackageShapeKind, "pin">, center: [number, number]) => void;
}

export function PackageEditorViewport({
  draft,
  selectedId,
  tool,
  onSelect,
  onPlacePin,
  onPlaceShape
}: PackageEditorViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shapesRef = useRef<THREE.Group | null>(null);
  const toolRef = useRef(tool);
  const draftRef = useRef(draft);
  const selectedRef = useRef(selectedId);
  const callbacksRef = useRef({ onSelect, onPlacePin, onPlaceShape });

  toolRef.current = tool;
  draftRef.current = draft;
  selectedRef.current = selectedId;
  callbacksRef.current = { onSelect, onPlacePin, onPlaceShape };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 26, 24);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "user-package-canvas";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI * 0.49;

    const board = createEditorBoard();
    scene.add(board.group, board.plane);
    const axisGizmo = createAxisGizmo();
    axisGizmo.visible = false;
    scene.add(axisGizmo);
    const shapes = new THREE.Group();
    scene.add(shapes);
    shapesRef.current = shapes;

    let axisTimer: ReturnType<typeof setTimeout> | undefined;
    const showAxisGizmo = () => {
      if (axisTimer) clearTimeout(axisTimer);
      axisGizmo.visible = true;
    };
    const hideAxisGizmoSoon = () => {
      if (axisTimer) clearTimeout(axisTimer);
      axisTimer = setTimeout(() => { axisGizmo.visible = false; }, 1200);
    };
    controls.addEventListener("start", showAxisGizmo);
    controls.addEventListener("end", hideAxisGizmoSoon);

    scene.add(new THREE.AmbientLight(0xffffff, VIEWPORT_LIGHTING.ambientIntensity));
    const key = new THREE.DirectionalLight(0xffffff, VIEWPORT_LIGHTING.keyIntensity);
    key.position.set(...VIEWPORT_LIGHTING.keyPosition);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    key.shadow.camera.left = -25;
    key.shadow.camera.right = 25;
    key.shadow.camera.top = 25;
    key.shadow.camera.bottom = -25;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 80;
    key.shadow.camera.updateProjectionMatrix();
    scene.add(key);
    const fill = new THREE.DirectionalLight(
      VIEWPORT_LIGHTING.fillColor,
      VIEWPORT_LIGHTING.fillIntensity
    );
    fill.position.set(...VIEWPORT_LIGHTING.fillPosition);
    scene.add(fill);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: { x: number; y: number; button: number } | undefined;

    function updatePointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
    }

    function handlePointerDown(event: PointerEvent) {
      pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
    }

    function handlePointerUp(event: PointerEvent) {
      if (!pointerStart || pointerStart.button !== 0) {
        pointerStart = undefined;
        return;
      }
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = undefined;
      if (moved > 4) return;

      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(shapes.children, true)
        .find((item) => findShapeId(item.object));
      if (hit) {
        const id = findShapeId(hit.object);
        if (id) callbacksRef.current.onSelect(id);
        return;
      }

      const boardHit = raycaster.intersectObject(board.plane, false)[0];
      if (!boardHit) {
        callbacksRef.current.onSelect(undefined);
        return;
      }
      const [rawX, rawZ] = worldToGrid([boardHit.point.x, boardHit.point.z]);
      const x = Math.round(rawX);
      const z = Math.round(rawZ);
      if (x < 0 || z < 0 || x >= USER_PACKAGE_BOARD_WIDTH || z >= USER_PACKAGE_BOARD_HEIGHT) {
        callbacksRef.current.onSelect(undefined);
        return;
      }
      if (toolRef.current === "pin") {
        callbacksRef.current.onPlacePin([x, z]);
      } else if (toolRef.current === "cuboid" || toolRef.current === "cylinder") {
        callbacksRef.current.onPlaceShape(toolRef.current, [x, z]);
      } else {
        callbacksRef.current.onSelect(undefined);
      }
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.removeEventListener("start", showAxisGizmo);
      controls.removeEventListener("end", hideAxisGizmoSoon);
      if (axisTimer) clearTimeout(axisTimer);
      controls.dispose();
      disposeGroup(shapes);
      disposeGroup(board.group);
      disposeGroup(axisGizmo);
      board.plane.geometry.dispose();
      board.plane.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      shapesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = shapesRef.current;
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeObject(child);
    }
    draft.shapes.forEach((shape, index) => {
      group.add(createShapeObject(shape, draft.shapes, index, shape.id === selectedId, draft.stackBase));
    });
  }, [draft.shapes, draft.stackBase, selectedId]);

  return <div className={`user-package-viewport tool-${tool}`} ref={containerRef} />;
}

function createAxisGizmo() {
  const group = new THREE.Group();
  group.position.set(
    -USER_PACKAGE_BOARD_WIDTH / 2 + 1.5,
    1.6,
    -USER_PACKAGE_BOARD_HEIGHT / 2 + 1.5
  );
  const length = 4;
  addAxis(group, [1, 0, 0], 0xd94b4b, "X", [length, 0, 0]);
  addAxis(group, [0, 1, 0], 0x2e9d57, "Y", [0, length, 0]);
  addAxis(group, [0, 0, 1], 0x2f6fdb, "Z", [0, 0, length]);
  return group;
}

function addAxis(
  group: THREE.Group,
  direction: [number, number, number],
  color: number,
  label: string,
  labelPosition: [number, number, number]
) {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(...direction),
    new THREE.Vector3(0, 0, 0),
    4,
    color,
    0.8,
    0.35
  );
  const lineMaterial = arrow.line.material as THREE.Material;
  const coneMaterial = arrow.cone.material as THREE.Material;
  lineMaterial.depthTest = false;
  lineMaterial.depthWrite = false;
  coneMaterial.depthTest = false;
  coneMaterial.depthWrite = false;
  arrow.line.renderOrder = 20;
  arrow.cone.renderOrder = 20;
  group.add(arrow);
  const sprite = createAxisLabel(label, color);
  sprite.position.set(...labelPosition);
  group.add(sprite);
}

function createAxisLabel(text: string, color: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.font = "bold 76px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false
  }));
  sprite.scale.set(1.1, 1.1, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function findShapeId(object: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = current.userData.userPackageShapeId;
    if (typeof id === "string") return id;
    current = current.parent;
  }
  return undefined;
}

function disposeGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    } else if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose());
    }
  });
}
