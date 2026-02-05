import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import { ConsolePanel } from "./components/console/ConsolePanel";
import { CodePanel } from "./components/editor/CodePanel";
import { AppMenu } from "./components/app/AppMenu";
import { ObjectBenchSection } from "./components/app/ObjectBenchSection";
import { AppDialogs } from "./components/app/AppDialogs";
import { SplitHandle } from "./components/ui/split-handle";
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
import { useAppSettings } from "./hooks/useAppSettings";
import { useSplitRatios } from "./hooks/useSplitRatios";
import { useVerticalSplit } from "./hooks/useVerticalSplit";
import { useRunConsole } from "./hooks/useRunConsole";
import { useLanguageServer } from "./hooks/useLanguageServer";
import { toFileUri } from "./services/lsp";
import { useDrafts } from "./hooks/useDrafts";
import { useUmlGraph } from "./hooks/useUmlGraph";
import { useJshellActions } from "./hooks/useJshellActions";
import { basename, joinPath } from "./services/paths";
import { useProjectIO } from "./hooks/useProjectIO";
import { getThemeColors } from "./services/monacoThemes";
import { jshellStart, jshellStop } from "./services/jshell";
import { buildClassSource } from "./services/javaCodegen";
import { getUmlSignature } from "./services/umlGraph";

const UML_HIGHLIGHT_SECONDS = 2;

const formatStatus = (input: unknown) =>
  typeof input === "string" ? input : JSON.stringify(input);

const trimStatus = (input: string, max = 200) =>
  input.length > max ? `${input.slice(0, max)}...` : input;

