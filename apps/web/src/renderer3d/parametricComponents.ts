import * as THREE from "three";

export type ParametricComponentKind =
  | "resistor"
  | "inductor"
  | "diode"
  | "led"
  | "radial_capacitor"
  | "electrolytic_capacitor"
  | "to92"
  | "dip"
  | "pin_header"
  | "terminal_block"
  | "tactile_switch"
  | "potentiometer";

export interface ParametricComponentSpec {
  kind: ParametricComponentKind;
  label?: string;
  pinCount?: number;
  color?: number;
  pinOffsets?: Array<[number, number]>;
}

const BOARD_TOP_Y = 0.28;
const LEAD_RADIUS = 0.045;
const EXPOSED_LEAD = 0.18;
const COMPONENT_LIFT = 0.42;

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
    case "dip":
      return createDip(spec.pinCount ?? 8, spec.label ?? `DIP-${spec.pinCount ?? 8}`, spec.pinOffsets);
    case "pin_header":
      return createPinHeader(spec.pinCount ?? 4, spec.pinOffsets);
    case "terminal_block":
      return createTerminalBlock(spec.pinCount ?? 2, spec.pinOffsets);
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
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), bodyMaterial);
  body.rotation.z = Math.PI / 2;
  body.position.set(centerX, 1.55, centerZ);
  body.scale.x = Math.min(1.4, Math.max(0.75, span / 6));
  group.add(body);

  addLeadBetween(group, [centerX - length / 2, centerZ], leftPin, 1.55);
  addLeadBetween(group, [centerX + length / 2, centerZ], rightPin, 1.55);
  addBentPin(group, leftPin[0], 1.55, leftPin[1]);
  addBentPin(group, rightPin[0], 1.55, rightPin[1]);

  if (addBands) {
    [-0.55, 0.05, 0.55].forEach((x, index) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(radius + 0.01, radius + 0.01, 0.1, 24),
        new THREE.MeshStandardMaterial({ color: [0x7c3aed, 0xb91c1c, 0xd97706][index], roughness: 0.4 })
      );
      band.rotation.z = Math.PI / 2;
      band.position.set(centerX + x, 1.55, centerZ);
      group.add(band);
    });
  } else {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 24), materials.lead);
    coil.scale.set(1, 1, 0.22);
    coil.position.set(centerX, 1.55, centerZ);
    group.add(coil);
  }

  addTextLabel(group, label, centerX, 2.18, centerZ + 0.52, 0x1e242b, 2.2);
  return group;
}

function createDiode(label: string, pinOffsets?: Array<[number, number]>) {
  const group = createAxialPart(label, materials.diodeBody, 0.42, 1.85, false, pinOffsets);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.12, 24), materials.lead);
  ring.rotation.z = Math.PI / 2;
  ring.position.set(0.58, 1.55, 0);
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

function createPinHeader(pinCount: number, pinOffsets = makeLinearPinOffsets(pinCount)) {
  const group = new THREE.Group();
  const box = getPinBox(pinOffsets);
  const base = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, box.width + 0.6), 0.36, Math.max(0.62, box.height + 0.5)), materials.blackPlastic);
  base.position.set(box.centerX, 0.82, box.centerZ);
  group.add(base);

  pinOffsets.forEach(([x, z]) => {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), materials.brass);
    pin.position.set(x, 0.9, z);
    group.add(pin);
  });
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

function addHorizontalLead(group: THREE.Group, x: number, y: number, z: number, length: number) {
  const lead = new THREE.Mesh(new THREE.CylinderGeometry(LEAD_RADIUS, LEAD_RADIUS, length, 12), materials.lead);
  lead.rotation.z = Math.PI / 2;
  lead.position.set(x, y, z);
  group.add(lead);
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
