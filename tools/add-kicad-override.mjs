#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const defaultKicadRoot = path.join(repoRoot, "docs", "kicad-symbols", "kicad-symbols-master");
const pinLibraryOverridesPath = path.join(repoRoot, "apps", "web", "src", "features", "import", "pinLibraryOverrides.json");
const powerPinNames = new Set(["GND", "VSS", "VEE", "VCC", "VDD", "VPP", "V+", "V-", "VS+", "VS-", "0"]);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const device = normalizeDeviceInput(args.device ?? await promptRequired(rl, "请输入器件型号，例如 74LS138 或 LM358："));
    const overrides = readJson(pinLibraryOverridesPath);
    const existing = findExistingOverride(overrides, device);
    if (existing && !args.force) {
      console.log(`本地 override 已有匹配项：${existing.match}`);
      console.log("如需覆盖，请加 --force。");
      return;
    }

    const kicadRoot = path.resolve(args.kicadRoot ?? defaultKicadRoot);
    const symbols = findMatchingSymbols(kicadRoot, device);
    if (symbols.length === 0) {
      throw new Error(`在 KiCad 符号库中找不到 ${device}。可用 --kicad-root 指定库路径。`);
    }

    const symbol = await chooseSymbol(rl, symbols);
    const pins = collectPinsFromSymbolFile(symbol.file, symbol.name);
    if (pins.length === 0) {
      throw new Error(`KiCad 符号 ${symbol.name} 没有可读取的引脚。`);
    }

    printPins(symbol, pins);
    const match = normalizeMatch(args.match ?? await promptWithDefault(rl, "写入 match 正则", suggestMatch(device)));
    const model = await buildOverrideModel(rl, match, pins);
    if (Object.keys(model.units).length === 0 && Object.keys(model.powerPins).length === 0) {
      throw new Error("没有录入任何 Multisim 引脚名，已取消写入。");
    }

    upsertDeviceModel(overrides, model, Boolean(args.force));
    writeJson(pinLibraryOverridesPath, overrides);
    console.log(`已写入 ${path.relative(repoRoot, pinLibraryOverridesPath)}`);
    console.log(`新增/更新 override：${model.match}`);
  } finally {
    rl.close();
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--device") {
      args.device = argv[index + 1];
      index += 1;
    } else if (arg === "--kicad-root") {
      args.kicadRoot = argv[index + 1];
      index += 1;
    } else if (arg === "--match") {
      args.match = argv[index + 1];
      index += 1;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`用法：
  node tools/add-kicad-override.mjs --device 74LS138
  node tools/add-kicad-override.mjs --device LM358 --match "^LM358" --force
  node tools/add-kicad-override.mjs --device NE555 --kicad-root docs/kicad-symbols/kicad-symbols-master

工具会读取 KiCad 符号脚号，检查 pinLibraryOverrides.json 是否已有匹配项。
没有匹配项时，逐个 KiCad 引脚询问 Multisim 引脚名，最后写入本地 override。`);
}

async function promptRequired(rl, prompt) {
  const value = (await rl.question(prompt)).trim();
  if (!value) {
    throw new Error("必须输入内容。");
  }
  return value;
}

async function promptWithDefault(rl, prompt, defaultValue) {
  const value = (await rl.question(`${prompt} [${defaultValue}]：`)).trim();
  return value || defaultValue;
}

function normalizeDeviceInput(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeMatch(value) {
  const match = value.trim();
  if (!match) {
    throw new Error("match 正则不能为空。");
  }
  return match;
}

function suggestMatch(device) {
  const ttl = device.match(/^74(?:HC|HCT|LS|ALS|F)?([0-9][A-Z0-9]*)/i);
  if (ttl) {
    return `^74(?:HC|HCT|LS|ALS|F)?${escapeRegex(ttl[1])}`;
  }

  return `^${escapeRegex(stripPackageSuffix(device))}`;
}

function stripPackageSuffix(device) {
  const stripped = device.replace(/(?:AD|AN|AP|D|N|P|CN|CP|CD|IP|IN|N8|P8|DR|DGK|SOIC|PDIP)$/i, "");
  return stripped.length >= 2 ? stripped : device;
}

function findExistingOverride(overrides, device) {
  for (const model of overrides.devicePinModels ?? []) {
    try {
      if (new RegExp(model.match, model.flags).test(device)) {
        return model;
      }
    } catch {
      if (model.match === device) {
        return model;
      }
    }
  }
  return undefined;
}

function findMatchingSymbols(kicadRoot, device) {
  if (!fs.existsSync(kicadRoot)) {
    throw new Error(`KiCad 符号库路径不存在：${kicadRoot}`);
  }

  const matches = [];
  for (const file of walkFiles(kicadRoot)) {
    if (!file.endsWith(".kicad_sym")) {
      continue;
    }

    const text = fs.readFileSync(file, "utf8");
    for (const name of topLevelSymbolNames(text)) {
      if (symbolMatchesDevice(name, device)) {
        matches.push({ name, file });
      }
    }
  }
  return matches.sort((a, b) => scoreSymbolName(b.name, device) - scoreSymbolName(a.name, device) || a.name.localeCompare(b.name));
}

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function topLevelSymbolNames(text) {
  const names = [];
  const pattern = /^\s*\(symbol\s+"([^"]+)"/gm;
  let match;
  while ((match = pattern.exec(text))) {
    if (!isUnitSubSymbol(match[1])) {
      names.push(match[1]);
    }
  }
  return names;
}

