import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import { toast } from "sonner";

import { ConsolePanel } from "./components/console/ConsolePanel";
import { CodePanel } from "./components/editor/CodePanel";
import { AppMenu } from "./components/app/AppMenu";
import { ObjectBenchSection } from "./components/app/ObjectBenchSection";
import type { DiagramViewMode } from "./components/diagram/DiagramPanel";
import { AppDialogs } from "./components/app/AppDialogs";
import { SplitHandle } from "./components/ui/split-handle";
import { Toaster } from "./components/ui/sonner";
import type { AddClassForm } from "./components/wizards/AddClassDialog";
import type { AddFieldForm } from "./components/wizards/AddFieldDialog";
import type { AddConstructorForm } from "./components/wizards/AddConstructorDialog";
import type { AddMethodForm } from "./components/wizards/AddMethodDialog";
import type { CreateObjectForm } from "./components/wizards/CreateObjectDialog";
import type { CallMethodForm } from "./components/wizards/CallMethodDialog";
import type { DiagramState } from "./models/diagram";
import type { FileNode } from "./models/files";
import type { UmlConstructor, UmlGraph, UmlMethod, UmlNode } from "./models/uml";
import type { ObjectInstance } from "./models/objectBench";
import type { OpenFile } from "./models/openFile";
import type { AppSettings } from "./models/settings";
import { useAppSettings } from "./hooks/useAppSettings";
import { useSplitRatios } from "./hooks/useSplitRatios";
import { useVerticalSplit } from "./hooks/useVerticalSplit";
import { useRunConsole } from "./hooks/useRunConsole";
import { useLanguageServer } from "./hooks/useLanguageServer";
import { toFileUri } from "./services/lsp";
import { useDrafts } from "./hooks/useDrafts";
import { useUmlGraph } from "./hooks/useUmlGraph";
import { useJshellActions } from "./hooks/useJshellActions";
import { usePackedArchiveSync } from "./hooks/usePackedArchiveSync";
import { useLaunchBootstrap } from "./hooks/useLaunchBootstrap";
import { useWindowCloseGuard } from "./hooks/useWindowCloseGuard";
import { useAppCapabilities } from "./hooks/useAppCapabilities";
import { useAppMenuState } from "./hooks/useAppMenuState";
import { useProjectSessionState } from "./hooks/useProjectSessionState";
import { basename, joinPath, toDisplayPath } from "./services/paths";
import { useProjectIO } from "./hooks/useProjectIO";
import { getThemeColors } from "./services/monacoThemes";
import { jshellStart, jshellStop } from "./services/jshell";
import { buildClassSource } from "./services/javaCodegen";
import { getUmlSignature } from "./services/umlGraph";
import type { ExportControls, ExportStyle } from "./components/diagram/UmlDiagram";
import type { StructogramExportControls } from "./components/structogram/StructogramView";
import {
  UML_REVEAL_REQUEST_TTL_SECONDS,
  UML_PARSE_DRAFT_DEBOUNCE_MS
} from "./constants/app";
import {
  CONSOLE_MIN_HEIGHT_PX,
  EDITOR_MIN_HEIGHT_PX,
  UML_DIAGRAM_MIN_HEIGHT_PX
} from "./constants/layout";
import { formatStatusText as formatStatus, trimStatusText as trimStatus } from "./services/status";

const hasClassFilesInTree = (node: FileNode | null): boolean => {
  if (!node) return false;
  if (node.kind === "file") {
    return node.name.toLowerCase().endsWith(".java");
  }
  return (node.children ?? []).some((child) => hasClassFilesInTree(child));
};

type LoadedAppSettings = {
  settings: AppSettings;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
  updateObjectBenchSplitRatioSetting: (ratio: number) => void;
};

export default function App() {
  const appSettings = useAppSettings();
  if (appSettings.settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading settings...
      </div>
    );
  }
  if (!appSettings.settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {appSettings.settingsError ?? "Failed to load settings."}
      </div>
    );
  }

  const {
    settings,
    settingsOpen,
    setSettingsOpen,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting,
    updateObjectBenchSplitRatioSetting
  } = appSettings as LoadedAppSettings;

  return (
    <AppContent
      settings={settings}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      handleSettingsChange={handleSettingsChange}
      updateUmlSplitRatioSetting={updateUmlSplitRatioSetting}
      updateConsoleSplitRatioSetting={updateConsoleSplitRatioSetting}
      updateObjectBenchSplitRatioSetting={updateObjectBenchSplitRatioSetting}
    />
  );
}

