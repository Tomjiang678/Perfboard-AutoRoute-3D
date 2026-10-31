import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getLibraryComponentByKind } from "../features/project/componentLibrary.ts";
import { adapterPinOffsets } from "../features/project/adapter.ts";
import { UNKNOWN_COMPONENT_LABEL } from "../features/project/componentTraits.ts";
import type { AdapterSpec } from "../types/project.ts";

export type ParametricComponentKind =
  | "resistor"
  | "inductor"
  | "diode"
  | "led"
  | "radial_capacitor"
  | "electrolytic_capacitor"
  | "to92"
  | "to39"
  | "to220"
  | "to3"
  | "to247"
  | "bridge_rectifier"
  | "relay"
  | "crystal"
  | "fuse"
  | "dip"
  | "dip_switch"
  | "seven_segment_display"
  | "alphanumeric_display"
  | "pin_header"
  | "terminal_block"
  | "slide_switch"
  | "buzzer"
  | "tactile_switch"
  | "potentiometer"
  | "adapter";

export interface ParametricComponentSpec {
  kind: ParametricComponentKind;
  label?: string;
  pinCount?: number;
  color?: number;
  pinOffsets?: Array<[number, number]>;
  isFallback?: boolean;
  /** 转接板规格：元件插在转接板上时带上，用于画板体与排针 */
  adapter?: AdapterSpec;
  /** 芯片插在转接板上时，脚由转接板的排针代替，本体不画脚 */
  hidePins?: boolean;
}

const BOARD_TOP_Y = 0.28;
const LEAD_RADIUS = 0.045;
const EXPOSED_LEAD = 0.18;

let darkComponentTheme = false;

export function setComponentTheme(dark: boolean) {
  darkComponentTheme = dark;
}

const materials = {
  lead: new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.28, metalness: 0.72 }),
  resistorBody: new THREE.MeshStandardMaterial({ color: 0xd5ba86, roughness: 0.55 }),
  diodeBody: new THREE.MeshStandardMaterial({ color: 0x1f252b, roughness: 0.42 }),
  icBody: new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.34 }),
  blackPlastic: new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.45 }),
  ledRed: new THREE.MeshStandardMaterial({
    color: 0xe83f3f,
    roughness: 0.14,
    metalness: 0.0,
    transparent: true,
    opacity: 0.72
  }),
  capacitorFilm: new THREE.MeshPhysicalMaterial({ color: 0xc9853d, roughness: 0.34, metalness: 0.08, clearcoat: 0.28, clearcoatRoughness: 0.32 }),
  capacitorSleeve: new THREE.MeshPhysicalMaterial({ color: 0x172b43, roughness: 0.3, metalness: 0.08, clearcoat: 0.2, clearcoatRoughness: 0.35 }),
  capacitorAluminum: new THREE.MeshStandardMaterial({ color: 0xc7d0d8, roughness: 0.24, metalness: 0.78 }),
  capacitorMarking: new THREE.MeshStandardMaterial({ color: 0xe7e8e8, roughness: 0.44 }),
  crystalMetal: new THREE.MeshStandardMaterial({ color: 0x9ca9b3, roughness: 0.24, metalness: 0.82 }),
  ferrite: new THREE.MeshStandardMaterial({ color: 0x294b42, roughness: 0.38, metalness: 0.08 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc77a43, roughness: 0.24, metalness: 0.78 }),
  terminalGreen: new THREE.MeshStandardMaterial({ color: 0x15845f, roughness: 0.32 }),
  /** 转接板：蓝色阻焊 + 清漆，和绿色洞洞板区分开 */
  adapterPcb: new THREE.MeshPhysicalMaterial({
    color: 0x1b3f7a,
    roughness: 0.22,
    metalness: 0.12,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15
  }),
  adapterSilk: new THREE.MeshStandardMaterial({ color: 0xdff3e8, roughness: 0.55 }),
  adapterPad: new THREE.MeshStandardMaterial({ color: 0xd8af4e, roughness: 0.18, metalness: 0.85 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc7953a, roughness: 0.22, metalness: 0.55 })
};
Object.values(materials).forEach((material) => {
  material.userData.shared = true;
});

export function createParametricComponent(spec: ParametricComponentSpec) {
  return componentFactories[spec.kind](spec);
}

/**
 * Single geometry source: renderers never invent pin layouts; they use the
 * caller-provided offsets and fall back to the component library geometry.
 */
function pins(spec: ParametricComponentSpec): Array<[number, number]> {
  return spec.pinOffsets ?? getLibraryComponentByKind(spec.kind, spec.pinCount)?.pinOffsets ?? [];
}

