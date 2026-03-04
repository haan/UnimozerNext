import type { FileNode } from "../models/files";
import type { UmlGraph, UmlNode } from "../models/uml";
import {
  invokeValidated,
  parseUmlGraphResponseSchema
} from "./tauriValidation";
import { toRelativePath } from "./paths";

const stripJavaExtension = (name: string) => name.replace(/\.java$/i, "");

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
    edges: [],
    failedFiles: []
  };
};

export type UmlOverride = {
  path: string;
  content: string;
};

export const parseUmlGraph = async (
  root: string,
  srcRoot: string,
  overrides: UmlOverride[],
  includeStructogramIr = false
): Promise<{ graph: UmlGraph; raw: string }> =>
  invokeValidated(
    "parse_uml_graph",
    parseUmlGraphResponseSchema,
    "parse_uml_graph response",
    {
      root,
      srcRoot,
      overrides,
      includeStructogramIr
    }
  );
