#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = path.join(repoRoot, "apps", "web", "src", "features", "import", "pinLibraryGenerated.json");
const powerPinNames = new Set(["GND", "VSS", "VEE", "VCC", "VDD", "VPP", "V+", "V-", "VS+", "VS-", "0"]);
const commonPresetDirs = [
  "4xxx.kicad_symdir",
  "74xGxx.kicad_symdir",
  "74xx.kicad_symdir",
  "Amplifier_Operational.kicad_symdir",
  "Comparator.kicad_symdir",
  "Timer.kicad_symdir",
  "Regulator_Linear.kicad_symdir",
  "Transistor_BJT.kicad_symdir",
  "Transistor_FET.kicad_symdir",
  "Diode.kicad_symdir",
  "Display_Character.kicad_symdir"
];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  applyPresetArgs(args);
  if (args.symbols.length === 0 && args.files.length === 0) {
    printHelp();
    process.exit(1);
  }

  const files = [
    ...args.files,
    ...args.symbols.flatMap((symbolsDir) => findSymbolFiles(symbolsDir))
  ];
  const models = [];
  for (const file of files) {
    const parsed = parseSExpr(fs.readFileSync(file, "utf8"));
    models.push(...extractDeviceModels(parsed));
  }

  const generated = {
    source: "generated from KiCad symbol libraries",
    generatedAt: new Date().toISOString(),
    pinModelTemplates: {},
    devicePinModels: uniqueModels(models).sort((a, b) => a.match.localeCompare(b.match))
  };

  fs.writeFileSync(args.out ?? defaultOut, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
  console.log(`已从 ${files.length} 个 KiCad 符号文件生成 ${generated.devicePinModels.length} 个引脚模型。`);
  console.log(`已更新 ${path.relative(repoRoot, args.out ?? defaultOut)}`);
}

function parseArgs(args) {
  const result = { files: [], symbols: [], presets: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--symbols") {
      result.symbols.push(path.resolve(args[index + 1]));
      index += 1;
    } else if (arg === "--out") {
      result.out = path.resolve(args[index + 1]);
      index += 1;
    } else if (arg === "--file") {
      result.files.push(path.resolve(args[index + 1]));
      index += 1;
    } else if (arg === "--kicad-root") {
      result.kicadRoot = path.resolve(args[index + 1]);
      index += 1;
    } else if (arg === "--preset") {
      result.presets.push(args[index + 1]);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

function applyPresetArgs(args) {
  for (const preset of args.presets) {
    if (preset !== "common") {
      throw new Error(`未知预设：${preset}`);
    }
    if (!args.kicadRoot) {
      throw new Error("--preset common 需要同时提供 --kicad-root path/to/kicad-symbols");
    }
    for (const dir of commonPresetDirs) {
      const fullPath = path.join(args.kicadRoot, dir);
      if (fs.existsSync(fullPath)) {
        args.symbols.push(fullPath);
      }
    }
  }
}

function printHelp() {
  console.log(`用法：
  node tools/import-kicad-symbols.mjs --symbols path/to/kicad-symbols
  node tools/import-kicad-symbols.mjs --kicad-root path/to/kicad-symbols --preset common
  node tools/import-kicad-symbols.mjs --symbols path/to/74xx.kicad_symdir --symbols path/to/4xxx.kicad_symdir
  node tools/import-kicad-symbols.mjs --file path/to/74xx.kicad_sym

默认写入 apps/web/src/features/import/pinLibraryGenerated.json。
Multisim 手工修正应写入 pinLibraryOverrides.json。`);
}

function findSymbolFiles(symbolsDir) {
  const files = [];
  for (const entry of fs.readdirSync(symbolsDir, { withFileTypes: true })) {
    const fullPath = path.join(symbolsDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findSymbolFiles(fullPath));
    } else if (entry.name.endsWith(".kicad_sym")) {
      files.push(fullPath);
    }
  }
  return files;
}

function tokenize(text) {
  const tokens = [];
  const pattern = /"((?:\\.|[^"\\])*)"|[()]|[^\s()]+/g;
  let match;
  while ((match = pattern.exec(text))) {
    tokens.push(match[1] !== undefined ? unescapeString(match[1]) : match[0]);
  }
  return tokens;
}

