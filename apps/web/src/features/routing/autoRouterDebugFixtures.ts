import type { BoardSize, PlacedComponent, RoutedNetEndpoint } from "../../types/project";
import { __autorouterDebug, autoRouteBoard } from "./autoRouter";

interface AutorouterFixture {
  name: string;
  board: BoardSize;
  components: PlacedComponent[];
  endpoints: RoutedNetEndpoint[];
}

export function runAutorouterDebugFixtures() {
  return createAutorouterDebugFixtures().map((fixture) => {
    const routing = autoRouteBoard(fixture.board, fixture.endpoints, fixture.components);
    return {
      name: fixture.name,
      traces: routing.traces.length,
      jumpers: routing.jumpers.length,
      failedNets: routing.failedNets,
      hasShortCircuit: hasShortCircuit(routing.traces)
    };
  });
}

export function runDrcDebugFixtures() {
  const base = createDip8ComparatorFixture();
  const crossing = __autorouterDebug.validateRoutingResult(
    base.board,
    {
      traces: [
        { id: "A", net: "A", points: [[2, 2], [8, 2]] },
        { id: "B", net: "B", points: [[5, 0], [5, 5]] }
      ],
      jumpers: [],
      failedNets: [],
      warnings: []
    },
    [ep("A", "U1", 1, [2, 2]), ep("A", "R1", 1, [8, 2]), ep("B", "U1", 2, [5, 0]), ep("B", "R2", 1, [5, 5])],
    base.components
  );
  const unrouted = __autorouterDebug.validateRoutingResult(
    base.board,
    { traces: [], jumpers: [], failedNets: [], warnings: [] },
    base.endpoints,
    base.components
  );
  const shorted = __autorouterDebug.validateRoutingResult(
    base.board,
    {
      traces: [
        { id: "A", net: "OUTA", points: [[9, 6], [8, 6]] },
        { id: "B", net: "INA", points: [[9, 7], [8, 7], [8, 6]] }
      ],
      jumpers: [],
      failedNets: [],
      warnings: []
    },
    base.endpoints,
    base.components
  );
  const wrongPhysicalNet = __autorouterDebug.validateRoutingResult(
    base.board,
    {
      traces: [
        { id: "wrong", net: "OUTA", points: [[9, 6], [9, 7]] }
      ],
      jumpers: [],
      failedNets: [],
      warnings: []
    },
    base.endpoints,
    base.components
  );

  return [
    { name: "bottom crossing", errors: crossing.drc.errors.map((issue) => issue.code), warnings: crossing.drc.warnings.map((issue) => issue.code) },
    { name: "unrouted required pins", errors: unrouted.drc.errors.map((issue) => issue.code), warnings: unrouted.drc.warnings.map((issue) => issue.code) },
    { name: "short between nets", errors: shorted.drc.errors.map((issue) => issue.code), warnings: shorted.drc.warnings.map((issue) => issue.code) },
    { name: "wrong physical net", errors: wrongPhysicalNet.drc.errors.map((issue) => issue.code), warnings: wrongPhysicalNet.drc.warnings.map((issue) => issue.code) }
  ];
}

export function createAutorouterDebugFixtures(): AutorouterFixture[] {
  return [
    createDip8ComparatorFixture(),
    createHeader2x5Fixture(),
    createTo92Fixture(),
    createPowerBusFixture()
  ];
}

function createDip8ComparatorFixture(): AutorouterFixture {
  const board = { width: 24, height: 18 };
  const components: PlacedComponent[] = [
    makeComponent("U1", "dip", "LM393", 8, [9, 6], [[0, 0], [0, 1], [0, 2], [0, 3], [3, 3], [3, 2], [3, 1], [3, 0]]),
    makeComponent("R1", "resistor", "R", 2, [3, 3], [[0, 0], [3, 0]]),
    makeComponent("R2", "resistor", "R", 2, [18, 4], [[0, 0], [3, 0]]),
    makeComponent("C1", "radial_capacitor", "C", 2, [4, 13], [[0, 0], [1, 0]])
  ];
  return {
    name: "DIP-8 dual comparator",
    board,
    components,
    endpoints: [
      ep("OUTA", "U1", 1, [9, 6]), ep("OUTA", "R1", 1, [3, 3]),
      ep("INA", "U1", 2, [9, 7]), ep("INA", "C1", 1, [4, 13]),
      ep("INB", "U1", 3, [9, 8]), ep("INB", "R2", 1, [18, 4]),
      ep("GND", "U1", 4, [9, 9]), ep("GND", "C1", 2, [5, 13]),
      ep("OUTB", "U1", 7, [12, 7]), ep("OUTB", "R2", 2, [21, 4]),
      ep("VCC", "U1", 8, [12, 6]), ep("VCC", "R1", 2, [6, 3])
    ]
  };
}