const componentFactories: Record<ParametricComponentKind, (spec: ParametricComponentSpec) => THREE.Group> = {
  resistor: (s) => createAxialPart(s.label ?? "R", materials.resistorBody, 0.45, 2.2, true, pins(s)),
  inductor: (s) => createAxialInductor(s.label ?? "L", pins(s)),
  diode: (s) => createDiode(s.label ?? "D", pins(s)),
  led: (s) => createLed(s.color ?? 0xe83f3f, pins(s)),
  radial_capacitor: (s) => createRadialCapacitor(s.label ?? "C", false, pins(s)),
  electrolytic_capacitor: (s) => createRadialCapacitor(s.label ?? "C", true, pins(s)),
  to92: (s) => createTo92(s.label ?? "Q", pins(s)),
  to39: (s) => createTo39(s.label ?? "Q", pins(s)),
  to220: (s) => createTo220(s.label ?? "Q", pins(s)),
  to3: (s) => createTo3(s.label ?? "Q", pins(s)),
  to247: (s) => createTo247(s.label ?? "Q", pins(s)),
  bridge_rectifier: (s) => createBridgeRectifier(s.label ?? "BR", pins(s)),
  relay: (s) => createRelay(s.label ?? "RLY", s.pinCount ?? 5, pins(s)),
  crystal: (s) => createCrystal(s.label ?? "Y", pins(s)),
  fuse: (s) => createFuse(s.label ?? "F", pins(s)),
  dip: (s) => createDip(s.pinCount ?? 8, s.label ?? `DIP-${s.pinCount ?? 8}`, pins(s), s.hidePins),
  dip_switch: (s) => createDipSwitch(s.pinCount ?? 16, s.label ?? `DIPSW${Math.floor((s.pinCount ?? 16) / 2)}`, pins(s)),
  seven_segment_display: (s) => createSevenSegmentDisplay(s.label ?? "7SEG", pins(s)),
  alphanumeric_display: (s) => createAlphanumericDisplay(s.label ?? "ALNUM", pins(s)),
  pin_header: (s) => createPinHeader(s.pinCount ?? 4, pins(s), s.isFallback),
  terminal_block: (s) => createTerminalBlock(s.pinCount ?? 2, pins(s)),
  slide_switch: (s) => createSlideSwitch(pins(s)),
  buzzer: (s) => createBuzzer(s.label ?? "BZ", pins(s)),
  tactile_switch: (s) => createTactileSwitch(pins(s)),
  potentiometer: (s) => createPotentiometer(pins(s)),
  adapter: (s) => createAdapterPlate(s.adapter ?? adapterSpecFromPins(pins(s)), s.label ?? "ADP")
};

function createAxialPart(
  label: string,
  bodyMaterial: THREE.Material,
  radius: number,
  length: number,
  addBands: boolean,
  pinOffsets: Array<[number, number]>
) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const span = Math.max(1, distance2d(leftPin, rightPin));
  const bodyLength = Math.min(span * 0.72, Math.max(length, span - 1.1));
  const angle = Math.atan2(rightPin[1] - leftPin[1], rightPin[0] - leftPin[0]);
  const axisX = Math.cos(angle);
  const axisZ = Math.sin(angle);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, bodyLength, 24), bodyMaterial);
  body.rotation.z = Math.PI / 2;
  body.rotation.y = -angle;
  body.position.set(centerX, 1.55, centerZ);
  group.add(body);

  addLeadBetween(group, [centerX - axisX * bodyLength / 2, centerZ - axisZ * bodyLength / 2], leftPin, 1.55);
  addLeadBetween(group, [centerX + axisX * bodyLength / 2, centerZ + axisZ * bodyLength / 2], rightPin, 1.55);
  addBentPin(group, leftPin[0], 1.55, leftPin[1]);
  addBentPin(group, rightPin[0], 1.55, rightPin[1]);

  if (addBands) {
    [-0.55, 0.05, 0.55].forEach((x, index) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(radius + 0.01, radius + 0.01, 0.1, 24),
        new THREE.MeshStandardMaterial({ color: [0x7c3aed, 0xb91c1c, 0xd97706][index], roughness: 0.4 })
      );
      band.rotation.z = Math.PI / 2;
      band.rotation.y = -angle;
      band.position.set(centerX + axisX * x, 1.55, centerZ + axisZ * x);
      group.add(band);
    });
  }

  addTextLabel(group, label, centerX, 2.18, centerZ + 0.52, 0x1e242b, 2.2);
  return group;
}

function createDiode(label: string, pinOffsets: Array<[number, number]>) {
  const group = createAxialPart(label, materials.diodeBody, 0.42, 1.85, false, pinOffsets);
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets ?? [[-3, 0], [3, 0]]);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const angle = Math.atan2(rightPin[1] - leftPin[1], rightPin[0] - leftPin[0]);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.12, 24), materials.lead);
  ring.rotation.z = Math.PI / 2;
  ring.rotation.y = -angle;
  ring.position.set(centerX + Math.cos(angle) * 0.58, 1.55, centerZ + Math.sin(angle) * 0.58);
  group.add(ring);
  return group;
}

function createLed(color: number, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12,
    transparent: true,
    opacity: 0.72
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 28, 16), material);
  dome.scale.y = 0.85;
  dome.position.set(centerX, 1.65, centerZ);
  group.add(dome);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.24, 28), material);
  base.position.set(centerX, 0.98, centerZ);
  group.add(base);
  addRadialPackagePins(group, [leftPin, rightPin], [centerX, centerZ], 0.74, 0.88, 0.98);
  return group;
}

