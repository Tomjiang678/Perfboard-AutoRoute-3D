/**
 * Test factory: builds KiCad .net files (S-expression format) from a compact
 * spec, plus a seeded pseudo-random circuit generator so the suite can create
 * its own netlists and test the whole import → placement → routing pipeline.
 */

export interface FactoryPin {
  num: number;
  name: string;
  type: string;
}

export interface FactoryComponent {
  ref: string;
  lib: string;
  part: string;
  value: string;
  pins: FactoryPin[];
}

export interface FactoryNetlist {
  components: FactoryComponent[];
  nets: Array<{ name: string; nodes: Array<{ ref: string; pin: number }> }>;
}

export function escapeNetlistString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildNetlistText(spec: FactoryNetlist): string {
  const lines: string[] = [];
  lines.push("(export");
  lines.push('\t(version "E")');
  lines.push("\t(components");
  for (const component of spec.components) {
    lines.push("\t\t(comp");
    lines.push(`\t\t\t(ref "${escapeNetlistString(component.ref)}")`);
    lines.push(`\t\t\t(value "${escapeNetlistString(component.value)}")`);
    lines.push(`\t\t\t(libsource (lib "${escapeNetlistString(component.lib)}") (part "${escapeNetlistString(component.part)}"))`);
    lines.push("\t\t)");
  }
  lines.push("\t)");

  const libparts = new Map<string, FactoryComponent>();
  for (const component of spec.components) {
    const key = `${component.lib}:${component.part}`;
    if (!libparts.has(key)) {
      libparts.set(key, component);
    }
  }
  lines.push("\t(libparts");
  for (const [, component] of libparts) {
    lines.push("\t\t(libpart");
    lines.push(`\t\t\t(lib "${escapeNetlistString(component.lib)}")`);
    lines.push(`\t\t\t(part "${escapeNetlistString(component.part)}")`);
    lines.push("\t\t\t(pins");
    for (const pin of component.pins) {
      lines.push(`\t\t\t\t(pin (num "${pin.num}") (name "${escapeNetlistString(pin.name)}") (type "${pin.type}"))`);
    }
    lines.push("\t\t\t)");
    lines.push("\t\t)");
  }
  lines.push("\t)");

  lines.push("\t(nets");
  for (const net of spec.nets) {
    lines.push("\t\t(net");
    lines.push(`\t\t\t(name "${escapeNetlistString(net.name)}")`);
    for (const node of net.nodes) {
      lines.push(`\t\t\t(node (ref "${escapeNetlistString(node.ref)}") (pin "${node.pin}"))`);
    }
    lines.push("\t\t)");
  }
  lines.push("\t)");
  lines.push(")");
  return lines.join("\n");
}

export function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GENERATOR_KINDS = [
  {
    prefix: "R", lib: "Device", part: "R", value: "R",
    pins: [{ num: 1, name: "1", type: "passive" }, { num: 2, name: "2", type: "passive" }]
  },
  {
    prefix: "C", lib: "Device", part: "C", value: "C",
    pins: [{ num: 1, name: "1", type: "passive" }, { num: 2, name: "2", type: "passive" }]
  },
  {
    prefix: "LED", lib: "Device", part: "LED", value: "LED",
    pins: [{ num: 1, name: "K", type: "passive" }, { num: 2, name: "A", type: "passive" }]
  },
  {
    prefix: "D", lib: "Device", part: "D", value: "D",
    pins: [{ num: 1, name: "K", type: "passive" }, { num: 2, name: "A", type: "passive" }]
  },
  {
    prefix: "U", lib: "Amplifier_Operational", part: "LM358", value: "LM358",
    pins: [
      { num: 1, name: "", type: "output" },
      { num: 2, name: "-", type: "input" },
      { num: 3, name: "+", type: "input" },
      { num: 4, name: "V-", type: "power_in" },
      { num: 5, name: "+", type: "input" },
      { num: 6, name: "-", type: "input" },
      { num: 7, name: "", type: "output" },
      { num: 8, name: "V+", type: "power_in" }
    ]
  },
  {
    prefix: "J", lib: "Connector", part: "Conn_01x02", value: "Conn_01x02",
    pins: [{ num: 1, name: "Pin_1", type: "passive" }, { num: 2, name: "Pin_2", type: "passive" }]
  }
];

export interface GeneratedCircuit {
  text: string;
  spec: FactoryNetlist;
}

/**
 * Deterministic circuit: a chain of two-pin parts plus two op-amps with a
 * shared GND net and per-opamp VCC nets; some pins left unconnected.
 */
export function generateCircuit(seed: number, partCount = 8): GeneratedCircuit {
  const rand = mulberry32(seed);
  const components: FactoryComponent[] = [];
  const nets: FactoryNetlist["nets"] = [];
  const twoPinCount = Math.max(2, Math.min(8, partCount - 2));

  let chain: FactoryComponent[] = [];
  for (let index = 0; index < twoPinCount; index += 1) {
    const kind = GENERATOR_KINDS[Math.floor(rand() * 4)]; // R/C/LED/D only
    const ref = `${kind.prefix}${index + 1}`;
    const component: FactoryComponent = { ref, ...kind, pins: kind.pins.map((pin) => ({ ...pin })) };
    components.push(component);
    chain.push(component);
  }

  const opampKind = GENERATOR_KINDS[4];
  const headerKind = GENERATOR_KINDS[5];
  const u1: FactoryComponent = { ref: "U1", ...opampKind, pins: opampKind.pins.map((pin) => ({ ...pin })) };
  const u2: FactoryComponent = { ref: "U2", ...opampKind, pins: opampKind.pins.map((pin) => ({ ...pin })) };
  const j1: FactoryComponent = { ref: "J1", ...headerKind, pins: headerKind.pins.map((pin) => ({ ...pin })) };
  components.push(u1, u2, j1);

  for (let index = 0; index < chain.length - 1; index += 1) {
    nets.push({
      name: `N${index + 1}`,
      nodes: [
        { ref: chain[index].ref, pin: 2 },
        { ref: chain[index + 1].ref, pin: 1 }
      ]
    });
  }
  nets.push({
    name: "GND",
    nodes: [
      { ref: chain[0].ref, pin: 1 },
      { ref: u1.ref, pin: 4 },
      { ref: u2.ref, pin: 4 },
      { ref: j1.ref, pin: 2 }
    ]
  });
  nets.push({
    name: "VCC",
    nodes: [
      { ref: u1.ref, pin: 8 },
      { ref: chain[chain.length - 1].ref, pin: 2 }
    ]
  });
  nets.push({
    name: "VCC2",
    nodes: [
      { ref: u2.ref, pin: 8 },
      { ref: j1.ref, pin: 1 }
    ]
  });
  nets.push({
    name: "SIG",
    nodes: [
      { ref: u1.ref, pin: 1 },
      { ref: u2.ref, pin: 3 }
    ]
  });

  const spec: FactoryNetlist = { components, nets };
  return { text: buildNetlistText(spec), spec };
}
