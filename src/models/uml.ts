export type UmlNodeKind = "class" | "interface" | "enum" | "record";
export type UmlEdgeKind = "extends" | "implements" | "association";

export type UmlNode = {
  id: string;
  name: string;
  kind: UmlNodeKind;
  path: string;
  fields: string[];
  methods: string[];
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
};