function createRadialCapacitor(
  label: string,
  polarized: boolean,
  pinOffsets: Array<[number, number]>
) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const height = polarized ? 2.2 : 1.5;
  const radius = polarized ? 0.64 : 0.68;
  const centerY = polarized ? 1.62 : 1.28;
  const bodyGeometry = createRoundedCanGeometry(radius, height);
  const body = new THREE.Mesh(bodyGeometry, polarized ? materials.capacitorSleeve : materials.capacitorFilm);
  body.position.set(centerX, centerY, centerZ);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  addRadialPackagePins(group, [leftPin, rightPin], [centerX, centerZ], radius, 0.56, 0.9);

  if (polarized) {
    const topY = centerY + height / 2 + 0.035;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.83, radius * 0.83, 0.08, 40), materials.capacitorAluminum);
    top.position.set(centerX, topY, centerZ);
    group.add(top);

    const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x77828b, roughness: 0.34, metalness: 0.55 });
    const ventA = new THREE.Mesh(new RoundedBoxGeometry(0.74, 0.025, 0.075, 2, 0.01), ventMaterial);
    const ventB = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.025, 0.74, 2, 0.01), ventMaterial);
    ventA.position.set(centerX, topY + 0.055, centerZ);
    ventB.position.set(centerX, topY + 0.055, centerZ);
    group.add(ventA, ventB);

    const polarityStripe = new THREE.Mesh(
      new RoundedBoxGeometry(0.2, height * 0.66, 0.025, 2, 0.01),
      materials.capacitorMarking
    );
    polarityStripe.position.set(centerX + radius * 0.72, centerY, centerZ + radius * 0.58);
    group.add(polarityStripe);
    addTextLabel(group, "−", centerX + 0.4, topY + 0.14, centerZ + 0.3, 0x27313b, 0.32);
    addTextLabel(group, "+", centerX - 0.4, topY + 0.14, centerZ - 0.3, 0x27313b, 0.32);
  } else {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.9, 0.035, 10, 40), new THREE.MeshStandardMaterial({ color: 0xa96b35, roughness: 0.32, metalness: 0.18 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(centerX, centerY + height * 0.28, centerZ);
    group.add(rim);
  }
  addTextLabel(group, label, centerX, centerY + height / 2 + 0.15, centerZ + 0.12, polarized ? 0xe8edf2 : 0x382b20, polarized ? 1.55 : 1.7);
  return group;
}

function createRoundedCanGeometry(radius: number, height: number) {
  const halfHeight = height / 2;
  const bevel = Math.min(0.12, radius * 0.2, height * 0.08);
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, -halfHeight),
    new THREE.Vector2(radius * 0.82, -halfHeight),
    new THREE.Vector2(radius * 0.96, -halfHeight + bevel * 0.55),
    new THREE.Vector2(radius, -halfHeight + bevel),
    new THREE.Vector2(radius, halfHeight - bevel),
    new THREE.Vector2(radius * 0.96, halfHeight - bevel * 0.55),
    new THREE.Vector2(radius * 0.82, halfHeight),
    new THREE.Vector2(0, halfHeight)
  ], 48);
}

function createAxialInductor(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const span = Math.max(1, distance2d(leftPin, rightPin));
  const bodyLength = Math.min(span * 0.72, Math.max(2.1, span - 1.1));
  const angle = Math.atan2(rightPin[1] - leftPin[1], rightPin[0] - leftPin[0]);
  const axisX = Math.cos(angle);
  const axisZ = Math.sin(angle);
  const bodyY = 1.55;
  const bodyRadius = 0.5;

  const core = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLength, 40, 1), materials.ferrite);
  core.rotation.z = Math.PI / 2;
  core.rotation.y = -angle;
  core.position.set(centerX, bodyY, centerZ);
  group.add(core);

  const windingCount = Math.max(5, Math.min(9, Math.floor(bodyLength * 2.7)));
  for (let index = 0; index < windingCount; index += 1) {
    const along = -bodyLength * 0.38 + (bodyLength * 0.76 * index) / Math.max(1, windingCount - 1);
    const winding = new THREE.Mesh(new THREE.TorusGeometry(bodyRadius + 0.025, 0.045, 10, 24), materials.copper);
    winding.rotation.y = Math.PI / 2 - angle;
    winding.position.set(centerX + axisX * along, bodyY, centerZ + axisZ * along);
    group.add(winding);
  }

  const endCapMaterial = new THREE.MeshStandardMaterial({ color: 0x526e64, roughness: 0.3, metalness: 0.12 });
  [-1, 1].forEach((side) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.82, bodyRadius * 0.92, 0.12, 36), endCapMaterial);
    cap.rotation.z = Math.PI / 2;
    cap.rotation.y = -angle;
    cap.position.set(centerX + axisX * side * bodyLength * 0.47, bodyY, centerZ + axisZ * side * bodyLength * 0.47);
    group.add(cap);
  });

  addLeadBetween(group, [centerX - axisX * bodyLength / 2, centerZ - axisZ * bodyLength / 2], leftPin, bodyY);
  addLeadBetween(group, [centerX + axisX * bodyLength / 2, centerZ + axisZ * bodyLength / 2], rightPin, bodyY);
  addBentPin(group, leftPin[0], bodyY, leftPin[1]);
  addBentPin(group, rightPin[0], bodyY, rightPin[1]);
  addTextLabel(group, label, centerX, 2.18, centerZ + 0.52, 0x1e242b, 1.9);
  return group;
}

