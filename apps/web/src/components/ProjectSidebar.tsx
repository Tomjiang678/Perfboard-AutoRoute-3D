import { Box, Grid3X3 } from "lucide-react";
import { useState } from "react";
import { resolveImportPins } from "../features/import/pinResolver";
import { resolveNetEndpoints } from "../features/import/netEndpointResolver";
import { pinGridPosition } from "../features/board/placement";
import type { DrcIssue, ImportedFile, ImportKind, PerfboardProject, PlacedComponent, RoutedNetEndpoint } from "../types/project";
import { FileDropZone } from "./FileDropZone";
import { getBoardModel } from "../features/board/factory";

interface ProjectSidebarProps {
  project: PerfboardProject;
  onImportFiles: (kind: ImportKind, files: File[]) => void | Promise<void>;
  onRemoveImportedFile: (fileId: string) => void;
  onSelectNet: (netName: string | undefined) => void;
}

export function ProjectSidebar({ project, onImportFiles, onRemoveImportedFile, onSelectNet }: ProjectSidebarProps) {
  const netlistFiles = project.files.filter((file) => file.kind === "netlist");

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h2>Project</h2>
        <div className="project-card">
          <div className="project-card-row">
            <Grid3X3 size={18} />
            <span>{getBoardModel(project.board).getDisplayName()}</span>
          </div>
          <div className="project-card-row">
            <Box size={18} />
            <span>2.54 mm pitch</span>
          </div>
        </div>
      </section>

      <section className="sidebar-section">
        <h2>Import</h2>
        <div className="drop-list">
          <FileDropZone kind="netlist" title="Netlist (.net)" accept=".net,.txt" onFiles={onImportFiles} />
        </div>
        <FileList title="Netlist files" files={netlistFiles} emptyText="No netlist imported" onRemove={onRemoveImportedFile} />
      </section>

      <ImportSummary project={project} onSelectNet={onSelectNet} />
    </aside>
  );
}

