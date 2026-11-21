import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createEditorBoard } from "../scene/boardScene.ts";
import { createShapeObject, worldToGrid } from "../scene/shapeMeshes.ts";
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
    scene.background = new THREE.Color(0xeef2f5);
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
    const shapes = new THREE.Group();
    scene.add(shapes);
    shapesRef.current = shapes;

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(10, 24, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
    fill.position.set(-14, 10, -10);
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
      controls.dispose();
      disposeGroup(shapes);
      disposeGroup(board.group);
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
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose());
    }
  });
}
