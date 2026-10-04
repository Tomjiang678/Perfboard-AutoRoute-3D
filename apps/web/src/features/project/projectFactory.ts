import type { BoardSize, PerfboardProject } from "../../types/project";

export function createProject(name: string, board: BoardSize): PerfboardProject {
  const kind = board.kind ?? "perfboard";
  return {
    id: crypto.randomUUID(),
    name: name.trim() || (kind === "breadboard" ? "Untitled Breadboard" : "Untitled Perfboard"),
    board: { ...board, kind },
    files: [],
    importState: {
      components: [],
      nets: [],
      warnings: []
    },
    components: [],
    selectedNetName: undefined,
    routing: {
      traces: [],
      jumpers: [],
      failedNets: [],
      warnings: []
    },
    constraints: [],
    constraintSchemaVersion: 1,
    createdAt: new Date().toISOString()
  };
}
