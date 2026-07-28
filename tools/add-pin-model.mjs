#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const docsDir = path.join(repoRoot, "docs");
const pinLibraryOverridesPath = path.join(repoRoot, "apps", "web", "src", "features", "import", "pinLibraryOverrides.json");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });

  try {
    const deviceInput = args.device ?? await promptRequired(rl, "请输入 docs 中的器件型号或 RefDes：");
    const component = resolveComponent(deviceInput);
    console.log(`找到元件：${component.ref} ${component.value} ${component.category} ${component.packageName}`);

    const netlistPins = findNetlistPinsInDocs(component);
    const modelLines = args.modelClipboard
      ? splitModelInput(readClipboard())
      : args.model
        ? splitModelInput(args.model)
        : await promptModelLines(rl);

    const parsedModel = modelLines.length > 0
      ? parseModelLines(modelLines)
      : parsedModelFromNetlist(netlistPins);
    if (parsedModel.units.length === 0) {
      throw new Error("没有找到 %p/%t 模型单元，也没有可用于推断的网表引脚。");
    }

    if (!args.noNetCheck) {
      const netCheck = checkNetlistPins(component, parsedModel, netlistPins);
      printNetlistCheck(netCheck);
      if (netCheck.status === "mismatch") {
        throw new Error("网表引脚和模型引脚不一致。请在 Multisim 中把该元件所有脚接地，导出网表报告到 docs/，然后重新运行。");
      }
    }

    const overrideLibrary = readJson(pinLibraryOverridesPath);
    const templateName = findMatchingTemplate(parsedModel, overrideLibrary.pinModelTemplates ?? {});
    const devicePattern = buildDevicePattern(component.value, templateName);
    const deviceModel = templateName
      ? { match: devicePattern, flags: "i", template: templateName }
      : buildExplicitDeviceModel(component, devicePattern, parsedModel);
    if (!deviceModel) {
      printUnknownTemplateHelp(parsedModel);
      return;
    }

    const changed = addDeviceModel(overrideLibrary, deviceModel);
    if (!changed) {
      console.log(`没有变化：${devicePattern} 已经被本地覆盖库覆盖。`);
      return;
    }

    writeJson(pinLibraryOverridesPath, overrideLibrary);
    console.log(templateName
      ? `已添加 ${devicePattern} -> ${templateName}`
      : `已添加 ${devicePattern} -> 显式引脚映射`);
    console.log(`已更新 ${path.relative(repoRoot, pinLibraryOverridesPath)}`);
  } finally {
    rl.close();
  }
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--device") {
      result.device = args[index + 1];
      index += 1;
    } else if (arg === "--model") {
      result.model = args[index + 1];
      index += 1;
    } else if (arg === "--model-clipboard") {
      result.modelClipboard = true;
    } else if (arg === "--no-net-check") {
      result.noNetCheck = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

function printHelp() {
  console.log(`用法：
  node tools/add-pin-model.mjs
  node tools/add-pin-model.mjs --device LM358AD --model "x%p_a %t1IN+ ..."
  node tools/add-pin-model.mjs --device 74LS138 --model-clipboard

器件可以输入 RefDes，例如 U4，也可以输入型号，例如 LM358AD。
工具会扫描 docs/ 中的交叉报告行和全脚接地网表报告。
只有在明确想跳过网表校验时，才使用 --no-net-check。`);
}

async function promptRequired(rl, prompt) {
  const value = (await rl.question(prompt)).trim();
  if (!value) {
    throw new Error("必须输入内容。");
  }
  return value;
}

async function promptModelLines(rl) {
  console.log("粘贴单行模型，输入 :clip 读取剪贴板，或第一行直接回车表示从网表推断：");
  const lines = [];
  while (true) {
    const line = await rl.question("> ");
    if (!line.trim()) {
      break;
    }
    if (lines.length === 0 && line.trim() === ":clip") {
      return splitModelInput(readClipboard());
    }
    lines.push(line);
  }
  return lines;
}

function readClipboard() {
  if (process.platform === "win32") {
    return execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], {
      encoding: "utf8"
    });
  }

  throw new Error("当前只实现了 Windows 剪贴板读取；其他平台请使用 --model。");
}