function unescapeString(value) {
  return value.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

function parseSExpr(text) {
  const tokens = tokenize(text);
  let index = 0;
  function read() {
    const token = tokens[index++];
    if (token === "(") {
      const list = [];
      while (tokens[index] !== ")" && index < tokens.length) {
        list.push(read());
      }
      index += 1;
      return list;
    }
    return token;
  }
  const forms = [];
  while (index < tokens.length) {
    forms.push(read());
  }
  return forms;
}

function extractDeviceModels(forms) {
  const models = [];
  for (const form of forms) {
    walk(form, (node) => {
      if (!isNode(node, "symbol") || typeof node[1] !== "string") {
        return;
      }

      const name = normalizeSymbolName(node[1]);
      if (!name || isUnitSubSymbol(name)) {
        return;
      }

      const pins = collectPins(node);
      if (pins.length === 0) {
        return;
      }

      const model = buildDeviceModel(name, pins);
      if (model) {
        models.push(model);
      }
    });
  }
  return models;
}

function walk(node, visit) {
  if (!Array.isArray(node)) {
    return;
  }
  visit(node);
  node.forEach((child) => walk(child, visit));
}

function isNode(node, name) {
  return Array.isArray(node) && node[0] === name;
}

function normalizeSymbolName(name) {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function isUnitSubSymbol(name) {
  return /_\d+_\d+$/.test(name);
}

function collectPins(symbolNode) {
  const pins = [];
  collectPinsFromNode(symbolNode, "", pins);
  return pins;
}

function collectPinsFromNode(node, unitHint, pins) {
  if (!Array.isArray(node)) {
    return;
  }

  let nextUnitHint = unitHint;
  if (isNode(node, "symbol") && typeof node[1] === "string") {
    const unitMatch = node[1].match(/_(\d+)_\d+$/);
    if (unitMatch) {
      nextUnitHint = unitMatch[1];
    }
  }

  if (isNode(node, "pin")) {
    const name = normalizePinName(childValue(node, "name"));
    const number = Number(childValue(node, "number"));
    const unit = childValue(node, "unit") || nextUnitHint || "";
    if (name && Number.isFinite(number) && number > 0) {
      pins.push({ name, number, unit });
    }
  }

  node.forEach((child) => collectPinsFromNode(child, nextUnitHint, pins));
}

function childValue(node, childName) {
  const child = node.find((item) => isNode(item, childName));
  return child?.[1] !== undefined ? String(child[1]) : "";
}

function normalizePinName(name) {
  return name
    .trim()
    .replace(/~\{([^}]+)\}/g, "~$1")
    .replace(/\s+/g, "")
    .replace(/^!/, "~")
    .toUpperCase();
}

function buildDeviceModel(symbolName, pins) {
  const deviceName = normalizeDeviceName(symbolName);
  if (!deviceName) {
    return undefined;
  }

  const units = {};
  const powerPins = {};
  const unitIds = [...new Set(pins.map((pin) => pin.unit).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  const multiUnit = unitIds.length > 1;

  for (const pin of pins) {
    if (powerPinNames.has(pin.name)) {
      powerPins[pin.name] = pin.number;
      continue;
    }

    const unitKey = multiUnit && pin.unit ? unitLabel(pin.unit) : "";
    units[unitKey] = units[unitKey] ?? {};
    units[unitKey][pin.name] = pin.number;
  }

  if (Object.keys(units).length === 0) {
    return undefined;
  }

  return {
    match: `^${escapeRegex(deviceName)}`,
    flags: "i",
    units,
    powerPins
  };
}

function normalizeDeviceName(symbolName) {
  const base = symbolName.replace(/-RESCUE-.+$/i, "");
  const match = base.match(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)?/i);
  const deviceName = match?.[0]?.replace(/[_-].*$/, "").toUpperCase();
  if (!deviceName || deviceName.length < 2 || !/[A-Z]/.test(deviceName)) {
    return "";
  }
  return deviceName;
}

function unitLabel(unit) {
  const index = Number(unit);
  if (!Number.isFinite(index) || index < 1 || index > 26) {
    return "";
  }
  return String.fromCharCode("A".charCodeAt(0) + index - 1);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueModels(models) {
  const map = new Map();
  for (const model of models) {
    if (!map.has(model.match)) {
      map.set(model.match, model);
    }
  }
  return [...map.values()];
}
