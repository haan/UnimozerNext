import { useEffect, useRef, useState } from "react";

import type { FileNode } from "../models/files";
import type { FileDraft } from "../models/drafts";
import type { UmlGraph } from "../models/uml";
import { buildMockGraph, parseUmlGraph } from "../services/uml";
import { basename, toFqnFromPath } from "../services/paths";

type UseUmlGraphArgs = {
  projectPath: string | null;
  tree: FileNode | null;
  fileDrafts: Record<string, FileDraft>;
  setUmlGraph: React.Dispatch<React.SetStateAction<UmlGraph | null>>;
  onDebugLog?: (text: string) => void;
  formatStatus: (input: unknown) => string;
};

type UseUmlGraphResult = {
  umlStatus: string | null;
  lastGoodGraphRef: React.MutableRefObject<UmlGraph | null>;
};

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

export const useUmlGraph = ({
  projectPath,
  tree,
  fileDrafts,
  setUmlGraph,
  onDebugLog,
  formatStatus
}: UseUmlGraphArgs): UseUmlGraphResult => {
  const [umlStatus, setUmlStatus] = useState<string | null>(null);
  const parseSeq = useRef(0);
  const lastGoodGraphRef = useRef<UmlGraph | null>(null);

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
    let active = true;
    const runParse = async () => {
      setUmlStatus("Parsing UML...");
      try {
        const result = await parseUmlGraph(projectPath, "src", overrides);
        const graph = result.graph;
        if (!active || currentSeq !== parseSeq.current) {
          return;
        }
        if (onDebugLog) {
          onDebugLog(`[UML] ${new Date().toLocaleTimeString()}\n${result.raw}`);
        }
        const mergedGraph = mergeWithLastGoodGraph(graph, lastGoodGraphRef.current);
        const withFailedNodes = ensureFailedNodes(
          mergedGraph,
          graph.failedFiles,
          projectPath,
          "src"
        );
        const nextGraph = applyInvalidFlags(withFailedNodes, graph.failedFiles);
        lastGoodGraphRef.current = nextGraph;
        setUmlGraph(nextGraph);
        if (graph.failedFiles && graph.failedFiles.length > 0) {
          const count = graph.failedFiles.length;
          setUmlStatus(
            `UML parse incomplete (${count} file${count === 1 ? "" : "s"}).`
          );
        } else {
          setUmlStatus(null);
        }
      } catch (error) {
        if (!active || currentSeq !== parseSeq.current) {
          return;
        }
        setUmlStatus(`UML parse failed: ${formatStatus(error)}`);
        if (lastGoodGraphRef.current) {
          setUmlGraph(lastGoodGraphRef.current);
        } else {
          const fallback = buildMockGraph(tree, projectPath);
          setUmlGraph(fallback);
        }
      }
    };

    void runParse();

    return () => {
      active = false;
    };
  }, [projectPath, tree, fileDrafts, onDebugLog, formatStatus, setUmlGraph]);

  return {
    umlStatus,
    lastGoodGraphRef
  };
};
