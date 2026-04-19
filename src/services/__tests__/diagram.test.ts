import { describe, it, expect } from "vitest";
import {
  createDefaultDiagramState,
  normalizeDiagramState,
  mergeDiagramState,
  parseLegacyPck,
} from "../diagram";

describe("createDefaultDiagramState", () => {
  it("returns empty nodes", () => {
    expect(createDefaultDiagramState().nodes).toEqual({});
  });
  it("returns default viewport", () => {
    const { viewport } = createDefaultDiagramState();
    expect(viewport.panX).toBe(0);
    expect(viewport.panY).toBe(0);
    expect(viewport.zoom).toBe(1);
  });
});

describe("normalizeDiagramState", () => {
  it("returns default state for null input", () => {
    expect(normalizeDiagramState(null)).toEqual(createDefaultDiagramState());
  });
  it("returns default state for undefined input", () => {
    expect(normalizeDiagramState(undefined)).toEqual(createDefaultDiagramState());
  });
  it("returns default state for non-object input", () => {
    expect(normalizeDiagramState("invalid")).toEqual(createDefaultDiagramState());
  });
  it("preserves valid node positions", () => {
    const state = normalizeDiagramState({
      nodes: { "com.Foo": { x: 100, y: 200 } },
      viewport: { panX: 10, panY: 20, zoom: 1.5 },
    });
    expect(state.nodes["com.Foo"]).toEqual({ x: 100, y: 200 });
  });
  it("preserves valid viewport", () => {
    const state = normalizeDiagramState({
      nodes: {},
      viewport: { panX: 10, panY: 20, zoom: 1.5 },
    });
    expect(state.viewport.panX).toBe(10);
    expect(state.viewport.zoom).toBe(1.5);
  });
  it("discards nodes with non-finite x position", () => {
    const state = normalizeDiagramState({
      nodes: { "com.Foo": { x: Infinity, y: 0 } },
      viewport: {},
    });
    expect(state.nodes["com.Foo"]).toBeUndefined();
  });
  it("discards nodes with NaN position", () => {
    const state = normalizeDiagramState({
      nodes: { "com.Foo": { x: NaN, y: 0 } },
      viewport: {},
    });
    expect(state.nodes["com.Foo"]).toBeUndefined();
  });
  it("falls back to default viewport values for non-finite numbers", () => {
    const state = normalizeDiagramState({
      nodes: {},
      viewport: { panX: Infinity, panY: NaN, zoom: 1 },
    });
    expect(state.viewport.panX).toBe(0);
    expect(state.viewport.panY).toBe(0);
  });
});

describe("mergeDiagramState", () => {
  it("adds position for new node id", () => {
    const base = createDefaultDiagramState();
    const { state, added } = mergeDiagramState(base, ["com.Main"]);
    expect(added).toBe(true);
    expect(state.nodes["com.Main"]).toBeDefined();
  });
  it("preserves existing node positions", () => {
    const base = {
      nodes: { "com.Foo": { x: 100, y: 200 } },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };
    const { state } = mergeDiagramState(base, ["com.Foo"]);
    expect(state.nodes["com.Foo"]).toEqual({ x: 100, y: 200 });
  });
  it("prunes stale node ids not in the given list", () => {
    const base = {
      nodes: { "com.Old": { x: 40, y: 40 } },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };
    const { state, added } = mergeDiagramState(base, ["com.New"]);
    expect(state.nodes["com.Old"]).toBeUndefined();
    expect(added).toBe(true);
  });
  it("deduplicates node ids", () => {
    const base = createDefaultDiagramState();
    const { state } = mergeDiagramState(base, ["com.A", "com.A", "com.B"]);
    const nodeCount = Object.keys(state.nodes).length;
    expect(nodeCount).toBe(2);
  });
  it("returns added=false when no change", () => {
    const base = {
      nodes: { "com.Foo": { x: 40, y: 40 } },
      viewport: { panX: 0, panY: 0, zoom: 1 },
    };
    const { added } = mergeDiagramState(base, ["com.Foo"]);
    expect(added).toBe(false);
  });
});

describe("parseLegacyPck", () => {
  it("returns empty for content with 6 or fewer lines", () => {
    expect(parseLegacyPck("a\nb\nc\nd\ne\nf")).toEqual({});
  });
  it("parses node positions after 6-line header", () => {
    const content = 'line1\nline2\nline3\nline4\nline5\nline6\n"com.Main","100","200"';
    const nodes = parseLegacyPck(content);
    expect(nodes["com.Main"]).toEqual({ x: 100, y: 200 });
  });
  it("parses multiple nodes", () => {
    const content = `line1\nline2\nline3\nline4\nline5\nline6\n"com.A","10","20"\n"com.B","30","40"`;
    const nodes = parseLegacyPck(content);
    expect(nodes["com.A"]).toEqual({ x: 10, y: 20 });
    expect(nodes["com.B"]).toEqual({ x: 30, y: 40 });
  });
  it("handles negative coordinates", () => {
    const content = `line1\nline2\nline3\nline4\nline5\nline6\n"com.X","-50","-100"`;
    const nodes = parseLegacyPck(content);
    expect(nodes["com.X"]).toEqual({ x: -50, y: -100 });
  });
  it("skips malformed lines", () => {
    const content = `line1\nline2\nline3\nline4\nline5\nline6\nnot a valid line\n"com.A","10","20"`;
    const nodes = parseLegacyPck(content);
    expect(Object.keys(nodes).length).toBe(1);
  });
  it("returns empty for empty string", () => {
    expect(parseLegacyPck("")).toEqual({});
  });
});
