import type { ImportState, ImportWarning, ParsedComponent, ParsedNet } from "../../types/project.ts";
import { devicePinModels, type DevicePinModel } from "./importConfig.ts";

export interface ParsedImportBundle {
  components: ParsedComponent[];
  nets: ParsedNet[];
  pinInfo: NonNullable<ImportState["pinInfo"]>;
  warnings: ImportWarning[];
}

interface SExprNode {
  head: string;
  args: Array<SExprNode | string>;
}

interface LibPartPins {
  pinCount: number;
  names: Map<number, string>;
  types: Map<number, string>;
}

export async function parseImportFiles(files: File[]): Promise<ParsedImportBundle> {
  const bundle: ParsedImportBundle = { components: [], nets: [], pinInfo: {}, warnings: [] };
  for (const file of files) {
    const text = await file.text();
    mergeBundle(bundle, parseKicadNetlist(text, file.name));
  }
  return bundle;
}

export function mergeImportState(current: ImportState, next: ParsedImportBundle): ImportState {
  const components = new Map(current.components.map((component) => [component.ref, component]));
  next.components.forEach((component) => components.set(component.ref, component));
  const nets = new Map(current.nets.map((net) => [net.name, { ...net, nodes: [...net.nodes] }]));
  for (const net of next.nets) {
    const existing = nets.get(net.name) ?? { name: net.name, nodes: [] };
    const nodeKeys = new Set(existing.nodes.map((node) => `${node.ref}.${node.pin}`));
    for (const node of net.nodes) {
      const key = `${node.ref}.${node.pin}`;
      if (!nodeKeys.has(key)) {
        existing.nodes.push(node);
        nodeKeys.add(key);
      }
    }
    nets.set(net.name, existing);
  }
  return {
    components: [...components.values()].sort((a, b) => naturalCompare(a.ref, b.ref)),
    nets: [...nets.values()].sort((a, b) => naturalCompare(a.name, b.name)),
    pinInfo: { ...current.pinInfo, ...next.pinInfo },
    warnings: [...current.warnings, ...next.warnings]
  };
}

/**
 * Removes everything a re-imported file previously contributed, so merging the
 * updated version of the same file replaces its data instead of leaving stale
 * nodes behind (which could make one pin belong to old and new nets at once).
 */
export function removeFileData(importState: ImportState, fileNames: string[]): ImportState {
  const names = new Set(fileNames);
  const nets = importState.nets
    .map((net) => ({
      ...net,
      nodes: net.nodes.filter((node) => !names.has(node.sourceFile ?? ""))
    }))
    .filter((net) => net.nodes.length > 0);
  const components = importState.components.filter((component) => !names.has(component.sourceFile ?? ""));
  const liveRefs = new Set(components.map((component) => component.ref));
  const pinInfo = Object.fromEntries(
    Object.entries(importState.pinInfo ?? {}).filter(([ref]) => liveRefs.has(ref))
  );
  return {
    components,
    nets,
    warnings: importState.warnings.filter((warning) => !names.has(warning.fileName)),
    pinInfo
  };
}

function mergeBundle(target: ParsedImportBundle, source: ParsedImportBundle) {
  target.components.push(...source.components);
  target.nets.push(...source.nets);
  target.pinInfo = { ...target.pinInfo, ...source.pinInfo };
  target.warnings.push(...source.warnings);
}

