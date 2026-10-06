import assert from "node:assert/strict";
import test from "node:test";
import { parseKicadNetlist, mergeImportState, parseImportFiles, removeFileData } from "../src/features/import/kicadNetlistParser.ts";
import { buildNetlistText, type FactoryNetlist } from "./helpers/netlistFactory.ts";
import type { ImportState } from "../src/types/project.ts";

function wrap(inner: string) {
  return `(export\n\t(version "E")\n${inner}\n)`;
}

/* ── component extraction ─────────────────────────────────────────────── */

test("component ref/value/lib/part are extracted", () => {
  const bundle = parseKicadNetlist(wrap('(components (comp (ref "R1") (value "R") (libsource (lib "Device") (part "R"))))'), "a.net");
  assert.equal(bundle.components.length, 1);
  assert.deepEqual(bundle.components[0], {
    ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "a.net"
  });
});

test("component footprint field is extracted when present", () => {
  const text = wrap('(components (comp (ref "U1") (value "LM358") (fields (field (name "Footprint") "DIP-8")) (libsource (lib "A") (part "B"))))');
  const bundle = parseKicadNetlist(text, "a.net");
  assert.equal(bundle.components[0].packageName, "DIP-8");
});

test("components with missing refs produce warnings and are skipped", () => {
  const bundle = parseKicadNetlist(wrap('(components (comp (value "R") (libsource (lib "Device") (part "R"))))'), "a.net");
  assert.equal(bundle.components.length, 0);
  assert.ok(bundle.warnings.length > 0);
});

