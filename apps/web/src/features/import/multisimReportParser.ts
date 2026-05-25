import type { ImportKind, ImportState, ImportWarning, ParsedComponent, ParsedNet } from "../../types/project";

export interface ParsedImportBundle {
  components: ParsedComponent[];
  nets: ParsedNet[];
  warnings: ImportWarning[];
}

export async function parseImportFiles(kind: ImportKind, files: File[]): Promise<ParsedImportBundle> {
  const bundle: ParsedImportBundle = {
    components: [],
    nets: [],
    warnings: []
  };

  for (const file of files) {
    const text = await file.text();
    if (kind === "netlist") {
      const result = parseMultisimNetlistReport(text, file.name);
      bundle.nets.push(...result.nets);
      bundle.warnings.push(...result.warnings);
    } else {
      const result = parseMultisimCrossReferenceReport(text, file.name);
      bundle.components.push(...result.components);
      bundle.warnings.push(...result.warnings);
    }
  }

  return bundle;
}

export function mergeImportState(current: ImportState, next: ParsedImportBundle): ImportState {
  return {
    components: mergeComponents(current.components, next.components),
    nets: mergeNets(current.nets, next.nets),
    warnings: [...current.warnings, ...next.warnings]
  };
}

function parseMultisimNetlistReport(text: string, fileName: string) {
  const netMap = new Map<string, ParsedNet>();
  const warnings: ImportWarning[] = [];
  let parsedRows = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || isDivider(line)) {
      continue;
    }

    const columns = splitReportLine(line);
    if (columns.length < 4 || columns[0] === "RefDes") {
      continue;
    }

    const [netName, , ref, pin] = columns;
    if (!netName || !ref || !pin || isLikelyHeaderToken(netName)) {
      continue;
    }

    const net = netMap.get(netName) ?? { name: netName, nodes: [], sourceFile: fileName };
    net.nodes.push({ ref, pin, sourceFile: fileName });
    netMap.set(netName, net);
    parsedRows += 1;
  }

  if (parsedRows === 0) {
    warnings.push({ fileName, message: "未识别到网表连接行" });
  }

  return {
    nets: [...netMap.values()].filter((net) => net.nodes.length > 0),
    warnings
  };
}

function parseMultisimCrossReferenceReport(text: string, fileName: string) {
  const components: ParsedComponent[] = [];
  const warnings: ImportWarning[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || isDivider(line) || line.startsWith("RefDes")) {
      continue;
    }

    const columns = splitReportLine(line);
    if (columns.length < 3) {
      continue;
    }

    const [ref, value, category, packageName = "-"] = columns;
    if (!isRefDes(ref) || !value || !category) {
      continue;
    }

    components.push({
      ref,
      value,
      category,
      packageName,
      sourceFile: fileName
    });
  }

  if (components.length === 0) {
    warnings.push({ fileName, message: "未识别到交叉引用元件行，请确认导入的是 Multisim 交叉引用报告" });
  }

  return {
    components,
    warnings
  };
}

function splitReportLine(line: string) {
  return line
    .split(/\s{2,}|\t+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isDivider(line: string) {
  return /^-+$/.test(line);
}

function isEncodedHeader(line: string) {
  return line.includes("_uc");
}

function isLikelyHeaderToken(value: string) {
  return value.includes("_uc") || value.toLowerCase() === "net";
}

function isRefDes(value: string) {
  return /^(R|C|L|LED|D|Q|U|J|P|S|SW|RV|V|A|TP|0)[A-Za-z0-9_+-]*$/i.test(value);
}

function mergeComponents(current: ParsedComponent[], next: ParsedComponent[]) {
  const map = new Map<string, ParsedComponent>();
  current.forEach((component) => map.set(component.ref, component));
  next.forEach((component) => map.set(component.ref, component));
  return [...map.values()].sort((a, b) => naturalRefCompare(a.ref, b.ref));
}

function mergeNets(current: ParsedNet[], next: ParsedNet[]) {
  const map = new Map<string, ParsedNet>();
  current.forEach((net) => map.set(net.name, { ...net, nodes: [...net.nodes] }));

  for (const net of next) {
    const existing = map.get(net.name) ?? { name: net.name, nodes: [] };
    const nodeKeys = new Set(existing.nodes.map((node) => `${node.ref}.${node.pin}`));
    for (const node of net.nodes) {
      const key = `${node.ref}.${node.pin}`;
      if (!nodeKeys.has(key)) {
        existing.nodes.push(node);
        nodeKeys.add(key);
      }
    }
    map.set(net.name, existing);
  }

  return [...map.values()].sort((a, b) => naturalRefCompare(a.name, b.name));
}

function naturalRefCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
