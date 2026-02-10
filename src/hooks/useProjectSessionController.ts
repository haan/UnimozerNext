import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DiagramState } from "../models/diagram";
import type { FileDraft } from "../models/drafts";
import type { FileNode } from "../models/files";
import type { ObjectInstance } from "../models/objectBench";
import type { OpenFile } from "../models/openFile";
import type { UmlGraph } from "../models/uml";
import { jshellStop } from "../services/jshell";
import { useProjectIO, type ProjectStorageMode } from "./useProjectIO";

type UseProjectSessionControllerArgs = {
  projectPath: string | null;
  projectStorageMode: ProjectStorageMode | null;
  packedArchivePath: string | null;
  openFilePath: string | null;
  setProjectPath: Dispatch<SetStateAction<string | null>>;
  setProjectStorageMode: Dispatch<SetStateAction<ProjectStorageMode | null>>;
  setPackedArchivePath: Dispatch<SetStateAction<string | null>>;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  setDiagramLayoutDirty: Dispatch<SetStateAction<boolean>>;
  fileDrafts: Record<string, FileDraft>;
  lastGoodGraphRef: MutableRefObject<UmlGraph | null>;
  setTree: Dispatch<SetStateAction<FileNode | null>>;
  setUmlGraph: Dispatch<SetStateAction<UmlGraph | null>>;
  setDiagramState: Dispatch<SetStateAction<DiagramState | null>>;
  setDiagramPath: Dispatch<SetStateAction<string | null>>;
  setOpenFile: Dispatch<SetStateAction<OpenFile | null>>;
  setContent: Dispatch<SetStateAction<string>>;
  setLastSavedContent: Dispatch<SetStateAction<string>>;
  setFileDrafts: Dispatch<SetStateAction<Record<string, FileDraft>>>;
  clearConsole: () => void;
  resetLsState: () => void;
  notifyLsOpen: (path: string, text: string) => void;
  updateDraftForPath: (path: string, content: string, savedOverride?: string) => void;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  formatStatus: (input: unknown) => string;
  awaitPackedArchiveSync: () => Promise<void>;
  clearPackedArchiveSyncError: () => void;
  setObjectBench: Dispatch<SetStateAction<ObjectInstance[]>>;
  setJshellReady: Dispatch<SetStateAction<boolean>>;
};

export const useProjectSessionController = ({
  projectPath,
  projectStorageMode,
  packedArchivePath,
  openFilePath,
  setProjectPath,
  setProjectStorageMode,
  setPackedArchivePath,
  setCompileStatus,
  setBusy,
  setStatus,
  setDiagramLayoutDirty,
  fileDrafts,
  lastGoodGraphRef,
  setTree,
  setUmlGraph,
  setDiagramState,
  setDiagramPath,
  setOpenFile,
  setContent,
  setLastSavedContent,
  setFileDrafts,
  clearConsole,
  resetLsState,
  notifyLsOpen,
  updateDraftForPath,
  formatAndSaveUmlFiles,
  formatStatus,
  awaitPackedArchiveSync,
  clearPackedArchiveSyncError,
  setObjectBench,
  setJshellReady
}: UseProjectSessionControllerArgs) => {
  const beforeProjectSwitch = useCallback(async () => {
    await awaitPackedArchiveSync();
    await Promise.allSettled([invoke("cancel_run"), jshellStop(), invoke("ls_stop")]);
    setJshellReady(false);
    setObjectBench([]);
  }, [awaitPackedArchiveSync, setJshellReady, setObjectBench]);

  const {
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenPackedProjectPath,
    handleNewProject,
    openFileByPath,
    handleSave: saveProject,
    handleSaveAs: saveProjectAs,
    loadDiagramState,
    reloadCurrentProjectFromDisk
  } = useProjectIO({
    projectPath,
    projectStorageMode,
    packedArchivePath,
    openFilePath,
    fileDrafts,
    lastGoodGraphRef,
    setProjectPath,
    setProjectStorageMode,
    setPackedArchivePath,
    setTree,
    setUmlGraph,
    setDiagramState,
    setDiagramPath,
    setOpenFile,
    setContent,
    setLastSavedContent,
    setFileDrafts,
    setCompileStatus,
    setBusy,
    setStatus,
    clearConsole,
    beforeProjectSwitch,
    resetLsState,
    notifyLsOpen,
    updateDraftForPath,
    formatAndSaveUmlFiles,
    formatStatus
  });

  const handleSave = useCallback(async () => {
    await awaitPackedArchiveSync();
    const success = await saveProject();
    if (success) {
      setDiagramLayoutDirty(false);
      clearPackedArchiveSyncError();
    }
  }, [
    awaitPackedArchiveSync,
    clearPackedArchiveSyncError,
    saveProject,
    setDiagramLayoutDirty
  ]);

  const handleSaveAs = useCallback(async () => {
    await awaitPackedArchiveSync();
    const success = await saveProjectAs();
    if (success) {
      setDiagramLayoutDirty(false);
      clearPackedArchiveSyncError();
    }
  }, [
    awaitPackedArchiveSync,
    clearPackedArchiveSyncError,
    saveProjectAs,
    setDiagramLayoutDirty
  ]);

  return {
    beforeProjectSwitch,
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenPackedProjectPath,
    handleNewProject,
    openFileByPath,
    loadDiagramState,
    handleSave,
    handleSaveAs,
    reloadCurrentProjectFromDisk
  };
};