test("multiple components are all extracted", () => {
  const spec: FactoryNetlist = {
    components: [
      { ref: "R1", lib: "Device", part: "R", value: "R", pins: [] },
      { ref: "R2", lib: "Device", part: "R", value: "R", pins: [] },
      { ref: "C1", lib: "Device", part: "C", value: "C", pins: [] }
    ],
    nets: []
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.deepEqual(bundle.components.map((c) => c.ref), ["R1", "R2", "C1"]);
});

/* ── libparts / pin info ──────────────────────────────────────────────── */

test("pin info captures name and type per pin", () => {
  const spec: FactoryNetlist = {
    components: [{ ref: "U1", lib: "X", part: "Y", value: "Y", pins: [
      { num: 1, name: "A", type: "input" },
      { num: 2, name: "B", type: "power_in" }
    ] }],
    nets: []
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.equal(bundle.pinInfo.U1["1"].name, "A");
  assert.equal(bundle.pinInfo.U1["1"].type, "input");
  assert.equal(bundle.pinInfo.U1["2"].type, "power");
});

test("pin info only spans up to the maximum pin number", () => {
  const spec: FactoryNetlist = {
    components: [{ ref: "U1", lib: "X", part: "Y", value: "Y", pins: [{ num: 4, name: "", type: "input" }] }],
    nets: []
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.deepEqual(Object.keys(bundle.pinInfo.U1).map(Number), [1, 2, 3, 4]);
});

test("libparts with an empty lib are matched by part name (LTSpice import)", () => {
  const text = `(export
	(version "E")
	(components
		(comp (ref "D1") (value "D") (libsource (lib "ltspice") (part "diode")))
		(comp (ref "U1") (value "OP07") (libsource (lib "ltspice") (part "OpAmps/OP07")))
	)
	(libparts
		(libpart
			(lib "")
			(part "OpAmps/OP07")
			(pins
				(pin (num "1") (name "In+") (type "passive"))
				(pin (num "2") (name "In-") (type "passive"))
				(pin (num "3") (name "V+") (type "passive"))
			)
		)
		(libpart
			(lib "")
			(part "diode")
			(pins
				(pin (num "1") (name "+") (type "passive"))
				(pin (num "2") (name "-") (type "passive"))
			)
		)
	)
	(nets)
)`;
  const bundle = parseKicadNetlist(text, "ltspice.net");
  assert.equal(bundle.components.length, 2);
  assert.equal(bundle.pinInfo!["U1"]!["1"].name, "In+");
  assert.equal(bundle.pinInfo!["U1"]!["3"].name, "V+");
  assert.equal(bundle.pinInfo!["D1"]!["1"].name, "+");
  assert.equal(Object.keys(bundle.pinInfo!["U1"]!).length, 3);
});

test("components without libparts get no pin info", () => {
  const text = '(export\n\t(version "E")\n\t(components (comp (ref "U1") (value "Y") (libsource (lib "X") (part "Y"))))\n)';
  const bundle = parseKicadNetlist(text, "a.net");
  assert.equal(bundle.pinInfo.U1, undefined);
});

/* ── nets ─────────────────────────────────────────────────────────────── */

test("nets carry ref and physical pin numbers", () => {
  const spec: FactoryNetlist = {
    components: [],
    nets: [{ name: "SIG", nodes: [{ ref: "R1", pin: 2 }, { ref: "U1", pin: 8 }] }]
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.deepEqual(bundle.nets[0].nodes, [
    { ref: "R1", pin: "2", sourceFile: "a.net" },
    { ref: "U1", pin: "8", sourceFile: "a.net" }
  ]);
});

for (const name of ["unconnected-(R1-Pad2)", "unconnected-(U1C-V+-Pad8)", "unconnected-(X-Pad1)"]) {
  test(`unconnected net "${name}" is filtered out`, () => {
    const spec: FactoryNetlist = {
      components: [],
      nets: [{ name, nodes: [{ ref: "R1", pin: 2 }] }]
    };
    const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
    assert.equal(bundle.nets.length, 0);
  });
}

test("nets with no nodes are dropped", () => {
  const spec: FactoryNetlist = {
    components: [],
    nets: [{ name: "EMPTY", nodes: [] }]
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.equal(bundle.nets.length, 0);
});

test("empty netlist produces a warning", () => {
  const bundle = parseKicadNetlist(wrap("(components)"), "a.net");
  assert.ok(bundle.warnings.length > 0);
});

/* ── malformed input ──────────────────────────────────────────────────── */

for (const [label, text] of [
  ["empty string", ""],
  ["unbalanced open", "(export (components"],
  ["unbalanced close", "(export (components)))"],
  ["scalar top level", '"just a string"']
] as Array<[string, string]>) {
  test(`malformed input (${label}) throws instead of crashing silently`, () => {
    assert.throws(() => parseKicadNetlist(text, "bad.net"));
  });
}

test("quoted strings survive spaces and parentheses", () => {
  const spec: FactoryNetlist = {
    components: [{ ref: "R1", lib: "Device", part: "R", value: "R (1k)", pins: [] }],
    nets: [{ name: "Net (a) b", nodes: [{ ref: "R1", pin: 1 }] }]
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.equal(bundle.components[0].value, "R (1k)");
  assert.equal(bundle.nets[0].name, "Net (a) b");
});

test("escaped quotes inside strings round-trip", () => {
  const spec: FactoryNetlist = {
    components: [{ ref: 'R"1', lib: "Device", part: "R", value: "R", pins: [] }],
    nets: []
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.equal(bundle.components[0].ref, 'R"1');
});

/* ── device model enrichment ──────────────────────────────────────────── */

test("74HC595 pin 1 name is enriched from the generated device library", () => {
  const spec: FactoryNetlist = {
    components: [{ ref: "U1", lib: "74xx", part: "74HC595", value: "74HC595", pins: [
      { num: 1, name: "", type: "output" },
      { num: 8, name: "GND", type: "power_in" }
    ] }],
    nets: []
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.equal(bundle.pinInfo!["U1"]!["1"].name, "QB");
});

test("power pins are marked via libpart type and device model powerPins", () => {
  const spec: FactoryNetlist = {
    components: [{ ref: "U1", lib: "74xx", part: "74HC595", value: "74HC595", pins: [
      { num: 8, name: "GND", type: "passive" },
      { num: 16, name: "VCC", type: "power_in" }
    ] }],
    nets: []
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "a.net");
  assert.equal(bundle.pinInfo!["U1"]!["8"].type, "power");
  assert.equal(bundle.pinInfo!["U1"]!["16"].type, "power");
});

/* ── bundle merging ───────────────────────────────────────────────────── */

test("mergeImportState merges components by ref and dedupes net nodes", () => {
  const current: ImportState = {
    components: [{ ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "old.net" }],
    nets: [{ name: "N1", nodes: [{ ref: "R1", pin: "1" }] }],
    warnings: [{ fileName: "old.net", message: "old" }],
    pinInfo: { R1: { "1": { name: "1", type: "passive" } } }
  };
  const next = {
    components: [
      { ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "new.net" },
      { ref: "C1", value: "C", category: "Device:C", packageName: "", sourceFile: "new.net" }
    ],
    nets: [{ name: "N1", nodes: [{ ref: "C1", pin: "1" }] }],
    warnings: [{ fileName: "new.net", message: "new" }],
    pinInfo: { C1: { "1": { name: "1", type: "passive" } } }
  };
  const merged = mergeImportState(current, next);
  assert.equal(merged.components.length, 2);
  assert.equal(merged.components[0].sourceFile, "new.net");
  assert.deepEqual(merged.nets[0].nodes.map((n) => `${n.ref}.${n.pin}`), ["R1.1", "C1.1"]);
  assert.equal(merged.warnings.length, 2);
  assert.ok(merged.pinInfo?.R1 && merged.pinInfo?.C1);
});

test("removeFileData strips a re-imported file's components, nets and pinInfo", () => {
  const state: ImportState = {
    components: [
      { ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "old.net" },
      { ref: "C1", value: "C", category: "Device:C", packageName: "", sourceFile: "keep.net" }
    ],
    nets: [
      { name: "N1", nodes: [{ ref: "R1", pin: "1", sourceFile: "old.net" }, { ref: "C1", pin: "1", sourceFile: "keep.net" }] },
      { name: "N2", nodes: [{ ref: "R1", pin: "2", sourceFile: "old.net" }] }
    ],
    warnings: [{ fileName: "old.net", message: "old" }, { fileName: "keep.net", message: "keep" }],
    pinInfo: { R1: { "1": { name: "1" } }, C1: { "1": { name: "1" } } }
  };
  const stripped = removeFileData(state, ["old.net"]);
  assert.deepEqual(stripped.components.map((component) => component.ref), ["C1"]);
  assert.deepEqual(stripped.nets[0].nodes.map((node) => `${node.ref}.${node.pin}`), ["C1.1"]);
  assert.equal(stripped.nets.length, 1);
  assert.deepEqual(stripped.warnings.map((warning) => warning.fileName), ["keep.net"]);
  assert.equal(stripped.pinInfo?.R1, undefined);
  assert.ok(stripped.pinInfo?.C1);
});

test("re-importing an updated netlist replaces old nodes instead of keeping both", async () => {
  const oldSpec: FactoryNetlist = {
    components: [{ ref: "R1", lib: "Device", part: "R", value: "R", pins: [] }],
    nets: [{ name: "SIG", nodes: [{ ref: "R1", pin: 1 }, { ref: "R1", pin: 2 }] }]
  };
  const newSpec: FactoryNetlist = {
    components: [{ ref: "R1", lib: "Device", part: "R", value: "R", pins: [] }],
    nets: [{ name: "SIG", nodes: [{ ref: "R1", pin: 1 }] }]
  };
  const oldBundle = parseKicadNetlist(buildNetlistText(oldSpec), "proj.net");
  const newBundle = parseKicadNetlist(buildNetlistText(newSpec), "proj.net");
  const mergedOnce = mergeImportState({ components: [], nets: [], warnings: [], pinInfo: {} }, oldBundle);
  const mergedTwice = mergeImportState(removeFileData(mergedOnce, ["proj.net"]), newBundle);
  assert.deepEqual(mergedTwice.nets[0].nodes.map((node) => node.pin), ["1"]);
});

test("parseImportFiles combines multiple files", async () => {
  const specA: FactoryNetlist = {
    components: [{ ref: "R1", lib: "Device", part: "R", value: "R", pins: [] }],
    nets: [{ name: "NA", nodes: [{ ref: "R1", pin: 1 }] }]
  };
  const specB: FactoryNetlist = {
    components: [{ ref: "C1", lib: "Device", part: "C", value: "C", pins: [] }],
    nets: [{ name: "NB", nodes: [{ ref: "C1", pin: 1 }] }]
  };
  const files = [
    new File([buildNetlistText(specA)], "a.net"),
    new File([buildNetlistText(specB)], "b.net")
  ];
  const bundle = await parseImportFiles(files);
  assert.equal(bundle.components.length, 2);
  assert.equal(bundle.nets.length, 2);
});
