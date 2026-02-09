import type { DiagramState } from "../models/diagram";
import type { OpenFile } from "../models/openFile";
import type { UmlGraph, UmlNode } from "../models/uml";
import type { ProjectStorageMode } from "./useProjectIO";

type UseAppCapabilitiesArgs = {
  busy: boolean;
  openFile: OpenFile | null;
  umlGraph: UmlGraph | null;
  diagramState: DiagramState | null;
  projectPath: string | null;
  openFilePath: string | null;
  selectedNode: UmlNode | null;
  visibleGraph: UmlGraph | null;
  hasDiagramExportControls: boolean;
  hasStructogramExportControls: boolean;
  hasUnsavedChanges: boolean;
  diagramLayoutDirty: boolean;
  projectStorageMode: ProjectStorageMode | null;
  scratchHasClasses: boolean;
  hasPackedArchiveSyncChanges: boolean;
};

type UseAppCapabilitiesResult = {
  editDisabled: boolean;
  zoomDisabled: boolean;
  hasUmlClasses: boolean;
  canAddClass: boolean;
  canAddField: boolean;
  canAddConstructor: boolean;
  canAddMethod: boolean;
  canCompileClass: boolean;
  canExportDiagram: boolean;
  canExportStructogram: boolean;
  hasPendingProjectChanges: boolean;
};

export const useAppCapabilities = ({
  busy,
  openFile,
  umlGraph,
  diagramState,
  projectPath,
  openFilePath,
  selectedNode,
  visibleGraph,
  hasDiagramExportControls,
  hasStructogramExportControls,
  hasUnsavedChanges,
  diagramLayoutDirty,
  projectStorageMode,
  scratchHasClasses,
  hasPackedArchiveSyncChanges
}: UseAppCapabilitiesArgs): UseAppCapabilitiesResult => {
  const editDisabled = !openFile || busy;
  const zoomDisabled = !umlGraph || !diagramState;
  const hasUmlClasses = Boolean(umlGraph?.nodes.length);
  const canAddClass = Boolean(projectPath) && !busy;
  const canAddField = Boolean(selectedNode) && Boolean(openFilePath) && !busy;
  const canAddConstructor = Boolean(selectedNode) && Boolean(openFilePath) && !busy;
  const canAddMethod = Boolean(selectedNode) && Boolean(openFilePath) && !busy;
  const canCompileClass = Boolean(projectPath) && !busy && hasUmlClasses;
  const canExportDiagram =
    Boolean(visibleGraph && diagramState) && hasUmlClasses && hasDiagramExportControls;
  const canExportStructogram = hasStructogramExportControls;
  const hasPendingProjectChanges =
    hasUnsavedChanges ||
    diagramLayoutDirty ||
    (projectStorageMode === "scratch" && scratchHasClasses) ||
    hasPackedArchiveSyncChanges;

  return {
    editDisabled,
    zoomDisabled,
    hasUmlClasses,
    canAddClass,
    canAddField,
    canAddConstructor,
    canAddMethod,
    canCompileClass,
    canExportDiagram,
    canExportStructogram,
    hasPendingProjectChanges
  };
};
