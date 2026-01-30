import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMonaco } from "@monaco-editor/react";

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
import type { UmlGraph, UmlNode } from "./models/uml";
import type { AppSettings } from "./models/settings";
import { createDefaultDiagramState, mergeDiagramState, parseLegacyPck } from "./services/diagram";
import { createDefaultSettings } from "./models/settings";
import { buildMockGraph, parseUmlGraph } from "./services/uml";
import { readSettings, writeSettings } from "./services/settings";

type OpenFile = {
  name: string;
  path: string;
};

type FileDraft = {
  content: string;
  lastSavedContent: string;
};

type RunOutputEvent = {
  runId: number;
  stream: string;
  line: string;
};

type LspPosition = {
  line: number;
  character: number;
};

type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

type LspDiagnostic = {
  range: LspRange;
  severity?: number;
  message: string;
  source?: string;
};

type LsDiagnosticsEvent = {
  uri: string;
  diagnostics: LspDiagnostic[];
};

type LsCrashedEvent = {
  projectRoot: string;
  code?: number | null;
};

type LspTextEdit = {
  range: LspRange;
  newText: string;
};

type RunStartEvent = {
  runId: number;
};

type RunCompleteEvent = {
  runId: number;
  ok: boolean;
  code?: number | null;
};

const basename = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
};

const formatStatus = (input: unknown) =>
  typeof input === "string" ? input : JSON.stringify(input);

const trimStatus = (input: string, max = 200) =>
  input.length > max ? `${input.slice(0, max)}...` : input;

const joinPath = (root: string, file: string) => {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${file}`;
};

const toRelativePath = (fullPath: string, rootPath: string) => {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "").toLowerCase();
  const normalizedFull = fullPath.toLowerCase();
  if (normalizedFull.startsWith(normalizedRoot)) {
    const sliced = fullPath.slice(normalizedRoot.length).replace(/^[\\/]/, "");
    return sliced.length ? sliced : fullPath;
  }
  return fullPath;
};

const toFileUri = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const withSlash = /^[a-zA-Z]:/.test(normalized) ? `/${normalized}` : normalized;
  return `file://${encodeURI(withSlash)}`;
};

const toFqnFromPath = (root: string, srcRoot: string, filePath: string) => {
  const srcPath = joinPath(root, srcRoot);
  const relative = toRelativePath(filePath, srcPath);
  const trimmed = relative === filePath ? basename(filePath) : relative;
  return trimmed.replace(/\.java$/i, "").replace(/[\\/]+/g, ".");
};

const sortTextEditsDescending = (a: LspTextEdit, b: LspTextEdit) => {
  if (a.range.start.line !== b.range.start.line) {
    return b.range.start.line - a.range.start.line;
  }
  return b.range.start.character - a.range.start.character;
};