function createTo92(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const center = getPinCenter(pinOffsets);

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.82, -0.26);
  bodyShape.lineTo(0.82, -0.26);
  bodyShape.absarc(0, -0.26, 0.82, 0, Math.PI, false);
  bodyShape.lineTo(-0.82, -0.26);

  const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.52,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3
  });
  bodyGeometry.center();
  const body = new THREE.Mesh(bodyGeometry, materials.blackPlastic);
  body.rotation.x = -Math.PI / 2;
  body.position.set(center[0], 1.38, center[1]);
  group.add(body);

  const bodyHalfWidth = 0.82;
  pinOffsets.forEach(([x, z]) => {
    if (Math.abs(x - center[0]) > bodyHalfWidth - 0.04) {
      const edgeX = center[0] + Math.sign(x - center[0]) * (bodyHalfWidth - 0.04);
      addLeadBetween(group, [edgeX, z], [x, z], 1.12);
    }
    addStraightPin(group, x, z, 1.16);
  });
  addTextLabel(group, label, center[0], 2.0, center[1] + 0.48, 0x3fffd2, 1.8);
  return group;
}

function createTo220(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const centerX = box.centerX;
  const centerZ = box.centerZ;

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.2, 0.55), materials.blackPlastic);
  body.position.set(centerX, 1.72, centerZ + 0.36);
  group.add(body);

  const tab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.7), materials.lead);
  tab.position.set(centerX, 2.88, centerZ + 0.36);
  group.add(tab);

  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.135, 24), new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.35 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.set(centerX, 2.92, centerZ + 0.36);
  group.add(hole);

  pinOffsets.forEach(([x, z]) => {
    const bodyEdge = centerX + Math.sign(x - centerX) * 1.125;
    if (Math.abs(x - centerX) > 1.125) {
      addLeadBetween(group, [bodyEdge, z], [x, z], 0.62);
      addStraightPin(group, x, z, 0.62);
    } else {
      addStraightPin(group, x, z, 1.05);
    }
  });
  addTextLabel(group, label, centerX, 2.12, centerZ + 0.72, 0x3fffd2, 1.7);
  return group;
}

function createTo39(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const center = getPinCenter(pinOffsets);

  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.85, 36), materials.lead);
  can.position.set(center[0], 1.25, center[1]);
  group.add(can);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.88, 0.18, 36), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.18, metalness: 0.65 }));
  cap.position.set(center[0], 1.78, center[1]);
  group.add(cap);

  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.45), materials.lead);
  tab.position.set(center[0] - 0.72, 1.25, center[1]);
  group.add(tab);

  pinOffsets.forEach(([x, z]) => {
    const dx = x - center[0];
    const dz = z - center[1];
    const radius = Math.hypot(dx, dz);
    if (radius > 0.78) {
      const scale = 0.78 / radius;
      addLeadBetween(group, [center[0] + dx * scale, center[1] + dz * scale], [x, z], 0.85);
    }
    addStraightPin(group, x, z, 0.86);
  });
  addTextLabel(group, label, center[0], 1.98, center[1] + 0.48, 0x1e242b, 1.6);
  return group;
}

function createDip(pinCount: number, label: string, pinOffsets: Array<[number, number]>, hidePins = false) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(2.4, box.width - 0.45);
  const bodyLength = Math.max(2, box.height + 0.7);
  const body = new THREE.Mesh(new RoundedBoxGeometry(bodyWidth, 0.62, bodyLength, 4, 0.12), materials.icBody);
  body.position.set(box.centerX, 1.0, box.centerZ);
  group.add(body);

  const pinOne = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.045, 24), materials.capacitorAluminum);
  pinOne.position.set(box.centerX - bodyWidth * 0.34, 1.335, box.minZ + 0.38);
  group.add(pinOne);

  pinOffsets.forEach(([x, z]) => {
    if (hidePins) return;
    const edgeX = box.centerX + Math.sign(x - box.centerX) * bodyWidth / 2;
    if (Math.abs(x - box.centerX) > bodyWidth / 2 - 0.08) {
      addLeadBetween(group, [edgeX, z], [x, z], 0.69);
    }
    addDipPin(group, x, z);
  });

  addTextLabel(group, label, box.centerX, 1.38, box.centerZ, 0xe8edf2, Math.min(2.4, bodyLength * 0.5));
  return group;
}

function createDipSwitch(pinCount: number, label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(2.4, box.width - 0.25);
  const bodyLength = Math.max(2, box.height + 0.75);
  const body = new THREE.Mesh(new RoundedBoxGeometry(bodyWidth, 0.5, bodyLength, 4, 0.1), new THREE.MeshStandardMaterial({ color: 0x9c2732, roughness: 0.36 }));
  body.position.set(box.centerX, 0.96, box.centerZ);
  group.add(body);

  const switchCount = Math.max(1, Math.floor(pinCount / 2));
  for (let index = 0; index < switchCount; index += 1) {
    const z = box.minZ + index * ((box.height || 1) / Math.max(1, switchCount - 1));
    const slider = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.35), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 }));
    slider.position.set(box.centerX + (index % 2 === 0 ? -0.22 : 0.22), 1.28, z);
    group.add(slider);
  }

  pinOffsets.forEach(([x, z]) => {
    const edgeX = box.centerX + Math.sign(x - box.centerX) * bodyWidth / 2;
    if (Math.abs(x - box.centerX) > bodyWidth / 2 - 0.08) {
      addLeadBetween(group, [edgeX, z], [x, z], 0.71);
    }
    addDipPin(group, x, z);
  });
  addTextLabel(group, label, box.centerX, 1.55, box.centerZ, 0xffffff, Math.min(2.6, bodyLength * 0.45));
  return group;
}

