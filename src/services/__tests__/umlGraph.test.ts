import { describe, it, expect } from "vitest";
import { getUmlSignature } from "../umlGraph";
import type { UmlGraph, UmlNode, UmlEdge } from "../../models/uml";

function node(id: string, fields: string[] = [], methods: string[] = [], isInvalid = false): UmlNode {
  return {
    id,
    isInvalid,
    fields: fields.map((sig) => ({ signature: sig }) as UmlNode["fields"][number]),
    methods: methods.map((sig) => ({ signature: sig }) as UmlNode["methods"][number]),
  } as unknown as UmlNode;
}

function edge(from: string, kind: string, to: string): UmlEdge {
  return { from, kind, to } as unknown as UmlEdge;
}

function graph(nodes: UmlNode[], edges: UmlEdge[]): UmlGraph {
  return { nodes, edges } as unknown as UmlGraph;
}

// ---------------------------------------------------------------------------
// null / empty
// ---------------------------------------------------------------------------

describe("getUmlSignature — null / empty", () => {
  it("returns empty string for null graph", () => {
    expect(getUmlSignature(null)).toBe("");
  });

  it("returns JSON with empty arrays for empty graph", () => {
    const result = getUmlSignature(graph([], []));
    expect(JSON.parse(result)).toEqual({ nodes: [], edges: [] });
  });
});

// ---------------------------------------------------------------------------
// node serialization
// ---------------------------------------------------------------------------

describe("getUmlSignature — node serialization", () => {
  it("includes node id", () => {
    const result = JSON.parse(getUmlSignature(graph([node("com.example.Foo")], [])));
    expect(result.nodes[0].id).toBe("com.example.Foo");
  });

  it("maps isInvalid to boolean false by default", () => {
    const result = JSON.parse(getUmlSignature(graph([node("A")], [])));
    expect(result.nodes[0].isInvalid).toBe(false);
  });

  it("maps isInvalid=true", () => {
    const result = JSON.parse(getUmlSignature(graph([node("A", [], [], true)], [])));
    expect(result.nodes[0].isInvalid).toBe(true);
  });

  it("includes field signatures", () => {
    const result = JSON.parse(getUmlSignature(graph([node("A", ["int x", "String name"])], [])));
    expect(result.nodes[0].fields).toContain("int x");
    expect(result.nodes[0].fields).toContain("String name");
  });

  it("includes method signatures", () => {
    const result = JSON.parse(getUmlSignature(graph([node("A", [], ["void run()"])], [])));
    expect(result.nodes[0].methods).toContain("void run()");
  });
});

// ---------------------------------------------------------------------------
// sorting (determinism)
// ---------------------------------------------------------------------------

describe("getUmlSignature — sorting", () => {
  it("sorts fields alphabetically within a node", () => {
    const result = JSON.parse(getUmlSignature(graph([node("A", ["z field", "a field"])], [])));
    expect(result.nodes[0].fields).toEqual(["a field", "z field"]);
  });

  it("sorts methods alphabetically within a node", () => {
    const result = JSON.parse(getUmlSignature(graph([node("A", [], ["void z()", "void a()"])], [])));
    expect(result.nodes[0].methods).toEqual(["void a()", "void z()"]);
  });

  it("sorts nodes by id", () => {
    const result = JSON.parse(getUmlSignature(graph([node("B"), node("A")], [])));
    expect(result.nodes[0].id).toBe("A");
    expect(result.nodes[1].id).toBe("B");
  });

  it("sorts edges as strings", () => {
    const result = JSON.parse(getUmlSignature(graph([], [
      edge("B", "extends", "C"),
      edge("A", "implements", "I"),
    ])));
    expect(result.edges[0]).toBe("A:implements:I");
    expect(result.edges[1]).toBe("B:extends:C");
  });

  it("produces the same signature regardless of input order", () => {
    const g1 = graph([node("B"), node("A")], [edge("B", "extends", "A"), edge("A", "implements", "I")]);
    const g2 = graph([node("A"), node("B")], [edge("A", "implements", "I"), edge("B", "extends", "A")]);
    expect(getUmlSignature(g1)).toBe(getUmlSignature(g2));
  });
});

// ---------------------------------------------------------------------------
// change detection
// ---------------------------------------------------------------------------

describe("getUmlSignature — change detection", () => {
  it("different node ids produce different signatures", () => {
    const a = getUmlSignature(graph([node("Foo")], []));
    const b = getUmlSignature(graph([node("Bar")], []));
    expect(a).not.toBe(b);
  });

  it("adding a field changes the signature", () => {
    const before = getUmlSignature(graph([node("A")], []));
    const after = getUmlSignature(graph([node("A", ["int x"])], []));
    expect(before).not.toBe(after);
  });

  it("adding an edge changes the signature", () => {
    const before = getUmlSignature(graph([node("A"), node("B")], []));
    const after = getUmlSignature(graph([node("A"), node("B")], [edge("A", "extends", "B")]));
    expect(before).not.toBe(after);
  });

  it("same graph twice produces identical signature", () => {
    const g = graph([node("A", ["int x"], ["void run()"]), node("B")], [edge("A", "extends", "B")]);
    expect(getUmlSignature(g)).toBe(getUmlSignature(g));
  });
});
