import { useCallback, useEffect, useRef, useState } from "react";

import type { FileNode } from "../models/files";
import type { FileDraft } from "../models/drafts";
import type { UmlGraph } from "../models/uml";
import { buildMockGraph, parseUmlGraph } from "../services/uml";
import { basename, toFqnFromPath } from "../services/paths";

type UseUmlGraphArgs = {
  projectPath: string | null;
  projectStorageMode: "folder" | "packed" | "scratch" | null;
  includeStructogramIr: boolean;
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

type PendingParseRequest = {
  seq: number;
  projectPath: string;
  includeStructogramIr: boolean;
  tree: FileNode;
  overrides: Array<{
    path: string;
    content: string;
  }>;
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

const hasJavaFiles = (node: FileNode): boolean => {
  if (node.kind === "file") {
    return node.name.toLowerCase().endsWith(".java");
  }
  return (node.children ?? []).some((child) => hasJavaFiles(child));
};

export const useUmlGraph = ({
  projectPath,
  projectStorageMode,
  includeStructogramIr,
  tree,
  fileDrafts,
  setUmlGraph,
  onDebugLog,
  formatStatus
}: UseUmlGraphArgs): UseUmlGraphResult => {
  const [umlStatus, setUmlStatus] = useState<string | null>(null);
  const parseSeqRef = useRef(0);
  const parseInFlightRef = useRef(false);
  const pendingParseRef = useRef<PendingParseRequest | null>(null);
  const isMountedRef = useRef(true);
  const onDebugLogRef = useRef(onDebugLog);
  const formatStatusRef = useRef(formatStatus);
  const lastGoodGraphRef = useRef<UmlGraph | null>(null);

  useEffect(() => {
    onDebugLogRef.current = onDebugLog;
    formatStatusRef.current = formatStatus;
  }, [onDebugLog, formatStatus]);

  const drainParseQueue = useCallback(() => {
    if (parseInFlightRef.current) return;
    parseInFlightRef.current = true;

    void (async () => {
      try {
        while (isMountedRef.current) {
          const request = pendingParseRef.current;
          if (!request) break;
          pendingParseRef.current = null;

          setUmlStatus("Parsing UML...");
          try {
            const result = await parseUmlGraph(
              request.projectPath,
              "src",
              request.overrides,
              request.includeStructogramIr
            );
            const isLatest = request.seq === parseSeqRef.current;
            const hasPendingNewer = pendingParseRef.current !== null;
            if (!isMountedRef.current || !isLatest || hasPendingNewer) {
              continue;
            }

            const graph = result.graph;
            const debugLog = onDebugLogRef.current;
            if (debugLog) {
              debugLog(`${new Date().toLocaleTimeString()}\n${result.raw}`);
            }
            const mergedGraph = mergeWithLastGoodGraph(graph, lastGoodGraphRef.current);
            const withFailedNodes = ensureFailedNodes(
              mergedGraph,
              graph.failedFiles,
              request.projectPath,
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
            const isLatest = request.seq === parseSeqRef.current;
            const hasPendingNewer = pendingParseRef.current !== null;
            if (!isMountedRef.current || !isLatest || hasPendingNewer) {
              continue;
            }

            const formatError = formatStatusRef.current;
            setUmlStatus(`UML parse failed: ${formatError(error)}`);
            if (lastGoodGraphRef.current) {
              setUmlGraph(lastGoodGraphRef.current);
            } else {
              const fallback = buildMockGraph(request.tree, request.projectPath);
              setUmlGraph(fallback);
            }
          }
        }
      } finally {
        parseInFlightRef.current = false;
        if (isMountedRef.current && pendingParseRef.current) {
          drainParseQueue();
        }
      }
    })();
  }, [setUmlGraph]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pendingParseRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!projectPath || !tree) {
      parseSeqRef.current += 1;
      pendingParseRef.current = null;
      return;
    }

    if (projectStorageMode === "scratch" && !hasJavaFiles(tree)) {
      parseSeqRef.current += 1;
      pendingParseRef.current = null;
      const mockGraph = buildMockGraph(tree, projectPath);
      lastGoodGraphRef.current = mockGraph;
      setUmlGraph(mockGraph);
      setUmlStatus(null);
      return;
    }

    const overrides = Object.entries(fileDrafts)
      .filter(([, draft]) => draft.content !== draft.lastSavedContent)
      .map(([path, draft]) => ({
        path,
        content: draft.content
      }));

    parseSeqRef.current += 1;
    pendingParseRef.current = {
      seq: parseSeqRef.current,
      projectPath,
      includeStructogramIr,
      tree,
      overrides
    };
    drainParseQueue();
  }, [
    projectPath,
    projectStorageMode,
    includeStructogramIr,
    tree,
    fileDrafts,
    setUmlGraph,
    drainParseQueue
  ]);

  return {
    umlStatus,
    lastGoodGraphRef
  };
};
