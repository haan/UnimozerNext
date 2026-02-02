import type { UmlGraph } from "../models/uml";

export const getUmlSignature = (graph: UmlGraph | null) => {
  if (!graph) return "";
  const nodes = [...graph.nodes]
    .map((node) => ({
      id: node.id,
      isInvalid: Boolean(node.isInvalid),
      fields: [...node.fields.map((field) => field.signature)].sort(),
      methods: [...node.methods.map((method) => method.signature)].sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges]
    .map((edge) => `${edge.from}:${edge.kind}:${edge.to}`)
    .sort();
  return JSON.stringify({ nodes, edges });
};
