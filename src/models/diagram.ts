export type DiagramNodePosition = {
  x: number;
  y: number;
};

export type DiagramViewport = {
  panX: number;
  panY: number;
  zoom: number;
};

export type DiagramState = {
  nodes: Record<string, DiagramNodePosition>;
  viewport: DiagramViewport;
};
