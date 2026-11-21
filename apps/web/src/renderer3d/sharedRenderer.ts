import type { WebGLRenderer } from "three";

let activeRenderer: WebGLRenderer | undefined;

export function registerSharedRenderer(renderer: WebGLRenderer | undefined) {
  activeRenderer = renderer;
}

export function getSharedRenderer() {
  return activeRenderer;
}
