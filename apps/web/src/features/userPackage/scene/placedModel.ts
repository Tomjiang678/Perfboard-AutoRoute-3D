import * as THREE from "three";
import { shapeBaseY } from "../model/stack.ts";
import { BOARD_TOP_Y } from "./constants.ts";
import { createUserBodyMesh, createUserPinMesh } from "./bodyMesh.ts";
import { USER_PACKAGE_PIN_HEIGHT, type UserPackageDraft } from "../model/types.ts";

/** Render a user package on the board; coordinates are local to its first pin. */
export function createUserPackageModel(
  draft: UserPackageDraft,
  pinOffsets?: Array<[number, number]>
) {
  const group = new THREE.Group();
  let pinIndex = 0;
  draft.shapes.forEach((shape, index) => {
    if (shape.kind === "pin") {
      const pin = createUserPinMesh();
      const hole = pinOffsets?.[pinIndex] ?? shape.hole;
      pin.position.set(hole[0], BOARD_TOP_Y + USER_PACKAGE_PIN_HEIGHT / 2, hole[1]);
      pin.userData.pinIndex = pinIndex;
      pinIndex += 1;
      group.add(pin);
      return;
    }
    const base = shapeBaseY(draft.shapes, index, draft.stackBase);
    const mesh = createUserBodyMesh(shape);
    mesh.position.set(shape.center[0], BOARD_TOP_Y + base + shape.height / 2, shape.center[1]);
    if (shape.kind === "cuboid") mesh.rotation.y = THREE.MathUtils.degToRad(shape.angle);
    group.add(mesh);
  });
  return group;
}
