import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import MonacoEditor from "@monaco-editor/react";
import { useMemo, useState } from "react";

import { Button } from "./components/ui/button";

type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: FileNode[];
};

type OpenFile = {
  name: string;
  path: string;
};

const SKIP_HINTS = ["node_modules", "bin", "target", "out", ".git"];

const basename = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
};

const formatStatus = (input: unknown) =>
  typeof input === "string" ? input : JSON.stringify(input);

const TreeNode = ({
  node,
  depth,
  activePath,
  onOpenFile
}: {
  node: FileNode;
  depth: number;
  activePath: string | null;
  onOpenFile: (node: FileNode) => void;
}) => {
  const [expanded, setExpanded] = useState(true);
  const isDir = node.kind === "dir";

  return (
    <div>
      <button
        type="button"
        onClick={() => (isDir ? setExpanded(!expanded) : onOpenFile(node))}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition hover:bg-accent/60 ${
          !isDir && node.path === activePath
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-muted-foreground">
          {isDir ? (expanded ? "-" : "+") : "*"}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && expanded && node.children?.length ? (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [status, setStatus] = useState("Open a Java project to begin.");
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(() => {
    if (!openFile) return false;
    return content !== lastSavedContent;
  }, [content, lastSavedContent, openFile]);

  const refreshTree = async (root: string) => {
    const result = await invoke<FileNode>("list_project_tree", { root });
    setTree(result);
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

  const handleOpenFile = async (node: FileNode) => {
    if (node.kind !== "file") return;
    setBusy(true);
    try {
      const text = await invoke<string>("read_text_file", { path: node.path });
      setOpenFile({ name: node.name, path: node.path });
      setContent(text);
      setLastSavedContent(text);
      setStatus(`Opened ${node.name}`);
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <div className="text-lg font-semibold text-foreground">Unimozer Next</div>
          <div className="text-xs text-muted-foreground">Milestone 1: Project + File Tree + Monaco</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleOpenProject} disabled={busy}>
            Open Project
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            variant="secondary"
            disabled={!dirty || busy}
          >
            Save
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-72 flex-col border-r border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Project</div>
            <div className="mt-1 truncate text-sm text-foreground">
              {projectPath ? basename(projectPath) : "No project"}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {projectPath ? projectPath : "Use Open Project to select a folder"}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-2 py-2">
            {tree ? (
              <TreeNode node={tree} depth={0} activePath={openFile?.path ?? null} onOpenFile={handleOpenFile} />
            ) : (
              <div className="px-2 py-4 text-xs text-muted-foreground">
                Select a folder to load Java sources.
                <div className="mt-2 text-[10px] text-muted-foreground/80">
                  Hint: {SKIP_HINTS.join(", ")} are hidden.
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex flex-1 flex-col bg-background">
          <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {openFile ? openFile.path : "No file open"}
            {dirty ? " * Unsaved changes" : ""}
          </div>
          <div className="flex-1">
            {openFile ? (
              <MonacoEditor
                language="java"
                theme="vs"
                value={content}
                onChange={(value) => {
                  const next = value ?? "";
                  setContent(next);
                }}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on"
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Open a Java file from the tree to start editing.
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        {status}
      </footer>
    </div>
  );
}
