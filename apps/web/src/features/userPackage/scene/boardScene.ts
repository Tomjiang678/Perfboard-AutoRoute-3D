import * as THREE from "three";
import { createBoardObject } from "../../board/rendering.ts";
import { BOARD_TOP_Y } from "./constants.ts";

export function createEditorBoard() {
  const group = createBoardObject({ kind: "perfboard", width: 30, height: 20 }, false, "light");
  group.position.y = 0;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 20),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = BOARD_TOP_Y + 0.002;
  plane.userData.editorBoardPlane = true;
  return { group, plane };
}