function createSevenSegmentDisplay(label: string, pinOffsets: Array<[number, number]>) {
  return createDisplay(label, pinOffsets, { minWidth: 3.2, minLength: 5.1, bodyColor: 0x1b2230, faceColor: 0x7f1d1d, barColor: 0xff3b30, barScale: 1, barOffset: 0, labelScale: 1.35 });
}

function createAlphanumericDisplay(label: string, pinOffsets: Array<[number, number]>) {
  return createDisplay(label, pinOffsets, { minWidth: 3.4, minLength: 6.2, bodyColor: 0x111827, faceColor: 0x1d4ed8, barColor: 0x60a5fa, barScale: 0.9, barOffset: -0.25, labelScale: 1.5, middleBar: true });
}

interface DisplayStyle {
  minWidth: number; minLength: number; bodyColor: number; faceColor: number;
  barColor: number; barScale: number; barOffset: number; labelScale: number; middleBar?: boolean;
}

function createDisplay(label: string, pinOffsets: Array<[number, number]>, style: DisplayStyle) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(style.minWidth, box.width + 1);
  const bodyLength = Math.max(style.minLength, box.height + 1);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, style.middleBar ? 0.76 : 0.72, bodyLength),
    new THREE.MeshStandardMaterial({ color: style.bodyColor, roughness: style.middleBar ? 0.32 : 0.3 })
  );
  body.position.set(box.centerX, style.middleBar ? 1.06 : 1.05, box.centerZ);
  group.add(body);
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - (style.middleBar ? 0.45 : 0.42), 0.08, bodyLength - (style.middleBar ? 0.55 : 0.5)),
    new THREE.MeshStandardMaterial({ color: style.faceColor, roughness: 0.2, transparent: true, opacity: style.middleBar ? 0.76 : 0.78 })
  );
  face.position.set(box.centerX, style.middleBar ? 1.47 : 1.45, box.centerZ);
  group.add(face);
  addSevenSegmentBars(group, box.centerX, style.middleBar ? 1.54 : 1.52, box.centerZ + style.barOffset, style.barColor, style.barScale);
  if (style.middleBar) addDisplayMiddleBar(group, box.centerX, box.centerZ);
  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.78));
  addTextLabel(group, label, box.centerX, style.middleBar ? 1.9 : 1.86, box.centerZ + bodyLength * (style.middleBar ? 0.38 : 0.36), 0xffffff, style.labelScale);
  return group;
}

function addDisplayMiddleBar(group: THREE.Group, x: number, z: number) {
  const middle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.7), new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.35 }));
  middle.position.set(x, 1.58, z);
  group.add(middle);
}

function addSevenSegmentBars(group: THREE.Group, x: number, y: number, z: number, color: number, scale: number) {
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.18 });
  const horizontal = (dz: number) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 0.05, 0.16 * scale), material);
    bar.position.set(x, y, z + dz * scale);
    group.add(bar);
  };
  const vertical = (dx: number, dz: number) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.05, 1.0 * scale), material);
    bar.position.set(x + dx * scale, y, z + dz * scale);
    group.add(bar);
  };

  horizontal(-1.15);
  horizontal(0);
  horizontal(1.15);
  vertical(-0.72, -0.58);
  vertical(0.72, -0.58);
  vertical(-0.72, 0.58);
  vertical(0.72, 0.58);
}

/**
 * 转接板：阻焊绿薄板 + 金盘 + 排针。原点在排针第 1 脚，和元件锚点一致，
 * 既能作为独立元件渲染，也能直接挂在插在它上面的芯片下面。
 */
export function createAdapterPlate(adapter: AdapterSpec, label: string) {
  const group = new THREE.Group();
  const offsets = adapterPinOffsets(adapter);
  const xs = offsets.map(([x]) => x);
  const zs = offsets.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = Math.max(adapter.width, maxX - minX + 2);
  const depth = Math.max(adapter.height, maxZ - minZ + 2);

  const plate = new THREE.Mesh(new RoundedBoxGeometry(width, 0.22, depth, 3, 0.12), materials.adapterPcb);
  plate.position.set(centerX, 0.36, centerZ);
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  // 丝印边框：四条细边，不遮挡板面
  const inset = 0.26;
  const bar = 0.07;
  const outline: Array<[number, number, number, number]> = [
    [centerX, centerZ - depth / 2 + inset, width - inset * 2, bar],
    [centerX, centerZ + depth / 2 - inset, width - inset * 2, bar],
    [centerX - width / 2 + inset, centerZ, bar, depth - inset * 2],
    [centerX + width / 2 - inset, centerZ, bar, depth - inset * 2]
  ];
  for (const [x, z, w, d] of outline) {
    const silk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), materials.adapterSilk);
    silk.position.set(x, 0.474, z);
    group.add(silk);
  }

  offsets.forEach(([x, z]) => {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), materials.brass);
    pin.position.set(x, 0.25, z);
    group.add(pin);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 20), materials.adapterPad);
    pad.position.set(x, 0.487, z);
    group.add(pad);
  });

  addTextLabel(group, label, centerX, 0.5, centerZ, 0xdff3e8, Math.min(2, Math.max(1, width * 0.32)));

  return group;
}