const applyTextEdits = (text: string, edits: LspTextEdit[]) => {
  if (!edits || edits.length === 0) return text;
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const toOffset = (position: LspPosition) => {
    const lineStart = lineStarts[position.line] ?? text.length;
    return lineStart + position.character;
  };
  const normalized = edits.map((edit) => ({
    start: toOffset(edit.range.start),
    end: toOffset(edit.range.end),
    newText: edit.newText
  }));
  normalized.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = text;
  for (const edit of normalized) {
    result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`;
  }
  return result;
};

export default function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [umlGraph, setUmlGraph] = useState<UmlGraph | null>(null);
  const [diagramState, setDiagramState] = useState<DiagramState | null>(null);
  const [diagramPath, setDiagramPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [fileDrafts, setFileDrafts] = useState<Record<string, FileDraft>>({});
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [status, setStatus] = useState("Open a Java project to begin.");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [umlStatus, setUmlStatus] = useState<string | null>(null);
  const [compileStatus, setCompileStatus] = useState<"success" | "failed" | null>(null);
  const [runSessionId, setRunSessionId] = useState<number | null>(null);
  const parseSeq = useRef(0);
  const lastGoodGraph = useRef<UmlGraph | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const consoleContainerRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(createDefaultSettings().layout.umlSplitRatio);
  const [isResizing, setIsResizing] = useState(false);
  const [consoleSplitRatio, setConsoleSplitRatio] = useState(
    createDefaultSettings().layout.consoleSplitRatio
  );
  const [isConsoleResizing, setIsConsoleResizing] = useState(false);
  const openFilePath = openFile?.path ?? null;
  const defaultTitle = "Unimozer Next";
  const [consoleOutput, setConsoleOutput] = useState("");
  const runSessionRef = useRef<number | null>(null);
  const consoleLinesRef = useRef<string[]>([]);
  const consoleDroppedRef = useRef(0);
  const consoleFlushRef = useRef<number | null>(null);
  const lsOpenRef = useRef<Set<string>>(new Set());
  const lsVersionRef = useRef<Record<string, number>>({});
  const lsGlyphRef = useRef<Record<string, string[]>>({});
  const prevOpenFileRef = useRef<string | null>(null);
  const lsReadyRef = useRef(false);
  const monaco = useMonaco();
  const monacoRef = useRef<ReturnType<typeof useMonaco> | null>(null);
  const splitRatioRef = useRef(splitRatio);
  const consoleSplitRatioRef = useRef(consoleSplitRatio);
  const getConsoleMinHeight = useCallback(() => {
    if (typeof window === "undefined") return 100;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--console-min-height")
      .trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 100;
  }, []);

  const dirty = useMemo(() => {
    if (!openFile) return false;
    return content !== lastSavedContent;
  }, [content, lastSavedContent, openFile]);

  const hasUnsavedChanges = useMemo(
    () => Object.values(fileDrafts).some((draft) => draft.content !== draft.lastSavedContent),
    [fileDrafts]
  );

  const projectName = useMemo(
    () => (projectPath ? basename(projectPath) : ""),
    [projectPath]
  );

  const updateDraftForPath = useCallback(
    (path: string, nextContent: string, savedOverride?: string) => {
      setFileDrafts((prev) => {
        const existing = prev[path];
        const lastSaved = savedOverride ?? existing?.lastSavedContent ?? nextContent;
        if (existing && existing.content === nextContent && existing.lastSavedContent === lastSaved) {
          return prev;
        }
        return {
          ...prev,
          [path]: {
            content: nextContent,
            lastSavedContent: lastSaved
          }
        };
      });
    },
    []
  );

  const setRunSession = useCallback((id: number | null) => {
    runSessionRef.current = id;
    setRunSessionId(id);
  }, []);

  useEffect(() => {
    if (monaco) {
      monacoRef.current = monaco;
    }
  }, [monaco]);

  useEffect(() => {
    if (settings.layout?.umlSplitRatio !== undefined) {
      setSplitRatio(settings.layout.umlSplitRatio);
    }
  }, [settings.layout?.umlSplitRatio]);

  useEffect(() => {
    if (settings.layout?.consoleSplitRatio !== undefined) {
      setConsoleSplitRatio(settings.layout.consoleSplitRatio);
    }
  }, [settings.layout?.consoleSplitRatio]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  useEffect(() => {
    consoleSplitRatioRef.current = consoleSplitRatio;
  }, [consoleSplitRatio]);

  const notifyLsOpen = useCallback((path: string, text: string) => {
    if (!lsReadyRef.current) return;
    if (lsOpenRef.current.has(path)) return;
    lsOpenRef.current.add(path);
    lsVersionRef.current[path] = 1;
    void invoke("ls_did_open", {
      uri: toFileUri(path),
      text,
      languageId: "java"
    }).catch(() => undefined);
  }, []);

  const notifyLsClose = useCallback((path: string) => {
    if (!lsReadyRef.current) return;
    if (!lsOpenRef.current.has(path)) return;
    lsOpenRef.current.delete(path);
    delete lsVersionRef.current[path];
    void invoke("ls_did_close", { uri: toFileUri(path) }).catch(() => undefined);
    const monacoInstance = monacoRef.current;
    if (monacoInstance) {
      const uri = toFileUri(path);
      const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
      if (model) {
        monacoInstance.editor.setModelMarkers(model, "jdtls", []);
        const existing = lsGlyphRef.current[uri] ?? [];
        if (existing.length > 0) {
          model.deltaDecorations(existing, []);
        }
        delete lsGlyphRef.current[uri];
      }
    }
  }, []);

  const notifyLsChange = useCallback((path: string, text: string) => {
    if (!lsReadyRef.current) return;
    if (!lsOpenRef.current.has(path)) {
      notifyLsOpen(path, text);
      return;
    }
    const nextVersion = (lsVersionRef.current[path] ?? 1) + 1;
    lsVersionRef.current[path] = nextVersion;
    void invoke("ls_did_change", {
      uri: toFileUri(path),
      version: nextVersion,
      text
    }).catch(() => undefined);
  }, [notifyLsOpen]);

  const formatAndSaveUmlFiles = useCallback(
    async (setStatusMessage: boolean) => {
      const targetPaths =
        umlGraph?.nodes?.length
          ? Array.from(new Set(umlGraph.nodes.map((node) => node.path)))
          : Object.keys(fileDrafts);
      if (targetPaths.length === 0) return 0;

      const entries: { path: string; content: string; hasDraft: boolean }[] = [];
      for (const path of targetPaths) {
        const draft = fileDrafts[path];
        if (draft) {
          entries.push({ path, content: draft.content, hasDraft: true });
          continue;
        }
        try {
          const text = await invoke<string>("read_text_file", { path });
          entries.push({ path, content: text, hasDraft: false });
        } catch {
          // Skip files we cannot read.
        }
      }
      if (entries.length === 0) return 0;

      const formatted: Record<string, string> = {};
      const tempOpened: string[] = [];
      const monacoInstance = monacoRef.current;

      if (lsReadyRef.current && settings.editor.autoFormatOnSave) {
        for (const entry of entries) {
          const path = entry.path;
          const text = entry.content;
          if (!lsOpenRef.current.has(path)) {
            notifyLsOpen(path, text);
            tempOpened.push(path);
          } else {
            notifyLsChange(path, text);
          }
        }

        for (const entry of entries) {
          const path = entry.path;
          const draftContent = entry.content;
          const uri = toFileUri(path);
          const model = monacoInstance
            ? monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri))
            : null;
          const tabSize = settings.editor.tabSize;
          const insertSpaces = settings.editor.insertSpaces;

          try {
            const edits = await invoke<LspTextEdit[]>("ls_format_document", {
              uri,
              tabSize,
              insertSpaces
            });
            if (edits && edits.length > 0) {
              let next = draftContent;
              if (model) {
                const monacoEdits = [...edits]
                  .sort(sortTextEditsDescending)
                  .map((edit) => ({
                    range: new monacoInstance.Range(
                      edit.range.start.line + 1,
                      edit.range.start.character + 1,
                      edit.range.end.line + 1,
                      edit.range.end.character + 1
                    ),
                    text: edit.newText
                  }));
                model.pushEditOperations([], monacoEdits, () => null);
                next = model.getValue();
                if (openFilePath === path) {
                  setContent(next);
                }
              } else {
                next = applyTextEdits(draftContent, edits);
              }
              formatted[path] = next;
              if (entry.hasDraft) {
                updateDraftForPath(path, next);
              }
              notifyLsChange(path, next);
            }
          } catch {
            // Formatting failed; keep original content.
          }
        }

        for (const path of tempOpened) {
          notifyLsClose(path);
        }
      }

      for (const entry of entries) {
        const path = entry.path;
        const contents = formatted[path] ?? entry.content;
        await invoke("write_text_file", { path, contents });
        if (entry.hasDraft) {
          updateDraftForPath(path, contents, contents);
        }
        if (openFilePath === path) {
          setLastSavedContent(contents);
          if (formatted[path]) {
            setContent(contents);
          }
        }
      }

      if (setStatusMessage) {
        setStatus(entries.length === 1 ? "Saved 1 file." : `Saved ${entries.length} files.`);
      }
      return entries.length;
    },
    [
      fileDrafts,
      notifyLsChange,
      notifyLsClose,
      notifyLsOpen,
      openFilePath,
      settings.editor,
      umlGraph,
      updateDraftForPath
    ]
  );

  const flushConsole = useCallback(() => {
    if (consoleFlushRef.current !== null) return;
    consoleFlushRef.current = window.setTimeout(() => {
      consoleFlushRef.current = null;
      const lines = consoleLinesRef.current;
      const dropped = consoleDroppedRef.current;
      const text = dropped > 0 ? [...lines, `... ${dropped} lines truncated ...`].join("\n") : lines.join("\n");
      setConsoleOutput(text);
    }, 50);
  }, []);

  const appendConsole = useCallback(
    (text: string) => {
      const lines = consoleLinesRef.current;
      const incoming = text.split(/\r?\n/);
      for (const line of incoming) {
        lines.push(line);
      }
      const maxLines = 2000;
      if (lines.length > maxLines) {
        const excess = lines.length - maxLines;
        lines.splice(0, excess);
        consoleDroppedRef.current += excess;
      }
      flushConsole();
    },
    [flushConsole]
  );

  const resetConsole = useCallback((text = "") => {
    if (consoleFlushRef.current !== null) {
      window.clearTimeout(consoleFlushRef.current);
      consoleFlushRef.current = null;
    }
    consoleDroppedRef.current = 0;
    if (text) {
      consoleLinesRef.current = text.split(/\r?\n/);
    } else {
      consoleLinesRef.current = [];
    }
    setConsoleOutput(text);
  }, []);

  const visibleGraph = useMemo(() => {
    if (!umlGraph) return null;
    if (settings.uml.showDependencies) return umlGraph;
    return {
      ...umlGraph,
      edges: umlGraph.edges.filter((edge) => edge.kind !== "dependency")
    };
  }, [umlGraph, settings.uml.showDependencies]);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const stored = await readSettings();
        const defaults = createDefaultSettings();
        const merged: AppSettings = {
          ...defaults,
          ...stored,
          uml: {
            ...defaults.uml,
            ...(stored as AppSettings).uml
          },
          editor: {
            ...defaults.editor,
            ...(stored as AppSettings).editor
          },
          layout: {
            ...defaults.layout,
            ...(stored as AppSettings).layout
          }
        };
        if (!cancelled) {
          setSettings(merged);
        }
      } catch {
        if (!cancelled) {
          setSettings(createDefaultSettings());
        }
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectPath) return;
    lsReadyRef.current = false;
    void invoke<string>("ls_start", { projectRoot: projectPath }).catch(() => undefined);
    return () => {
      void invoke("ls_stop").catch(() => undefined);
    };
  }, [projectPath]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const crashUnlisten = await listen<LsCrashedEvent>("ls_crashed", (event) => {
        if (!active) return;
        lsReadyRef.current = false;
        if (projectPath && event.payload.projectRoot === projectPath) {
          void invoke<string>("ls_start", { projectRoot: projectPath }).catch(() => undefined);
        }
      });
      if (!active) {
        crashUnlisten();
        return;
      }
      unlisten = crashUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [projectPath]);

  useEffect(() => {
    let unlistenReady: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const readyUnlisten = await listen("ls_ready", () => {
        lsReadyRef.current = true;
        if (openFilePath) {
          notifyLsOpen(openFilePath, content);
        }
      });
      if (!active) {
        readyUnlisten();
        return;
      }
      unlistenReady = readyUnlisten;

      const errorUnlisten = await listen("ls_error", () => {
        lsReadyRef.current = false;
      });
      if (!active) {
        errorUnlisten();
        return;
      }
      unlistenError = errorUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenReady) unlistenReady();
      if (unlistenError) unlistenError();
    };
  }, [openFilePath, content, notifyLsOpen]);

  useEffect(() => {
    let unlistenDiagnostics: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const diagnosticsUnlisten = await listen<LsDiagnosticsEvent>(
        "ls_diagnostics",
        (event) => {
          const monacoInstance = monacoRef.current;
          if (!monacoInstance) return;
          const model = monacoInstance.editor.getModel(
            monacoInstance.Uri.parse(event.payload.uri)
          );
          if (!model) return;
          const diagnostics = event.payload.diagnostics ?? [];
          const markers = diagnostics
            .filter((diag) => diag.severity === 1)
            .map((diag) => ({
              startLineNumber: diag.range.start.line + 1,
              startColumn: diag.range.start.character + 1,
              endLineNumber: diag.range.end.line + 1,
              endColumn: diag.range.end.character + 1,
              severity: monacoInstance.MarkerSeverity.Error,
              message: diag.message,
              source: diag.source ?? "jdtls"
            }));
          monacoInstance.editor.setModelMarkers(model, "jdtls", markers);

          const glyphDecorations = markers.map((marker) => ({
            range: new monacoInstance.Range(
              marker.startLineNumber,
              1,
              marker.startLineNumber,
              1
            ),
            options: {
              glyphMarginClassName: "codicon codicon-error",
              glyphMarginHoverMessage: { value: marker.message }
            }
          }));
          const existing = lsGlyphRef.current[event.payload.uri] ?? [];
          const next = model.deltaDecorations(existing, glyphDecorations);
          lsGlyphRef.current[event.payload.uri] = next;
        }
      );

      if (!active) {
        diagnosticsUnlisten();
        return;
      }
      unlistenDiagnostics = diagnosticsUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenDiagnostics) unlistenDiagnostics();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenStart: (() => void) | null = null;
    let unlistenOutput: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;

    const setup = async () => {
      const startUnlisten = await listen<RunStartEvent>("run-start", (event) => {
        setRunSession(event.payload.runId);
      });
      if (!active) {
        startUnlisten();
        return;
      }
      unlistenStart = startUnlisten;

      const outputUnlisten = await listen<RunOutputEvent>("run-output", (event) => {
        const activeId = runSessionRef.current;
        if (activeId === null || event.payload.runId !== activeId) return;
        const prefix = event.payload.stream === "stderr" ? "[stderr] " : "";
        if (event.payload.line) {
          appendConsole(`${prefix}${event.payload.line}`);
        }
      });
      if (!active) {
        outputUnlisten();
        return;
      }
      unlistenOutput = outputUnlisten;

      const completeUnlisten = await listen<RunCompleteEvent>("run-complete", (event) => {
        const activeId = runSessionRef.current;
        if (activeId === null || event.payload.runId !== activeId) return;
        const exitLabel = event.payload.ok
          ? "Run finished."
          : `Run failed (exit ${event.payload.code ?? "?"}).`;
        appendConsole(exitLabel);
        setStatus(event.payload.ok ? "Run main succeeded." : "Run main failed.");
        setRunSession(null);
      });
      if (!active) {
        completeUnlisten();
        return;
      }
      unlistenComplete = completeUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenStart) unlistenStart();
      if (unlistenOutput) unlistenOutput();
      if (unlistenComplete) unlistenComplete();
    };
  }, [appendConsole, setRunSession]);

  const handleSettingsChange = (next: AppSettings) => {
    setSettings(next);
    void writeSettings(next);
  };

  const updateUmlSplitRatioSetting = useCallback((ratio: number) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        layout: {
          ...prev.layout,
          umlSplitRatio: ratio
        }
      };
      void writeSettings(next);
      return next;
    });
  }, []);

  const updateConsoleSplitRatioSetting = useCallback((ratio: number) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        layout: {
          ...prev.layout,
          consoleSplitRatio: ratio
        }
      };
      void writeSettings(next);
      return next;
    });
  }, []);

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

  const refreshTree = useCallback(async (root: string) => {
    const result = await invoke<FileNode>("list_project_tree", { root });
    setTree(result);
  }, []);

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
  }, [compileStatus, openFilePath, fileDrafts, lastSavedContent, updateDraftForPath, notifyLsChange]);

  const loadDiagramState = async (root: string, graph: UmlGraph) => {
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
  };

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
      lastGoodGraph.current = null;
      setDiagramState(null);
      setDiagramPath(null);
      setOpenFile(null);
      setFileDrafts({});
      setContent("");
      setLastSavedContent("");
      setCompileStatus(null);
      lsOpenRef.current.clear();
      lsVersionRef.current = {};
      prevOpenFileRef.current = null;
      setStatus(`Project loaded: ${dir}`);
    } catch (error) {
      setStatus(`Failed to open project: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [refreshTree]);

  useEffect(() => {
    if (!projectPath || !tree) {
      setUmlGraph(null);
      lastGoodGraph.current = null;
      setDiagramState(null);
      setDiagramPath(null);
      if (Object.keys(fileDrafts).length > 0) {
        setFileDrafts({});
      }
      return;
    }

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
  }, [projectPath, tree, fileDrafts, resetConsole]);

  useEffect(() => {
    const window = getCurrentWindow();
    const nextTitle = projectPath ? `${defaultTitle} - ${projectPath}` : defaultTitle;
    window.setTitle(nextTitle).catch(() => undefined);
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || !umlGraph) return;
    void loadDiagramState(projectPath, umlGraph);
  }, [projectPath, umlGraph]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const minPanel = 260;
      let x = event.clientX - rect.left;
      x = Math.max(minPanel, Math.min(rect.width - minPanel, x));
      setSplitRatio(x / rect.width);
    };

    const handleUp = () => {
      setIsResizing(false);
      const ratio = splitRatioRef.current;
      if (Number.isFinite(ratio)) {
        updateUmlSplitRatioSetting(ratio);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isResizing, updateUmlSplitRatioSetting]);

  useEffect(() => {
    if (!isConsoleResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!consoleContainerRef.current) return;
      const rect = consoleContainerRef.current.getBoundingClientRect();
      const minPanel = getConsoleMinHeight();
      let y = event.clientY - rect.top;
      y = Math.max(minPanel, Math.min(rect.height - minPanel, y));
      setConsoleSplitRatio(y / rect.height);
    };

    const handleUp = () => {
      setIsConsoleResizing(false);
      const ratio = consoleSplitRatioRef.current;
      if (Number.isFinite(ratio)) {
        updateConsoleSplitRatioSetting(ratio);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [getConsoleMinHeight, isConsoleResizing, updateConsoleSplitRatioSetting]);

  const openFileByPath = async (path: string) => {
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
  };

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await formatAndSaveUmlFiles(true);
    } catch (error) {
      setStatus(`Failed to save file: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  }, [formatAndSaveUmlFiles]);

  const handleExportProject = async () => {
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
      lastGoodGraph.current = null;
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
  };

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

  useEffect(() => {
    const prev = prevOpenFileRef.current;
    if (prev && prev !== openFilePath) {
      notifyLsClose(prev);
    }
    prevOpenFileRef.current = openFilePath;
  }, [openFilePath, notifyLsClose]);

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

  const handleCompileClass = async (node: UmlNode) => {
    if (!projectPath) return;
    const overrides = Object.entries(fileDrafts)
      .filter(([, draft]) => draft.content !== draft.lastSavedContent)
      .map(([path, draft]) => ({
        path,
        content: draft.content
      }));

    setBusy(true);
    const startedAt = new Date().toLocaleTimeString();
    resetConsole();
    setCompileStatus(null);
    appendConsole(`[${startedAt}] Compile requested for ${node.name}`);
    try {
      await formatAndSaveUmlFiles(false);
      const result = await invoke<{
        ok: boolean;
        stdout: string;
        stderr: string;
      }>("compile_project", {
        root: projectPath,
        srcRoot: "src",
        overrides
      });
      if (result.stdout) {
        appendConsole(result.stdout.trim());
      }
      if (result.stderr) {
        appendConsole(result.stderr.trim());
      }
      if (result.ok) {
        appendConsole("Compilation succeeded.");
        setCompileStatus("success");
      } else if (!result.stderr && !result.stdout) {
        appendConsole("Compilation failed.");
      }
      if (!result.ok) {
        setCompileStatus("failed");
      }
      setStatus(result.ok ? "Compile succeeded." : "Compile failed.");
    } catch (error) {
      appendConsole(`Compile failed: ${formatStatus(error)}`);
      setCompileStatus("failed");
      setStatus("Compile failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleRunMain = async (node: UmlNode) => {
    if (!projectPath) return;
    const startedAt = new Date().toLocaleTimeString();
    resetConsole();
    appendConsole(`[${startedAt}] Run main requested for ${node.name}`);
    try {
      if (runSessionRef.current !== null) {
        await invoke("cancel_run");
        setRunSession(null);
      }
      await invoke<number>("run_main", {
        root: projectPath,
        mainClass: node.id
      });
      setStatus("Run main started.");
    } catch (error) {
      appendConsole(`Run main failed: ${formatStatus(error)}`);
      setStatus("Run main failed.");
      setRunSession(null);
    }
  };

  const handleCancelRun = async () => {
    if (runSessionRef.current === null) return;
    try {
      await invoke("cancel_run");
      appendConsole("Run cancellation requested.");
      setStatus("Cancelling run...");
    } catch (error) {
      appendConsole(`Cancel failed: ${formatStatus(error)}`);
      setStatus("Cancel failed.");
    }
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
              onPointerDown={(event) => {
                event.preventDefault();
                setIsResizing(true);
              }}
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
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setIsConsoleResizing(true);
                  }}
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
