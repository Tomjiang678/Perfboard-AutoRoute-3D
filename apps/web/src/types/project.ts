export type ImportKind = "netlist" | "bom";
export type DragMoveModifier = "shift" | "alt" | "ctrl" | "none";
export type ThemeMode = "light" | "dark";
export type ShortcutAction =
  | "refresh"
  | "select"
  | "transparent"
  | "rotate"
  | "mount"
  | "unmount"
  | "delete"
  | "generateComponents"
  | "autoPlace"
  | "autoRoute"
  | "runDrc"
  | "clearDrc"
  | "solder"
  | "jumper"
  | "erase";

export type KeyboardShortcuts = Record<ShortcutAction, string>;

export interface ImportedFile {
  id: string;
  kind: ImportKind;
  name: string;
  size: number;
  importedAt: string;
}

export interface ParsedComponent {
  ref: string;
  value: string;
  category: string;
  packageName: string;
  sourceFile: string;
}

export interface NetNode {
  ref: string;
  pin: string;
  sourceFile?: string;
}

export interface ParsedNet {
  name: string;
  nodes: NetNode[];
  sourceFile?: string;
}

export interface ImportWarning {
  fileName: string;
  message: string;
}

export interface ImportState {
  components: ParsedComponent[];
  nets: ParsedNet[];
  warnings: ImportWarning[];
}

export interface RoutedNetEndpoint {
  net: string;
  ref: string;
  pin: number;
  grid: [number, number];
  role: string;
}

export interface BottomTrace {
  id: string;
  net: string;
  points: Array<[number, number]>;
  layer?: "bottom";
  edges?: Array<[[number, number], [number, number]]>;
  locked?: boolean;
}

export interface JumperRoute {
  id: string;
  net: string;
  from: [number, number];
  to: [number, number];
  layer?: "jumper";
  locked?: boolean;
}

export interface RoutingState {
  traces: BottomTrace[];
  jumpers: JumperRoute[];
  failedNets: string[];
  warnings: string[];
  diagnostics?: RoutingDiagnostics;
  drc?: DrcReport;
}

export interface RoutingDiagnostics {
  failedNetDetails: FailedNetDiagnostic[];
}

export interface FailedNetDiagnostic {
  net: string;
  endpoints: RoutedNetEndpoint[];
  unconnectedEndpoints: RoutedNetEndpoint[];
  connectedGroups: RoutedNetEndpoint[][];
}

export type PinRouteStatusKind =
  | "CONNECTED"
  | "REQUIRED_UNCONNECTED"
  | "NET_PIN_UNROUTED"
  | "NO_NET_UNUSED"
  | "WRONG_NET_SHORT";

export interface PinRouteStatus {
  ref: string;
  pin: number;
  pinName?: string;
  grid: [number, number];
  expectedNet?: string;
  actualNets: string[];
  status: PinRouteStatusKind;
}

export type DrcSeverity = "error" | "warning";

export type DrcIssueCode =
  | "NET_PIN_UNROUTED"
  | "REQUIRED_UNCONNECTED"
  | "NO_NET_UNUSED"
  | "WRONG_NET_SHORT"
  | "SHORT_BETWEEN_NETS"
  | "BOTTOM_ROUTE_CROSSING"
  | "BOTTOM_ROUTE_OVERLAP"
  | "INVALID_BOARD_HOLE"
  | "HOLE_OCCUPIED"
  | "JUMPER_ENDPOINT_INVALID_HOLE"
  | "JUMPER_ENDPOINT_OCCUPIED"
  | "JUMPER_SAME_ELECTRICAL_NODE"
  | "POWER_RAIL_NET_REQUIRED"
  | "TWO_PIN_HORIZONTAL_CENTER_REQUIRED"
  | "CHIP_CENTER_GAP_REQUIRED"
  | "SUSPICIOUS_ADJACENT_IC_PINS"
  | "DIP_PIN_GEOMETRY";

export interface DrcIssue {
  code: DrcIssueCode;
  severity: DrcSeverity;
  message: string;
  ref?: string;
  pin?: number;
  pinName?: string;
  expectedNet?: string;
  actualNet?: string;
  actualNets?: string[];
  net?: string;
  grid?: [number, number];
  segment?: [[number, number], [number, number]];
}

export interface DrcReport {
  passed: boolean;
  errors: DrcIssue[];
  warnings: DrcIssue[];
  pinStatuses: PinRouteStatus[];
}

