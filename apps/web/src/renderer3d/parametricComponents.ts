import * as THREE from "three";

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
  | "dip"
  | "dip_switch"
  | "seven_segment_display"
  | "alphanumeric_display"
  | "pin_header"
  | "terminal_block"
  | "slide_switch"
  | "buzzer"
  | "tactile_switch"
  | "potentiometer";

export interface ParametricComponentSpec {
  kind: ParametricComponentKind;
  label?: string;
  pinCount?: number;
  color?: number;
  pinOffsets?: Array<[number, number]>;
  isFallback?: boolean;
}

const BOARD_TOP_Y = 0.28;
const LEAD_RADIUS = 0.045;
const EXPOSED_LEAD = 0.18;

const materials = {
  lead: new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.28, metalness: 0.72 }),
  resistorBody: new THREE.MeshStandardMaterial({ color: 0xd5ba86, roughness: 0.55 }),
  inductorBody: new THREE.MeshStandardMaterial({ color: 0x3d7a4f, roughness: 0.48 }),
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
  capacitorBlue: new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.3 }),
  capacitorDark: new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.24 }),
  terminalGreen: new THREE.MeshStandardMaterial({ color: 0x15845f, roughness: 0.32 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc7953a, roughness: 0.22, metalness: 0.55 })
};
Object.values(materials).forEach((material) => {
  material.userData.shared = true;
});

export function createParametricComponent(spec: ParametricComponentSpec) {
  switch (spec.kind) {
    case "resistor":
      return createAxialPart(spec.label ?? "R", materials.resistorBody, 0.45, 2.2, true, spec.pinOffsets);
    case "inductor":
      return createAxialPart(spec.label ?? "L", materials.inductorBody, 0.52, 2.35, false, spec.pinOffsets);
    case "diode":
      return createDiode(spec.label ?? "D", spec.pinOffsets);
    case "led":
      return createLed(spec.color ?? 0xe83f3f, spec.pinOffsets);
    case "radial_capacitor":
      return createRadialCapacitor(spec.label ?? "C", false, spec.pinOffsets);
    case "electrolytic_capacitor":
      return createRadialCapacitor(spec.label ?? "C", true, spec.pinOffsets);
    case "to92":
      return createTo92(spec.label ?? "Q", spec.pinOffsets);
    case "to39":
      return createTo39(spec.label ?? "Q", spec.pinOffsets);
    case "to220":
      return createTo220(spec.label ?? "Q", spec.pinOffsets);
    case "dip":
      return createDip(spec.pinCount ?? 8, spec.label ?? `DIP-${spec.pinCount ?? 8}`, spec.pinOffsets);
    case "dip_switch":
      return createDipSwitch(spec.pinCount ?? 16, spec.label ?? `DIPSW${Math.floor((spec.pinCount ?? 16) / 2)}`, spec.pinOffsets);
    case "seven_segment_display":
      return createSevenSegmentDisplay(spec.label ?? "7SEG", spec.pinOffsets);
    case "alphanumeric_display":
      return createAlphanumericDisplay(spec.label ?? "ALNUM", spec.pinOffsets);
    case "pin_header":
      return createPinHeader(spec.pinCount ?? 4, spec.pinOffsets, spec.isFallback);
    case "terminal_block":
      return createTerminalBlock(spec.pinCount ?? 2, spec.pinOffsets);
    case "slide_switch":
      return createSlideSwitch(spec.pinOffsets);
    case "buzzer":
      return createBuzzer(spec.label ?? "BZ", spec.pinOffsets);
    case "tactile_switch":
      return createTactileSwitch(spec.pinOffsets);
    case "potentiometer":
      return createPotentiometer(spec.pinOffsets);
  }
}

function createAxialPart(
  label: string,
  bodyMaterial: THREE.Material,
  radius: number,
  length: number,
  addBands: boolean,
  pinOffsets: Array<[number, number]> = [[-3, 0], [3, 0]]
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
  } else {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 24), materials.lead);
    coil.scale.set(1, 1, 0.22);
    coil.rotation.y = -angle;
    coil.position.set(centerX, 1.55, centerZ);
    group.add(coil);
  }

  addTextLabel(group, label, centerX, 2.18, centerZ + 0.52, 0x1e242b, 2.2);
  return group;
}

