import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { DiagramPanel } from "./components/diagram/DiagramPanel";
import { CodePanel } from "./components/editor/CodePanel";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger
} from "./components/ui/menubar";
import type { DiagramState } from "./models/diagram";
import type { FileNode } from "./models/files";
import type { UmlGraph } from "./models/uml";
import { createDefaultDiagramState, mergeDiagramState, parseLegacyPck } from "./services/diagram";
import { buildMockGraph, parseUmlGraph } from "./services/uml";

type OpenFile = {
  name: string;
  path: string;
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
  const [umlStatus, setUmlStatus] = useState<string | null>(null);
  const parseSeq = useRef(0);
  const lastGoodGraph = useRef<UmlGraph | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isResizing, setIsResizing] = useState(false);
  const openFilePath = openFile?.path ?? null;

  const dirty = useMemo(() => {
    if (!openFile) return false;
    return content !== lastSavedContent;
  }, [content, lastSavedContent, openFile]);

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

  const refreshTree = async (root: string) => {
    const result = await invoke<FileNode>("list_project_tree", { root });
    setTree(result);
  };

  const loadDiagramState = async (root: string, graph: UmlGraph) => {
    const diagramFile = joinPath(root, "diagram.json");
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

  const handleOpenProject = async () => {
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
      setContent("");
      setLastSavedContent("");
      setStatus(`Project loaded: ${dir}`);
    } catch (error) {
      setStatus(`Failed to open project: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!projectPath || !tree) {
      setUmlGraph(null);
      lastGoodGraph.current = null;
      setDiagramState(null);
      setDiagramPath(null);
      return;
    }

    const overrides =
      openFilePath
        ? [
            {
              path: openFilePath,
              content
            }
          ]
        : [];

    parseSeq.current += 1;
    const currentSeq = parseSeq.current;
    const timer = window.setTimeout(async () => {
      setUmlStatus("Parsing UML...");
      try {
        const graph = await parseUmlGraph(projectPath, "src", overrides);
        if (currentSeq === parseSeq.current) {
          const mergedGraph = mergeWithLastGoodGraph(graph, lastGoodGraph.current);
          const nextGraph = applyInvalidFlags(mergedGraph, graph.failedFiles);
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
  }, [projectPath, tree, openFilePath, content]);

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
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isResizing]);

  const openFileByPath = async (path: string) => {
    setBusy(true);
    try {
      const text = await invoke<string>("read_text_file", { path });
      const name = basename(path);
      setOpenFile({ name, path });
      setContent(text);
      setLastSavedContent(text);
      setStatus(`Opened ${name}`);
    } catch (error) {
      setStatus(`Failed to open file: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!openFile) return;
    setBusy(true);
    try {
      await invoke("write_text_file", { path: openFile.path, contents: content });
      setLastSavedContent(content);
      setStatus(`Saved ${openFile.name}`);
    } catch (error) {
      setStatus(`Failed to save file: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAs = async () => {
    const selection = await save({
      title: "Save Java File As",
      defaultPath: openFile?.path
    });
    if (!selection || typeof selection !== "string") {
      setStatus("Save As cancelled.");
      return;
    }

    setBusy(true);
    try {
      await invoke("write_text_file", { path: selection, contents: content });
      const name = basename(selection);
      setOpenFile({ name, path: selection });
      setLastSavedContent(content);
      setStatus(`Saved ${name}`);
    } catch (error) {
      setStatus(`Failed to save file: ${formatStatus(error)}`);
    } finally {
      setBusy(false);
    }
  };

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
      <header className="flex items-center border-b border-border bg-card px-4 py-2">
        <Menubar className="border-0 bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={handleOpenProject} disabled={busy}>
                Open
              </MenubarItem>
              <MenubarItem onClick={handleSave} disabled={!dirty || busy || !openFile}>
                Save
              </MenubarItem>
              <MenubarItem onClick={handleSaveAs} disabled={busy}>
                Save As
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
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col bg-background">
          <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
            <section
              className="flex flex-col border-r border-border"
              style={{ width: `${splitRatio * 100}%` }}
            >
              <DiagramPanel
                graph={umlGraph}
                diagram={diagramState}
                onNodePositionChange={handleNodePositionChange}
                onNodeSelect={handleNodeSelect}
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
              <CodePanel
                openFile={openFile}
                content={content}
                dirty={dirty}
                onChange={setContent}
              />
            </section>
          </div>
        </main>
      </div>

      <footer className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        {status}
        {umlStatus ? ` • ${umlStatus}` : ""}
      </footer>
    </div>
  );
}