function ImportSummary({
  project,
  onSelectNet
}: {
  project: PerfboardProject;
  onSelectNet: (netName: string | undefined) => void;
}) {
  const { components, nets, warnings } = project.importState;
  const resolvedPins = resolveImportPins(project.importState);
  const connectedNodes = nets.reduce((sum, net) => sum + net.nodes.length, 0);
  const resolvedNodeCount = resolvedPins.nets.reduce((sum, net) => sum + net.nodes.length, 0);
  const unresolvedNodeCount = resolvedPins.nets.reduce((sum, net) => sum + net.unresolved.length, 0);
  const endpoints = resolveNetEndpoints(project.importState, project.components);
  const endpointCountByNet = new Map<string, number>();
  endpoints.forEach((endpoint) => endpointCountByNet.set(endpoint.net, (endpointCountByNet.get(endpoint.net) ?? 0) + 1));
  const pinNetRows = buildPinNetRows(project.components, endpoints);
  const [showComponents, setShowComponents] = useState(true);
  const [showAllNets, setShowAllNets] = useState(false);
  const [showPinNets, setShowPinNets] = useState(true);
  const sortedNets = [...nets].sort((a, b) => netSortScore(b.name) - netSortScore(a.name) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const visibleNets = showAllNets ? sortedNets : sortedNets.slice(0, 12);

  return (
    <section className="sidebar-section">
      <h2>Import Result</h2>
      <div className="import-summary">
        <Summary label="Parts" value={components.length} />
        <Summary label="Nets" value={nets.length} />
        <Summary label="Nodes" value={connectedNodes} />
        <Summary label="Mapped" value={resolvedNodeCount} />
        <Summary label="Missing" value={unresolvedNodeCount} />
      </div>

      {components.length > 0 && (
        <div className="parsed-list">
          <div className="parsed-list-header">
            <h3>Components</h3>
            <button className="text-button" type="button" onClick={() => setShowComponents((current) => !current)}>
              {showComponents ? "Collapse" : `Show (${components.length})`}
            </button>
          </div>
          {showComponents && (
            <>
              {components.slice(0, 8).map((component) => (
                <div className="parsed-row" key={component.ref}>
                  <span>{component.ref}</span>
                  <small>{component.value} / {component.packageName}</small>
                </div>
              ))}
              {components.length > 8 && <p>More components: {components.length - 8}</p>}
            </>
          )}
        </div>
      )}

      {nets.length > 0 && (
        <div className="parsed-list">
          <h3>Nets</h3>
          <div className={showAllNets ? "net-list expanded" : "net-list"}>
          {visibleNets.map((net) => (
            <button
              className={project.selectedNetName === net.name ? "parsed-row selectable selected" : "parsed-row selectable"}
              key={net.name}
              type="button"
              onClick={() => onSelectNet(net.name)}
            >
              <span>{net.name}</span>
              <small>{endpointCountByNet.get(net.name) ?? 0}/{net.nodes.length} holes</small>
            </button>
          ))}
          </div>
          {sortedNets.length > 12 && (
            <button className="text-button" type="button" onClick={() => setShowAllNets((current) => !current)}>
              {showAllNets ? "Show fewer nets" : `Show all nets (${sortedNets.length})`}
            </button>
          )}
        </div>
      )}

      {pinNetRows.length > 0 && (
        <div className="parsed-list">
          <div className="parsed-list-header">
            <h3>Pin nets</h3>
            <button className="text-button" type="button" onClick={() => setShowPinNets((current) => !current)}>
              {showPinNets ? "Collapse" : `Show (${pinNetRows.length})`}
            </button>
          </div>
          {showPinNets && (
            <>
              {pinNetRows.slice(0, 24).map((row) => (
                <div className="parsed-row" key={`${row.ref}-${row.pin}`}>
                  <span>{row.ref}.{row.pin}</span>
                  <small>{row.net} @ {row.grid}</small>
                </div>
              ))}
              {pinNetRows.length > 24 && <p>More pins: {pinNetRows.length - 24}</p>}
            </>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="warning-list">
          {warnings.slice(-3).map((warning, index) => (
            <p key={`${warning.fileName}-${index}`}>{warning.fileName}: {warning.message}</p>
          ))}
        </div>
      )}

      {(project.routing.traces.length > 0 ||
        project.routing.jumpers.length > 0 ||
        project.routing.failedNets.length > 0 ||
        project.routing.warnings.length > 0 ||
        project.routing.drc) && (
        <div className="parsed-list">
          <h3>Routing / DRC</h3>
          <div className="parsed-row">
            <span>Solder</span>
            <small>{project.routing.traces.length} segments</small>
          </div>
          <div className="parsed-row">
            <span>Jumpers</span>
            <small>{project.routing.jumpers.length} jumpers</small>
          </div>
          {project.routing.diagnostics?.failedNetDetails.length ? (
            project.routing.diagnostics.failedNetDetails.map((detail) => (
              <div className="warning-list" key={detail.net}>
                <p>Failed net {detail.net}: {formatEndpointList(detail.endpoints)}</p>
                <p>Unconnected: {formatEndpointList(detail.unconnectedEndpoints)}</p>
                <p>Connected groups: {detail.connectedGroups.map((group) => group.length).join(" / ")}</p>
              </div>
            ))
          ) : project.routing.failedNets.length > 0 ? (
            <p>Failed nets: {project.routing.failedNets.join(", ")}</p>
          ) : null}
          {project.routing.drc && (
            <div className="warning-list">
              <p>DRC: {project.routing.drc.errors.length} errors / {project.routing.drc.warnings.length} warnings</p>
              {project.routing.drc.errors.slice(0, 8).map((issue, index) => (
                <p key={`error-${index}`}>{formatDrcIssue(issue)}</p>
              ))}
              {project.routing.drc.warnings.slice(0, 6).map((issue, index) => (
                <p key={`warning-${index}`}>{formatDrcIssue(issue)}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {resolvedPins.warnings.length > 0 && (
        <div className="warning-list">
          {resolvedPins.warnings.slice(0, 5).map((warning, index) => (
            <p key={`${warning.ref}-${warning.pin}-${index}`}>
              {warning.ref}.{warning.pin}: {warning.message}
            </p>
          ))}
          {resolvedPins.warnings.length > 5 && <p>More unresolved pins: {resolvedPins.warnings.length - 5}</p>}
        </div>
      )}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function netSortScore(name: string) {
  return /^(0|GND|VCC|VDD|VEE|VSS|VDC|VDC\d+|\+?\d+V)$/i.test(name) ? 1000 : 0;
}

function FileList({ title, files, emptyText, onRemove }: { title: string; files: ImportedFile[]; emptyText: string; onRemove: (fileId: string) => void }) {
  return (
    <div className="file-list">
      <h3>{title}</h3>
      {files.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        files.map((file) => (
          <div className="file-row" key={file.id}>
            <span>{file.name}</span>
            <small>{formatFileSize(file.size)}</small>
            <button className="text-button danger" type="button" onClick={() => onRemove(file.id)}>
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function buildPinNetRows(components: PlacedComponent[], endpoints: RoutedNetEndpoint[]) {
  const endpointByRefPin = new Map(endpoints.map((endpoint) => [`${endpoint.ref}:${endpoint.pin}`, endpoint]));
  return components.flatMap((component) => {
    return component.pinOffsets.map((_, index) => {
      const pin = index + 1;
      const endpoint = endpointByRefPin.get(`${component.name}:${pin}`);
      const grid = endpoint?.grid ?? pinGridPosition(component, pin);
      return {
        ref: component.name,
        pin,
        net: endpoint?.net ?? "(no net)",
        grid: `${grid[0]},${grid[1]}`
      };
    });
  });
}

function formatEndpointList(endpoints: RoutedNetEndpoint[]) {
  if (endpoints.length === 0) {
    return "none";
  }
  return endpoints.map((endpoint) => `${endpoint.ref}.${endpoint.pin}(${endpoint.grid[0]},${endpoint.grid[1]})`).join(", ");
}

function formatDrcIssue(issue: DrcIssue) {
  const location = issue.grid ? ` @ ${issue.grid[0]},${issue.grid[1]}` : "";
  const pin = issue.ref ? ` ${issue.ref}${issue.pin ? `.${issue.pin}` : ""}` : "";
  return `${issue.severity.toUpperCase()} ${issue.code}${pin}${location}: ${issue.message}`;
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
