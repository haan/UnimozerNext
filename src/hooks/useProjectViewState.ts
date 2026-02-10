import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DiagramViewMode } from "../components/diagram/DiagramPanel";
import type { UmlGraph, UmlNode } from "../models/uml";
import { basename } from "../services/paths";
import type { ProjectStorageMode } from "./useProjectIO";

type UseProjectViewStateArgs = {
  openFilePath: string | null;
  selectedClassId: string | null;
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
  umlGraph: UmlGraph | null;
  leftPanelViewMode: DiagramViewMode;
  setLeftPanelViewMode: Dispatch<SetStateAction<DiagramViewMode>>;
  projectStorageMode: ProjectStorageMode | null;
  packedArchivePath: string | null;
  projectPath: string | null;
};

type UseProjectViewStateResult = {
  canUseStructogramMode: boolean;
  selectedNode: UmlNode | null;
  projectName: string;
  exportDefaultPath: string | null;
};

export const useProjectViewState = ({
  openFilePath,
  selectedClassId,
  setSelectedClassId,
  umlGraph,
  leftPanelViewMode,
  setLeftPanelViewMode,
  projectStorageMode,
  packedArchivePath,
  projectPath
}: UseProjectViewStateArgs): UseProjectViewStateResult => {
  const canUseStructogramMode = useMemo(
    () => Boolean(openFilePath && openFilePath.toLowerCase().endsWith(".java")),
    [openFilePath]
  );

  const selectedNode = useMemo(() => {
    if (!selectedClassId) return null;
    return umlGraph?.nodes.find((node) => node.id === selectedClassId) ?? null;
  }, [selectedClassId, umlGraph]);

  useEffect(() => {
    if (!canUseStructogramMode && leftPanelViewMode === "structogram") {
      setLeftPanelViewMode("uml");
    }
  }, [canUseStructogramMode, leftPanelViewMode, setLeftPanelViewMode]);

  useEffect(() => {
    if (selectedClassId && !selectedNode) {
      setSelectedClassId(null);
    }
  }, [selectedClassId, selectedNode, setSelectedClassId]);

  const projectName = useMemo(() => {
    if (projectStorageMode === "scratch") {
      return "Unsaved Project";
    }
    if (projectStorageMode === "packed" && packedArchivePath) {
      return basename(packedArchivePath).replace(/\.umz$/i, "");
    }
    return projectPath ? basename(projectPath) : "";
  }, [packedArchivePath, projectPath, projectStorageMode]);

  const exportDefaultPath = useMemo(() => {
    if (projectStorageMode === "packed") {
      return packedArchivePath;
    }
    if (projectStorageMode === "folder") {
      return projectPath;
    }
    return null;
  }, [packedArchivePath, projectPath, projectStorageMode]);

  return {
    canUseStructogramMode,
    selectedNode,
    projectName,
    exportDefaultPath
  };
};
