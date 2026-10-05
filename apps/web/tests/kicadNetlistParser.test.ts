import assert from "node:assert/strict";
import test from "node:test";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";

const SAMPLE = `(export
	(version "E")
	(components
		(comp
			(ref "R1")
			(value "R")
			(libsource (lib "Device") (part "R"))
		)
	)
	(libparts
		(libpart
			(lib "Device")
			(part "R")
			(pins
				(pin (num "1") (name "") (type "passive"))
				(pin (num "2") (name "") (type "passive"))
			)
		)
	)
	(nets
		(net
			(code "1")
			(name "Net-(R1-Pad1)")
			(node (ref "R1") (pin "1") (pintype "passive"))
		)
		(net
			(code "2")
			(name "unconnected-(R1-Pad2)")
			(node (ref "R1") (pin "2") (pintype "passive"))
		)
	)
)`;

test("parses KiCad components, nets and pin info; filters unconnected nets", () => {
  const bundle = parseKicadNetlist(SAMPLE, "sample.net");

  assert.equal(bundle.components.length, 1);
  assert.equal(bundle.components[0].ref, "R1");
  assert.equal(bundle.components[0].value, "R");
  assert.equal(bundle.components[0].category, "Device:R");

  assert.equal(bundle.nets.length, 1);
  assert.equal(bundle.nets[0].name, "Net-(R1-Pad1)");
  assert.deepEqual(bundle.nets[0].nodes, [{ ref: "R1", pin: "1", sourceFile: "sample.net" }]);

  assert.equal(bundle.pinInfo.R1["1"].type, "passive");
  assert.equal(bundle.pinInfo.R1["2"].type, "passive");
  assert.equal(bundle.warnings.length, 0);
});

test("74HC595 symbol pins are enriched from the generated device library", () => {
  const text = `(export
	(version "E")
	(components
		(comp (ref "U1") (value "74HC595") (libsource (lib "74xx") (part "74HC595")))
	)
	(libparts
		(libpart
			(lib "74xx")
			(part "74HC595")
			(pins
				(pin (num "1") (name "") (type "output"))
				(pin (num "8") (name "GND") (type "power_in"))
				(pin (num "16") (name "VCC") (type "power_in"))
			)
		)
	)
	(nets)
)`;
  const bundle = parseKicadNetlist(text, "shift.net");
  assert.equal(bundle.components.length, 1);
  const pin = bundle.pinInfo!.U1!;
  assert.equal(pin["1"].name, "QB");
  assert.equal(pin["8"].type, "power");
  assert.equal(pin["16"].type, "power");
});
