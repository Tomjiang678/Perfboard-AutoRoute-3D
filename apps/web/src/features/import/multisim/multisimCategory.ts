/**
 * Multisim report categories use their own vocabulary ("OPAMP", "CAP_ELECTROLIT").
 * Translate them into the KiCad-style category strings the existing mapping rules
 * already understand, so the part lands on the right footprint instead of the
 * generic placeholder. This is a fixed table, not a device library: it never says
 * which pin is which — that always comes from a user profile.
 */
const CATEGORY_TRANSLATIONS: Record<string, string> = {
  RESISTOR: "Device:R",
  RESISTORS: "Device:R",
  VARIABLE_RESISTOR: "Device:R_Potentiometer",
  CAPACITOR: "Device:C",
  CAPACITORS: "Device:C",
  CAP_ELECTROLIT: "Device:CP",
  CAP_ELECTROLYTIC: "Device:CP",
  INDUCTOR: "Device:L",
  INDUCTORS: "Device:L",
  DIODE: "Device:D",
  DIODES: "Device:D",
  LED: "Device:LED",
  ZENER: "Device:D_Zener",
  BJT_NPN: "Transistor_BJT:NPN",
  BJT_PNP: "Transistor_BJT:PNP",
  JFET_N: "Transistor_FET:JFET",
  MOSFET_N: "Transistor_FET:MOSFET",
  MOSFET_P: "Transistor_FET:MOSFET",
  OPAMP: "Amplifier_Operational:OpAmp",
  OP_AMP: "Amplifier_Operational:OpAmp",
  COMPARATOR: "Comparator:",
  TIMER: "Timer:",
  CRYSTAL: "Device:Crystal",
  RELAY: "Relay:",
  FUSE: "Device:Fuse",
  BUZZER: "Device:Buzzer",
  TRANSFORMER: "Device:Transformer",
  SEVEN_SEG_DISPLAY: "Display_Character:",
  ALPHANUMERIC_DISPLAY: "Display_Character:"
};

const POWER_CATEGORY = /POWER_SOURCES|VOLTAGE_SOURCES|^GROUND$|^POWER$/i;

export function isMultisimPowerCategory(category: string): boolean {
  return POWER_CATEGORY.test(category.trim());
}

export function translateMultisimCategory(category: string): string {
  const key = category.trim().toUpperCase().replace(/\s+/g, "_");
  return CATEGORY_TRANSLATIONS[key] ?? category.trim();
}