function adapterSpecFromPins(pinOffsets: Array<[number, number]>): AdapterSpec {
  const box = getPinBox(pinOffsets);
  return {
    pinCount: Math.max(2, pinOffsets.length),
    width: Math.round(box.width) + 2,
    height: Math.round(box.height) + 2,
    rowSpacing: Math.max(1, Math.round(box.height))
  };
}

function createPinHeader(pinCount: number, pinOffsets: Array<[number, number]>, isFallback = false) {  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const baseWidth = Math.max(1, box.width + 0.6);
  const baseDepth = Math.max(0.62, box.height + 0.5);
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseWidth, 0.36, baseDepth), materials.blackPlastic);
  base.position.set(box.centerX, 0.82, box.centerZ);
  group.add(base);

  if (isFallback) {
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.32 });
    const stripeCount = Math.max(2, pinCount);
    const stripeWidth = baseWidth / stripeCount;
    for (let index = 0; index < stripeCount; index += 1) {
      if (index % 2 === 0) {
        continue;
      }

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeWidth, 0.38, baseDepth + 0.02), stripeMaterial);
      stripe.position.set(box.centerX - baseWidth / 2 + stripeWidth * (index + 0.5), 0.835, box.centerZ);
      group.add(stripe);
    }
  }

  pinOffsets.forEach(([x, z]) => {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), materials.brass);
    pin.position.set(x, 0.9, z);
    group.add(pin);
  });

  if (isFallback) {
    addTextLabel(group, UNKNOWN_COMPONENT_LABEL, box.centerX, 1.26, box.centerZ + baseDepth * 0.28, 0xfacc15, Math.min(2.4, Math.max(1.2, baseWidth * 0.55)));
  }

  return group;
}

function createTerminalBlock(pinCount: number, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const body = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.2, box.width + 0.8), 1.15, Math.max(1.15, box.height + 1.1)), materials.terminalGreen);
  body.position.set(box.centerX, 1.0, box.centerZ);
  group.add(body);

  pinOffsets.forEach(([x, z]) => {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 24), materials.brass);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, 1.16, z + 0.61);
    group.add(screw);
    addStraightPin(group, x, z, 0.72);
  });
  return group;
}

function createSlideSwitch(pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const body = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2.3, box.width + 0.8), 0.65, 1.1), materials.blackPlastic);
  body.position.set(box.centerX, 0.96, box.centerZ);
  group.add(body);

  const actuator = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.45), materials.brass);
  actuator.position.set(box.centerX - 0.35, 1.45, box.centerZ);
  group.add(actuator);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.78));
  return group;
}

function createBuzzer(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.85, 36), materials.blackPlastic);
  body.position.set(centerX, 1.15, centerZ);
  group.add(body);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.42 }));
  top.position.set(centerX, 1.6, centerZ);
  group.add(top);

  addRadialPackagePins(group, [leftPin, rightPin], [centerX, centerZ], 0.95, 0.74, 0.75);
  addTextLabel(group, label, centerX, 1.68, centerZ + 0.52, 0x3fffd2, 1.35);
  return group;
}

function createTactileSwitch(pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const body = new THREE.Mesh(new THREE.BoxGeometry(box.width + 0.8, 0.45, box.height + 0.8), new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.34 }));
  body.position.set(box.centerX, 0.82, box.centerZ);
  group.add(body);

  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 28), materials.blackPlastic);
  button.position.set(box.centerX, 1.2, box.centerZ);
  group.add(button);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.72));
  return group;
}

function createPotentiometer(pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.25), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3 }));
  body.position.set(box.centerX, 1.14, box.centerZ);
  group.add(body);

  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.18, 32), materials.brass);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(box.centerX, 1.37, box.centerZ + 0.67);
  group.add(knob);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.86));
  return group;
}

function createTo3(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const center = getPinCenter(pinOffsets);

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.34, 44), materials.lead);
  disc.position.set(center[0], 1.28, center[1]);
  group.add(disc);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.18, 0.16, 44), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.2, metalness: 0.7 }));
  cap.position.set(center[0], 1.52, center[1]);
  group.add(cap);

  pinOffsets.forEach(([x, z]) => {
    const dx = x - center[0];
    const dz = z - center[1];
    const radius = Math.hypot(dx, dz);
    if (radius > 1.08) {
      const scale = 1.08 / radius;
      addLeadBetween(group, [center[0] + dx * scale, center[1] + dz * scale], [x, z], 1.1);
    }
    addStraightPin(group, x, z, 1.1);
  });
  addTextLabel(group, label, center[0], 1.8, center[1] + 0.45, 0x1e242b, 1.7);
  return group;
}