function resolveComponent(inputText) {
  const direct = parseCrossRow(inputText);
  if (direct) {
    return direct;
  }

  const match = findCrossRowInDocs(inputText.trim());
  if (match) {
    return match;
  }

  throw new Error(`找不到 "${inputText}" 对应的交叉报告行。请粘贴完整行，或把报告放入 docs/。`);
}

function parseCrossRow(line) {
  const columns = line.trim().split(/\s+/);
  if (columns.length < 4) {
    return undefined;
  }

  const [ref, value, category, packageName, circuitId] = columns;
  if (!/^[A-Za-z]+\d+$/i.test(ref)) {
    return undefined;
  }

  return {
    ref,
    value,
    category,
    packageName,
    circuitId
  };
}

function findCrossRowInDocs(query) {
  if (!fs.existsSync(docsDir)) {
    return undefined;
  }

  const normalizedQuery = query.toUpperCase();
  for (const filePath of walkFiles(docsDir)) {
    if (!/\.(txt|md|csv)$/i.test(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line.toUpperCase().includes(normalizedQuery)) {
        continue;
      }
      const parsed = parseCrossRow(line);
      if (parsed) {
        return parsed;
      }
    }
  }
  return undefined;
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

function splitModelInput(value) {
  const normalized = value
    .replace(/\r?\n/g, " ")
    .replace(/\s+\+\s+/g, " ")
    .trim();
  return normalized ? [normalized] : [];
}

function parseModelLines(lines) {
  const text = lines.join(" ");
  const unitChunks = text.split(/(?=\b[a-zA-Z]%p(?:_[a-zA-Z0-9]+)?\b)/g).map((chunk) => chunk.trim()).filter(Boolean);
  const units = unitChunks.map(parseUnitChunk).filter(Boolean);
  return { units, orderedByModel: true };
}

function parseUnitChunk(chunk) {
  const unitMatch = chunk.match(/\b[a-zA-Z]%p(?:_([a-zA-Z0-9]+))?\b/);
  if (!unitMatch) {
    return undefined;
  }

  const unit = (unitMatch[1] ?? "").toUpperCase();
  const pins = Array.from(chunk.matchAll(/%t([A-Za-z0-9_~+\-*]+)(?=[?\s%]|$)/g), (match) => normalizePinName(match[1]));
  return {
    unit,
    pins
  };
}

function normalizePinName(pin) {
  return pin.trim().toUpperCase();
}

function findMatchingTemplate(parsedModel, templates) {
  for (const [name, template] of Object.entries(templates)) {
    if (templateMatchesParsedModel(template, parsedModel)) {
      return name;
    }
  }
  return undefined;
}

function templateMatchesParsedModel(template, parsedModel) {
  const parsedUnits = normalizeParsedUnits(parsedModel.units);
  const powerPins = new Set(Object.keys(template.powerPins ?? {}).map(normalizePinName));
  const templateUnits = Object.entries(template.units).map(([unit, pins]) => ({
    unit,
    pins: new Set(Object.keys(pins).map(normalizePinName))
  }));

  if (parsedUnits.length !== templateUnits.length) {
    return false;
  }

  return parsedUnits.every((parsedUnit) => {
    const templateUnit = templateUnits.find((candidate) => candidate.unit === parsedUnit.unit);
    if (!templateUnit) {
      return false;
    }

    return parsedUnit.pins.every((pin) =>
      templateUnit.pins.has(pin)
        || templateUnit.pins.has(stripLeadingUnitNumber(pin))
        || powerPins.has(pin)
    );
  });
}

function normalizeParsedUnits(units) {
  return units.map((unit, index) => ({
    unit: unit.unit || String.fromCharCode("A".charCodeAt(0) + index),
    pins: unit.pins.filter((pin) => pin !== "M")
  }));
}

function stripLeadingUnitNumber(pin) {
  return pin.replace(/^\d+/, "");
}

function checkNetlistPins(component, parsedModel, netlistPins = findNetlistPinsInDocs(component)) {
  if (netlistPins.allPins.size === 0) {
    return {
      status: "missing",
      ref: component.ref,
      netPins: netlistPins.allPins,
      expectedPins: expectedPinsFromModel(parsedModel),
      missingPins: [],
      extraPins: []
    };
  }

  const expectedPins = expectedPinsFromModel(parsedModel);
  const hiddenPowerPins = inferHiddenPowerPins(component, inferPinCount(component.packageName), expectedPins);
  const allowedExtraPins = new Set(Object.keys(hiddenPowerPins));
  const missingPins = [...expectedPins].filter((pin) => !netlistPins.allPins.has(pin));
  const extraPins = [...netlistPins.allPins].filter((pin) => !expectedPins.has(pin) && !allowedExtraPins.has(pin));

  return {
    status: missingPins.length || extraPins.length ? "mismatch" : "ok",
    ref: component.ref,
    netPins: netlistPins.allPins,
    expectedPins,
    missingPins,
    extraPins
  };
}

function findNetlistPinsInDocs(component) {
  const pinsByUnit = new Map();
  const allPins = new Set();
  if (!fs.existsSync(docsDir)) {
    return { allPins, pinsByUnit };
  }

  const normalizedRef = component.ref.toUpperCase();
  const normalizedCircuitId = component.circuitId?.toUpperCase();
  for (const filePath of walkFiles(docsDir)) {
    if (!/\.(txt|md|csv)$/i.test(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const columns = splitReportLine(line);
      if (columns.length < 4) {
        continue;
      }

      const [, circuitId, nodeRef, pin] = columns;
      if (normalizedCircuitId && circuitId.toUpperCase() !== normalizedCircuitId) {
        continue;
      }
      if (!isLikelyNetPin(pin)) {
        continue;
      }
      const { baseRef, unit } = splitLogicalRef(nodeRef);
      if (baseRef.toUpperCase() === normalizedRef) {
        const normalizedPin = normalizePinName(pin);
        allPins.add(normalizedPin);
        const unitPins = pinsByUnit.get(unit) ?? new Set();
        unitPins.add(normalizedPin);
        pinsByUnit.set(unit, unitPins);
      }
    }
  }
  return { allPins, pinsByUnit };
}

function isLikelyNetPin(pin) {
  if (!pin || /[\\/,;]/.test(pin)) {
    return false;
  }
  return /^[~A-Za-z0-9_+\-*]+$/.test(pin);
}

function splitReportLine(line) {
  return line
    .trim()
    .split(/\s{2,}|\t+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitLogicalRef(ref) {
  const match = ref.match(/^([A-Za-z]+\d+)([A-Za-z])?$/);
  return {
    baseRef: match?.[1] ?? ref,
    unit: match?.[2] ?? ""
  };
}

function expectedPinsFromModel(parsedModel) {
  const pins = new Set();
  for (const unit of parsedModel.units) {
    for (const pin of unit.pins) {
      if (pin !== "M") {
        pins.add(normalizePinName(pin));
      }
    }
  }
  return pins;
}

function parsedModelFromNetlist(netlistPins) {
  const units = [...netlistPins.pinsByUnit.entries()]
    .sort(([unitA], [unitB]) => unitA.localeCompare(unitB, undefined, { numeric: true, sensitivity: "base" }))
    .map(([unit, pins]) => ({
      unit,
      pins: [...pins].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    }));

  if (units.length) {
    console.log("已从网表推断模型引脚：");
    for (const unit of units) {
      console.log(`  ${unit.unit || "单单元"}: ${unit.pins.join(", ")}`);
    }
  }

  return { units, orderedByModel: false };
}

function printNetlistCheck(check) {
  if (check.status === "missing") {
    console.log(`网表校验：在 docs/ 中没有找到 ${check.ref} 的引脚，继续但不做网表校验。`);
    return;
  }

  console.log(`网表校验：找到 ${check.netPins.size} 个引脚，模型期望 ${check.expectedPins.size} 个。`);
  if (check.status === "ok") {
    console.log("网表校验：通过。");
    return;
  }

  if (check.missingPins.length) {
    console.log(`网表缺少：${check.missingPins.join(", ")}`);
  }
  if (check.extraPins.length) {
    console.log(`网表多出：${check.extraPins.join(", ")}`);
  }
  if (check.expectedPins.size <= 2 && check.netPins.size > check.expectedPins.size + 4) {
    console.log("提示：模型文本看起来被截断了。请复制完整模型文本，并使用 :clip 或 --model-clipboard。");
  }
}

function buildDevicePattern(value, templateName) {
  const normalized = value.toUpperCase();
  const family74 = normalized.match(/^74(?:HC|HCT|LS|ALS|F)?(\d{2,4})/);
  if (family74) {
    return `^74(?:HC|HCT|LS|ALS|F)?${family74[1]}`;
  }

  const device = normalized.match(/^([A-Z]{1,4}\d{2,4})/)?.[1]
    ?? normalized.match(/^(\dN\d{3,4})/)?.[1]
    ?? normalized.replace(/[^A-Z0-9].*$/, "");

  if (!device) {
    throw new Error(`无法从型号 "${value}" 推导器件匹配规则。`);
  }

  if (templateName === "dual_opamp_8" && /^LM393|LM2903/.test(device)) {
    return `^${device}`;
  }

  return `^${device}`;
}

function buildExplicitDeviceModel(component, devicePattern, parsedModel) {
  if (!parsedModel.orderedByModel) {
    return undefined;
  }

  const orderedPins = orderedUniqueModelPins(parsedModel);
  const pinCount = inferPinCount(component.packageName) ?? orderedPins.length;
  const visiblePinNames = new Set(orderedPins);
  const hiddenPowerPins = inferHiddenPowerPins(component, pinCount, visiblePinNames);
  const hiddenPinCount = Object.keys(hiddenPowerPins).length;
  if (orderedPins.length + hiddenPinCount !== pinCount) {
    throw new Error(`模型有 ${orderedPins.length} 个唯一 %t 引脚，隐藏电源脚推断增加 ${hiddenPinCount} 个，但封装 ${component.packageName} 表示应有 ${pinCount} 个脚。为避免写入不确定映射，已停止。`);
  }

  const occupiedPins = new Set(Object.values(hiddenPowerPins));
  const pinNumbers = new Map(Object.entries(hiddenPowerPins).map(([pin, physicalPin]) => [pin, physicalPin]));
  let visibleIndex = 0;
  for (let physicalPin = 1; physicalPin <= pinCount; physicalPin += 1) {
    if (occupiedPins.has(physicalPin)) {
      continue;
    }
    const pin = orderedPins[visibleIndex];
    if (pin) {
      pinNumbers.set(pin, physicalPin);
    }
    visibleIndex += 1;
  }

  const units = {};
  for (const unit of normalizeParsedUnits(parsedModel.units)) {
    units[unit.unit] = {};
    for (const pin of unit.pins) {
      const physicalPin = pinNumbers.get(pin);
      if (physicalPin) {
        units[unit.unit][pin] = physicalPin;
      }
    }
  }

  return {
    match: devicePattern,
    flags: "i",
    units,
    powerPins: buildPowerPins(pinNumbers)
  };
}

function orderedUniqueModelPins(parsedModel) {
  const pins = [];
  const seen = new Set();
  for (const unit of parsedModel.units) {
    for (const pin of unit.pins) {
      const normalized = normalizePinName(pin);
      if (normalized === "M" || seen.has(normalized)) {
        continue;
      }
      pins.push(normalized);
      seen.add(normalized);
    }
  }
  return pins;
}

function buildPowerPins(pinNumbers) {
  const powerNames = new Set(["VS+", "V+", "VCC", "VDD", "VS-", "V-", "GND", "VEE", "0", "COM"]);
  const powerPins = {};
  for (const [pin, physicalPin] of pinNumbers.entries()) {
    if (powerNames.has(pin)) {
      powerPins[pin] = physicalPin;
    }
  }
  return powerPins;
}

function inferHiddenPowerPins(component, pinCount, visiblePinNames = new Set()) {
  const value = component.value.toUpperCase();
  const category = component.category.toUpperCase();
  const is74Family = /^74(?:HC|HCT|LS|ALS|F)?\d+/.test(value) || category.includes("74");
  if (!is74Family || !pinCount) {
    return {};
  }

  const result = {};
  const hasGround = visiblePinNames.has("GND") || visiblePinNames.has("VSS") || visiblePinNames.has("0");
  const hasPositive = visiblePinNames.has("VCC") || visiblePinNames.has("VDD");
  if (!hasGround) {
    result.GND = Math.floor(pinCount / 2);
  }
  if (!hasPositive) {
    result.VCC = pinCount;
  }
  return result;
}

function inferPinCount(packageName) {
  const normalized = packageName.toUpperCase();
  const dipSwitch = normalized.match(/DIPSW(\d+)/);
  if (dipSwitch) {
    return Number(dipSwitch[1]) * 2;
  }
  if (normalized.includes("CASE751A")) {
    return 14;
  }
  if (/TO-?220|TO-?92|TO-?39/.test(normalized)) {
    return 3;
  }

  const match = normalized.match(/(?:DIP|PDIP|SDIP|SO|SOP|SOIC)-?P?-?(\d+)/)
    ?? normalized.match(/\bD0?(\d+)\b/)
    ?? normalized.match(/\bDO(\d+)\b/)
    ?? normalized.match(/\bN0?(\d+)\b/)
    ?? normalized.match(/\bNO(\d+)\b/)
    ?? normalized.match(/(\d+)\s*PIN/);
  if (!match) {
    return undefined;
  }

  const pinCount = Number(match[1]);
  return Number.isFinite(pinCount) ? pinCount : undefined;
}

function addDeviceModel(overrideLibrary, deviceModel) {
  const coveredBy = findCoveringModel(overrideLibrary.devicePinModels ?? [], deviceModel.match);
  if (coveredBy) {
    assertCompatibleExistingModel(coveredBy, deviceModel);
    return false;
  }

  const mergeTarget = deviceModel.template
    ? overrideLibrary.devicePinModels.find((model) => model.template === deviceModel.template && canMergePattern(model.match, deviceModel.match))
    : undefined;
  if (mergeTarget) {
    mergeTarget.match = mergePattern(mergeTarget.match, deviceModel.match);
    return true;
  }

  overrideLibrary.devicePinModels.push(deviceModel);
  return true;
}

function findCoveringModel(models, devicePattern) {
  const probe = patternProbe(devicePattern);
  return models.find((model) => {
    try {
      return new RegExp(model.match, model.flags).test(probe);
    } catch {
      return false;
    }
  });
}

function assertCompatibleExistingModel(existingModel, newModel) {
  if (existingModel.template || newModel.template || !existingModel.units || !newModel.units) {
    return;
  }

  const differences = [];
  for (const [unit, pins] of Object.entries(newModel.units)) {
    const existingPins = existingModel.units[unit] ?? {};
    for (const [pin, physicalPin] of Object.entries(pins)) {
      if (existingPins[pin] !== undefined && existingPins[pin] !== physicalPin) {
        differences.push(`${unit || "单单元"}.${pin}: 已有 ${existingPins[pin]}，新增 ${physicalPin}`);
      }
    }
  }

  if (differences.length) {
    throw new Error(`已有引脚模型 ${existingModel.match} 与新模型冲突：\n${differences.join("\n")}`);
  }
}

function patternProbe(pattern) {
  return pattern
    .replace(/^\^/, "")
    .replace(/\(\?:HC\|HCT\|LS\|ALS\|F\)\?/, "HC")
    .replace(/[()]/g, "")
    .split("|")[0]
    .replace(/[^A-Z0-9].*$/i, "");
}

function canMergePattern(existingPattern, newPattern) {
  return existingPattern.startsWith("^(") && newPattern.startsWith("^") && !newPattern.includes("(?:");
}

function mergePattern(existingPattern, newPattern) {
  const device = newPattern.replace(/^\^/, "");
  const closeIndex = existingPattern.indexOf(")");
  if (closeIndex === -1) {
    return existingPattern;
  }

  const body = existingPattern.slice(2, closeIndex);
  const parts = body.split("|");
  if (!parts.includes(device)) {
    parts.push(device);
  }
  return `^(${parts.join("|")})${existingPattern.slice(closeIndex + 1)}`;
}

function printUnknownTemplateHelp(parsedModel) {
  console.log("没有已有引脚模板能匹配这些模型引脚。");
  console.log("检测到的单元：");
  for (const unit of parsedModel.units) {
    console.log(`  ${unit.unit || "单单元"}: ${unit.pins.join(", ")}`);
  }
  console.log("请先向 pinModelTemplates 添加模板，或直接用 add-import-json.mjs 写入显式 JSON 映射。");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