export function parseKicadNetlist(text: string, fileName: string): ParsedImportBundle {
  const root = parseSExpr(text);
  const components: ParsedComponent[] = [];
  const libPinsByKey = new Map<string, LibPartPins>();
  const warnings: ImportWarning[] = [];

  for (const comp of children(root, "components").flatMap((node) => children(node, "comp"))) {
    const ref = childText(comp, "ref");
    const value = childText(comp, "value");
    const libsource = child(comp, "libsource");
    const lib = childText(libsource, "lib");
    const part = childText(libsource, "part");
    const footprint = componentFootprint(comp);
    if (!ref || !lib || !part) {
      warnings.push({ fileName, message: `网表中有无法解析的元件条目（ref=${ref ?? "?"}）` });
      continue;
    }
    components.push({
      ref,
      value,
      category: `${lib}:${part}`,
      packageName: footprint,
      sourceFile: fileName
    });
  }

  for (const libpart of children(root, "libparts").flatMap((node) => children(node, "libpart"))) {
    const lib = childText(libpart, "lib");
    const part = childText(libpart, "part");
    if (!part) continue;
    const pins: LibPartPins = { pinCount: 0, names: new Map(), types: new Map() };
    for (const pin of children(libpart, "pins").flatMap((node) => children(node, "pin"))) {
      const num = Number(childText(pin, "num"));
      if (!Number.isInteger(num) || num < 1) continue;
      const name = childText(pin, "name") ?? "";
      const type = childText(pin, "type") ?? "";
      pins.pinCount = Math.max(pins.pinCount, num);
      pins.names.set(num, name);
      pins.types.set(num, type);
    }
    // LTSpice-imported schematics emit libparts with an empty lib; the part
    // name alone then disambiguates. Store both keys so component lookup
    // works for regular and ltspice-style netlists alike.
    libPinsByKey.set(`${lib}:${part}`, pins);
    libPinsByKey.set(part, pins);
  }

  const pinInfo: NonNullable<ImportState["pinInfo"]> = {};
  for (const component of components) {
    const libPins = libPinsByKey.get(component.category) ?? libPinsByKey.get(component.category.split(":")[1] ?? "");
    if (!libPins) continue;
    const model = findDevicePinModel(component.value, component.category);
    const perPin: NonNullable<ImportState["pinInfo"]>[string] = {};
    for (let pin = 1; pin <= libPins.pinCount; pin += 1) {
      const libName = libPins.names.get(pin) ?? "";
      const libType = libPins.types.get(pin) ?? "";
      const modelName = pinNameFromModel(model, pin);
      const isPower = libType === "power_in" || Object.values(model?.powerPins ?? {}).includes(pin);
      const genericName = libName === "" || libName === "-" || libName === "+" || libName === "~";
      perPin[pin] = {
        name: genericName && modelName ? modelName : libName || modelName,
        type: isPower ? "power" : libType || (modelName ? "signal" : "")
      };
    }
    pinInfo[component.ref] = perPin;
  }

  const nets: ParsedNet[] = [];
  for (const net of children(root, "nets").flatMap((node) => children(node, "net"))) {
    const name = childText(net, "name") ?? "";
    if (name.startsWith("unconnected-")) {
      continue;
    }
    const nodes: ParsedNet["nodes"] = [];
    for (const node of children(net, "node")) {
      const ref = childText(node, "ref");
      const pin = childText(node, "pin");
      if (ref && pin) {
        nodes.push({ ref, pin, sourceFile: fileName });
      }
    }
    if (nodes.length > 0) {
      nets.push({ name, nodes, sourceFile: fileName });
    }
  }

  if (components.length === 0 && warnings.length === 0) {
    warnings.push({ fileName, message: "未识别到 KiCad 网表内容，请确认是 Eeschema 导出的 .net 文件" });
  }

  return { components, nets, pinInfo, warnings };
}

/* ── S-expression parsing ─────────────────────────────────────────────── */

function parseSExpr(text: string): SExprNode {
  const tokens = tokenize(text);
  const position = { index: 0 };
  const value = parseValue(tokens, position);
  if (typeof value === "string") {
    throw new Error("网表顶层不是列表结构");
  }
  if (position.index !== tokens.length) {
    throw new Error("网表存在多余的顶层内容");
  }
  return value;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\uFEFF") {
      index += 1;
      continue;
    }
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push(char);
      index += 1;
      continue;
    }
    if (char === '"') {
      let end = index + 1;
      let value = "";
      while (end < text.length && text[end] !== '"') {
        if (text[end] === "\\" && end + 1 < text.length) {
          value += text[end + 1];
          end += 2;
        } else {
          value += text[end];
          end += 1;
        }
      }
      tokens.push(value);
      index = end + 1;
      continue;
    }
    let end = index;
    while (end < text.length && !" \t\n\r()\"".includes(text[end])) {
      end += 1;
    }
    tokens.push(text.slice(index, end));
    index = end;
  }
  return tokens;
}

function parseValue(tokens: string[], position: { index: number }): SExprNode | string {
  if (position.index >= tokens.length) {
    throw new Error("网表意外结束");
  }
  const token = tokens[position.index];
  if (token === "(") {
    position.index += 1;
    const head = tokens[position.index];
    position.index += 1;
    const args: Array<SExprNode | string> = [];
    while (position.index < tokens.length && tokens[position.index] !== ")") {
      args.push(parseValue(tokens, position));
    }
    if (position.index >= tokens.length) {
      throw new Error("网表缺少右括号");
    }
    position.index += 1;
    return { head, args };
  }
  position.index += 1;
  return token;
}

function children(node: SExprNode | undefined, name: string): SExprNode[] {
  return node?.args.filter((arg): arg is SExprNode => typeof arg !== "string" && arg.head === name) ?? [];
}

function child(node: SExprNode | undefined, name: string): SExprNode | undefined {
  return children(node, name)[0];
}

function childText(node: SExprNode | undefined, name: string): string {
  const value = child(node, name)?.args[0];
  return typeof value === "string" ? value : "";
}

function componentFootprint(comp: SExprNode): string {
  for (const fields of children(comp, "fields")) {
    for (const field of children(fields, "field")) {
      if (childText(field, "name") === "Footprint") {
        return field.args.filter((arg): arg is string => typeof arg === "string").join(" ");
      }
    }
  }
  return "";
}

/* ── Device pin model enrichment ──────────────────────────────────────── */

function findDevicePinModel(value: string, category: string): DevicePinModel | undefined {
  const candidates = [value, category.split(":")[1] ?? ""].filter(Boolean);
  for (const candidate of candidates) {
    const model = devicePinModels.find((entry) => entry.match.test(candidate));
    if (model) return model;
  }
  return undefined;
}

function pinNameFromModel(model: DevicePinModel | undefined, pin: number): string {
  if (!model) return "";
  const allUnits = Object.fromEntries(
    Object.values(model.units).flatMap((unit) => Object.entries(unit))
  );
  const entry = Object.entries(allUnits).find(([, physical]) => physical === pin);
  return entry?.[0] ?? "";
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
