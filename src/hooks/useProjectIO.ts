import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DiagramState } from "../models/diagram";
import type { FileNode } from "../models/files";
import type { UmlGraph } from "../models/uml";
import type { FileDraft } from "../models/drafts";
import type { OpenFile } from "../models/openFile";
import { createDefaultDiagramState, mergeDiagramState, parseLegacyPck } from "../services/diagram";
import { basename, joinPath, toDisplayPath } from "../services/paths";
import {
  DEFAULT_NEW_PROJECT_FILE_NAME,
  PACKED_PROJECT_EXTENSION
} from "../constants/project";

type OpenPackedProjectResponse = {
  archivePath: string;
  workspaceDir: string;
  projectRoot: string;
  projectName: string;
};

type OpenScratchProjectResponse = {
  projectRoot: string;
  projectName: string;
};

export type ProjectStorageMode = "folder" | "packed" | "scratch";

type UseProjectIOArgs = {
  projectPath: string | null;
  projectStorageMode: ProjectStorageMode | null;
  packedArchivePath: string | null;
  fileDrafts: Record<string, FileDraft>;
  lastGoodGraphRef: MutableRefObject<UmlGraph | null>;
  setProjectPath: Dispatch<SetStateAction<string | null>>;
  setProjectStorageMode: Dispatch<SetStateAction<ProjectStorageMode | null>>;
  setPackedArchivePath: Dispatch<SetStateAction<string | null>>;
  setTree: Dispatch<SetStateAction<FileNode | null>>;
  setUmlGraph: Dispatch<SetStateAction<UmlGraph | null>>;
  setDiagramState: Dispatch<SetStateAction<DiagramState | null>>;
  setDiagramPath: Dispatch<SetStateAction<string | null>>;
  setOpenFile: Dispatch<SetStateAction<OpenFile | null>>;
  setContent: Dispatch<SetStateAction<string>>;
  setLastSavedContent: Dispatch<SetStateAction<string>>;
  setFileDrafts: Dispatch<SetStateAction<Record<string, FileDraft>>>;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  clearConsole: () => void;
  beforeProjectSwitch?: () => Promise<void>;
  resetLsState: () => void;
  notifyLsOpen: (path: string, text: string) => void;
  updateDraftForPath: (path: string, content: string, savedOverride?: string) => void;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  formatStatus: (input: unknown) => string;
};

type UseProjectIOResult = {
  handleOpenProject: () => Promise<void>;
  handleOpenFolderProject: () => Promise<void>;
  handleOpenPackedProjectPath: (archivePath: string) => Promise<void>;
  handleNewProject: (options?: { clearConsole?: boolean }) => Promise<void>;
  openFileByPath: (path: string) => Promise<void>;
  handleSave: () => Promise<boolean>;
  handleSaveAs: () => Promise<boolean>;
  loadDiagramState: (root: string, graph: UmlGraph) => Promise<void>;
};

