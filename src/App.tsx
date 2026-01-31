import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConsolePanel } from "./components/console/ConsolePanel";
import { DiagramPanel } from "./components/diagram/DiagramPanel";
import { CodePanel } from "./components/editor/CodePanel";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger
} from "./components/ui/menubar";
import type { DiagramState } from "./models/diagram";
import type { FileNode } from "./models/files";
import type { UmlGraph } from "./models/uml";
import type { OpenFile } from "./models/openFile";
import { buildMockGraph, parseUmlGraph } from "./services/uml";
import { useAppSettings } from "./hooks/useAppSettings";
import { useSplitRatios } from "./hooks/useSplitRatios";
import { useRunConsole } from "./hooks/useRunConsole";
import { useLanguageServer } from "./hooks/useLanguageServer";
import { toFileUri } from "./services/lsp";
import { useDrafts } from "./hooks/useDrafts";
import { basename, toFqnFromPath } from "./services/paths";
import { useProjectIO } from "./hooks/useProjectIO";

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
  const {
    settings,
    settingsOpen,
    setSettingsOpen,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting
  } = useAppSettings();
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
  const openFilePath = openFile?.path ?? null;
  const defaultTitle = "Unimozer Next";
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

  const projectName = useMemo(
    () => (projectPath ? basename(projectPath) : ""),
    [projectPath]
  );

  const {
    consoleOutput,
    compileStatus,
    setCompileStatus,
    runSessionId,
    handleCompileClass,
    handleRunMain,
    handleCancelRun
  } = useRunConsole({
    projectPath,
    fileDrafts,
    formatAndSaveUmlFiles,
    setBusy,
    setStatus,
    formatStatus
  });

  const {
    handleOpenProject,
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
  }, [projectPath, tree, fileDrafts]);

  useEffect(() => {
    const window = getCurrentWindow();
    const nextTitle = projectPath ? `${defaultTitle} - ${projectPath}` : defaultTitle;
    window.setTitle(nextTitle).catch(() => undefined);
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || !umlGraph) return;
    void loadDiagramState(projectPath, umlGraph);
  }, [projectPath, umlGraph, loadDiagramState]);


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
      const isOpen = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o";
      if (!isSave && !isOpen) return;
      event.preventDefault();
      if (isOpen) {
        if (!busy) {
          void handleOpenProject();
        }
        return;
      }
      if (!hasUnsavedChanges || busy) return;
      void handleSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasUnsavedChanges, busy, handleSave, handleOpenProject]);

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

  const handleNodeSelect = (id: string) => {
    if (!umlGraph) return;
    const node = umlGraph.nodes.find((item) => item.id === id);
    if (!node) return;
    void openFileByPath(node.path);
  };

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
              <MenubarItem onClick={handleOpenProject} disabled={busy}>
                Open
                <MenubarShortcut>
                  {navigator.platform.toLowerCase().includes("mac") ? "⌘O" : "Ctrl+O"}
                </MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={handleSave} disabled={!hasUnsavedChanges || busy}>
                Save
                <MenubarShortcut>
                  {navigator.platform.toLowerCase().includes("mac") ? "⌘S" : "Ctrl+S"}
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
              <MenubarItem disabled>Undo</MenubarItem>
              <MenubarItem disabled>Redo</MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>Cut</MenubarItem>
              <MenubarItem disabled>Copy</MenubarItem>
              <MenubarItem disabled>Paste</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>View</MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled>Zoom In</MenubarItem>
              <MenubarItem disabled>Zoom Out</MenubarItem>
              <MenubarItem disabled>Reset Zoom</MenubarItem>
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
              <DiagramPanel
                graph={visibleGraph}
                diagram={diagramState}
                compiled={compileStatus === "success"}
                backgroundColor={settings.uml.panelBackground}
                onNodePositionChange={handleNodePositionChange}
                onNodeSelect={handleNodeSelect}
                onCompileClass={handleCompileClass}
                onRunMain={handleRunMain}
              />
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
                    tabSize={settings.editor.tabSize}
                    insertSpaces={settings.editor.insertSpaces}
                    autoCloseBrackets={settings.editor.autoCloseBrackets}
                    autoCloseQuotes={settings.editor.autoCloseQuotes}
                    autoCloseComments={settings.editor.autoCloseComments}
                    wordWrap={settings.editor.wordWrap}
                    darkTheme={settings.editor.darkTheme}
                    onChange={handleContentChange}
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
    </div>
  );
}
