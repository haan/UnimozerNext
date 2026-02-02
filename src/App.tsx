import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import { ConsolePanel } from "./components/console/ConsolePanel";
import { DiagramPanel } from "./components/diagram/DiagramPanel";
import { ObjectBenchPanel } from "./components/objectBench/ObjectBenchPanel";
import { CodePanel } from "./components/editor/CodePanel";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { AddClassDialog, type AddClassForm } from "./components/wizards/AddClassDialog";
import { AddFieldDialog, type AddFieldForm } from "./components/wizards/AddFieldDialog";
import {
  AddConstructorDialog,
  type AddConstructorForm
} from "./components/wizards/AddConstructorDialog";
import { AddMethodDialog, type AddMethodForm } from "./components/wizards/AddMethodDialog";
import { CreateObjectDialog, type CreateObjectForm } from "./components/wizards/CreateObjectDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "./components/ui/alert-dialog";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "./components/ui/menubar";
import type { DiagramState } from "./models/diagram";
import type { FileNode } from "./models/files";
import type { UmlConstructor, UmlGraph, UmlNode } from "./models/uml";
import type { ObjectInstance } from "./models/objectBench";
import type { OpenFile } from "./models/openFile";
import { buildMockGraph, parseUmlGraph } from "./services/uml";
import { useAppSettings } from "./hooks/useAppSettings";
import { useSplitRatios } from "./hooks/useSplitRatios";
import { useVerticalSplit } from "./hooks/useVerticalSplit";
import { useRunConsole } from "./hooks/useRunConsole";
import { useLanguageServer } from "./hooks/useLanguageServer";
import { toFileUri } from "./services/lsp";
import { useDrafts } from "./hooks/useDrafts";
import { basename, joinPath, toFqnFromPath } from "./services/paths";
import { useProjectIO } from "./hooks/useProjectIO";
import { getThemeColors } from "./services/monacoThemes";
import { jshellEval, jshellInspect, jshellStart, jshellStop } from "./services/jshell";

const UML_HIGHLIGHT_SECONDS = 2;

const formatStatus = (input: unknown) =>
  typeof input === "string" ? input : JSON.stringify(input);

const trimStatus = (input: string, max = 200) =>
  input.length > max ? `${input.slice(0, max)}...` : input;

const escapeJavaString = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const escapeJavaChar = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const normalizeConstructorArg = (raw: string, type: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const normalizedType = type.replace(/\s+/g, "");
  if (normalizedType === "String") {
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
      return trimmed;
    }
    return `"${escapeJavaString(trimmed)}"`;
  }
  if (normalizedType === "char") {
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed;
    }
    return `'${escapeJavaChar(trimmed)}'`;
  }
  return trimmed;
};

const resolveConstructorParamClass = (type: string) => {
  const normalizedType = type.replace(/\s+/g, "");
  switch (normalizedType) {
    case "int":
    case "long":
    case "float":
    case "double":
    case "boolean":
    case "char":
      return `${normalizedType}.class`;
    case "String":
      return "java.lang.String.class";
    default:
      return `Class.forName("${normalizedType}")`;
  }
};

