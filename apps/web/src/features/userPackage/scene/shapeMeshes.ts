import * as THREE from "three";
import { shapeBaseY } from "../model/stack.ts";
import {
  USER_PACKAGE_BOARD_HEIGHT,
  USER_PACKAGE_BOARD_WIDTH,
  USER_PACKAGE_PIN_HEIGHT,
  type UserPackageShape
} from "../model/types.ts";
import { BOARD_TOP_Y, SHAPE_ACCENT } from "./constants.ts";
import { createUserBodyMesh, createUserPinMesh } from "./bodyMesh.ts";

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
    ? createPinObject(shape, selected, packageTopY(shapes, stackBase))
    : shape.kind === "cuboid"
      ? createCuboidObject(shape, shapeBaseY(shapes, index, stackBase), selected)
      : createCylinderObject(shape, shapeBaseY(shapes, index, stackBase), selected);
  object.userData.userPackageShapeId = shape.id;
  object.traverse((child) => {
    child.userData.userPackageShapeId = shape.id;
  });
  return object;
}

function createPinObject(
  shape: Extract<UserPackageShape, { kind: "pin" }>,
  selected: boolean,
  selectionY: number
) {
  const group = new THREE.Group();
  const [x, z] = gridToWorld(shape.hole);
  const pin = createUserPinMesh();
  pin.position.set(x, BOARD_TOP_Y + USER_PACKAGE_PIN_HEIGHT / 2, z);
  group.add(pin);
  if (selected) {
    group.add(createSelectionRing(x, z, selectionY));
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
  const mesh = createUserBodyMesh(shape);
  group.add(mesh);
  if (selected) {
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
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
  const mesh = createUserBodyMesh(shape);
  group.add(mesh);
  if (selected) {
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 25),
      new THREE.LineBasicMaterial({ color: SHAPE_ACCENT })
    ));
  }
  group.position.set(x, BOARD_TOP_Y + baseY + shape.height / 2, z);
  return group;
}

function createSelectionRing(x: number, z: number, y: number) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.26, 24),
    new THREE.MeshBasicMaterial({
      color: SHAPE_ACCENT,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.06, z);
  ring.renderOrder = 25;
  return ring;
}

function packageTopY(shapes: UserPackageShape[], stackBase?: number) {
  return shapes.reduce((top, shape, index) => {
    if (shape.kind === "pin") return top;
    return Math.max(top, BOARD_TOP_Y + shapeBaseY(shapes, index, stackBase) + shape.height);
  }, BOARD_TOP_Y);
}
