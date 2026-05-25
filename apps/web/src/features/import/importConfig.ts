import type { LibraryComponentKind, ParsedComponent } from "../../types/project";

export interface DevicePinModel {
  match: RegExp;
  units: Record<string, Record<string, number>>;
  powerPins: Record<string, number>;
}

export interface ComponentMappingRule {
  kind: LibraryComponentKind;
  label: string;
  match: (component: NormalizedComponentFields) => boolean;
  pinCount?: (component: ParsedComponent) => number | undefined;
  leadSpacing?: number;
  rowSpacing?: number;
}

export interface NormalizedComponentFields {
  refPrefix: string;
  category: string;
  packageName: string;
  value: string;
}

export const devicePinModels: DevicePinModel[] = [
  {
    match: /^(TL062|TL072|TL082|LM358|LM2904)/i,
    units: {
      A: {
        "1OUT": 1,
        OUT: 1,
        "1IN-": 2,
        "IN-": 2,
        "1IN+": 3,
        "IN+": 3
      },
      B: {
        "2OUT": 7,
        OUT: 7,
        "2IN-": 6,
        "IN-": 6,
        "2IN+": 5,
        "IN+": 5
      }
    },
    powerPins: {
      "VS+": 8,
      "V+": 8,
      VCC: 8,
      "VS-": 4,
      "V-": 4,
      GND: 4,
      VEE: 4
    }
  },
  {
    match: /^(LM393|LM2903)/i,
    units: {
      A: {
        "1OUT": 1,
        OUT: 1,
        "1IN-": 2,
        "IN-": 2,
        "1IN+": 3,
        "IN+": 3
      },
      B: {
        "2OUT": 7,
        OUT: 7,
        "2IN-": 6,
        "IN-": 6,
        "2IN+": 5,
        "IN+": 5
      }
    },
    powerPins: {
      "VS+": 8,
      "V+": 8,
      VCC: 8,
      "VS-": 4,
      "V-": 4,
      GND: 4,
      VEE: 4
    }
  },
  {
    match: /^(NE555|LM555|TLC555)/i,
    units: {
      "": {
        GND: 1,
        "0": 1,
        TRIG: 2,
        TRI: 2,
        OUT: 3,
        RESET: 4,
        RST: 4,
        CTRL: 5,
        CONT: 5,
        CON: 5,
        THRESH: 6,
        THR: 6,
        DISCH: 7,
        DIS: 7,
        VCC: 8
      }
    },
    powerPins: {
      GND: 1,
      VCC: 8,
      "V+": 8
    }
  }
];

export const simplePinMaps = {
  passiveCategories: /RESISTOR|CAP|INDUCTOR/,
  diodeCategories: /DIODE|LED/,
  diodeValuePatterns: /PHOTO_DIODE/,
  diodePins: {
    A: 1,
    K: 2
  } as Record<string, number>,
  bjtCategories: /BJT/,
  bjtPins: {
    C: 1,
    B: 2,
    E: 3
  } as Record<string, number>,
  switchCategories: /SWITCH/
};

export const componentMappingRules: ComponentMappingRule[] = [
  {
    kind: "led",
    label: "LED",
    leadSpacing: 1,
    match: ({ refPrefix, category }) => refPrefix === "LED" || category.includes("LED")
  },
  {
    kind: "resistor",
    label: "R",
    leadSpacing: 3,
    match: ({ refPrefix, category }) => refPrefix === "R" || category.includes("RESISTOR")
  },
  {
    kind: "inductor",
    label: "L",
    leadSpacing: 3,
    match: ({ refPrefix, category }) => refPrefix === "L" || category.includes("INDUCTOR")
  },
  {
    kind: "diode",
    label: "D",
    leadSpacing: 3,
    match: ({ refPrefix, category, value }) => refPrefix === "D" || category.includes("DIODE") || value.includes("PHOTO_DIODE")
  },
  {
    kind: "to92",
    label: "Q",
    match: ({ refPrefix, category }) => refPrefix === "Q" || category.includes("BJT") || category.includes("TRANSISTOR")
  },
  {
    kind: "electrolytic_capacitor",
    label: "C",
    leadSpacing: 1,
    match: ({ refPrefix, category, value }) => (refPrefix === "C" || category.includes("CAP")) && (category.includes("ELECT") || value.includes("UF"))
  },
  {
    kind: "radial_capacitor",
    label: "C",
    leadSpacing: 1,
    match: ({ refPrefix, category }) => refPrefix === "C" || category.includes("CAP")
  },
  {
    kind: "dip",
    label: "DIP",
    rowSpacing: 3,
    pinCount: (component) => parseDipPinCount(component.packageName) ?? 8,
    match: ({ refPrefix, packageName }) => refPrefix === "U" || packageName.includes("DIP") || packageName.includes("PDIP") || packageName.includes("SO-")
  },
  {
    kind: "pin_header",
    label: "HDR",
    pinCount: (component) => getFallbackPinCount(component),
    match: ({ refPrefix }) => refPrefix === "J" || refPrefix === "P" || refPrefix === "A"
  },
  {
    kind: "pin_header",
    label: "SW",
    pinCount: (component) => parseDipSwitchPinCount(component.value) ?? parseDipSwitchPinCount(component.packageName) ?? 4,
    match: ({ refPrefix, category }) => refPrefix === "S" || refPrefix === "SW" || category.includes("SWITCH")
  },
  {
    kind: "potentiometer",
    label: "RV",
    match: ({ refPrefix }) => refPrefix === "RV"
  }
];

export const fallbackComponentMapping = {
  kind: "pin_header" as const,
  label: "X",
  pinCount: 2
};

export function parseDipPinCount(packageName: string) {
  const match = packageName.match(/(?:DIP|PDIP|P)-?P?-?(\d+)/i) ?? packageName.match(/(\d+)\s*PIN/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function parseDipSwitchPinCount(value: string) {
  const match = value.match(/DIPSW(\d+)/i);
  if (!match) {
    return undefined;
  }

  const switchCount = Number(match[1]);
  return Number.isFinite(switchCount) ? switchCount * 2 : undefined;
}

function getFallbackPinCount(component: ParsedComponent) {
  if (component.value.toUpperCase().includes("BOOST_CONVERTER")) {
    return 3;
  }

  return 4;
}
