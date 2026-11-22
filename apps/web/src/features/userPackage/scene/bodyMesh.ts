import * as THREE from "three";
import {
  USER_PACKAGE_PIN_HEIGHT,
  type UserPackageCuboid,
  type UserPackageCylinder
} from "../model/types.ts";

/** Shared geometry/material for the editor and the placed-on-board model. */
export function createUserBodyMesh(shape: UserPackageCuboid | UserPackageCylinder) {
  const material = new THREE.MeshStandardMaterial({
    color: shape.color,
    roughness: 0.46,
    metalness: 0.1
  });
  const geometry = shape.kind === "cylinder"
    ? new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 36)
    : new THREE.BoxGeometry(shape.length, shape.height, shape.width);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createUserPinMesh() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xc7c7c7,
    roughness: 0.28,
    metalness: 0.72
  });
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, USER_PACKAGE_PIN_HEIGHT, 16),
    material
  );
  mesh.castShadow = true;
  return mesh;
}