export const useProjectIO = ({
  projectPath,
  projectStorageMode,
  packedArchivePath,
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
}: UseProjectIOArgs): UseProjectIOResult => {
  const ensureUmzPath = useCallback((path: string) => {
    const extension = `.${PACKED_PROJECT_EXTENSION}`;
    return path.toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
  }, []);

  const refreshTree = useCallback(
    async (root: string) => {
      const result = await invoke<FileNode>("list_project_tree", { root });
      setTree(result);
    },
    [setTree]
  );

  const resetProjectSession = useCallback(() => {
    setUmlGraph(null);
    lastGoodGraphRef.current = null;
    setDiagramState(null);
    setDiagramPath(null);
    setOpenFile(null);
    setFileDrafts({});
    setContent("");
    setLastSavedContent("");
    setCompileStatus(null);
    resetLsState();
  }, [
    lastGoodGraphRef,
    resetLsState,
    setCompileStatus,
    setContent,
    setDiagramPath,
    setDiagramState,
    setFileDrafts,
    setLastSavedContent,
    setOpenFile,
    setUmlGraph
  ]);

  const prepareProjectSwitch = useCallback(async () => {
    if (!beforeProjectSwitch) {
      return;
    }
    try {
      await beforeProjectSwitch();
    } catch {
      // Ignore pre-switch cleanup failures and proceed with open/create flow.
    }
  }, [beforeProjectSwitch]);

  const loadDiagramState = useCallback(
    async (root: string, graph: UmlGraph) => {
      const diagramFile = joinPath(root, "unimozer.json");
      let baseState: DiagramState | null = null;
      let loadedFromDisk = false;

      try {
        const text = await invoke<string>("read_text_file", { path: diagramFile });
        baseState = JSON.parse(text) as DiagramState;
        loadedFromDisk = true;
      } catch {
        baseState = null;
      }

      if (!baseState) {
        try {
          const legacyText = await invoke<string>("read_text_file", {
            path: joinPath(root, "unimozer.pck")
          });
          const legacyNodes = parseLegacyPck(legacyText);
          if (Object.keys(legacyNodes).length > 0) {
            baseState = {
              ...createDefaultDiagramState(),
              nodes: legacyNodes
            };
          }
        } catch {
          baseState = null;
        }
      }

      if (!baseState) {
        baseState = createDefaultDiagramState();
      }

      const merged = mergeDiagramState(
        baseState,
        graph.nodes.map((node) => node.id)
      );
      setDiagramState(merged.state);
      setDiagramPath(diagramFile);

      if (!loadedFromDisk || merged.added) {
        await invoke("write_text_file", {
          path: diagramFile,
          contents: JSON.stringify(merged.state, null, 2)
        });
      }
    },
    [setDiagramPath, setDiagramState]
  );

  const openFileByPath = useCallback(
    async (path: string) => {
      clearConsole();
      setBusy(true);
      try {
        const existingDraft = fileDrafts[path];
        const name = basename(path);
        if (existingDraft) {
          setOpenFile({ name, path });
          setContent(existingDraft.content);
          setLastSavedContent(existingDraft.lastSavedContent);
          notifyLsOpen(path, existingDraft.content);
          setStatus(`Opened ${name}`);
        } else {
          const text = await invoke<string>("read_text_file", { path });
          setOpenFile({ name, path });
          setContent(text);
          setLastSavedContent(text);
          updateDraftForPath(path, text, text);
          notifyLsOpen(path, text);
          setStatus(`Opened ${name}`);
        }
      } catch (error) {
        setStatus(`Failed to open file: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      clearConsole,
      fileDrafts,
      formatStatus,
      notifyLsOpen,
      setBusy,
      setContent,
      setLastSavedContent,
      setOpenFile,
      setStatus,
      updateDraftForPath
    ]
  );

  const handleOpenPackedProjectPath = useCallback(
    async (archivePath: string) => {
      setStatus("Opening project...");
      clearConsole();
      await prepareProjectSwitch();
      setBusy(true);
      try {
        const response = await invoke<OpenPackedProjectResponse>("open_packed_project", {
          archivePath
        });
        await refreshTree(response.projectRoot);
        setProjectPath(response.projectRoot);
        setProjectStorageMode("packed");
        setPackedArchivePath(response.archivePath);
        resetProjectSession();
        setStatus(`Project loaded: ${toDisplayPath(response.archivePath)}`);
      } catch (error) {
        setStatus(`Failed to open project: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      clearConsole,
      formatStatus,
      prepareProjectSwitch,
      refreshTree,
      resetProjectSession,
      setBusy,
      setPackedArchivePath,
      setProjectPath,
      setProjectStorageMode,
      setStatus
    ]
  );

  const handleOpenProject = useCallback(async () => {
    setStatus("Opening project...");
    const selection = await open({
      directory: false,
      multiple: false,
      title: "Open Unimozer Project",
      filters: [
        {
          name: "Unimozer Project",
          extensions: [PACKED_PROJECT_EXTENSION]
        }
      ]
    });

    const filePath = Array.isArray(selection) ? selection[0] : selection;
    if (!filePath || typeof filePath !== "string") {
      setStatus("Open project cancelled.");
      return;
    }

    await handleOpenPackedProjectPath(filePath);
  }, [handleOpenPackedProjectPath, setStatus]);

  const handleOpenFolderProject = useCallback(async () => {
    setStatus("Opening folder project...");
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Open Folder Project"
    });

    const dir = Array.isArray(selection) ? selection[0] : selection;
    if (!dir || typeof dir !== "string") {
      setStatus("Open folder project cancelled.");
      return;
    }

    setBusy(true);
    clearConsole();
    await prepareProjectSwitch();
    try {
      await refreshTree(dir);
      setProjectPath(dir);
      setProjectStorageMode("folder");
      setPackedArchivePath(null);
      resetProjectSession();
      setStatus(`Project loaded: ${toDisplayPath(dir)}`);
    } catch (error) {
      setStatus(`Failed to open folder project: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [
    clearConsole,
    formatStatus,
    prepareProjectSwitch,
    refreshTree,
    resetProjectSession,
    setBusy,
    setPackedArchivePath,
    setProjectPath,
    setProjectStorageMode,
    setStatus
  ]);

  const handleNewProject = useCallback(async (options?: { clearConsole?: boolean }) => {
    const shouldClearConsole = options?.clearConsole ?? true;
    setStatus("Creating project...");
    setBusy(true);
    if (shouldClearConsole) {
      clearConsole();
    }
    await prepareProjectSwitch();
    try {
      const response = await invoke<OpenScratchProjectResponse>("create_scratch_project");
      await refreshTree(response.projectRoot);
      setProjectPath(response.projectRoot);
      setProjectStorageMode("scratch");
      setPackedArchivePath(null);
      resetProjectSession();
      setStatus("Unsaved project ready.");
    } catch (error) {
      setStatus(`Failed to create project: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [
    clearConsole,
    formatStatus,
    prepareProjectSwitch,
    refreshTree,
    resetProjectSession,
    setBusy,
    setPackedArchivePath,
    setProjectPath,
    setProjectStorageMode,
    setStatus
  ]);

  const switchToPackedArchive = useCallback(
    async (archivePath: string) => {
      clearConsole();
      await prepareProjectSwitch();
      const response = await invoke<OpenPackedProjectResponse>("open_packed_project", {
        archivePath
      });
      await refreshTree(response.projectRoot);
      setProjectPath(response.projectRoot);
      setProjectStorageMode("packed");
      setPackedArchivePath(response.archivePath);
      resetProjectSession();
      return response.archivePath;
    },
    [
      clearConsole,
      prepareProjectSwitch,
      refreshTree,
      resetProjectSession,
      setPackedArchivePath,
      setProjectPath,
      setProjectStorageMode
    ]
  );

  const handleSave = useCallback(async () => {
    if (!projectPath) {
      setStatus("Open a project before saving.");
      return false;
    }
    if (projectStorageMode === "scratch") {
      const suggestedName = DEFAULT_NEW_PROJECT_FILE_NAME;
      const selection = await save({
        title: "Save Project As",
        defaultPath: packedArchivePath ?? suggestedName,
        filters: [
          {
            name: "Unimozer Project",
            extensions: [PACKED_PROJECT_EXTENSION]
          }
        ]
      });
      if (!selection || typeof selection !== "string") {
        setStatus("Save As cancelled.");
        return false;
      }

      const archivePath = ensureUmzPath(selection);
      setBusy(true);
      try {
        await formatAndSaveUmlFiles(true);
        await invoke("save_packed_project", {
          projectRoot: projectPath,
          archivePath
        });
        const activeArchivePath = await switchToPackedArchive(archivePath);
        setStatus(`Project saved to ${toDisplayPath(activeArchivePath)}`);
        return true;
      } catch (error) {
        setStatus(`Save As failed: ${formatStatus(error)}`);
        return false;
      } finally {
        setBusy(false);
      }
    }
    setBusy(true);
    try {
      await formatAndSaveUmlFiles(true);
      if (projectStorageMode === "packed") {
        if (!packedArchivePath) {
          throw new Error("Packed project archive path is missing.");
        }
        await invoke("save_packed_project", {
          projectRoot: projectPath,
          archivePath: packedArchivePath
        });
        setStatus(`Project saved: ${toDisplayPath(packedArchivePath)}`);
      }
      return true;
    } catch (error) {
      setStatus(`Failed to save file: ${formatStatus(error)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    ensureUmzPath,
    formatAndSaveUmlFiles,
    formatStatus,
    packedArchivePath,
    projectPath,
    projectStorageMode,
    setBusy,
    setStatus,
    switchToPackedArchive
  ]);

  const handleSaveAs = useCallback(async () => {
    if (!projectPath) {
      setStatus("Open a project before saving.");
      return false;
    }
    const suggestedName =
      projectStorageMode === "scratch"
        ? DEFAULT_NEW_PROJECT_FILE_NAME
        : `${basename(projectPath)}.${PACKED_PROJECT_EXTENSION}`;
    const selection = await save({
      title: "Save Project As",
      defaultPath: packedArchivePath ?? suggestedName,
      filters: [
        {
          name: "Unimozer Project",
          extensions: [PACKED_PROJECT_EXTENSION]
        }
      ]
    });
    if (!selection || typeof selection !== "string") {
      setStatus("Save As cancelled.");
      return false;
    }

    const archivePath = ensureUmzPath(selection);
    setBusy(true);
    try {
      await formatAndSaveUmlFiles(true);
      await invoke("save_packed_project", {
        projectRoot: projectPath,
        archivePath
      });
      if (projectStorageMode === "packed" || projectStorageMode === "scratch") {
        const activeArchivePath = await switchToPackedArchive(archivePath);
        setStatus(`Project saved to ${toDisplayPath(activeArchivePath)}`);
      } else {
        setStatus(`Project saved to ${toDisplayPath(archivePath)}`);
      }
      return true;
    } catch (error) {
      setStatus(`Save As failed: ${formatStatus(error)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    ensureUmzPath,
    formatAndSaveUmlFiles,
    formatStatus,
    packedArchivePath,
    projectPath,
    projectStorageMode,
    setBusy,
    setStatus,
    switchToPackedArchive
  ]);

  return {
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenPackedProjectPath,
    handleNewProject,
    openFileByPath,
    handleSave,
    handleSaveAs,
    loadDiagramState
  };
};