export default function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [umlGraph, setUmlGraph] = useState<UmlGraph | null>(null);
  const [diagramState, setDiagramState] = useState<DiagramState | null>(null);
  const [diagramPath, setDiagramPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [status, setStatus] = useState("Open a Java project to begin.");
  const [busy, setBusy] = useState(false);
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
  const [objectBench, setObjectBench] = useState<ObjectInstance[]>([]);
  const [jshellReady, setJshellReady] = useState(false);
  const [removeClassOpen, setRemoveClassOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UmlNode | null>(null);
  const [confirmProjectActionOpen, setConfirmProjectActionOpen] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<"open" | "new" | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [fieldTarget, setFieldTarget] = useState<UmlNode | null>(null);
  const [constructorTarget, setConstructorTarget] = useState<UmlNode | null>(null);
  const [methodTarget, setMethodTarget] = useState<UmlNode | null>(null);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const bumpEditorResetKey = useCallback(() => {
    setEditorResetKey((prev) => prev + 1);
  }, []);
  const {
    settings,
    settingsOpen,
    setSettingsOpen,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting,
    updateObjectBenchSplitRatioSetting
  } = useAppSettings();
  const debugLogging = settings.advanced?.debugLogging ?? false;
  const codeHighlightEnabled = settings.uml.codeHighlight ?? true;
  const showDependencies = settings.uml.showDependencies ?? true;
  const showPackages = settings.uml.showPackages ?? true;
  const fontSize = settings.general.fontSize ?? 14;
  const showPrivateObjectFields =
    settings.objectBench.showPrivateObjectFields ?? true;
  const showInheritedObjectFields =
    settings.objectBench.showInheritedObjectFields ?? true;
  const showStaticObjectFields =
    settings.objectBench.showStaticObjectFields ?? true;
  const showSwingAttributes = settings.uml.showSwingAttributes ?? true;
  const wordWrap = settings.editor.wordWrap ?? true;
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
    minTop: 240
  });
  const openFilePath = openFile?.path ?? null;
  const defaultTitle = "Unimozer Next";
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const pendingRevealRef = useRef<{
    path: string;
    line: number;
    column: number;
    durationSeconds: number;
  } | null>(null);
  const umlSignatureRef = useRef<string>("");
  const lastCompileOutDirRef = useRef<string | null>(null);
  const lastCompileStatusRef = useRef<"success" | "failed" | null>(null);
  const zoomControlsRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  } | null>(null);
  const consoleThemeDefaults = useRef<{ bg: string; fg: string } | null>(null);
  const {
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsClose,
    notifyLsChange,
    resetLsState
  } = useLanguageServer({
    projectPath,
    openFilePath,
    openFileContent: content
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
    notifyLsChange,
    notifyLsClose,
    setStatus,
    onExternalContent: bumpEditorResetKey
  });

  const dirty = useMemo(() => {
    if (!openFile) return false;
    return content !== lastSavedContent;
  }, [content, lastSavedContent, openFile]);
  const editDisabled = !openFile || busy;
  const zoomDisabled = !umlGraph || !diagramState;
  const canAddClass = Boolean(projectPath) && !busy;
  const selectedNode = useMemo(() => {
    if (!selectedClassId) return null;
    return umlGraph?.nodes.find((node) => node.id === selectedClassId) ?? null;
  }, [selectedClassId, umlGraph]);
  const canAddField = Boolean(selectedNode) && Boolean(openFilePath) && !busy;
  const canAddConstructor = Boolean(selectedNode) && Boolean(openFilePath) && !busy;
  const canAddMethod = Boolean(selectedNode) && Boolean(openFilePath) && !busy;

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

  useEffect(() => {
    applyPendingReveal();
  }, [applyPendingReveal, openFilePath, content]);

  const handlePaste = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    let text = "";
    try {
      const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
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

  const handleExit = useCallback(() => {
    const window = getCurrentWindow();
    window.close().catch(() => undefined);
  }, []);

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

  useEffect(() => {
    if (!openFile) {
      editorRef.current = null;
    }
  }, [openFile]);

  useEffect(() => {
    if (!addFieldOpen) {
      setFieldTarget(null);
    }
  }, [addFieldOpen]);

  useEffect(() => {
    if (!addConstructorOpen) {
      setConstructorTarget(null);
    }
  }, [addConstructorOpen]);

  useEffect(() => {
    if (!addMethodOpen) {
      setMethodTarget(null);
    }
  }, [addMethodOpen]);

  useEffect(() => {
    if (!createObjectOpen) {
      setCreateObjectTarget(null);
      setCreateObjectConstructor(null);
    }
  }, [createObjectOpen]);

  useEffect(() => {
    if (!callMethodOpen) {
      setCallMethodTarget(null);
      setCallMethodInfo(null);
    }
  }, [callMethodOpen]);

  useEffect(() => {
    if (!methodReturnOpen) {
      setMethodReturnValue(null);
      setMethodReturnLabel("");
    }
  }, [methodReturnOpen]);

  useEffect(() => {
    if (selectedClassId && !selectedNode) {
      setSelectedClassId(null);
    }
  }, [selectedClassId, selectedNode]);

  const projectName = useMemo(
    () => (projectPath ? basename(projectPath) : ""),
    [projectPath]
  );

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
    [projectPath, setStatus]
  );

  const {
    consoleOutput,
    compileStatus,
    setCompileStatus,
    runSessionId,
    appendConsoleOutput,
    resetConsoleOutput,
    handleCompileClass,
    handleRunMain,
    handleCancelRun
  } = useRunConsole({
    projectPath,
    fileDrafts,
    formatAndSaveUmlFiles,
    setBusy,
    setStatus,
    formatStatus,
    onCompileSuccess: handleCompileSuccess,
    onCompileRequested: () => setObjectBench([])
  });

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
    tree,
    fileDrafts,
    setUmlGraph,
    onDebugLog: appendDebugOutput,
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
    appendDebugOutput,
    setStatus,
    setBusy,
    formatStatus,
    trimStatus
  });

  const {
    handleOpenProject,
    handleNewProject,
    openFileByPath,
    handleSave,
    handleExportProject,
    loadDiagramState
  } = useProjectIO({
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
    onExternalContent: bumpEditorResetKey
  });

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
    const window = getCurrentWindow();
    const nextTitle = projectPath ? `${defaultTitle} - ${projectPath}` : defaultTitle;
    window.setTitle(nextTitle).catch(() => undefined);
  }, [projectPath]);

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
    if (!projectPath || !umlGraph) return;
    void loadDiagramState(projectPath, umlGraph);
  }, [projectPath, umlGraph, loadDiagramState]);


  const handleNodePositionChange = (id: string, x: number, y: number, commit: boolean) => {
    setDiagramState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        nodes: {
          ...prev.nodes,
          [id]: { x, y }
        }
      };
      if (commit && diagramPath) {
        void invoke("write_text_file", {
          path: diagramPath,
          contents: JSON.stringify(next, null, 2)
        });
      }
      return next;
    });
  };

  const getNodeById = useCallback(
    (id: string) => umlGraph?.nodes.find((item) => item.id === id) ?? null,
    [umlGraph]
  );

  const queueEditorReveal = useCallback(
    async (
      path: string,
      range: { startLine: number; startColumn: number },
      durationSeconds = UML_HIGHLIGHT_SECONDS
    ) => {
      if (!range?.startLine) return;
      pendingRevealRef.current = {
        path,
        line: range.startLine,
        column: range.startColumn ?? 1,
        durationSeconds
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
        void openFileByPath(node.path);
      }
    },
    [appendDebugOutput, openFileByPath, queueEditorReveal]
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
        void openFileByPath(node.path);
      }
    },
    [appendDebugOutput, openFileByPath, queueEditorReveal]
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

  const requestProjectAction = useCallback(
    (action: "open" | "new") => {
      if (!hasUnsavedChanges) {
        if (action === "open") {
          void handleOpenProject();
        } else {
          void handleNewProject();
        }
        return;
      }
      setPendingProjectAction(action);
      setConfirmProjectActionOpen(true);
    },
    [hasUnsavedChanges, handleOpenProject, handleNewProject]
  );

  const confirmProjectAction = useCallback(() => {
    const action = pendingProjectAction;
    setConfirmProjectActionOpen(false);
    setPendingProjectAction(null);
    if (action === "open") {
      void handleOpenProject();
    } else if (action === "new") {
      void handleNewProject();
    }
  }, [pendingProjectAction, handleOpenProject, handleNewProject]);

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
        if (!hasUnsavedChanges || busy) return;
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
  }, [hasUnsavedChanges, busy, handleSave, requestProjectAction]);

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
        await openFileByPath(filePath);
        updateDraftForPath(filePath, source, "");
        setContent(source);
        setLastSavedContent("");
        bumpEditorResetKey();
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
      openFileByPath,
      setTree,
      setCompileStatus,
      updateDraftForPath,
      bumpEditorResetKey
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
          bumpEditorResetKey();
          notifyLsChange(target.path, updated);
        } else {
          setOpenFile({ name: basename(target.path), path: target.path });
          setContent(updated);
          setLastSavedContent(savedBaseline);
          bumpEditorResetKey();
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
      notifyLsChange,
      notifyLsOpen,
      bumpEditorResetKey,
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
          bumpEditorResetKey();
          notifyLsChange(target.path, updated);
        } else {
          setOpenFile({ name: basename(target.path), path: target.path });
          setContent(updated);
          setLastSavedContent(savedBaseline);
          bumpEditorResetKey();
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
      notifyLsChange,
      notifyLsOpen,
      bumpEditorResetKey,
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
          bumpEditorResetKey();
          notifyLsChange(target.path, updated);
        } else {
          setOpenFile({ name: basename(target.path), path: target.path });
          setContent(updated);
          setLastSavedContent(savedBaseline);
          bumpEditorResetKey();
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
      notifyLsChange,
      notifyLsOpen,
      bumpEditorResetKey,
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
        busy={busy}
        hasUnsavedChanges={hasUnsavedChanges}
        projectName={projectName}
        isMac={isMac}
        editDisabled={editDisabled}
        zoomDisabled={zoomDisabled}
        canAddClass={canAddClass}
        canAddConstructor={canAddConstructor}
        canAddField={canAddField}
        canAddMethod={canAddMethod}
        showPrivateObjectFields={showPrivateObjectFields}
        showInheritedObjectFields={showInheritedObjectFields}
        showStaticObjectFields={showStaticObjectFields}
        showDependencies={showDependencies}
        showPackages={showPackages}
        showSwingAttributes={showSwingAttributes}
        wordWrap={wordWrap}
        onRequestNewProject={() => requestProjectAction("new")}
        onRequestOpenProject={() => requestProjectAction("open")}
        onSave={() => {
          void handleSave();
        }}
        onSaveAs={() => {
          void handleExportProject();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onExit={handleExit}
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
      />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col bg-background">
          <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
            <div className="h-full" style={{ width: `${splitRatio * 100}%` }}>
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
                  onNodePositionChange={handleNodePositionChange}
                onNodeSelect={handleNodeSelect}
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
                onAddClass={canAddClass ? () => setAddClassOpen(true) : undefined}
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
                  className="min-h-50 flex-none overflow-hidden"
                  style={{ height: `${consoleSplitRatio * 100}%` }}
                >
                    <CodePanel
                      key={openFilePath ? `${openFilePath}:${editorResetKey}` : "no-file"}
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
                      onDebugLog={appendDebugOutput}
                      onEditorMount={(editor) => {
                        editorRef.current = editor;
                        applyPendingReveal();
                      }}
                    />
                </div>
                <SplitHandle
                  orientation="horizontal"
                  positionPercent={consoleSplitRatio * 100}
                  ariaLabel="Resize console panel"
                  onPointerDown={startConsoleResize}
                />
                <div className="min-h-[var(--console-min-height)] flex-1 overflow-hidden">
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
        onAddFieldOpenChange={setAddFieldOpen}
        onCreateField={handleCreateField}
        addConstructorOpen={addConstructorOpen}
        onAddConstructorOpenChange={setAddConstructorOpen}
        addConstructorClassName={constructorTarget?.name ?? selectedNode?.name}
        onCreateConstructor={handleCreateConstructor}
        addMethodOpen={addMethodOpen}
        onAddMethodOpenChange={setAddMethodOpen}
        addMethodClassName={methodTarget?.name ?? selectedNode?.name}
        onCreateMethod={handleCreateMethod}
        createObjectOpen={createObjectOpen}
        onCreateObjectOpenChange={setCreateObjectOpen}
        onCreateObject={handleCreateObject}
        createObjectClassName={createObjectTarget?.name ?? selectedNode?.name ?? ""}
        createObjectConstructorLabel={createObjectConstructor?.signature ?? ""}
        createObjectParams={createObjectConstructor?.params ?? []}
        existingObjectNames={objectBench.map((item) => item.name)}
        callMethodOpen={callMethodOpen}
        onCallMethodOpenChange={setCallMethodOpen}
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
        onMethodReturnOpenChange={setMethodReturnOpen}
        methodReturnLabel={methodReturnLabel}
        methodReturnValue={methodReturnValue}
        busy={busy}
      />
    </div>
  );
}