function createTo247(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const centerX = box.centerX;
  const centerZ = box.centerZ;

  const body = new THREE.Mesh(new THREE.BoxGeometry(Math.max(3.1, box.width + 0.7), 2.9, 0.65), materials.blackPlastic);
  body.position.set(centerX, 1.88, centerZ + 0.42);
  group.add(body);

  const tab = new THREE.Mesh(new THREE.BoxGeometry(Math.max(3.3, box.width + 0.9), 0.14, 0.85), materials.lead);
  tab.position.set(centerX, 3.42, centerZ + 0.42);
  group.add(tab);

  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.15, 24), new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.35 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.set(centerX, 3.46, centerZ + 0.42);
  group.add(hole);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 1.15));
  addTextLabel(group, label, centerX, 2.35, centerZ + 0.8, 0x3fffd2, 1.8);
  return group;
}

function createBridgeRectifier(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);

  const body = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2.4, box.width + 0.5), 1.15, 1.15), materials.blackPlastic);
  body.position.set(box.centerX, 1.12, box.centerZ);
  group.add(body);

  const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20), materials.brass);
  mark.rotation.x = Math.PI / 2;
  mark.position.set(box.centerX, 1.72, box.centerZ);
  group.add(mark);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.9));
  addTextLabel(group, label, box.centerX, 1.85, box.centerZ, 0x3fffd2, Math.min(2.6, box.width * 0.7));
  return group;
}

function createRelay(label: string, pinCount: number, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(2.6, box.width + 0.6);
  const bodyDepth = Math.max(2.6, box.height + 0.8);

  const base = new THREE.Mesh(new RoundedBoxGeometry(bodyWidth + 0.18, 0.2, bodyDepth + 0.18, 4, 0.08), materials.blackPlastic);
  base.position.set(box.centerX, 0.55, box.centerZ);
  group.add(base);

  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: 0x24384c, roughness: 0.3, metalness: 0.08, clearcoat: 0.34, clearcoatRoughness: 0.28 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(bodyWidth, 1.25, bodyDepth, 5, 0.16), bodyMaterial);
  body.position.set(box.centerX, 1.27, box.centerZ);
  group.add(body);

  const topY = 1.27 + 1.25 / 2;
  const topPanel = new THREE.Mesh(new RoundedBoxGeometry(bodyWidth * 0.72, 0.035, bodyDepth * 0.58, 3, 0.01), new THREE.MeshStandardMaterial({ color: 0x354d63, roughness: 0.36, metalness: 0.16 }));
  topPanel.position.set(box.centerX, topY + 0.018, box.centerZ);
  group.add(topPanel);

  const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe6ae57, emissive: 0x4b2b08, emissiveIntensity: 0.24, roughness: 0.2, metalness: 0.12 }));
  indicator.position.set(box.centerX - bodyWidth * 0.32, topY + 0.055, box.centerZ - bodyDepth * 0.28);
  group.add(indicator);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.86));
  addTextLabel(group, label, box.centerX, topY + 0.34, box.centerZ + bodyDepth * 0.08, 0xe8edf2, Math.min(1.8, bodyWidth * 0.68));
  return group;
}

function createCrystal(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const angle = Math.atan2(rightPin[1] - leftPin[1], rightPin[0] - leftPin[0]);
  const axisX = Math.cos(angle);
  const axisZ = Math.sin(angle);
  const bodyY = 1.34;
  const bodyLength = Math.max(1.7, distance2d(leftPin, rightPin) + 0.15);

  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, bodyLength, 36, 1), materials.crystalMetal);
  can.rotation.z = Math.PI / 2;
  can.rotation.y = -angle;
  can.position.set(centerX, bodyY, centerZ);
  group.add(can);

  [-1, 1].forEach((side) => {
    const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.1, 36), materials.capacitorAluminum);
    endCap.rotation.z = Math.PI / 2;
    endCap.rotation.y = -angle;
    endCap.position.set(centerX + axisX * side * bodyLength * 0.46, bodyY, centerZ + axisZ * side * bodyLength * 0.46);
    group.add(endCap);
  });

  // Anchor both leads to their actual grid holes and run them into the underside
  // of the can so they stay attached at every allowed board rotation.
  addStraightPin(group, leftPin[0], leftPin[1], bodyY + 0.08);
  addStraightPin(group, rightPin[0], rightPin[1], bodyY + 0.08);
  addTextLabel(group, label, centerX, bodyY + 0.48, centerZ + 0.4, 0x1e242b, 1.45);
  return group;
}