function createDiode(label: string, pinOffsets?: Array<[number, number]>) {
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

function createLed(color: number, pinOffsets: Array<[number, number]> = [[0, 0], [1, 0]]) {
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
  addStraightPin(group, leftPin[0], leftPin[1], 0.98);
  addStraightPin(group, rightPin[0], rightPin[1], 0.98);
  return group;
}

function createRadialCapacitor(
  label: string,
  polarized: boolean,
  pinOffsets: Array<[number, number]> = [[0, 0], [1, 0]]
) {
  const group = new THREE.Group();
  const [leftPin, rightPin] = normalizeTwoPins(pinOffsets);
  const centerX = (leftPin[0] + rightPin[0]) / 2;
  const centerZ = (leftPin[1] + rightPin[1]) / 2;
  const material = polarized ? materials.capacitorDark : materials.capacitorBlue;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, polarized ? 2.2 : 1.45, 28), material);
  body.position.set(centerX, polarized ? 1.62 : 1.28, centerZ);
  group.add(body);
  addStraightPin(group, leftPin[0], leftPin[1], 0.9);
  addStraightPin(group, rightPin[0], rightPin[1], 0.9);

  if (polarized) {
    addTextLabel(group, "-", centerX + 0.48, 2.05, centerZ + 0.58, 0x3fffd2, 1.8);
  }
  addTextLabel(group, label, centerX, polarized ? 2.82 : 2.04, centerZ + 0.15, 0x3fffd2, 2.05);
  return group;
}

function createTo92(label: string, pinOffsets: Array<[number, number]> = [[-1, 0], [0, 0], [1, 0]]) {
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

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.88));
  addTextLabel(group, label, center[0], 2.0, center[1] + 0.48, 0x3fffd2, 1.8);
  return group;
}

function createTo220(label: string, pinOffsets: Array<[number, number]> = [[-1, 0], [0, 0], [1, 0]]) {
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

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 1.05));
  addTextLabel(group, label, centerX, 2.12, centerZ + 0.72, 0x3fffd2, 1.7);
  return group;
}

function createTo39(label: string, pinOffsets: Array<[number, number]> = [[-1, 0], [1, 0], [0, 1]]) {
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

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.86));
  addTextLabel(group, label, center[0], 1.98, center[1] + 0.48, 0x1e242b, 1.6);
  return group;
}

function createDip(pinCount: number, label: string, pinOffsets = makeDipPinOffsets(pinCount, 3)) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(2.4, box.width - 0.45);
  const bodyLength = Math.max(2, box.height + 0.7);
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, 0.62, bodyLength), materials.icBody);
  body.position.set(box.centerX, 1.0, box.centerZ);
  group.add(body);

  const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.035, 20), new THREE.MeshStandardMaterial({ color: 0x2f3740 }));
  notch.rotation.x = Math.PI / 2;
  notch.position.set(box.centerX, 1.32, box.minZ - 0.16);
  group.add(notch);

  pinOffsets.forEach(([x, z]) => addDipPin(group, x, z));
  pinOffsets.forEach(([x, z], index) => {
    const sideSign = x <= box.centerX ? -1 : 1;
    addTextLabel(group, String(index + 1), x + sideSign * 0.34, 0.82, z, 0x3fffd2, 0.9);
  });

  addTextLabel(group, label, box.centerX, 1.38, box.centerZ, 0x3fffd2, Math.min(2.8, bodyLength * 0.58));
  return group;
}

function createDipSwitch(pinCount: number, label: string, pinOffsets = makeDipPinOffsets(pinCount, 3)) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(2.4, box.width - 0.25);
  const bodyLength = Math.max(2, box.height + 0.75);
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, 0.5, bodyLength), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.36 }));
  body.position.set(box.centerX, 0.96, box.centerZ);
  group.add(body);

  const switchCount = Math.max(1, Math.floor(pinCount / 2));
  for (let index = 0; index < switchCount; index += 1) {
    const z = box.minZ + index * ((box.height || 1) / Math.max(1, switchCount - 1));
    const slider = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.35), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 }));
    slider.position.set(box.centerX + (index % 2 === 0 ? -0.22 : 0.22), 1.28, z);
    group.add(slider);
  }

  pinOffsets.forEach(([x, z]) => addDipPin(group, x, z));
  addTextLabel(group, label, box.centerX, 1.55, box.centerZ, 0xffffff, Math.min(2.6, bodyLength * 0.45));
  return group;
}

