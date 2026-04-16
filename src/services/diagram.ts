import type { DiagramState, DiagramNodePosition } from "../models/diagram";

const GRID_COLS = 3;
const GRID_X = 40;
const GRID_Y = 40;
const GRID_W = 260;
const GRID_H = 180;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isValidNodePosition = (value: unknown): value is DiagramNodePosition => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<DiagramNodePosition>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y);
};

const dedupeAndSortNodeIds = (nodeIds: string[]) =>
  [...new Set(nodeIds)].sort((a, b) => a.localeCompare(b));

const getSimpleId = (id: string) => {
  const separator = id.lastIndexOf(".");
  return separator >= 0 ? id.slice(separator + 1) : id;
};

const alignToGrid = (value: number, origin: number, step: number) => {
  const normalized = (value - origin) / step;
  return origin + Math.round(normalized) * step;
};

const gridSlotKey = (col: number, row: number) => `${col}:${row}`;

const getGridSlotFromPosition = (
  position: DiagramNodePosition,
  startX: number,
  startY: number
): string | null => {
  const col = Math.round((position.x - startX) / GRID_W);
  const row = Math.round((position.y - startY) / GRID_H);
  if (!Number.isFinite(col) || !Number.isFinite(row)) {
    return null;
  }
  const slotX = startX + col * GRID_W;
  const slotY = startY + row * GRID_H;
  if (!isNearGridSlot(position, slotX, slotY)) {
    return null;
  }
  return gridSlotKey(col, row);
};

const isNearGridSlot = (
  position: DiagramNodePosition,
  slotX: number,
  slotY: number
) =>
  Math.abs(position.x - slotX) <= GRID_W * 0.35 &&
  Math.abs(position.y - slotY) <= GRID_H * 0.35;

const collectOccupiedGridSlots = (
  positions: DiagramNodePosition[],
  startX: number,
  startY: number
) => {
  const occupied = new Set<string>();
  for (const position of positions) {
    const slot = getGridSlotFromPosition(position, startX, startY);
    if (!slot) continue;
    occupied.add(slot);
  }
  return occupied;
};

export const createDefaultDiagramState = (): DiagramState => ({
  nodes: {},
  viewport: {
    panX: 0,
    panY: 0,
    zoom: 1
  }
});

export const normalizeDiagramState = (input: unknown): DiagramState => {
  const fallback = createDefaultDiagramState();
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const candidate = input as Partial<DiagramState> & {
    viewport?: Partial<DiagramState["viewport"]>;
  };

  const viewport: Partial<DiagramState["viewport"]> = candidate.viewport ?? {};
  const nodes = (() => {
    if (!candidate.nodes || typeof candidate.nodes !== "object") {
      return fallback.nodes;
    }
    const normalized: Record<string, DiagramNodePosition> = {};
    for (const [id, position] of Object.entries(candidate.nodes)) {
      if (!isValidNodePosition(position)) continue;
      normalized[id] = { x: position.x, y: position.y };
    }
    return normalized;
  })();

  return {
    nodes,
    viewport: {
      panX:
        typeof viewport.panX === "number" && Number.isFinite(viewport.panX)
          ? viewport.panX
          : fallback.viewport.panX,
      panY:
        typeof viewport.panY === "number" && Number.isFinite(viewport.panY)
          ? viewport.panY
          : fallback.viewport.panY,
      zoom:
        typeof viewport.zoom === "number" && Number.isFinite(viewport.zoom)
          ? viewport.zoom
          : fallback.viewport.zoom
    }
  };
};

const positionForAppendedNode = (
  startX: number,
  startY: number,
  occupiedSlots: Set<string>
): DiagramNodePosition => {
  let index = 0;
  const maxIterations = Math.max(occupiedSlots.size + 128, 256);
  while (index < maxIterations) {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const key = gridSlotKey(col, row);
    if (!occupiedSlots.has(key)) {
      occupiedSlots.add(key);
      return {
        x: startX + col * GRID_W,
        y: startY + row * GRID_H
      };
    }
    index += 1;
  }

  const fallbackCol = maxIterations % GRID_COLS;
  const fallbackRow = Math.floor(maxIterations / GRID_COLS);
  occupiedSlots.add(gridSlotKey(fallbackCol, fallbackRow));
  return {
    x: startX + fallbackCol * GRID_W,
    y: startY + fallbackRow * GRID_H
  };
};