function AppContent({
  settings,
  settingsOpen,
  setSettingsOpen,
  handleSettingsChange,
  updateUmlSplitRatioSetting,
  updateConsoleSplitRatioSetting,
  updateObjectBenchSplitRatioSetting
}: LoadedAppSettings) {
  const {
    projectPath,
    projectStorageMode,
    packedArchivePath,
    status,
    busy,
    compileStatus,
    diagramLayoutDirty,
    packedArchiveSyncFailed,
    setProjectPath,
    setProjectStorageMode,
    setPackedArchivePath,
    setStatus,
    setBusy,
    setCompileStatus,
    setDiagramLayoutDirty,
    setPackedArchiveSyncFailed
  } = useProjectSessionState();
  const [tree, setTree] = useState<FileNode | null>(null);
  const [umlGraph, setUmlGraph] = useState<UmlGraph | null>(null);
  const [diagramState, setDiagramState] = useState<DiagramState | null>(null);
  const [diagramPath, setDiagramPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addConstructorOpen, setAddConstructorOpen] = useState(false);
  const [addMethodOpen, setAddMethodOpen] = useState(false);
  const [createObjectOpen, setCreateObjectOpen] = useState(false);
  const [createObjectTarget, setCreateObjectTarget] = useState<UmlNode | null>(null);
  const [createObjectConstructor, setCreateObjectConstructor] = useState<UmlConstructor | null>(
    null
  );
  const [callMethodOpen, setCallMethodOpen] = useState(false);
  const [callMethodTarget, setCallMethodTarget] = useState<ObjectInstance | null>(null);
  const [callMethodInfo, setCallMethodInfo] = useState<UmlMethod | null>(null);
  const [methodReturnOpen, setMethodReturnOpen] = useState(false);
  const [methodReturnValue, setMethodReturnValue] = useState<string | null>(null);
  const [methodReturnLabel, setMethodReturnLabel] = useState("");
  const [leftPanelViewMode, setLeftPanelViewMode] = useState<DiagramViewMode>("uml");
  const [editorCaret, setEditorCaret] = useState<{ lineNumber: number; column: number } | null>(
    null
  );
  const [objectBench, setObjectBench] = useState<ObjectInstance[]>([]);
  const [jshellReady, setJshellReady] = useState(false);
  const [removeClassOpen, setRemoveClassOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UmlNode | null>(null);
  const [confirmProjectActionOpen, setConfirmProjectActionOpen] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<
    "open" | "openFolder" | "new" | "exit" | null
  >(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [fieldTarget, setFieldTarget] = useState<UmlNode | null>(null);
  const [constructorTarget, setConstructorTarget] = useState<UmlNode | null>(null);
  const [methodTarget, setMethodTarget] = useState<UmlNode | null>(null);
  const debugLogging = settings.advanced.debugLogging;
  const structogramColorsEnabled = settings.advanced.structogramColors;
  const structogramLoopHeaderColor = settings.structogram.loopHeaderColor;
  const structogramIfHeaderColor = settings.structogram.ifHeaderColor;
  const structogramSwitchHeaderColor = settings.structogram.switchHeaderColor;
  const structogramTryWrapperColor = settings.structogram.tryWrapperColor;
  const codeHighlightEnabled = settings.uml.codeHighlight;
  const showDependencies = settings.uml.showDependencies;
  const showPackages = settings.uml.showPackages;
  const fontSize = settings.general.fontSize;
  const showPrivateObjectFields =
    settings.objectBench.showPrivateObjectFields;
  const showInheritedObjectFields =
    settings.objectBench.showInheritedObjectFields;
  const showStaticObjectFields =
    settings.objectBench.showStaticObjectFields;
  const showSwingAttributes = settings.uml.showSwingAttributes;
  const wordWrap = settings.editor.wordWrap;
  const {
    containerRef,
    consoleContainerRef,
    splitRatio,
    consoleSplitRatio,
    startUmlResize,
    startConsoleResize
  } = useSplitRatios({
    umlSplitRatio: settings.layout.umlSplitRatio,
    consoleSplitRatio: settings.layout.consoleSplitRatio,
    onCommitUmlSplitRatio: updateUmlSplitRatioSetting,
    onCommitConsoleSplitRatio: updateConsoleSplitRatioSetting
  });
  const {
    containerRef: benchContainerRef,
    splitRatio: objectBenchSplitRatio,
    startResize: startBenchResize
  } = useVerticalSplit({
    ratio: settings.layout.objectBenchSplitRatio,
    onCommit: updateObjectBenchSplitRatioSetting,
    minTop: UML_DIAGRAM_MIN_HEIGHT_PX
  });
  const openFilePath = openFile?.path ?? null;
  const canUseStructogramMode = Boolean(
    openFilePath && openFilePath.toLowerCase().endsWith(".java")
  );
  const defaultTitle = "Unimozer Next";
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const pendingRevealRef = useRef<{
    path: string;
    line: number;
    column: number;
    durationSeconds: number;
    requestedAtMs: number;
  } | null>(null);
  const umlSignatureRef = useRef<string>("");
  const lastCompileOutDirRef = useRef<string | null>(null);
  const lastCompileStatusRef = useRef<"success" | "failed" | null>(null);
  const requestProjectActionRef = useRef<
    (action: "open" | "openFolder" | "new" | "exit") => void
  >(() => undefined);
  const zoomControlsRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  } | null>(null);
  const exportControlsRef = useRef<ExportControls | null>(null);
  const structogramExportControlsRef = useRef<StructogramExportControls | null>(null);
  const [hasDiagramExportControls, setHasDiagramExportControls] = useState(false);
  const [hasStructogramExportControls, setHasStructogramExportControls] = useState(false);
  const consoleThemeDefaults = useRef<{ bg: string; fg: string } | null>(null);
  const {
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsClose,
    notifyLsChange,
    notifyLsChangeImmediate,
    resetLsState
  } = useLanguageServer({
    projectPath,
    openFilePath,
    openFileContent: content
  });

  const {
    requestPackedArchiveSync,
    awaitPackedArchiveSync,
    clearPackedArchiveSyncError
  } = usePackedArchiveSync({
    projectStorageMode,
    projectPath,
    packedArchivePath,
    formatStatus,
    trimStatus,
    setStatus,
    setDiagramLayoutDirty,
    setPackedArchiveSyncFailed
  });

  const {
    fileDrafts,
    setFileDrafts,
    updateDraftForPath,
    formatAndSaveUmlFiles,
    hasUnsavedChanges
  } = useDrafts({
    umlGraph,
    openFilePath,
    setContent,
    setLastSavedContent,
    settingsEditor: settings.editor,
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsChangeImmediate,
    notifyLsClose,
    setStatus
  });
  const scratchHasClasses = useMemo(() => hasClassFilesInTree(tree), [tree]);
  const [umlParseDrafts, setUmlParseDrafts] = useState(fileDrafts);

  useEffect(() => {
    if (!projectPath) {
      setUmlParseDrafts({});
      return;
    }
    const timer = window.setTimeout(() => {
      setUmlParseDrafts(fileDrafts);
    }, UML_PARSE_DRAFT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fileDrafts, projectPath]);

  const dirty = useMemo(() => {
    if (!openFile) return false;
    return content !== lastSavedContent;
  }, [content, lastSavedContent, openFile]);
  const selectedNode = useMemo(() => {
    if (!selectedClassId) return null;
    return umlGraph?.nodes.find((node) => node.id === selectedClassId) ?? null;
  }, [selectedClassId, umlGraph]);

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform),
    []
  );

  const updateUmlSettings = useCallback(
    (partial: Partial<typeof settings.uml>) => {
      handleSettingsChange({
        ...settings,
        uml: {
          ...settings.uml,
          ...partial
        }
      });
    },
    [handleSettingsChange, settings]
  );

  const updateObjectBenchSettings = useCallback(
    (partial: Partial<typeof settings.objectBench>) => {
      handleSettingsChange({
        ...settings,
        objectBench: {
          ...settings.objectBench,
          ...partial
        }
      });
    },
    [handleSettingsChange, settings]
  );

  const triggerEditorAction = useCallback((actionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("menu", actionId, null);
  }, []);

  const applyPendingReveal = useCallback(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    const expiresAtMs = pending.requestedAtMs + pending.durationSeconds * 1000;
    if (Date.now() > expiresAtMs) {
      pendingRevealRef.current = null;
      return;
    }
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const modelPath = model.uri?.fsPath ?? "";
    if (modelPath && modelPath.toLowerCase() !== pending.path.toLowerCase()) return;
    const maxLine = model.getLineCount();
    const line = Math.min(Math.max(pending.line, 1), maxLine);
    const maxColumn = model.getLineMaxColumn(line);
    const column = Math.min(Math.max(pending.column, 1), maxColumn);
    editor.setPosition({ lineNumber: line, column });
    editor.revealPositionInCenter({ lineNumber: line, column });
    editor.focus();
    pendingRevealRef.current = null;
  }, [monacoRef]);

  const clearPendingReveal = useCallback(() => {
    pendingRevealRef.current = null;
  }, []);

  const handlePaste = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    let text = "";
    try {
      text = await readText();
    } catch {
      text = "";
    }
    if (text.length > 0) {
      const model = editor.getModel();
      if (!model) return;
      const selections = editor.getSelections() ?? [];
      const edits = (selections.length ? selections : [editor.getSelection()])
        .filter(Boolean)
        .map((selection) => ({
          range: selection!,
          text,
          forceMoveMarkers: true
        }));
      if (edits.length) {
        editor.executeEdits("clipboard", edits);
        return;
      }
    }
    editor.trigger("menu", "editor.action.clipboardPasteAction", null);
  }, []);

  const handleExit = useWindowCloseGuard({
    awaitBeforeExit: awaitPackedArchiveSync,
    onCloseRequested: () => requestProjectActionRef.current("exit")
  });

  const handleMenuAddClass = useCallback(() => {
    setAddClassOpen(true);
  }, []);

  const handleMenuAddConstructor = useCallback(() => {
    if (selectedNode) {
      setConstructorTarget(selectedNode);
      setAddConstructorOpen(true);
    }
  }, [selectedNode]);

  const handleMenuAddField = useCallback(() => {
    if (selectedNode) {
      setFieldTarget(selectedNode);
      setAddFieldOpen(true);
    }
  }, [selectedNode]);

  const handleMenuAddMethod = useCallback(() => {
    if (selectedNode) {
      setMethodTarget(selectedNode);
      setAddMethodOpen(true);
    }
  }, [selectedNode]);
  const handleAddFieldOpenChange = useCallback((open: boolean) => {
    setAddFieldOpen(open);
    if (!open) {
      setFieldTarget(null);
    }
  }, []);
  const handleAddConstructorOpenChange = useCallback((open: boolean) => {
    setAddConstructorOpen(open);
    if (!open) {
      setConstructorTarget(null);
    }
  }, []);
  const handleAddMethodOpenChange = useCallback((open: boolean) => {
    setAddMethodOpen(open);
    if (!open) {
      setMethodTarget(null);
    }
  }, []);
  const handleCreateObjectOpenChange = useCallback((open: boolean) => {
    setCreateObjectOpen(open);
    if (!open) {
      setCreateObjectTarget(null);
      setCreateObjectConstructor(null);
    }
  }, []);
  const handleCallMethodOpenChange = useCallback((open: boolean) => {
    setCallMethodOpen(open);
    if (!open) {
      setCallMethodTarget(null);
      setCallMethodInfo(null);
    }
  }, []);
  const handleMethodReturnOpenChange = useCallback((open: boolean) => {
    setMethodReturnOpen(open);
    if (!open) {
      setMethodReturnValue(null);
      setMethodReturnLabel("");
    }
  }, []);

  useEffect(() => {
    if (!openFile) {
      editorRef.current = null;
    }
  }, [openFile]);

  useEffect(() => {
    if (!canUseStructogramMode && leftPanelViewMode === "structogram") {
      setLeftPanelViewMode("uml");
    }
  }, [canUseStructogramMode, leftPanelViewMode]);

  useEffect(() => {
    if (selectedClassId && !selectedNode) {
      setSelectedClassId(null);
    }
  }, [selectedClassId, selectedNode]);

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

  useEffect(() => {
    if (!projectPath) {
      setObjectBench([]);
      setJshellReady(false);
      void jshellStop();
      return;
    }
    return () => {
      void jshellStop();
      setObjectBench([]);
      setJshellReady(false);
    };
  }, [projectPath]);

  useEffect(() => {
    const signature = getUmlSignature(umlGraph);
    if (!signature) {
      umlSignatureRef.current = "";
      setObjectBench([]);
      return;
    }
    if (signature !== umlSignatureRef.current) {
      umlSignatureRef.current = signature;
      setObjectBench([]);
    }
  }, [umlGraph]);

  const handleCompileSuccess = useCallback(
    async (outDir: string) => {
      if (!projectPath) return;
      lastCompileOutDirRef.current = outDir;
      requestPackedArchiveSync();
      try {
        await jshellStop();
      } catch {
        // Ignore failures when restarting JShell.
      }
      try {
        await jshellStart(projectPath, outDir);
        setJshellReady(true);
        setObjectBench([]);
      } catch (error) {
        setJshellReady(false);
        setStatus(`JShell failed to start: ${trimStatus(formatStatus(error))}`);
      }
    },
    [projectPath, requestPackedArchiveSync, setStatus]
  );

  const {
    consoleOutput,
    runSessionId,
    appendConsoleOutput,
    resetConsoleOutput,
    handleCompileProject,
    handleCompileClass,
    handleRunMain,
    handleCancelRun
  } = useRunConsole({
    projectPath,
    fileDrafts,
    compileStatus,
    setCompileStatus,
    formatAndSaveUmlFiles,
    setBusy,
    setStatus,
    formatStatus,
    onCompileSuccess: handleCompileSuccess,
    onCompileRequested: () => setObjectBench([])
  });

  const clearConsole = useCallback(() => {
    resetConsoleOutput();
  }, [resetConsoleOutput]);

  const handleMenuCompileProject = useCallback(() => {
    void handleCompileProject();
  }, [handleCompileProject]);

  useEffect(() => {
    if (compileStatus !== "success") {
      setJshellReady(false);
    }
    if (lastCompileStatusRef.current === "success" && compileStatus !== "success") {
      setObjectBench([]);
    }
    lastCompileStatusRef.current = compileStatus;
  }, [compileStatus]);

  const appendDebugOutput = useCallback(
    (text: string) => {
      if (!debugLogging) return;
      appendConsoleOutput(text);
    },
    [appendConsoleOutput, debugLogging]
  );

  const handleExportStatus = useCallback(
    (message: string) => {
      setStatus(message);
      const lowered = message.toLowerCase();
      if (lowered.startsWith("failed") || lowered.includes("failed")) {
        toast.error(message);
      } else {
        toast.success(message);
      }
    },
    [setStatus]
  );

  const handleCopyDiagramPng = useCallback(
    (style: ExportStyle) => {
      exportControlsRef.current?.copyDiagramPng(style);
    },
    []
  );

  const handleExportDiagramPng = useCallback(
    (style: ExportStyle) => {
      exportControlsRef.current?.exportDiagramPng(style);
    },
    []
  );

  const handleCopyStructogramPng = useCallback(() => {
    structogramExportControlsRef.current?.copyStructogramPng();
  }, []);

  const handleExportStructogramPng = useCallback(() => {
    structogramExportControlsRef.current?.exportStructogramPng();
  }, []);

  useEffect(() => {
    if (!debugLogging) return;
    let active = true;
    const loadStartupLogs = async () => {
      try {
        const lines = await invoke<string[]>("take_startup_logs");
        if (!active || !lines.length) return;
        lines.forEach((line) => appendConsoleOutput(line));
      } catch {
        // Ignore startup log failures.
      }
    };
    void loadStartupLogs();
    return () => {
      active = false;
    };
  }, [appendConsoleOutput, debugLogging]);

  const { umlStatus, lastGoodGraphRef } = useUmlGraph({
    projectPath,
    projectStorageMode,
    includeStructogramIr: leftPanelViewMode === "structogram",
    tree,
    fileDrafts: umlParseDrafts,
    setUmlGraph,
    onDebugLog: debugLogging ? appendDebugOutput : undefined,
    formatStatus
  });

  const {
    getPublicMethodsForObject,
    handleCreateObject: createObjectWithJshell,
    executeMethodCall
  } = useJshellActions({
    projectPath,
    umlGraph,
    jshellReady,
    setJshellReady,
    objectBench,
    setObjectBench,
    lastCompileOutDirRef,
    appendConsoleOutput,
    resetConsoleOutput,
    appendDebugOutput: debugLogging ? appendDebugOutput : undefined,
    setStatus,
    setBusy,
    formatStatus,
    trimStatus
  });

  const beforeProjectSwitch = useCallback(async () => {
    await awaitPackedArchiveSync();
    await Promise.allSettled([
      invoke("cancel_run"),
      jshellStop(),
      invoke("ls_stop")
    ]);
    setJshellReady(false);
    setObjectBench([]);
  }, [awaitPackedArchiveSync]);

  const {
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenPackedProjectPath,
    handleNewProject,
    openFileByPath,
    handleSave: saveProject,
    handleSaveAs: saveProjectAs,
    loadDiagramState
  } = useProjectIO({
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
  });

  useLaunchBootstrap({
    projectPath,
    appendDebugOutput,
    handleOpenPackedProjectPath,
    handleNewProject,
    formatStatus,
    trimStatus
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

  const visibleGraph = useMemo(() => {
    if (!umlGraph) return null;
    let nextGraph: UmlGraph = umlGraph;
    if (!showDependencies) {
      nextGraph = {
        ...nextGraph,
        edges: nextGraph.edges.filter((edge) => edge.kind !== "dependency")
      };
    }
    if (!showSwingAttributes) {
      const swingPattern = /\bjavax\.swing\./;
      nextGraph = {
        ...nextGraph,
        nodes: nextGraph.nodes.map((node) => ({
          ...node,
          fields: node.fields.filter((field) => {
            const parts = field.signature.split(":");
            if (parts.length < 2) return true;
            const type = parts.slice(1).join(":").trim();
            return !swingPattern.test(type);
          })
        }))
      };
    }
    return nextGraph;
  }, [umlGraph, showDependencies, showSwingAttributes]);
  const {
    editDisabled,
    zoomDisabled,
    canAddClass,
    canAddField,
    canAddConstructor,
    canAddMethod,
    canCompileClass,
    canExportDiagram,
    canExportStructogram,
    hasPendingProjectChanges
  } = useAppCapabilities({
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
    hasPackedArchiveSyncChanges: projectStorageMode === "packed" && packedArchiveSyncFailed
  });
  const appMenuState = useAppMenuState({
    busy,
    hasPendingProjectChanges,
    projectName,
    isMac,
    editDisabled,
    zoomDisabled,
    canAddClass,
    canAddConstructor,
    canAddField,
    canAddMethod,
    canCompileClass,
    canExportDiagram,
    canExportStructogram,
    showPrivateObjectFields,
    showInheritedObjectFields,
    showStaticObjectFields,
    showDependencies,
    showPackages,
    showSwingAttributes,
    canUseStructogramMode,
    leftPanelViewMode,
    structogramColorsEnabled,
    wordWrap
  });


  const handleContentChange = useCallback((value: string) => {
    if (compileStatus !== null && openFilePath) {
      const baseline =
        fileDrafts[openFilePath]?.lastSavedContent ?? lastSavedContent;
      if (value !== baseline) {
        setCompileStatus(null);
      }
    }
    setContent(value);
    if (openFilePath) {
      updateDraftForPath(openFilePath, value, lastSavedContent);
      notifyLsChange(openFilePath, value);
    }
  }, [
    compileStatus,
    openFilePath,
    fileDrafts,
    lastSavedContent,
    setCompileStatus,
    updateDraftForPath,
    notifyLsChange
  ]);

  useEffect(() => {
    setEditorCaret(null);
  }, [openFilePath]);


  useEffect(() => {
    const window = getCurrentWindow();
    const titleValue =
      projectStorageMode === "scratch"
        ? "Unsaved Project"
        : projectStorageMode === "packed"
          ? packedArchivePath ?? projectPath
          : projectPath;
    const nextTitle = titleValue
      ? `${defaultTitle} - ${toDisplayPath(titleValue)}`
      : defaultTitle;
    window.setTitle(nextTitle).catch(() => undefined);
  }, [packedArchivePath, projectPath, projectStorageMode]);

  useEffect(() => {
    const root = document.documentElement;
    if (!consoleThemeDefaults.current) {
      const styles = getComputedStyle(root);
      consoleThemeDefaults.current = {
        bg: styles.getPropertyValue("--console-bg").trim(),
        fg: styles.getPropertyValue("--console-fg").trim()
      };
    }
    const defaults = consoleThemeDefaults.current;
    if (settings.editor.theme === "default") {
      if (defaults) {
        root.style.setProperty("--console-bg", defaults.bg);
        root.style.setProperty("--console-fg", defaults.fg);
      }
      root.style.removeProperty("--editor-separator-color");
      root.style.removeProperty("--editor-separator-hover");
      return;
    }

    let cancelled = false;
    const applyTheme = async () => {
      const colors = await getThemeColors(settings.editor.theme);
      if (cancelled) return;
      if (!colors || (!colors.background && !colors.foreground)) {
        if (defaults) {
          root.style.setProperty("--console-bg", defaults.bg);
          root.style.setProperty("--console-fg", defaults.fg);
        }
        root.style.removeProperty("--editor-separator-color");
        root.style.removeProperty("--editor-separator-hover");
        return;
      }
      if (colors.background) {
        root.style.setProperty("--console-bg", colors.background);
      }
      if (colors.foreground) {
        root.style.setProperty("--console-fg", colors.foreground);
      }
      const separatorColor =
        colors.lineHighlightBorder ?? colors.lineHighlightBackground ?? null;
      if (separatorColor) {
        root.style.setProperty("--editor-separator-color", separatorColor);
        root.style.setProperty("--editor-separator-hover", separatorColor);
      } else {
        root.style.removeProperty("--editor-separator-color");
        root.style.removeProperty("--editor-separator-hover");
      }
    };
    void applyTheme();
    return () => {
      cancelled = true;
    };
  }, [settings.editor.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--structogram-loop-header", structogramLoopHeaderColor);
    root.style.setProperty("--structogram-if-header", structogramIfHeaderColor);
    root.style.setProperty("--structogram-switch-header", structogramSwitchHeaderColor);
    root.style.setProperty("--structogram-try-wrapper", structogramTryWrapperColor);
  }, [
    structogramIfHeaderColor,
    structogramLoopHeaderColor,
    structogramSwitchHeaderColor,
    structogramTryWrapperColor
  ]);

  useEffect(() => {
    if (!projectPath || !umlGraph) return;
    void loadDiagramState(projectPath, umlGraph);
  }, [projectPath, umlGraph, loadDiagramState]);


  const handleNodePositionChange = (id: string, x: number, y: number, commit: boolean) => {
    let nextToPersist: DiagramState | null = null;
    setDiagramState((prev) => {
      if (!prev) return prev;
      const current = prev.nodes[id];
      const isSamePosition = Boolean(current && current.x === x && current.y === y);
      if (isSamePosition) {
        if (commit) {
          nextToPersist = prev;
        }
        return prev;
      }
      const next = {
        ...prev,
        nodes: {
          ...prev.nodes,
          [id]: { x, y }
        }
      };
      if (commit) {
        nextToPersist = next;
      }
      return next;
    });
    if (!commit || !diagramPath || !nextToPersist) {
      return;
    }
    void invoke("write_text_file", {
      path: diagramPath,
      contents: JSON.stringify(nextToPersist, null, 2)
    })
      .then(() => {
        requestPackedArchiveSync();
      })
      .catch(() => undefined);
  };

  const getNodeById = useCallback(
    (id: string) => umlGraph?.nodes.find((item) => item.id === id) ?? null,
    [umlGraph]
  );

  const queueEditorReveal = useCallback(
    async (
      path: string,
      range: { startLine: number; startColumn: number },
      durationSeconds = UML_REVEAL_REQUEST_TTL_SECONDS
    ) => {
      if (!range?.startLine) return;
      pendingRevealRef.current = {
        path,
        line: range.startLine,
        column: range.startColumn ?? 1,
        durationSeconds,
        requestedAtMs: Date.now()
      };
      appendDebugOutput(
        `[UML] Reveal ${basename(path)} @ ${range.startLine}:${range.startColumn ?? 1}`
      );
      if (openFilePath !== path) {
        await openFileByPath(path);
      }
      applyPendingReveal();
    },
    [appendDebugOutput, applyPendingReveal, openFileByPath, openFilePath]
  );

  const handleNodeSelect = (id: string) => {
    const node = getNodeById(id);
    if (!node) return;
    clearPendingReveal();
    setSelectedClassId(node.id);
    void openFileByPath(node.path);
  };

  const handleFieldSelect = useCallback(
    (field: UmlNode["fields"][number], node: UmlNode) => {
      setSelectedClassId(node.id);
      appendDebugOutput(
        `[UML] Field click ${node.name} :: ${field.signature} (${field.range ? "has range" : "no range"})`
      );
      if (field.range) {
        void queueEditorReveal(node.path, field.range);
      } else {
        clearPendingReveal();
        void openFileByPath(node.path);
      }
    },
    [appendDebugOutput, clearPendingReveal, openFileByPath, queueEditorReveal]
  );

  const handleMethodSelect = useCallback(
    (method: UmlNode["methods"][number], node: UmlNode) => {
      setSelectedClassId(node.id);
      appendDebugOutput(
        `[UML] Method click ${node.name} :: ${method.signature} (${method.range ? "has range" : "no range"})`
      );
      if (method.range) {
        void queueEditorReveal(node.path, method.range);
      } else {
        clearPendingReveal();
        void openFileByPath(node.path);
      }
    },
    [appendDebugOutput, clearPendingReveal, openFileByPath, queueEditorReveal]
  );

  const handleRemoveClass = useCallback(
    async (node: UmlNode) => {
      if (!projectPath) {
        setStatus("Open a project before removing a class.");
        return;
      }
      setBusy(true);
      try {
        const name = basename(node.path);
        await invoke("remove_text_file", { path: node.path });
        notifyLsClose(node.path);
        const monaco = monacoRef.current;
        if (monaco) {
          const uri = toFileUri(node.path);
          const model = monaco.editor.getModel(monaco.Uri.parse(uri));
          if (model) {
            model.dispose();
          }
        }
        const nextTree = await invoke<FileNode>("list_project_tree", { root: projectPath });
        setTree(nextTree);
        if (openFilePath && openFilePath === node.path) {
          setOpenFile(null);
          setContent("");
          setLastSavedContent("");
        }
        setFileDrafts((prev) => {
          const next = { ...prev };
          delete next[node.path];
          return next;
        });
        setCompileStatus(null);
        setStatus(`Removed ${name}`);
        if (selectedClassId === node.id) {
          setSelectedClassId(null);
        }
      } catch (error) {
        setStatus(`Failed to remove class: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      openFilePath,
      projectPath,
      selectedClassId,
      notifyLsClose,
      monacoRef,
      setBusy,
      setCompileStatus,
      setContent,
      setFileDrafts,
      setLastSavedContent,
      setOpenFile,
      setStatus,
      setTree
    ]
  );

  const requestRemoveClass = useCallback((node: UmlNode) => {
    setRemoveTarget(node);
    setRemoveClassOpen(true);
  }, []);

  const confirmRemoveClass = useCallback(async () => {
    if (!removeTarget) return;
    setRemoveClassOpen(false);
    await handleRemoveClass(removeTarget);
    setRemoveTarget(null);
  }, [handleRemoveClass, removeTarget]);

  const runProjectAction = useCallback(
    (action: "open" | "openFolder" | "new" | "exit") => {
      if (action === "open") {
        void handleOpenProject();
      } else if (action === "openFolder") {
        void handleOpenFolderProject();
      } else if (action === "exit") {
        handleExit();
      } else {
        void handleNewProject();
      }
    },
    [handleExit, handleNewProject, handleOpenFolderProject, handleOpenProject]
  );

  const requestProjectAction = useCallback(
    (action: "open" | "openFolder" | "new" | "exit") => {
      if (!hasPendingProjectChanges) {
        runProjectAction(action);
        return;
      }
      setPendingProjectAction(action);
      setConfirmProjectActionOpen(true);
    },
    [hasPendingProjectChanges, runProjectAction]
  );

  useEffect(() => {
    requestProjectActionRef.current = requestProjectAction;
  }, [requestProjectAction]);

  const confirmProjectAction = useCallback(() => {
    const action = pendingProjectAction;
    setConfirmProjectActionOpen(false);
    setPendingProjectAction(null);
    if (action) {
      runProjectAction(action);
    }
  }, [pendingProjectAction, runProjectAction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        if (!busy) {
          requestProjectAction("open");
        }
        return;
      }
      if (key === "n") {
        event.preventDefault();
        if (!busy) {
          requestProjectAction("new");
        }
        return;
      }
      if (key === "s") {
        event.preventDefault();
        if (busy || !projectPath) return;
        void handleSave();
        return;
      }
      if (key === "+" || key === "=") {
        event.preventDefault();
        zoomControlsRef.current?.zoomIn();
        return;
      }
      if (key === "-" || key === "_") {
        event.preventDefault();
        zoomControlsRef.current?.zoomOut();
        return;
      }
      if (key === "0") {
        event.preventDefault();
        zoomControlsRef.current?.resetZoom();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, handleSave, projectPath, requestProjectAction]);

  const handleOpenAddField = useCallback((node: UmlNode) => {
    setSelectedClassId(node.id);
    setFieldTarget(node);
    setAddFieldOpen(true);
  }, []);

  const handleOpenAddConstructor = useCallback((node: UmlNode) => {
    setSelectedClassId(node.id);
    setConstructorTarget(node);
    setAddConstructorOpen(true);
  }, []);

  const handleOpenAddMethod = useCallback((node: UmlNode) => {
    setSelectedClassId(node.id);
    setMethodTarget(node);
    setAddMethodOpen(true);
  }, []);

  const handleOpenCreateObject = useCallback(
    (node: UmlNode, constructor: UmlConstructor) => {
      if (!jshellReady) {
        setStatus("Compile the project before creating objects.");
        return;
      }
      setSelectedClassId(node.id);
      setCreateObjectTarget(node);
      setCreateObjectConstructor(constructor);
      setCreateObjectOpen(true);
    },
    [jshellReady, setStatus]
  );

  const handleOpenCallMethod = useCallback(
    (object: ObjectInstance, method: UmlMethod) => {
      if (!jshellReady) {
        setStatus("Compile the project before calling methods.");
        return;
      }
      const params = method.params ?? [];
      if (params.length === 0) {
        void executeMethodCall({
          target: object,
          method,
          paramValues: [],
          onReturn: (label, value) => {
            setMethodReturnLabel(label);
            setMethodReturnValue(value);
            setMethodReturnOpen(true);
          }
        });
        return;
      }
      setCallMethodTarget(object);
      setCallMethodInfo(method);
      setCallMethodOpen(true);
    },
    [executeMethodCall, jshellReady, setStatus]
  );

  const handleCreateClass = useCallback(
    async (form: AddClassForm) => {
      if (!projectPath) {
        setStatus("Open a project before creating a class.");
        return;
      }

      const name = form.name.trim().replace(/\.java$/i, "");
      if (!name) {
        setStatus("Class name is required.");
        return;
      }

      const srcRoot = joinPath(projectPath, "src");
      const separator = projectPath.includes("\\") ? "\\" : "/";
      const packageName = form.packageName.trim();
      const packagePath = packageName ? packageName.split(".").join(separator) : "";
      const dirPath = packagePath ? joinPath(srcRoot, packagePath) : srcRoot;
      const filePath = joinPath(dirPath, `${name}.java`);
      const source = buildClassSource(form);

      setBusy(true);
      try {
        try {
          await invoke<string>("read_text_file", { path: filePath });
          setStatus(`Class already exists: ${name}.java`);
          return;
        } catch {
          // File does not exist, continue.
        }

        await invoke("write_text_file", { path: filePath, contents: source });
        const nextTree = await invoke<FileNode>("list_project_tree", { root: projectPath });
        setTree(nextTree);
        setCompileStatus(null);
        clearPendingReveal();
        await openFileByPath(filePath);
        updateDraftForPath(filePath, source, "");
        setContent(source);
        setLastSavedContent("");
        setStatus(`Created ${name}.java`);
      } catch (error) {
        setStatus(`Failed to create class: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      projectPath,
      setStatus,
      setBusy,
      clearPendingReveal,
      openFileByPath,
      setTree,
      setCompileStatus,
      updateDraftForPath
    ]
  );

  const handleCreateField = useCallback(
    async (form: AddFieldForm) => {
      const target = fieldTarget ?? selectedNode;
      if (!projectPath) {
        setStatus("Open a project before adding a field.");
        return;
      }
      if (!target) {
        setStatus("Select a class before adding a field.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[target.path];
        const originalContent = existingDraft
          ? existingDraft.content
          : await invoke<string>("read_text_file", { path: target.path });
        const savedBaseline = existingDraft?.lastSavedContent ?? originalContent;
        const payload = {
          action: "addField",
          path: target.path,
          classId: target.id,
          content: originalContent,
          field: {
            name: form.name.trim(),
            fieldType: form.type.trim(),
            visibility: form.visibility,
            isStatic: form.isStatic,
            isFinal: form.isFinal,
            initialValue: form.initialValue.trim()
          },
          includeGetter: form.includeGetter,
          includeSetter: form.includeSetter,
          useParamPrefix: form.useParamPrefix,
          includeJavadoc: form.includeJavadoc
        };

        const updated = await invoke<string>("add_field_to_class", { request: payload });
        updateDraftForPath(target.path, updated, savedBaseline);
        if (openFilePath === target.path) {
          setContent(updated);
          setLastSavedContent(savedBaseline);
          notifyLsChangeImmediate(target.path, updated);
        } else {
          setOpenFile({ name: basename(target.path), path: target.path });
          setContent(updated);
          setLastSavedContent(savedBaseline);
          notifyLsOpen(target.path, updated);
        }
        setCompileStatus(null);
        setStatus(`Added field to ${basename(target.path)}`);
      } catch (error) {
        setStatus(`Failed to add field: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      fieldTarget,
      selectedNode,
      projectPath,
      fileDrafts,
      openFilePath,
      notifyLsChangeImmediate,
      notifyLsOpen,
      setBusy,
      setCompileStatus,
      setContent,
      setLastSavedContent,
      setOpenFile,
      setStatus,
      updateDraftForPath
    ]
  );

  const handleCreateConstructor = useCallback(
    async (form: AddConstructorForm) => {
      const target = constructorTarget ?? selectedNode;
      if (!projectPath) {
        setStatus("Open a project before adding a constructor.");
        return;
      }
      if (!target) {
        setStatus("Select a class before adding a constructor.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[target.path];
        const originalContent = existingDraft
          ? existingDraft.content
          : await invoke<string>("read_text_file", { path: target.path });
        const savedBaseline = existingDraft?.lastSavedContent ?? originalContent;
        const payload = {
          action: "addConstructor",
          path: target.path,
          classId: target.id,
          content: originalContent,
          params: form.params.map((param) => ({
            name: param.name.trim(),
            paramType: param.type.trim()
          })),
          includeJavadoc: form.includeJavadoc
        };

        const updated = await invoke<string>("add_constructor_to_class", { request: payload });
        updateDraftForPath(target.path, updated, savedBaseline);
        if (openFilePath === target.path) {
          setContent(updated);
          setLastSavedContent(savedBaseline);
          notifyLsChangeImmediate(target.path, updated);
        } else {
          setOpenFile({ name: basename(target.path), path: target.path });
          setContent(updated);
          setLastSavedContent(savedBaseline);
          notifyLsOpen(target.path, updated);
        }
        setCompileStatus(null);
        setStatus(`Added constructor to ${basename(target.path)}`);
      } catch (error) {
        setStatus(`Failed to add constructor: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      constructorTarget,
      selectedNode,
      projectPath,
      fileDrafts,
      openFilePath,
      notifyLsChangeImmediate,
      notifyLsOpen,
      setBusy,
      setCompileStatus,
      setContent,
      setLastSavedContent,
      setOpenFile,
      setStatus,
      updateDraftForPath
    ]
  );

  const handleCreateMethod = useCallback(
    async (form: AddMethodForm) => {
      const target = methodTarget ?? selectedNode;
      if (!projectPath) {
        setStatus("Open a project before adding a method.");
        return;
      }
      if (!target) {
        setStatus("Select a class before adding a method.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[target.path];
        const originalContent = existingDraft
          ? existingDraft.content
          : await invoke<string>("read_text_file", { path: target.path });
        const savedBaseline = existingDraft?.lastSavedContent ?? originalContent;
        const payload = {
          action: "addMethod",
          path: target.path,
          classId: target.id,
          content: originalContent,
          method: {
            name: form.name.trim(),
            returnType: form.returnType.trim(),
            visibility: form.visibility,
            isStatic: form.isStatic,
            isAbstract: form.isAbstract,
            includeJavadoc: form.includeJavadoc
          },
          params: form.params.map((param) => ({
            name: param.name.trim(),
            paramType: param.type.trim()
          }))
        };

        const updated = await invoke<string>("add_method_to_class", { request: payload });
        updateDraftForPath(target.path, updated, savedBaseline);
        if (openFilePath === target.path) {
          setContent(updated);
          setLastSavedContent(savedBaseline);
          notifyLsChangeImmediate(target.path, updated);
        } else {
          setOpenFile({ name: basename(target.path), path: target.path });
          setContent(updated);
          setLastSavedContent(savedBaseline);
          notifyLsOpen(target.path, updated);
        }
        setCompileStatus(null);
        setStatus(`Added method to ${basename(target.path)}`);
      } catch (error) {
        setStatus(`Failed to add method: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      methodTarget,
      selectedNode,
      projectPath,
      fileDrafts,
      openFilePath,
      notifyLsChangeImmediate,
      notifyLsOpen,
      setBusy,
      setCompileStatus,
      setContent,
      setLastSavedContent,
      setOpenFile,
      setStatus,
      updateDraftForPath
    ]
  );

  const handleCreateObject = useCallback(
    async (form: CreateObjectForm) => {
      const target = createObjectTarget;
      const constructor = createObjectConstructor;
      if (!target || !constructor) {
        setStatus("Select a constructor before creating an object.");
        return;
      }
      await createObjectWithJshell({ form, target, constructor });
    },
    [createObjectConstructor, createObjectTarget, createObjectWithJshell, setStatus]
  );

  const handleCallMethod = useCallback(
    async (form: CallMethodForm) => {
      const target = callMethodTarget;
      const method = callMethodInfo;
      if (!target || !method) {
        setStatus("Select a method before calling it.");
        return;
      }
      await executeMethodCall({
        target,
        method,
        paramValues: form.paramValues,
        onReturn: (label, value) => {
          setMethodReturnLabel(label);
          setMethodReturnValue(value);
          setMethodReturnOpen(true);
        }
      });
    },
    [callMethodInfo, callMethodTarget, executeMethodCall, setStatus]
  );

  const handleRemoveObject = useCallback((object: ObjectInstance) => {
    setObjectBench((prev) => prev.filter((item) => item.name !== object.name));
    setStatus(`Removed ${object.name}.`);
  }, [setStatus]);

  return (
    <div className="flex h-full flex-col">
      <AppMenu
        {...appMenuState}
        onRequestNewProject={() => requestProjectAction("new")}
        onRequestOpenProject={() => requestProjectAction("open")}
        onRequestOpenFolderProject={() => requestProjectAction("openFolder")}
        onSave={() => {
          void handleSave();
        }}
        onSaveAs={() => {
          void handleSaveAs();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onExit={() => requestProjectAction("exit")}
        onUndo={() => triggerEditorAction("undo")}
        onRedo={() => triggerEditorAction("redo")}
        onCut={() => triggerEditorAction("editor.action.clipboardCutAction")}
        onCopy={() => triggerEditorAction("editor.action.clipboardCopyAction")}
        onPaste={() => {
          void handlePaste();
        }}
        onZoomIn={() => zoomControlsRef.current?.zoomIn()}
        onZoomOut={() => zoomControlsRef.current?.zoomOut()}
        onZoomReset={() => zoomControlsRef.current?.resetZoom()}
        onToggleShowPrivate={(value) =>
          updateObjectBenchSettings({ showPrivateObjectFields: value })
        }
        onToggleShowInherited={(value) =>
          updateObjectBenchSettings({ showInheritedObjectFields: value })
        }
        onToggleShowStatic={(value) =>
          updateObjectBenchSettings({ showStaticObjectFields: value })
        }
        onToggleShowDependencies={(value) =>
          updateUmlSettings({ showDependencies: value })
        }
        onToggleShowPackages={(value) =>
          updateUmlSettings({ showPackages: value })
        }
        onToggleShowSwingAttributes={(value) =>
          updateUmlSettings({ showSwingAttributes: value })
        }
        onToggleStructogramMode={(value) => {
          setLeftPanelViewMode(value ? "structogram" : "uml");
        }}
        onToggleStructogramColors={(value) =>
          handleSettingsChange({
            ...settings,
            advanced: {
              ...settings.advanced,
              structogramColors: value
            }
          })
        }
        onToggleWordWrap={(value) =>
          handleSettingsChange({
            ...settings,
            editor: {
              ...settings.editor,
              wordWrap: value
            }
          })
        }
        onAddClass={handleMenuAddClass}
        onAddConstructor={handleMenuAddConstructor}
        onAddField={handleMenuAddField}
        onAddMethod={handleMenuAddMethod}
        onCompileClass={handleMenuCompileProject}
        onCopyDiagramPng={handleCopyDiagramPng}
        onExportDiagramPng={handleExportDiagramPng}
        onCopyStructogramPng={handleCopyStructogramPng}
        onExportStructogramPng={handleExportStructogramPng}
      />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col bg-background">
          <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
            <div
              className="h-full min-w-0 overflow-hidden"
              style={{ width: `${splitRatio * 100}%` }}
            >
                <ObjectBenchSection
                  benchContainerRef={benchContainerRef}
                  objectBenchSplitRatio={objectBenchSplitRatio}
                  startBenchResize={startBenchResize}
                  graph={visibleGraph}
                  diagram={diagramState}
                  compiled={compileStatus === "success"}
                  backgroundColor={settings.uml.panelBackground}
                  showPackages={showPackages}
                  fontSize={fontSize}
                  structogramColorsEnabled={structogramColorsEnabled}
                  exportDefaultPath={exportDefaultPath}
                  onExportStatus={handleExportStatus}
                  onNodePositionChange={handleNodePositionChange}
                  onNodeSelect={handleNodeSelect}
                  onCompileProject={canCompileClass ? handleMenuCompileProject : undefined}
                  onCompileClass={handleCompileClass}
                  onRunMain={handleRunMain}
                  onCreateObject={handleOpenCreateObject}
                  onRemoveClass={requestRemoveClass}
                  onAddField={handleOpenAddField}
                  onAddConstructor={handleOpenAddConstructor}
                  onAddMethod={handleOpenAddMethod}
                  onFieldSelect={codeHighlightEnabled ? handleFieldSelect : undefined}
                  onMethodSelect={codeHighlightEnabled ? handleMethodSelect : undefined}
                  onRegisterZoom={(controls) => {
                    zoomControlsRef.current = controls;
                  }}
                  onRegisterExport={(controls) => {
                    exportControlsRef.current = controls;
                    setHasDiagramExportControls(Boolean(controls));
                  }}
                  onRegisterStructogramExport={(controls) => {
                    structogramExportControlsRef.current = controls;
                    setHasStructogramExportControls(Boolean(controls));
                  }}
                  onAddClass={canAddClass ? () => setAddClassOpen(true) : undefined}
                  viewMode={leftPanelViewMode}
                  activeFilePath={openFilePath}
                  caretLineNumber={editorCaret?.lineNumber ?? null}
                  onDebugLog={debugLogging ? appendDebugOutput : undefined}
                objectBench={objectBench}
                showPrivate={showPrivateObjectFields}
                showInherited={showInheritedObjectFields}
                showStatic={showStaticObjectFields}
                getMethodsForObject={getPublicMethodsForObject}
                onCallMethod={handleOpenCallMethod}
                onRemoveObject={handleRemoveObject}
              />
            </div>

            <SplitHandle
              orientation="vertical"
              positionPercent={splitRatio * 100}
              ariaLabel="Resize information panel"
              onPointerDown={startUmlResize}
            />

            <section className="flex min-w-0 flex-1 flex-col">
              <div
                ref={consoleContainerRef}
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div
                  className="flex-none overflow-hidden"
                  style={{
                    height: `${consoleSplitRatio * 100}%`,
                    minHeight: `${EDITOR_MIN_HEIGHT_PX}px`
                  }}
                >
                    <CodePanel
                      openFile={openFile}
                      fileUri={openFilePath ? toFileUri(openFilePath) : null}
                      content={content}
                      dirty={dirty}
                      fontSize={fontSize}
                      theme={settings.editor.theme}
                      tabSize={settings.editor.tabSize}
                      insertSpaces={settings.editor.insertSpaces}
                      autoCloseBrackets={settings.editor.autoCloseBrackets}
                      autoCloseQuotes={settings.editor.autoCloseQuotes}
                      autoCloseComments={settings.editor.autoCloseComments}
                      wordWrap={settings.editor.wordWrap}
                      onChange={handleContentChange}
                      debugLogging={debugLogging}
                      onDebugLog={debugLogging ? appendDebugOutput : undefined}
                      onEditorMount={(editor) => {
                        editorRef.current = editor;
                        applyPendingReveal();
                      }}
                      onCaretChange={(position) => {
                        setEditorCaret(position);
                      }}
                    />
                </div>
                <SplitHandle
                  orientation="horizontal"
                  positionPercent={consoleSplitRatio * 100}
                  ariaLabel="Resize console panel"
                  onPointerDown={startConsoleResize}
                />
                <div
                  className="flex-1 overflow-hidden"
                  style={{ minHeight: `${CONSOLE_MIN_HEIGHT_PX}px` }}
                >
                  <ConsolePanel
                    output={consoleOutput}
                    fontSize={fontSize}
                    running={runSessionId !== null}
                    onStop={handleCancelRun}
                  />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        {status}
        {umlStatus ? ` • ${umlStatus}` : ""}
      </footer>

      <AppDialogs
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        addClassOpen={addClassOpen}
        onAddClassOpenChange={setAddClassOpen}
        onCreateClass={handleCreateClass}
        addFieldOpen={addFieldOpen}
        onAddFieldOpenChange={handleAddFieldOpenChange}
        onCreateField={handleCreateField}
        addConstructorOpen={addConstructorOpen}
        onAddConstructorOpenChange={handleAddConstructorOpenChange}
        addConstructorClassName={constructorTarget?.name ?? selectedNode?.name}
        onCreateConstructor={handleCreateConstructor}
        addMethodOpen={addMethodOpen}
        onAddMethodOpenChange={handleAddMethodOpenChange}
        addMethodClassName={methodTarget?.name ?? selectedNode?.name}
        onCreateMethod={handleCreateMethod}
        createObjectOpen={createObjectOpen}
        onCreateObjectOpenChange={handleCreateObjectOpenChange}
        onCreateObject={handleCreateObject}
        createObjectClassName={createObjectTarget?.name ?? selectedNode?.name ?? ""}
        createObjectConstructorLabel={createObjectConstructor?.signature ?? ""}
        createObjectParams={createObjectConstructor?.params ?? []}
        existingObjectNames={objectBench.map((item) => item.name)}
        callMethodOpen={callMethodOpen}
        onCallMethodOpenChange={handleCallMethodOpenChange}
        onCallMethod={handleCallMethod}
        callMethodObjectName={callMethodTarget?.name ?? ""}
        callMethodLabel={callMethodInfo?.signature ?? ""}
        callMethodParams={callMethodInfo?.params ?? []}
        removeClassOpen={removeClassOpen}
        onRemoveClassOpenChange={(open) => {
          setRemoveClassOpen(open);
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        removeTargetName={removeTarget?.name ?? null}
        onConfirmRemoveClass={() => {
          void confirmRemoveClass();
        }}
        confirmProjectActionOpen={confirmProjectActionOpen}
        onConfirmProjectActionOpenChange={(open) => {
          setConfirmProjectActionOpen(open);
          if (!open) {
            setPendingProjectAction(null);
          }
        }}
        canConfirmProjectAction={Boolean(pendingProjectAction)}
        onConfirmProjectAction={confirmProjectAction}
        methodReturnOpen={methodReturnOpen}
        onMethodReturnOpenChange={handleMethodReturnOpenChange}
        methodReturnLabel={methodReturnLabel}
        methodReturnValue={methodReturnValue}
        busy={busy}
      />
      <Toaster />
    </div>
  );
}