function createSevenSegmentDisplay(label: string, pinOffsets: Array<[number, number]> = makeDipPinOffsets(10, 3)) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(3.2, box.width + 1.0);
  const bodyLength = Math.max(5.1, box.height + 1.0);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, 0.72, bodyLength),
    new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.3 })
  );
  body.position.set(box.centerX, 1.05, box.centerZ);
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.42, 0.08, bodyLength - 0.5),
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.2, transparent: true, opacity: 0.78 })
  );
  face.position.set(box.centerX, 1.45, box.centerZ);
  group.add(face);

  addSevenSegmentBars(group, box.centerX, 1.52, box.centerZ, 0xff3b30, 1.0);
  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.78));
  addTextLabel(group, label, box.centerX, 1.86, box.centerZ + bodyLength * 0.36, 0xffffff, 1.35);
  return group;
}

function createAlphanumericDisplay(label: string, pinOffsets: Array<[number, number]> = makeDipPinOffsets(14, 3)) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const bodyWidth = Math.max(3.4, box.width + 1.0);
  const bodyLength = Math.max(6.2, box.height + 1.0);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, 0.76, bodyLength),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.32 })
  );
  body.position.set(box.centerX, 1.06, box.centerZ);
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.45, 0.08, bodyLength - 0.55),
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.2, transparent: true, opacity: 0.76 })
  );
  face.position.set(box.centerX, 1.47, box.centerZ);
  group.add(face);

  addSevenSegmentBars(group, box.centerX, 1.54, box.centerZ - 0.25, 0x60a5fa, 0.9);
  const middle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 2.7), new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.35 }));
  middle.position.set(box.centerX, 1.58, box.centerZ);
  group.add(middle);

  pinOffsets.forEach(([x, z]) => addStraightPin(group, x, z, 0.78));
  addTextLabel(group, label, box.centerX, 1.9, box.centerZ + bodyLength * 0.38, 0xffffff, 1.5);
  return group;
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

function createPinHeader(pinCount: number, pinOffsets = makeLinearPinOffsets(pinCount), isFallback = false) {
  const group = new THREE.Group();
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
    addTextLabel(group, "UNK", box.centerX, 1.26, box.centerZ + baseDepth * 0.28, 0xfacc15, Math.min(2.4, Math.max(1.2, baseWidth * 0.55)));
  }

  return group;
}

function createTerminalBlock(pinCount: number, pinOffsets = makeLinearPinOffsets(pinCount)) {
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

function createSlideSwitch(pinOffsets: Array<[number, number]> = [[-1, 0], [0, 0], [1, 0]]) {
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

function createBuzzer(label: string, pinOffsets: Array<[number, number]> = [[0, 0], [2, 0]]) {
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

  addStraightPin(group, leftPin[0], leftPin[1], 0.75);
  addStraightPin(group, rightPin[0], rightPin[1], 0.75);
  addTextLabel(group, label, centerX, 1.68, centerZ + 0.52, 0x3fffd2, 1.35);
  return group;
}

function createTactileSwitch(pinOffsets: Array<[number, number]> = [[0, 0], [2, 0], [0, 2], [2, 2]]) {
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

function createPotentiometer(pinOffsets: Array<[number, number]> = [[-1, 0], [0, 0], [1, 0]]) {
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

function makeLinearPinOffsets(pinCount: number) {
  return Array.from({ length: pinCount }, (_, index) => [index, 0] as [number, number]);
}

function makeDipPinOffsets(pinCount: number, rowSpacing: number) {
  const pinsPerSide = Math.ceil(pinCount / 2);
  const offsets: Array<[number, number]> = [];
  for (let index = 0; index < pinsPerSide; index += 1) {
    offsets.push([0, index]);
  }
  for (let index = pinsPerSide - 1; index >= 0; index -= 1) {
    offsets.push([rowSpacing, index]);
  }
  return offsets;
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
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.font = "800 38px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width * 0.25, 1);
  group.add(sprite);
}
