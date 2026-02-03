export type UmlNodeKind = "class" | "interface" | "enum" | "record";
export type UmlEdgeKind =
  | "extends"
  | "implements"
  | "association"
  | "dependency"
  | "reflexive-association";

export type UmlMethod = {
  signature: string;
  name?: string;
  returnType?: string;
  params?: { name: string; type: string }[];
  isMain?: boolean;
  isAbstract?: boolean;
  isStatic?: boolean;
  visibility?: string;
  declaringClass?: string;
  isInherited?: boolean;
  range?: UmlSourceRange;
};

export type UmlConstructor = {
  signature: string;
  params: { name: string; type: string }[];
  visibility?: string;
};

export type UmlField = {
  signature: string;
  isStatic?: boolean;
  visibility?: string;
  range?: UmlSourceRange;
};

export type UmlSourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type UmlNode = {
  id: string;
  name: string;
  kind: UmlNodeKind;
  path: string;
  isAbstract?: boolean;
  isInvalid?: boolean;
  fields: UmlField[];
  methods: UmlMethod[];
};

export type UmlEdge = {
  id: string;
  from: string;
  to: string;
  kind: UmlEdgeKind;
};

export type UmlGraph = {
  nodes: UmlNode[];
  edges: UmlEdge[];
  failedFiles?: string[];
};
