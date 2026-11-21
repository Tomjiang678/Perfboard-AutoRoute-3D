import type { PerfboardProject, RoutingState } from "../../types/project.ts";
import { stripDrcWarnings } from "./drcWarnings.ts";

/**
 * Package / pin-number changes move the electrical endpoints of every net that
 * touches the component. Keep the unaffected nets, but drop all routing on the
 * affected nets so stale copper cannot survive the change.
 */
export function invalidateComponentRouting(
  project: PerfboardProject,
  componentNames: string | string[]
): RoutingState {
  const names = new Set(Array.isArray(componentNames) ? componentNames : [componentNames]);
  const refs = new Set(
    project.importState.components
      .filter((component) => names.has(component.ref))
      .map((component) => component.ref)
  );
  if (refs.size === 0) return project.routing;

  const nets = new Set(
    project.importState.nets
      .filter((net) => net.nodes.some((node) => refs.has(node.ref)))
      .map((net) => net.name)
  );
  if (nets.size === 0) return project.routing;

  return {
    ...project.routing,
    traces: project.routing.traces.filter((trace) => !nets.has(trace.net)),
    jumpers: project.routing.jumpers.filter((jumper) => !nets.has(jumper.net)),
    failedNets: project.routing.failedNets.filter((net) => !nets.has(net)),
    warnings: stripDrcWarnings(project.routing.warnings),
    diagnostics: undefined,
    drc: undefined
  };
}
