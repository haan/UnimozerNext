import type { FileNode } from "../models/files";
import type { UmlGraph, UmlNode } from "../models/uml";

const stripJavaExtension = (name: string) => name.replace(/\.java$/i, "");

const toRelativePath = (fullPath: string, rootPath: string) => {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "").toLowerCase();
  const normalizedFull = fullPath.toLowerCase();
  if (normalizedFull.startsWith(normalizedRoot)) {
    const sliced = fullPath.slice(normalizedRoot.length).replace(/^[\\/]/, "");
    return sliced.length ? sliced : fullPath;
  }
  return fullPath;
};

const pathToFqn = (relativePath: string) =>
  stripJavaExtension(relativePath).replace(/[\\/]+/g, ".");

const fileNodeToUmlNode = (node: FileNode, rootPath: string): UmlNode => {
  const relative = toRelativePath(node.path, rootPath);
  const id = pathToFqn(relative);
  const name = stripJavaExtension(node.name);

  return {
    id,
    name,
    kind: "class",
    path: node.path,
    fields: [],
    methods: []
  };
};

const collectNodes = (node: FileNode, rootPath: string, acc: UmlNode[]) => {
  if (node.kind === "file") {
    acc.push(fileNodeToUmlNode(node, rootPath));
    return;
  }
  node.children?.forEach((child) => collectNodes(child, rootPath, acc));
};

export const buildMockGraph = (tree: FileNode, rootPath: string): UmlGraph => {
  const nodes: UmlNode[] = [];
  collectNodes(tree, rootPath, nodes);
  return {
    nodes,
    edges: []
  };
};
