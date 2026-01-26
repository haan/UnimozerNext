import type { DiagramState, DiagramNodePosition } from "../models/diagram";

const GRID_COLS = 3;
const GRID_X = 40;
const GRID_Y = 40;
const GRID_W = 260;
const GRID_H = 180;

export const createDefaultDiagramState = (): DiagramState => ({
  version: 1,
  showFields: true,
  showMethods: true,
  showParams: true,
  showTypes: true,
  showVisibility: true,
  showRelations: true,
  nodes: {},
  viewport: {
    panX: 0,
    panY: 0,
    zoom: 1
  }
});

const positionForIndex = (index: number): DiagramNodePosition => {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return {
    x: GRID_X + col * GRID_W,
    y: GRID_Y + row * GRID_H
  };
};

export const mergeDiagramState = (
  base: DiagramState,
  nodeIds: string[]
): { state: DiagramState; added: boolean } => {
  const nodes = { ...base.nodes };
  const existingCount = Object.keys(nodes).length;
  let added = false;
  let newIndex = 0;

  const sorted = [...nodeIds].sort((a, b) => a.localeCompare(b));
  for (const id of sorted) {
    if (!nodes[id]) {
      nodes[id] = positionForIndex(existingCount + newIndex);
      newIndex += 1;
      added = true;
    }
  }

  return {
    state: {
      ...base,
      nodes
    },
    added
  };
};

export const parseLegacyPck = (content: string): Record<string, DiagramNodePosition> => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 6) {
    return {};
  }

  const nodes: Record<string, DiagramNodePosition> = {};
  for (const line of lines.slice(6)) {
    const match = line.match(/^"(.+?)","(-?\d+)","(-?\d+)"$/);
    if (!match) continue;
    const [, fqn, x, y] = match;
    nodes[fqn] = { x: Number.parseInt(x, 10), y: Number.parseInt(y, 10) };
  }
  return nodes;
};