function createFuse(label: string, pinOffsets: Array<[number, number]>) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const span = Math.max(1, distance2d(leftPin, rightPin));
  const angle = Math.atan2(rightPin[1] - leftPin[1], rightPin[0] - leftPin[0]);
  const axisX = Math.cos(angle);
  const axisZ = Math.sin(angle);
  const bodyY = 1.28;
  const tubeLength = Math.max(0.8, span - 1.45);
  const capLength = 0.34;
  const bodyCenter = (along: number): [number, number, number] => [centerX + axisX * along, bodyY, centerZ + axisZ * along];

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, tubeLength, 36, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xd9e8ed, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.34, transmission: 0.42, thickness: 0.18, clearcoat: 0.8 })
  );
  glass.rotation.z = Math.PI / 2;
  glass.rotation.y = -angle;
  glass.position.set(centerX, bodyY, centerZ);
  group.add(glass);

  const fuseWire = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, tubeLength * 0.76, 16), materials.copper);
  fuseWire.rotation.z = Math.PI / 2;
  fuseWire.rotation.y = -angle;
  fuseWire.position.set(centerX, bodyY, centerZ);
  group.add(fuseWire);

  [-1, 1].forEach((side) => {
    const capOffset = tubeLength / 2 + capLength / 2 - 0.025;
    const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, capLength, 32), materials.capacitorAluminum);
    endCap.rotation.z = Math.PI / 2;
    endCap.rotation.y = -angle;
    endCap.position.set(...bodyCenter(side * capOffset));
    group.add(endCap);

    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.352, 0.018, 8, 28), materials.brass);
    seam.rotation.y = Math.PI / 2 - angle;
    seam.position.set(...bodyCenter(side * (tubeLength / 2 + capLength * 0.72)));
    group.add(seam);
  });

  const leadEndOffset = tubeLength / 2 + capLength;
  addLeadBetween(group, [centerX - axisX * leadEndOffset, centerZ - axisZ * leadEndOffset], leftPin, bodyY);
  addLeadBetween(group, [centerX + axisX * leadEndOffset, centerZ + axisZ * leadEndOffset], rightPin, bodyY);
  addStraightPin(group, leftPin[0], leftPin[1], bodyY + 0.08);
  addStraightPin(group, rightPin[0], rightPin[1], bodyY + 0.08);
  addTextLabel(group, label, centerX, 1.98, centerZ + 0.42, 0x1e242b, 1.45);
  return group;
}

function addDipPin(group: THREE.Group, x: number, z: number) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 0.09), materials.lead);
  leg.position.set(x, 0.55, z);
  group.add(leg);
  addStraightPin(group, x, z, 0.68);
}

function addStraightPin(group: THREE.Group, x: number, z: number, topY: number) {
  const length = topY - (BOARD_TOP_Y - EXPOSED_LEAD);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(LEAD_RADIUS, LEAD_RADIUS, length, 12), materials.lead);
  pin.position.set(x, BOARD_TOP_Y - EXPOSED_LEAD + length / 2, z);
  group.add(pin);
}

function addBentPin(group: THREE.Group, x: number, topY: number, z: number) {
  addStraightPin(group, x, z, topY);
}

function addLeadBetween(group: THREE.Group, from: [number, number], to: [number, number], y: number) {
  const length = distance2d(from, to);
  if (length <= 0.01) {
    return;
  }

  const lead = new THREE.Mesh(new THREE.CylinderGeometry(LEAD_RADIUS, LEAD_RADIUS, length, 12), materials.lead);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  lead.rotation.z = Math.PI / 2;
  lead.rotation.y = -angle;
  lead.position.set((from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2);
  group.add(lead);
}

function addRadialPackagePins(
  group: THREE.Group,
  pinOffsets: Array<[number, number]>,
  center: [number, number],
  bodyRadius: number,
  connectionY: number,
  innerPinTopY: number
) {
  pinOffsets.forEach(([x, z]) => {
    const dx = x - center[0];
    const dz = z - center[1];
    const distance = Math.hypot(dx, dz);
    const connectionRadius = bodyRadius * 0.8;
    if (distance > connectionRadius) {
      const scale = connectionRadius / distance;
      addLeadBetween(
        group,
        [center[0] + dx * scale, center[1] + dz * scale],
        [x, z],
        connectionY
      );
      addStraightPin(group, x, z, connectionY);
    } else {
      addStraightPin(group, x, z, innerPinTopY);
    }
  });
}

function normalizeTwoPins(pinOffsets: Array<[number, number]>): [[number, number], [number, number]] {
  if (pinOffsets.length >= 2) {
    return [pinOffsets[0], pinOffsets[1]];
  }
  return [[-1, 0], [1, 0]];
}

function getPinCenter(pinOffsets: Array<[number, number]>): [number, number] {
  const sum = pinOffsets.reduce(
    (acc, [x, z]) => {
      acc[0] += x;
      acc[1] += z;
      return acc;
    },
    [0, 0]
  );
  return [sum[0] / pinOffsets.length, sum[1] / pinOffsets.length];
}

function getPinBox(pinOffsets: Array<[number, number]>) {
  const xs = pinOffsets.map(([x]) => x);
  const zs = pinOffsets.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    height: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2
  };
}

function distance2d(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function addTextLabel(group: THREE.Group, text: string, x: number, y: number, z: number, color: number, width: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `#${labelColorForTheme(color).toString(16).padStart(6, "0")}`;
  ctx.font = "800 38px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(12,18,28,0.52)";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width * 0.25, 1);
  group.add(sprite);
}

function labelColorForTheme(color: number) {
  if (color === 0x3fffd2) {
    return 0xe8edf2;
  }
  if (!darkComponentTheme) {
    return color;
  }
  const lightness = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l;
  return lightness < 0.5 ? 0xd7e3f4 : color;
}