export type LibraryComponentKind =
  | "resistor"
  | "inductor"
  | "diode"
  | "led"
  | "radial_capacitor"
  | "electrolytic_capacitor"
  | "to92"
  | "to39"
  | "to220"
  | "dip"
  | "dip_switch"
  | "seven_segment_display"
  | "alphanumeric_display"
  | "pin_header"
  | "terminal_block"
  | "slide_switch"
  | "buzzer"
  | "tactile_switch"
  | "potentiometer";

export interface PlacedComponent {
  id: string;
  kind: LibraryComponentKind;
  label: string;
  name: string;
  value: string;
  pinCount?: number;
  leadSpacing: number;
  rowSpacing: number;
  sameSidePitch: number;
  pinHeaderRows?: number;
  pinHeaderColumns?: number;
  pinOffsets: Array<[number, number]>;
  position: [number, number];
  rotation: number;
  mounted: boolean;
  isFallback?: boolean;
  fallbackReason?: string;
  fallbackPinMap?: Record<string, number>;
}

export interface BoardSize {
  width: number;
  height: number;
  /** Missing on legacy projects; legacy boards are migrated to perfboard. */
  kind?: BoardKind;
  breadboard?: BreadboardLayout;
}

export type BoardKind = "perfboard" | "breadboard";

export interface BreadboardLayout {
  /** Number of terminal-strip modules placed next to each other. */
  modules: number;
  /** Number of numbered terminal rows along the long edge. */
  terminalRows: number;
  /** Standalone boards have red/blue rails on each side; combined boards have one outer rail per side. */
  powerRailsPerSide: 1 | 2;
}

export type ConstraintStrength = "hard" | "soft";
export type ConstraintStatus = "active" | "disabled" | "conflicted" | "orphaned";

export interface ConstraintRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DesignConstraintBase {
  id: string;
  strength: ConstraintStrength;
  status: ConstraintStatus;
  enabled: boolean;
  sourceText: string;
  explanation: string;
  createdAt: string;
}

export interface ComponentRegionConstraint extends DesignConstraintBase {
  kind: "component_in_region";
  componentIds: string[];
  componentRefs: string[];
  region: ConstraintRegion;
}

export interface ComponentBoardEdgeConstraint extends DesignConstraintBase {
  kind: "component_on_board_edge";
  componentIds: string[];
  componentRefs: string[];
  edge: "top" | "bottom" | "left" | "right" | "short_side" | "long_side" | "any";
  depth?: number;
}

export interface ComponentNearConstraint extends DesignConstraintBase {
  kind: "component_near_component";
  componentId: string;
  componentRef: string;
  anchorComponentId: string;
  anchorComponentRef: string;
  maxDistance: number;
}

export interface ComponentLockConstraint extends DesignConstraintBase {
  kind: "component_lock";
  componentId: string;
  componentRef: string;
  lockPosition: boolean;
  lockRotation: boolean;
}

export interface ComponentOrientationConstraint extends DesignConstraintBase {
  kind: "component_orientation";
  componentId: string;
  componentRef: string;
  rotationDegrees: number;
}

export interface RegionKeepoutConstraint extends DesignConstraintBase {
  kind: "region_keepout";
  region: ConstraintRegion;
  blockPlacement: boolean;
  blockBottomRouting: boolean;
  blockJumpers: boolean;
}

export interface PowerRailConstraint extends DesignConstraintBase {
  kind: "power_rail";
  net: string;
  axis: "row" | "column";
  index: number;
  from: number;
  to: number;
}

export interface NetJumperLimitConstraint extends DesignConstraintBase {
  kind: "net_jumper_limit";
  net: string;
  maxJumpers: number;
}

export type DesignConstraint =
  | ComponentRegionConstraint
  | ComponentBoardEdgeConstraint
  | ComponentNearConstraint
  | ComponentLockConstraint
  | ComponentOrientationConstraint
  | RegionKeepoutConstraint
  | PowerRailConstraint
  | NetJumperLimitConstraint;

export interface PerfboardProject {
  id: string;
  name: string;
  board: BoardSize;
  files: ImportedFile[];
  importState: ImportState;
  components: PlacedComponent[];
  selectedNetName?: string;
  routing: RoutingState;
  constraints?: DesignConstraint[];
  constraintSchemaVersion?: number;
  createdAt: string;
}
