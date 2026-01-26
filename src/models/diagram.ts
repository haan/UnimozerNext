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
  version: 1;
  showFields: boolean;
  showMethods: boolean;
  showParams: boolean;
  showTypes: boolean;
  showVisibility: boolean;
  showRelations: boolean;
  nodes: Record<string, DiagramNodePosition>;
  viewport: DiagramViewport;
};
