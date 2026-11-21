import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary.ts";
import { getSharedRenderer } from "../renderer3d/sharedRenderer.ts";
import { createParametricComponent, type ParametricComponentKind } from "../renderer3d/parametricComponents.ts";

interface PackagePinPreview3DProps {
  definition: LibraryComponentDefinition;
  numbers: number[];
  selected: number;
  onSelect: (index: number) => void;
}

const WIDTH = 960;
const HEIGHT = 520;

/**
 * Renders the real parametric package with the already-running board renderer
 * into an offscreen target, then paints that bitmap into a 2D canvas. No second
 * WebGL context is created, which is what previously black-screened the window.
 */
export function PackagePinPreview3D({ definition, numbers, selected, onSelect }: PackagePinPreview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hotspotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | undefined>(undefined);
  const renderRef = useRef<(() => void) | undefined>(undefined);
  const yawRef = useRef(-0.7);
  const pitchRef = useRef(0.5);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const renderer = getSharedRenderer();
    const canvas = canvasRef.current;
    if (!renderer || !canvas) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    const context = canvas.getContext("2d");
    if (!context) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.1, 1000);
    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(6, 10, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-8, 4, -6);
    scene.add(fill);

    let group: THREE.Group | undefined;
    try {
      group = createParametricComponent({
        kind: definition.kind as ParametricComponentKind,
        label: definition.label,
        pinCount: definition.pinCount,
        pinOffsets: definition.pinOffsets
      });
      scene.add(group);
    } catch {
      group = undefined;
    }

    const bounds = group ? new THREE.Box3().setFromObject(group) : new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 2);
    const anchors = definition.pinOffsets.map(([x, z]) => {
      if (!group) return new THREE.Vector3(x, bounds.min.y + 0.2, z);
      const raycaster = new THREE.Raycaster(new THREE.Vector3(x, bounds.min.y - 10, z), new THREE.Vector3(0, 1, 0));
      raycaster.camera = camera;
      const hit = raycaster
        .intersectObject(group, true)
        .find((candidate) => (candidate.object as THREE.Sprite).type !== "Sprite");
      return hit ? hit.point.clone().add(new THREE.Vector3(0, 0.18, 0)) : new THREE.Vector3(x, bounds.min.y + 0.2, z);
    });

    const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    const image = context.createImageData(WIDTH, HEIGHT);
    if (!dragRef.current) dragRef.current = undefined;
    const updateCamera = () => {
      const radius = span * 2.35;
      camera.position.set(
        center.x + Math.cos(yawRef.current) * Math.cos(pitchRef.current) * radius,
        center.y + Math.sin(pitchRef.current) * radius,
        center.z + Math.sin(yawRef.current) * Math.cos(pitchRef.current) * radius
      );
      camera.lookAt(center);
      camera.updateMatrixWorld();
    };

    const updateHotspots = () => {
      const host = hostRef.current;
      if (!host) return;
      const scaleX = host.clientWidth / WIDTH;
      const scaleY = host.clientHeight / HEIGHT;
      anchors.forEach((anchor, index) => {
        const point = anchor.clone().project(camera);
        const button = hotspotRefs.current[index];
        if (!button) return;
        button.style.left = `${(point.x + 1) / 2 * WIDTH * scaleX}px`;
        button.style.top = `${(1 - point.y) / 2 * HEIGHT * scaleY}px`;
      });
    };

    const render = () => {
      updateCamera();
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
      renderer.setRenderTarget(previousTarget);
      for (let row = 0; row < HEIGHT; row += 1) {
        const source = (HEIGHT - 1 - row) * WIDTH * 4;
        image.data.set(pixels.subarray(source, source + WIDTH * 4), row * WIDTH * 4);
      }
      context.putImageData(image, 0, 0);
      updateHotspots();
    };
    renderRef.current = render;
    render();

    const resizeObserver = new ResizeObserver(updateHotspots);
    if (hostRef.current) resizeObserver.observe(hostRef.current);

    return () => {
      resizeObserver.disconnect();
      renderRef.current = undefined;
      renderer.setRenderTarget(null);
      target.dispose();
      if (group) {
        scene.remove(group);
        group.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
      }
    };
  }, [definition]);

  return (
    <div className="pin-number-preview-3d" ref={hostRef}>
      {unavailable ? (
        <div className="pin-number-preview-unavailable">3D 预览不可用</div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            onPointerDown={(event) => {
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                yaw: yawRef.current,
                pitch: pitchRef.current
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              yawRef.current = drag.yaw + (event.clientX - drag.x) * 0.01;
              pitchRef.current = Math.max(-0.1, Math.min(1.15, drag.pitch + (event.clientY - drag.y) * 0.008));
              renderRef.current?.();
            }}
            onPointerUp={(event) => {
              dragRef.current = undefined;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => { dragRef.current = undefined; }}
          />
          {definition.pinOffsets.map((offset, index) => (
            <button
              key={`${offset[0]}-${offset[1]}-${index}`}
              ref={(element) => { hotspotRefs.current[index] = element; }}
              type="button"
              className={index === selected ? "pin-number-hotspot active" : "pin-number-hotspot"}
              onClick={() => onSelect(index)}
            >
              {numbers[index]}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