const getUmlSignature = (graph: UmlGraph | null) => {
  if (!graph) return "";
  const nodes = [...graph.nodes]
    .map((node) => ({
      id: node.id,
      isInvalid: Boolean(node.isInvalid),
      fields: [...node.fields.map((field) => field.signature)].sort(),
      methods: [...node.methods.map((method) => method.signature)].sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges]
    .map((edge) => `${edge.from}:${edge.kind}:${edge.to}`)
    .sort();
  return JSON.stringify({ nodes, edges });
};

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
  const [objectBench, setObjectBench] = useState<ObjectInstance[]>([]);
  const objectBenchRef = useRef<ObjectInstance[]>([]);
  const [jshellReady, setJshellReady] = useState(false);
  const [removeClassOpen, setRemoveClassOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UmlNode | null>(null);
  const [confirmProjectActionOpen, setConfirmProjectActionOpen] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<"open" | "new" | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [fieldTarget, setFieldTarget] = useState<UmlNode | null>(null);
  const [constructorTarget, setConstructorTarget] = useState<UmlNode | null>(null);
  const [methodTarget, setMethodTarget] = useState<UmlNode | null>(null);
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
  const showPrivateObjectFields = settings.view.showPrivateObjectFields ?? true;
  const showInheritedObjectFields = settings.view.showInheritedObjectFields ?? true;
  const showStaticObjectFields = settings.view.showStaticObjectFields ?? true;
  const [umlStatus, setUmlStatus] = useState<string | null>(null);
  const parseSeq = useRef(0);
  const lastGoodGraph = useRef<UmlGraph | null>(null);
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
  const highlightDecorationRef = useRef<string[]>([]);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setStatus
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
  const canAddField = Boolean(selectedNode) && !busy;
  const canAddConstructor = Boolean(selectedNode) && !busy;
  const canAddMethod = Boolean(selectedNode) && !busy;

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform),
    []
  );

  const updateViewSettings = useCallback(
    (partial: Partial<typeof settings.view>) => {
      handleSettingsChange({
        ...settings,
        view: {
          ...settings.view,
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

  const highlightEditorLine = useCallback(
    (lineNumber: number, durationSeconds: number) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const model = editor.getModel();
      if (!model) return;
      const safeLine = Math.min(Math.max(lineNumber, 1), model.getLineCount());
      highlightDecorationRef.current = model.deltaDecorations(
        highlightDecorationRef.current,
        [
          {
            range: new monaco.Range(safeLine, 1, safeLine, 1),
            options: {
              isWholeLine: true,
              className: "uml-line-highlight"
            }
          }
        ]
      );
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = setTimeout(() => {
        const editorNow = editorRef.current;
        if (!editorNow) return;
        const currentModel = editorNow.getModel();
        if (!currentModel) return;
        highlightDecorationRef.current = currentModel.deltaDecorations(
          highlightDecorationRef.current,
          []
        );
      }, durationSeconds * 1000);
    },
    [monacoRef]
  );

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
    highlightEditorLine(line, pending.durationSeconds);
    pendingRevealRef.current = null;
  }, [highlightEditorLine, monacoRef]);

  useEffect(() => {
    applyPendingReveal();
  }, [applyPendingReveal, openFilePath, content]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (pendingRevealRef.current) return;
    const model = editor.getModel();
    if (!model) return;
    if (highlightDecorationRef.current.length > 0) {
      highlightDecorationRef.current = model.deltaDecorations(
        highlightDecorationRef.current,
        []
      );
    }
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, [openFilePath]);

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
    objectBenchRef.current = objectBench;
  }, [objectBench]);

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
    lastGoodGraphRef: lastGoodGraph,
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
    formatStatus
  });

  const visibleGraph = useMemo(() => {
    if (!umlGraph) return null;
    if (settings.uml.showDependencies) return umlGraph;
    return {
      ...umlGraph,
      edges: umlGraph.edges.filter((edge) => edge.kind !== "dependency")
    };
  }, [umlGraph, settings.uml.showDependencies]);

  const mergeWithLastGoodGraph = (graph: UmlGraph, previous: UmlGraph | null): UmlGraph => {
    const failedFiles = graph.failedFiles ?? [];
    if (!previous || failedFiles.length === 0) return graph;
    const failedSet = new Set(failedFiles);
    const mergedNodes = new Map<string, UmlGraph["nodes"][number]>();
    graph.nodes.forEach((node) => mergedNodes.set(node.id, node));
    previous.nodes.forEach((node) => {
      if (failedSet.has(node.path) && !mergedNodes.has(node.id)) {
        mergedNodes.set(node.id, node);
      }
    });
    const nodeIds = new Set(mergedNodes.keys());
    const mergedEdges = new Map<string, UmlGraph["edges"][number]>();
    graph.edges.forEach((edge) => mergedEdges.set(edge.id, edge));
    previous.edges.forEach((edge) => {
      if (mergedEdges.has(edge.id)) return;
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
      const fromNode = previous.nodes.find((node) => node.id === edge.from);
      const toNode = previous.nodes.find((node) => node.id === edge.to);
      if (!fromNode || !toNode) return;
      if (failedSet.has(fromNode.path) || failedSet.has(toNode.path)) {
        mergedEdges.set(edge.id, edge);
      }
    });
    return {
      ...graph,
      nodes: Array.from(mergedNodes.values()),
      edges: Array.from(mergedEdges.values())
    };
  };

  const applyInvalidFlags = (graph: UmlGraph, failedFiles?: string[]): UmlGraph => {
    const failedSet = new Set(failedFiles ?? []);
    return {
      ...graph,
      nodes: graph.nodes.map((node) => ({
        ...node,
        isInvalid: failedSet.has(node.path)
      }))
    };
  };

  const ensureFailedNodes = (
    graph: UmlGraph,
    failedFiles: string[] | undefined,
    root: string,
    srcRoot: string
  ): UmlGraph => {
    if (!failedFiles || failedFiles.length === 0) return graph;
    const existingPaths = new Set(graph.nodes.map((node) => node.path));
    const nodes = [...graph.nodes];
    for (const filePath of failedFiles) {
      if (existingPaths.has(filePath)) continue;
      const name = basename(filePath).replace(/\.java$/i, "") || basename(filePath);
      const id = toFqnFromPath(root, srcRoot, filePath) || name;
      nodes.push({
        id,
        name,
        kind: "class",
        path: filePath,
        fields: [],
        methods: [],
        isInvalid: true
      });
    }
    return {
      ...graph,
      nodes
    };
  };

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
    if (!projectPath || !tree) return;

    const overrides = Object.entries(fileDrafts)
      .filter(([, draft]) => draft.content !== draft.lastSavedContent)
      .map(([path, draft]) => ({
        path,
        content: draft.content
      }));

    parseSeq.current += 1;
    const currentSeq = parseSeq.current;
    const timer = window.setTimeout(async () => {
      setUmlStatus("Parsing UML...");
      try {
        const result = await parseUmlGraph(projectPath, "src", overrides);
        const graph = result.graph;
        if (currentSeq === parseSeq.current) {
          appendDebugOutput(
            `[UML] ${new Date().toLocaleTimeString()}\n${result.raw}`
          );
          const mergedGraph = mergeWithLastGoodGraph(graph, lastGoodGraph.current);
          const withFailedNodes = ensureFailedNodes(mergedGraph, graph.failedFiles, projectPath, "src");
          const nextGraph = applyInvalidFlags(withFailedNodes, graph.failedFiles);
          lastGoodGraph.current = nextGraph;
          setUmlGraph(nextGraph);
          if (graph.failedFiles && graph.failedFiles.length > 0) {
            const count = graph.failedFiles.length;
            setUmlStatus(`UML parse incomplete (${count} file${count === 1 ? "" : "s"}).`);
          } else {
            setUmlStatus(null);
          }
        }
      } catch (error) {
        if (currentSeq === parseSeq.current) {
          setUmlStatus(`UML parse failed: ${trimStatus(formatStatus(error))}`);
          if (lastGoodGraph.current) {
            setUmlGraph(lastGoodGraph.current);
          } else {
            const fallback = buildMockGraph(tree, projectPath);
            setUmlGraph(fallback);
          }
        }
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [projectPath, tree, fileDrafts, appendDebugOutput, debugLogging]);

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
        return;
      }
      if (colors.background) {
        root.style.setProperty("--console-bg", colors.background);
      }
      if (colors.foreground) {
        root.style.setProperty("--console-fg", colors.foreground);
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

  const buildClassSource = useCallback((form: AddClassForm) => {
    const name = form.name.trim().replace(/\.java$/i, "");
    const packageName = form.packageName.trim();
    const extendsName = form.extendsName.trim();
    const tokens: string[] = [];
    tokens.push("public");
    if (!form.isInterface && form.isAbstract) tokens.push("abstract");
    if (!form.isInterface && form.isFinal) tokens.push("final");
    tokens.push(form.isInterface ? "interface" : "class");
    tokens.push(name);
    if (extendsName) {
      tokens.push("extends", extendsName);
    }

    const classHeader = tokens.join(" ");
    const docBlock = form.includeJavadoc
      ? "/**\n * write your javadoc description here\n */\n"
      : "";
    const mainDoc = form.includeJavadoc
      ? "  /**\n   * write your javadoc description here\n   * @param args the command line arguments\n   */\n"
      : "";
    const mainMethod =
      form.includeMain && !form.isInterface
        ? `${mainDoc}  public static void main(String[] args) {\n  }\n\n`
        : "";
    const packageLine = packageName ? `package ${packageName};\n\n` : "";

    return `${packageLine}${docBlock}${classHeader} {\n\n${mainMethod}}\n`;
  }, []);

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
      buildClassSource
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
          notifyLsChange(target.path, updated);
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
      notifyLsChange,
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
          notifyLsChange(target.path, updated);
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
      notifyLsChange,
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
          notifyLsChange(target.path, updated);
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
      notifyLsChange,
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
      if (!projectPath) {
        setStatus("Open a project before creating objects.");
        return;
      }
      if (!target || !constructor) {
        setStatus("Select a constructor before creating an object.");
        return;
      }
      if (!jshellReady) {
        setStatus("Compile the project before creating objects.");
        return;
      }

      setBusy(true);
      const args = constructor.params.map((param, index) =>
        normalizeConstructorArg(form.paramValues[index] ?? "", param.type)
      );
      const usesDefaultPackage = !target.id.includes(".");
      const ctorParams = constructor.params.map((param) =>
        resolveConstructorParamClass(param.type)
      );
      const constructorSelector =
        ctorParams.length === 0
          ? "getDeclaredConstructor()"
          : `getDeclaredConstructor(${ctorParams.join(", ")})`;
      const code = usesDefaultPackage
        ? `var ${form.objectName} = Class.forName("${target.id}").${constructorSelector}.newInstance(${args.join(", ")});`
        : `var ${form.objectName} = new ${target.id}(${args.join(", ")});`;
      appendDebugOutput(
        `[${new Date().toLocaleTimeString()}] JShell eval\n${code}`
      );
      const isBrokenPipe = (message: string) =>
        message.toLowerCase().includes("pipe is being closed") ||
        message.toLowerCase().includes("broken pipe") ||
        message.toLowerCase().includes("closed unexpectedly");

      const startedAt = new Date().toLocaleTimeString();
      resetConsoleOutput();
      appendConsoleOutput(
        `[${startedAt}] Create object requested for ${form.objectName}`
      );

      const logJshellOutput = (stdout?: string, stderr?: string) => {
        const jshellTime = new Date().toLocaleTimeString();
        if (stdout) {
          appendDebugOutput(
            `[${jshellTime}] JShell output\n${stdout.trim()}`
          );
        }
        if (stderr) {
          appendDebugOutput(
            `[${jshellTime}] JShell error output\n${stderr.trim()}`
          );
        }
      };

      const refreshObjects = async (objects: ObjectInstance[]) => {
        const fallback = new Map(objects.map((obj) => [obj.name, obj]));
        const refreshed: ObjectInstance[] = [];
        for (const obj of objects) {
          const inspect = await jshellInspect(obj.name);
          if (!inspect.ok) {
            const message = trimStatus(inspect.error || "Unknown error");
            appendDebugOutput(
              `[${new Date().toLocaleTimeString()}] JShell inspect failed for ${obj.name}\n${message}`
            );
            refreshed.push(fallback.get(obj.name) ?? obj);
            continue;
          }
          refreshed.push({
            name: obj.name,
            type: inspect.typeName || obj.type,
            fields: inspect.fields ?? []
          });
        }
        return refreshed;
      };

      const createInstance = async (): Promise<ObjectInstance | null> => {
        const result = await jshellEval(code);
        logJshellOutput(result.stdout, result.stderr);
        if (!result.ok) {
          const message = `Failed to create ${form.objectName}: ${trimStatus(
            result.error || result.stderr || "Unknown error"
          )}`;
          appendConsoleOutput(message);
          setStatus("Object creation failed.");
          return null;
        }

        const inspect = await jshellInspect(form.objectName);
        if (!inspect.ok) {
          const message = `Failed to inspect ${form.objectName}: ${trimStatus(
            inspect.error || "Unknown error"
          )}`;
          appendConsoleOutput(message);
          setStatus("Object creation failed.");
          return null;
        }
        return {
          name: form.objectName,
          type: target.name || inspect.typeName || target.id,
          fields: inspect.fields ?? []
        };
      };

      const createAndRefresh = async () => {
        const entry = await createInstance();
        if (!entry) return false;
        const baseObjects = objectBenchRef.current.filter((item) => item.name !== entry.name);
        const refreshed = await refreshObjects([...baseObjects, entry]);
        setObjectBench(refreshed);
        appendConsoleOutput("Object created.");
        setStatus(`Created ${entry.name}.`);
        return true;
      };

      try {
        await createAndRefresh();
      } catch (error) {
        const message = formatStatus(error);
        appendDebugOutput(
          `[${new Date().toLocaleTimeString()}] JShell error\n${message}`
        );
        if (isBrokenPipe(message)) {
          setJshellReady(false);
          const outDir = lastCompileOutDirRef.current;
          if (projectPath && outDir) {
            try {
              await jshellStop();
              await jshellStart(projectPath, outDir);
              setJshellReady(true);
              const retryOk = await createAndRefresh();
              if (retryOk) return;
            } catch (restartError) {
              appendDebugOutput(
                `[${new Date().toLocaleTimeString()}] JShell restart failed\n${formatStatus(
                  restartError
                )}`
              );
            }
          }
        }
        setStatus(`Failed to create object: ${trimStatus(message)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      appendDebugOutput,
      appendConsoleOutput,
      createObjectConstructor,
      createObjectTarget,
      jshellReady,
      projectPath,
      resetConsoleOutput,
      setBusy,
      setJshellReady,
      setStatus
    ]
  );

  return (
    <div className="flex h-full flex-col">
      <header className="relative flex items-center border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <img
            src="/icon/icon.png"
            alt="Unimozer Next icon"
            className="h-10 w-10"
            draggable={false}
          />
          <Menubar className="border-0 bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => requestProjectAction("new")} disabled={busy}>
                New Project
                <MenubarShortcut>{isMac ? "⌘N" : "Ctrl+N"}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => requestProjectAction("open")} disabled={busy}>
                Open
                <MenubarShortcut>
                  {isMac ? "⌘O" : "Ctrl+O"}
                </MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={handleSave} disabled={!hasUnsavedChanges || busy}>
                Save
                <MenubarShortcut>
                  {isMac ? "⌘S" : "Ctrl+S"}
                </MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={handleExportProject} disabled={busy || !projectPath}>
                Save As
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setSettingsOpen(true)} disabled={busy}>
                Settings
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onClick={() => {
                  const window = getCurrentWindow();
                  window.close().catch(() => undefined);
                }}
                disabled={busy}
              >
                Exit
              </MenubarItem>
            </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Edit</MenubarTrigger>
              <MenubarContent>
              <MenubarItem
                onClick={() => triggerEditorAction("undo")}
                disabled={editDisabled}
              >
                Undo
                <MenubarShortcut>{isMac ? "⌘Z" : "Ctrl+Z"}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                onClick={() => triggerEditorAction("redo")}
                disabled={editDisabled}
              >
                Redo
                <MenubarShortcut>{isMac ? "⇧⌘Z" : "Ctrl+Y"}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onClick={() => triggerEditorAction("editor.action.clipboardCutAction")}
                disabled={editDisabled}
              >
                Cut
                <MenubarShortcut>{isMac ? "⌘X" : "Ctrl+X"}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                onClick={() => triggerEditorAction("editor.action.clipboardCopyAction")}
                disabled={editDisabled}
              >
                Copy
                <MenubarShortcut>{isMac ? "⌘C" : "Ctrl+C"}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                onClick={() => {
                  void handlePaste();
                }}
                disabled={editDisabled}
              >
                Paste
                <MenubarShortcut>{isMac ? "⌘V" : "Ctrl+V"}</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  onClick={() => zoomControlsRef.current?.zoomIn()}
                disabled={zoomDisabled}
              >
                Zoom In
                <MenubarShortcut>{isMac ? "⌘+" : "Ctrl++"}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                onClick={() => zoomControlsRef.current?.zoomOut()}
                disabled={zoomDisabled}
              >
                Zoom Out
                <MenubarShortcut>{isMac ? "⌘-" : "Ctrl+-"}</MenubarShortcut>
              </MenubarItem>
                <MenubarItem
                  onClick={() => zoomControlsRef.current?.resetZoom()}
                  disabled={zoomDisabled}
                >
                  Reset Zoom
                  <MenubarShortcut>{isMac ? "⌘0" : "Ctrl+0"}</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Object Bench</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarCheckboxItem
                      checked={showPrivateObjectFields}
                      onCheckedChange={(checked) =>
                        updateViewSettings({ showPrivateObjectFields: Boolean(checked) })
                      }
                    >
                      Show private fields
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem
                      checked={showInheritedObjectFields}
                      onCheckedChange={(checked) =>
                        updateViewSettings({ showInheritedObjectFields: Boolean(checked) })
                      }
                    >
                      Show inherited fields
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem
                      checked={showStaticObjectFields}
                      onCheckedChange={(checked) =>
                        updateViewSettings({ showStaticObjectFields: Boolean(checked) })
                      }
                    >
                      Show static fields
                    </MenubarCheckboxItem>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Insert</MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  onClick={() => setAddClassOpen(true)}
                  disabled={!canAddClass}
                >
                  Class
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onClick={() => {
                    if (selectedNode) {
                      setConstructorTarget(selectedNode);
                      setAddConstructorOpen(true);
                    }
                  }}
                  disabled={!canAddConstructor}
                >
                  Constructor
                </MenubarItem>
                <MenubarItem
                  onClick={() => {
                    if (selectedNode) {
                      setFieldTarget(selectedNode);
                      setAddFieldOpen(true);
                    }
                  }}
                  disabled={!canAddField}
                >
                  Field
                </MenubarItem>
                <MenubarItem
                  onClick={() => {
                    if (selectedNode) {
                      setMethodTarget(selectedNode);
                      setAddMethodOpen(true);
                    }
                  }}
                  disabled={!canAddMethod}
                >
                  Method
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>

        {projectName ? (
          <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm font-medium text-foreground">
            <span className="max-w-[60vw] truncate">{projectName}</span>
            {hasUnsavedChanges ? (
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col bg-background">
          <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
            <section
              className="flex flex-col border-r border-border"
              style={{ width: `${splitRatio * 100}%` }}
            >
              <div ref={benchContainerRef} className="relative flex h-full flex-col">
                <div
                  className="min-h-0 flex-none overflow-hidden"
                  style={{ height: `${objectBenchSplitRatio * 100}%` }}
                >
                  <DiagramPanel
                    graph={visibleGraph}
                    diagram={diagramState}
                    compiled={compileStatus === "success"}
                    backgroundColor={settings.uml.panelBackground}
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
                  />
                </div>
                <div
                  className="absolute left-0 z-10 h-3 w-full -translate-y-1.5 cursor-row-resize transition hover:bg-border/40"
                  style={{ top: `${objectBenchSplitRatio * 100}%` }}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize object bench panel"
                  onPointerDown={startBenchResize}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
                </div>
                <div className="min-h-[var(--bench-min-height)] flex-1 overflow-hidden">
                  <ObjectBenchPanel
                    objects={objectBench}
                    showPrivate={showPrivateObjectFields}
                    showInherited={showInheritedObjectFields}
                    showStatic={showStaticObjectFields}
                  />
                </div>
              </div>
            </section>

            <div
              className="absolute top-0 h-full w-3 -translate-x-1.5 cursor-col-resize transition hover:bg-border/40"
              style={{ left: `${splitRatio * 100}%` }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize information panel"
              onPointerDown={startUmlResize}
            >
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/60" />
            </div>

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
                    openFile={openFile}
                    fileUri={openFilePath ? toFileUri(openFilePath) : null}
                    content={content}
                    dirty={dirty}
                    fontSize={settings.editor.fontSize}
                    theme={settings.editor.theme}
                    tabSize={settings.editor.tabSize}
                    insertSpaces={settings.editor.insertSpaces}
                    autoCloseBrackets={settings.editor.autoCloseBrackets}
                    autoCloseQuotes={settings.editor.autoCloseQuotes}
                    autoCloseComments={settings.editor.autoCloseComments}
                    wordWrap={settings.editor.wordWrap}
                    onChange={handleContentChange}
                    onEditorMount={(editor) => {
                      editorRef.current = editor;
                      applyPendingReveal();
                    }}
                  />
                </div>
                <div
                  className="absolute left-0 w-full h-3 -translate-y-1.5 cursor-row-resize transition hover:bg-border/40"
                  style={{ top: `${consoleSplitRatio * 100}%` }}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize console panel"
                  onPointerDown={startConsoleResize}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
                </div>
                <div className="min-h-[var(--console-min-height)] flex-1 overflow-hidden">
                  <ConsolePanel
                    output={consoleOutput}
                    fontSize={settings.editor.fontSize}
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

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={handleSettingsChange}
      />
      <AddClassDialog
        open={addClassOpen}
        onOpenChange={setAddClassOpen}
        onSubmit={handleCreateClass}
        busy={busy}
      />
      <AddFieldDialog
        open={addFieldOpen}
        onOpenChange={setAddFieldOpen}
        onSubmit={handleCreateField}
        busy={busy}
      />
      <AddConstructorDialog
        open={addConstructorOpen}
        onOpenChange={setAddConstructorOpen}
        onSubmit={handleCreateConstructor}
        className={constructorTarget?.name ?? selectedNode?.name}
        busy={busy}
      />
      <AddMethodDialog
        open={addMethodOpen}
        onOpenChange={setAddMethodOpen}
        onSubmit={handleCreateMethod}
        className={methodTarget?.name ?? selectedNode?.name}
        busy={busy}
      />
      <CreateObjectDialog
        open={createObjectOpen}
        onOpenChange={setCreateObjectOpen}
        onSubmit={handleCreateObject}
        className={createObjectTarget?.name ?? selectedNode?.name ?? ""}
        constructorLabel={createObjectConstructor?.signature ?? ""}
        params={createObjectConstructor?.params ?? []}
        existingNames={objectBench.map((item) => item.name)}
        busy={busy}
      />
      <AlertDialog
        open={removeClassOpen}
        onOpenChange={(open) => {
          setRemoveClassOpen(open);
          if (!open) {
            setRemoveTarget(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader className="items-center text-center">
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </AlertDialogMedia>
            <AlertDialogTitle>Remove class?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This will delete{" "}
              <strong>{removeTarget ? removeTarget.name : "this class"}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <AlertDialogCancel
              variant="outline"
              className="w-full"
              disabled={busy}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="w-full bg-destructive/10 text-destructive hover:bg-destructive/20"
              disabled={busy || !removeTarget}
              onClick={() => {
                void confirmRemoveClass();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirmProjectActionOpen}
        onOpenChange={(open) => {
          setConfirmProjectActionOpen(open);
          if (!open) {
            setPendingProjectAction(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader className="items-center text-center">
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              You have unsaved changes. Continuing will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <AlertDialogCancel
              variant="outline"
              className="w-full"
              disabled={busy}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full"
              disabled={busy || !pendingProjectAction}
              onClick={() => {
                confirmProjectAction();
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
