import type { PerfboardProject } from "../../types/project";

export function createProject(name: string, width: number, height: number): PerfboardProject {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled Perfboard",
    board: {
      width,
      height
    },
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
