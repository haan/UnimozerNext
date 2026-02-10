import { useMemo } from "react";

import type { FileNode } from "../models/files";
import type { OpenFile } from "../models/openFile";
import type { UmlGraph } from "../models/uml";

type UseAppDerivedStateArgs = {
  tree: FileNode | null;
  openFile: OpenFile | null;
  content: string;
  lastSavedContent: string;
  umlGraph: UmlGraph | null;
  showDependencies: boolean;
  showSwingAttributes: boolean;
};

type UseAppDerivedStateResult = {
  scratchHasClasses: boolean;
  dirty: boolean;
  visibleGraph: UmlGraph | null;
  isMac: boolean;
};

const hasClassFilesInTree = (node: FileNode | null): boolean => {
  if (!node) return false;
  if (node.kind === "file") {
    return node.name.toLowerCase().endsWith(".java");
  }
  return (node.children ?? []).some((child) => hasClassFilesInTree(child));
};

export const useAppDerivedState = ({
  tree,
  openFile,
  content,
  lastSavedContent,
  umlGraph,
  showDependencies,
  showSwingAttributes
}: UseAppDerivedStateArgs): UseAppDerivedStateResult => {
  const scratchHasClasses = useMemo(() => hasClassFilesInTree(tree), [tree]);

  const dirty = useMemo(() => {
    if (!openFile) return false;
    return content !== lastSavedContent;
  }, [content, lastSavedContent, openFile]);

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

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform),
    []
  );

  return {
    scratchHasClasses,
    dirty,
    visibleGraph,
    isMac
  };
};