function createHeader2x5Fixture(): AutorouterFixture {
  const board = { width: 26, height: 18 };
  const components: PlacedComponent[] = [
    makeComponent("J1", "pin_header", "HDR", 10, [3, 7], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2]]),
    makeComponent("U2", "dip", "DIP8", 8, [15, 5], [[0, 0], [0, 1], [0, 2], [0, 3], [3, 3], [3, 2], [3, 1], [3, 0]])
  ];
  return {
    name: "2x5 header escape",
    board,
    components,
    endpoints: [
      ep("N1", "J1", 1, [3, 7]), ep("N1", "U2", 1, [15, 5]),
      ep("N2", "J1", 2, [4, 7]), ep("N2", "U2", 2, [15, 6]),
      ep("N3", "J1", 3, [5, 7]), ep("N3", "U2", 3, [15, 7]),
      ep("N4", "J1", 4, [6, 7]), ep("N4", "U2", 7, [18, 6]),
      ep("GND", "J1", 6, [3, 9]), ep("GND", "U2", 4, [15, 8]),
      ep("VCC", "J1", 10, [7, 9]), ep("VCC", "U2", 8, [18, 5])
    ]
  };
}

function createTo92Fixture(): AutorouterFixture {
  const board = { width: 20, height: 14 };
  const components: PlacedComponent[] = [
    makeComponent("Q1", "to92", "2N3904", 3, [9, 6], [[-1, 0], [0, 0], [1, 0]]),
    makeComponent("R3", "resistor", "R", 2, [3, 3], [[0, 0], [3, 0]]),
    makeComponent("R4", "resistor", "R", 2, [14, 10], [[0, 0], [3, 0]])
  ];
  return {
    name: "TO-92 three pin escape",
    board,
    components,
    endpoints: [
      ep("BASE", "Q1", 2, [9, 6]), ep("BASE", "R3", 2, [6, 3]),
      ep("COL", "Q1", 3, [10, 6]), ep("COL", "R4", 1, [14, 10]),
      ep("EMIT", "Q1", 1, [8, 6]), ep("EMIT", "R3", 1, [3, 3])
    ]
  };
}

function createPowerBusFixture(): AutorouterFixture {
  const board = { width: 28, height: 18 };
  const components: PlacedComponent[] = [
    makeComponent("U3", "dip", "DIP8", 8, [11, 6], [[0, 0], [0, 1], [0, 2], [0, 3], [3, 3], [3, 2], [3, 1], [3, 0]]),
    makeComponent("C2", "radial_capacitor", "C", 2, [4, 4], [[0, 0], [1, 0]]),
    makeComponent("J2", "pin_header", "HDR", 4, [21, 7], [[0, 0], [1, 0], [2, 0], [3, 0]])
  ];
  return {
    name: "VCC/GND multi endpoint bus",
    board,
    components,
    endpoints: [
      ep("VCC", "U3", 8, [14, 6]), ep("VCC", "C2", 1, [4, 4]), ep("VCC", "J2", 1, [21, 7]),
      ep("GND", "U3", 4, [11, 9]), ep("GND", "C2", 2, [5, 4]), ep("GND", "J2", 4, [24, 7]),
      ep("SIG", "U3", 1, [11, 6]), ep("SIG", "J2", 2, [22, 7])
    ]
  };
}

function makeComponent(
  name: string,
  kind: PlacedComponent["kind"],
  value: string,
  pinCount: number,
  position: [number, number],
  pinOffsets: Array<[number, number]>
): PlacedComponent {
  return {
    id: name,
    kind,
    label: name,
    name,
    value,
    pinCount,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets,
    position,
    rotation: 0,
    mounted: true
  };
}

function ep(net: string, ref: string, pin: number, grid: [number, number]): RoutedNetEndpoint {
  return { net, ref, pin, grid, role: String(pin) };
}

function hasShortCircuit(traces: Array<{ net: string; points: Array<[number, number]> }>) {
  const owner = new Map<string, string>();
  for (const trace of traces) {
    for (const point of trace.points) {
      const id = `${point[0]},${point[1]}`;
      const existing = owner.get(id);
      if (existing && existing !== trace.net) {
        return true;
      }
      owner.set(id, trace.net);
    }
  }
  return false;
}