function symbolMatchesDevice(symbolName, device) {
  const normalizedSymbol = normalizeSymbolKey(symbolName);
  const normalizedDevice = normalizeSymbolKey(device);
  if (!normalizedSymbol || !normalizedDevice) {
    return false;
  }

  const strippedDevice = normalizeSymbolKey(stripPackageSuffix(device));
  return normalizedSymbol === normalizedDevice
    || normalizedSymbol.startsWith(normalizedDevice)
    || normalizedSymbol === strippedDevice;
}

function normalizeSymbolKey(value) {
  return value
    .toUpperCase()
    .replace(/:.+$/, "")
    .replace(/[-_].+$/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function scoreSymbolName(symbolName, device) {
  const symbol = normalizeSymbolKey(symbolName);
  const normalizedDevice = normalizeSymbolKey(device);
  const strippedDevice = normalizeSymbolKey(stripPackageSuffix(device));
  if (symbol === normalizedDevice) {
    return 100;
  }
  if (symbol === strippedDevice) {
    return 90;
  }
  if (symbol.startsWith(normalizedDevice)) {
    return 80 - (symbol.length - normalizedDevice.length);
  }
  return 0;
}

async function chooseSymbol(rl, symbols) {
  if (symbols.length === 1) {
    console.log(`找到 KiCad 符号：${symbols[0].name}`);
    return symbols[0];
  }

  const shown = symbols.slice(0, 20);
  console.log("找到多个 KiCad 符号：");
  shown.forEach((symbol, index) => {
    console.log(`${index + 1}. ${symbol.name} (${path.relative(repoRoot, symbol.file)})`);
  });
  const answer = await promptWithDefault(rl, "请选择序号", "1");
  const index = Number(answer);
  if (!Number.isInteger(index) || index < 1 || index > shown.length) {
    throw new Error("选择序号无效。");
  }
  return shown[index - 1];
}

function collectPinsFromSymbolFile(file, symbolName) {
  const forms = parseSExpr(fs.readFileSync(file, "utf8"));
  let symbolNode;
  for (const form of forms) {
    walk(form, (node) => {
      if (!symbolNode && isNode(node, "symbol") && node[1] === symbolName) {
        symbolNode = node;
      }
    });
  }
  if (!symbolNode) {
    return [];
  }

  const pins = [];
  collectPinsFromNode(symbolNode, "", pins);
  return uniquePins(pins).sort(comparePins);
}

function printPins(symbol, pins) {
  console.log(`KiCad 符号：${symbol.name}`);
  console.log(`文件：${path.relative(repoRoot, symbol.file)}`);
  console.log("KiCad 引脚：");
  for (const pin of pins) {
    const unit = pin.unit ? ` unit ${unitLabel(pin.unit)}` : "";
    console.log(`  ${pin.number}: ${pin.name}${unit}`);
  }
}

async function buildOverrideModel(rl, match, pins) {
  const model = {
    match,
    flags: "i",
    units: {},
    powerPins: {}
  };

  console.log("逐个输入 Multisim 引脚名；回车使用 KiCad 名称，输入 - 跳过。多个别名用逗号分隔。");
  for (const pin of pins) {
    const unit = pin.unit ? unitLabel(pin.unit) : "";
    const unitText = unit ? ` / unit ${unit}` : "";
    const answer = await promptWithDefault(rl, `KiCad ${pin.number} ${pin.name}${unitText} 对应的 Multisim 名称`, pin.name);
    if (answer.trim() === "-") {
      continue;
    }

    const aliases = answer
      .split(",")
      .map(normalizePinName)
      .filter(Boolean);
    for (const alias of aliases) {
      if (isPowerAlias(alias, pin.name)) {
        model.powerPins[alias] = pin.number;
      } else {
        const unitKey = unit || "";
        model.units[unitKey] = model.units[unitKey] ?? {};
        model.units[unitKey][alias] = pin.number;
      }
    }
  }

  if (Object.keys(model.units).length === 0) {
    model.units[""] = {};
  }
  return model;
}

function isPowerAlias(alias, kicadName) {
  return powerPinNames.has(alias) || powerPinNames.has(normalizePinName(kicadName));
}

function upsertDeviceModel(overrides, model, force) {
  overrides.pinModelTemplates = overrides.pinModelTemplates ?? {};
  overrides.devicePinModels = overrides.devicePinModels ?? [];
  const index = overrides.devicePinModels.findIndex((existing) => existing.match === model.match);
  if (index >= 0) {
    if (!force) {
      throw new Error(`${model.match} 已存在；如需覆盖，请加 --force。`);
    }
    overrides.devicePinModels[index] = model;
    return;
  }
  overrides.devicePinModels.push(model);
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

function isUnitSubSymbol(name) {
  return /_\d+_\d+$/.test(name);
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

function uniquePins(pins) {
  const map = new Map();
  for (const pin of pins) {
    map.set(`${pin.number}:${pin.name}:${pin.unit}`, pin);
  }
  return [...map.values()];
}

function comparePins(a, b) {
  return a.number - b.number || String(a.unit).localeCompare(String(b.unit)) || a.name.localeCompare(b.name);
}

function unitLabel(unit) {
  const index = Number(unit);
  if (!Number.isFinite(index) || index < 1 || index > 26) {
    return "";
  }
  return String.fromCharCode("A".charCodeAt(0) + index - 1);
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
