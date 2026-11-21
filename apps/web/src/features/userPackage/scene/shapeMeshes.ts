import * as THREE from "three";
import { shapeBaseY } from "../model/stack.ts";
import {
  USER_PACKAGE_BOARD_HEIGHT,
  USER_PACKAGE_BOARD_WIDTH,
  USER_PACKAGE_PIN_HEIGHT,
  type UserPackageShape
} from "../model/types.ts";
import { BOARD_TOP_Y, SHAPE_ACCENT } from "./constants.ts";

export function gridToWorld([x, z]: [number, number]): [number, number] {
  return [x - USER_PACKAGE_BOARD_WIDTH / 2 + 0.5, z - USER_PACKAGE_BOARD_HEIGHT / 2 + 0.5];
}

export function worldToGrid([x, z]: [number, number]): [number, number] {
  return [x + USER_PACKAGE_BOARD_WIDTH / 2 - 0.5, z + USER_PACKAGE_BOARD_HEIGHT / 2 - 0.5];
}

export function createShapeObject(
  shape: UserPackageShape,
  shapes: UserPackageShape[],
  index: number,
  selected: boolean,
  stackBase?: number
) {
  const object = shape.kind === "pin"
    ? createPinObject(shape, selected)
    : shape.kind === "cuboid"
      ? createCuboidObject(shape, shapeBaseY(shapes, index, stackBase), selected)
      : createCylinderObject(shape, shapeBaseY(shapes, index, stackBase), selected);
  object.userData.userPackageShapeId = shape.id;
  object.traverse((child) => {
    child.userData.userPackageShapeId = shape.id;
  });
  return object;
}

function createPinObject(shape: Extract<UserPackageShape, { kind: "pin" }>, selected: boolean) {
  const group = new THREE.Group();
  const [x, z] = gridToWorld(shape.hole);
  const material = new THREE.MeshStandardMaterial({
    color: 0xc7c7c7,
    roughness: 0.28,
    metalness: 0.72
  });
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, USER_PACKAGE_PIN_HEIGHT, 16),
    material
  );
  pin.position.set(x, BOARD_TOP_Y + USER_PACKAGE_PIN_HEIGHT / 2, z);
  group.add(pin);
  if (selected) {
    group.add(createSelectionRing(x, z));
  }
  return group;
}

function createCuboidObject(
  shape: Extract<UserPackageShape, { kind: "cuboid" }>,
  baseY: number,
  selected: boolean
) {
  const group = new THREE.Group();
  const [x, z] = gridToWorld(shape.center);
  const geometry = new THREE.BoxGeometry(shape.length, shape.height, shape.width);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: shape.color, roughness: 0.5, metalness: 0.08 })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (selected) {
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: SHAPE_ACCENT })
    ));
  }
  group.position.set(x, BOARD_TOP_Y + baseY + shape.height / 2, z);
  group.rotation.y = THREE.MathUtils.degToRad(shape.angle);
  return group;
}

function createCylinderObject(
  shape: Extract<UserPackageShape, { kind: "cylinder" }>,
  baseY: number,
  selected: boolean
) {
  const group = new THREE.Group();
  const [x, z] = gridToWorld(shape.center);
  const geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 36);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: shape.color, roughness: 0.46, metalness: 0.1 })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (selected) {
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 25),
      new THREE.LineBasicMaterial({ color: SHAPE_ACCENT })
    ));
  }
  group.position.set(x, BOARD_TOP_Y + baseY + shape.height / 2, z);
  return group;
}

function createSelectionRing(x: number, z: number) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.26, 24),
    new THREE.MeshBasicMaterial({ color: SHAPE_ACCENT, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, BOARD_TOP_Y + USER_PACKAGE_PIN_HEIGHT + 0.01, z);
  return ring;
}
