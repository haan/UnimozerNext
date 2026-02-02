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
import { basename, joinPath, toRelativePath } from "../services/paths";

type UseProjectIOArgs = {
  projectPath: string | null;
  fileDrafts: Record<string, FileDraft>;
  openFilePath: string | null;
  lastGoodGraphRef: MutableRefObject<UmlGraph | null>;
  setProjectPath: Dispatch<SetStateAction<string | null>>;
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
  resetLsState: () => void;
  notifyLsOpen: (path: string, text: string) => void;
  updateDraftForPath: (path: string, content: string, savedOverride?: string) => void;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  formatStatus: (input: unknown) => string;
  onExternalContent: () => void;
};

type UseProjectIOResult = {
  handleOpenProject: () => Promise<void>;
  handleNewProject: () => Promise<void>;
  openFileByPath: (path: string) => Promise<void>;
  handleSave: () => Promise<void>;
  handleExportProject: () => Promise<void>;
  loadDiagramState: (root: string, graph: UmlGraph) => Promise<void>;
};

export const useProjectIO = ({
  projectPath,
  fileDrafts,
  openFilePath,
  lastGoodGraphRef,
  setProjectPath,
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
  resetLsState,
  notifyLsOpen,
  updateDraftForPath,
  formatAndSaveUmlFiles,
  formatStatus,
  onExternalContent
}: UseProjectIOArgs): UseProjectIOResult => {
  const refreshTree = useCallback(
    async (root: string) => {
      const result = await invoke<FileNode>("list_project_tree", { root });
      setTree(result);
    },
    [setTree]
  );

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
      setBusy(true);
      try {
        const existingDraft = fileDrafts[path];
        const name = basename(path);
        if (existingDraft) {
          setOpenFile({ name, path });
          setContent(existingDraft.content);
          setLastSavedContent(existingDraft.lastSavedContent);
          onExternalContent();
          notifyLsOpen(path, existingDraft.content);
          setStatus(`Opened ${name}`);
        } else {
          const text = await invoke<string>("read_text_file", { path });
          setOpenFile({ name, path });
          setContent(text);
          setLastSavedContent(text);
          onExternalContent();
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
      fileDrafts,
      formatStatus,
      notifyLsOpen,
      setBusy,
      setContent,
      setLastSavedContent,
      setOpenFile,
      setStatus,
      updateDraftForPath,
      onExternalContent
    ]
  );

  const handleOpenProject = useCallback(async () => {
    setStatus("Opening project...");
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Open Java Project"
    });

    const dir = Array.isArray(selection) ? selection[0] : selection;
    if (!dir || typeof dir !== "string") {
      setStatus("Open project cancelled.");
      return;
    }

    setBusy(true);
    try {
      await refreshTree(dir);
      setProjectPath(dir);
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
      setStatus(`Project loaded: ${dir}`);
    } catch (error) {
      setStatus(`Failed to open project: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [
    formatStatus,
    lastGoodGraphRef,
    refreshTree,
    resetLsState,
    setBusy,
    setCompileStatus,
    setContent,
    setDiagramPath,
    setDiagramState,
    setFileDrafts,
    setLastSavedContent,
    setOpenFile,
    setProjectPath,
    setStatus,
    setUmlGraph
  ]);

  const handleNewProject = useCallback(async () => {
    setStatus("Creating project...");
    const selection = await save({
      title: "Create new project",
      defaultPath: projectPath ?? undefined
    });

    if (!selection || typeof selection !== "string") {
      setStatus("New project cancelled.");
      return;
    }

    setBusy(true);
    try {
      await invoke("create_netbeans_project", { target: selection });
      await refreshTree(selection);
      setProjectPath(selection);
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
      setStatus(`Project created: ${selection}`);
    } catch (error) {
      setStatus(`Failed to create project: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [
    formatStatus,
    lastGoodGraphRef,
    projectPath,
    refreshTree,
    resetLsState,
    setBusy,
    setCompileStatus,
    setContent,
    setDiagramPath,
    setDiagramState,
    setFileDrafts,
    setLastSavedContent,
    setOpenFile,
    setProjectPath,
    setStatus,
    setUmlGraph
  ]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await formatAndSaveUmlFiles(true);
    } catch (error) {
      setStatus(`Failed to save file: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [formatAndSaveUmlFiles, formatStatus, setBusy, setStatus]);

  const handleExportProject = useCallback(async () => {
    if (!projectPath) {
      setStatus("Open a project before exporting.");
      return;
    }
    const selection = await save({
      title: "Save project as",
      defaultPath: projectPath
    });
    if (!selection || typeof selection !== "string") {
      setStatus("Export cancelled.");
      return;
    }

    const overrides = Object.entries(fileDrafts)
      .filter(([, draft]) => draft.content !== draft.lastSavedContent)
      .map(([path, draft]) => ({
        path,
        content: draft.content
      }));

    setBusy(true);
    try {
      await invoke("export_netbeans_project", {
        root: projectPath,
        srcRoot: "src",
        target: selection,
        overrides
      });

      await refreshTree(selection);

      const remappedDrafts: Record<string, FileDraft> = {};
      for (const [path, draft] of Object.entries(fileDrafts)) {
        const relative = toRelativePath(path, projectPath);
        const nextPath = joinPath(selection, relative);
        remappedDrafts[nextPath] = {
          content: draft.content,
          lastSavedContent: draft.content
        };
      }

      let nextOpenFile: OpenFile | null = null;
      let nextContent = "";
      let nextLastSaved = "";
      if (openFilePath) {
        const relative = toRelativePath(openFilePath, projectPath);
        const nextPath = joinPath(selection, relative);
        nextOpenFile = { name: basename(nextPath), path: nextPath };
        const draft = remappedDrafts[nextPath];
        if (draft) {
          nextContent = draft.content;
          nextLastSaved = draft.lastSavedContent;
        }
      }

      setProjectPath(selection);
      setUmlGraph(null);
      lastGoodGraphRef.current = null;
      setDiagramState(null);
      setDiagramPath(null);
      setFileDrafts(remappedDrafts);
      setOpenFile(nextOpenFile);
      setContent(nextContent);
      setLastSavedContent(nextLastSaved);
      setCompileStatus(null);
      setStatus(`Project saved to ${selection}`);
    } catch (error) {
      setStatus(`Export failed: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [
    fileDrafts,
    formatStatus,
    lastGoodGraphRef,
    openFilePath,
    projectPath,
    refreshTree,
    setBusy,
    setCompileStatus,
    setContent,
    setDiagramPath,
    setDiagramState,
    setFileDrafts,
    setLastSavedContent,
    setOpenFile,
    setProjectPath,
    setStatus,
    setUmlGraph
  ]);

  return {
    handleOpenProject,
    handleNewProject,
    openFileByPath,
    handleSave,
    handleExportProject,
    loadDiagramState
  };
};