export const mergeDiagramState = (
  base: DiagramState,
  nodeIds: string[]
): { state: DiagramState; added: boolean } => {
  const nodes: Record<string, DiagramNodePosition> = {};
  for (const [id, position] of Object.entries(base.nodes)) {
    if (!isValidNodePosition(position)) continue;
    nodes[id] = { x: position.x, y: position.y };
  }

  const sorted = dedupeAndSortNodeIds(nodeIds);
  const sortedSet = new Set(sorted);
  const anchorNodes: Record<string, DiagramNodePosition> = {};
  for (const id of sorted) {
    const position = nodes[id];
    if (position) {
      anchorNodes[id] = position;
    }
  }
  const anchorPositions = Object.values(anchorNodes);
  const startX =
    anchorPositions.length > 0
      ? alignToGrid(
          Math.min(...anchorPositions.map((position) => position.x)),
          GRID_X,
          GRID_W
        )
      : GRID_X;
  const startY =
    anchorPositions.length > 0
      ? alignToGrid(
          Math.min(...anchorPositions.map((position) => position.y)),
          GRID_Y,
          GRID_H
        )
      : GRID_Y;
  const occupiedSlots = collectOccupiedGridSlots(anchorPositions, startX, startY);
  const staleIds = Object.keys(nodes).filter((id) => !sortedSet.has(id));
  const staleBySimpleName = new Map<string, string>();
  const duplicatedSimpleNames = new Set<string>();
  for (const id of staleIds) {
    const simple = getSimpleId(id);
    if (staleBySimpleName.has(simple)) {
      duplicatedSimpleNames.add(simple);
      continue;
    }
    staleBySimpleName.set(simple, id);
  }
  for (const duplicated of duplicatedSimpleNames) {
    staleBySimpleName.delete(duplicated);
  }
  const consumedAliasIds = new Set<string>();
  const staleFallbackQueue = staleIds
    .filter((id) => nodes[id] && !consumedAliasIds.has(id))
    .sort((a, b) => {
      const pa = nodes[a]!;
      const pb = nodes[b]!;
      if (pa.y !== pb.y) return pa.y - pb.y;
      if (pa.x !== pb.x) return pa.x - pb.x;
      return a.localeCompare(b);
    });

  let added = false;
  const unresolvedMissing: string[] = [];

  for (const id of sorted) {
    if (!nodes[id]) {
      const aliasId = staleBySimpleName.get(getSimpleId(id));
      const aliasPosition =
        aliasId && !consumedAliasIds.has(aliasId) ? nodes[aliasId] : undefined;
      if (aliasId && aliasPosition) {
        const reused = { x: aliasPosition.x, y: aliasPosition.y };
        nodes[id] = reused;
        anchorNodes[id] = reused;
        consumedAliasIds.add(aliasId);
        const slot = getGridSlotFromPosition(reused, startX, startY);
        if (slot) {
          occupiedSlots.add(slot);
        }
        added = true;
        continue;
      }
      unresolvedMissing.push(id);
    }
  }

  for (const id of unresolvedMissing) {
    const reuseId = staleFallbackQueue.find(
      (candidateId) => !consumedAliasIds.has(candidateId)
    );
    if (reuseId) {
      consumedAliasIds.add(reuseId);
      const reused = { x: nodes[reuseId]!.x, y: nodes[reuseId]!.y };
      nodes[id] = reused;
      anchorNodes[id] = reused;
      const slot = getGridSlotFromPosition(reused, startX, startY);
      if (slot) {
        occupiedSlots.add(slot);
      }
      added = true;
      continue;
    }

    const position = positionForAppendedNode(startX, startY, occupiedSlots);
    nodes[id] = position;
    anchorNodes[id] = position;
    added = true;
  }

  const nextNodes: Record<string, DiagramNodePosition> = {};
  for (const id of sorted) {
    const position = nodes[id];
    if (!position) continue;
    nextNodes[id] = { x: position.x, y: position.y };
  }

  const stalePruned = Object.keys(nodes).length !== Object.keys(nextNodes).length;

  return {
    state: {
      ...base,
      nodes: nextNodes
    },
    added: added || stalePruned
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
