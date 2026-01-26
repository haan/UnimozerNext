import type { DiagramState } from "../../models/diagram";
import type { UmlGraph } from "../../models/uml";
import { UmlDiagram } from "./UmlDiagram";

export type DiagramPanelProps = {
  graph: UmlGraph | null;
  diagram: DiagramState | null;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect: (id: string) => void;
};

export const DiagramPanel = ({
  graph,
  diagram,
  onNodePositionChange,
  onNodeSelect
}: DiagramPanelProps) => (
  <div className="flex h-full flex-col">
    <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
      UML Diagram
    </div>
    <div className="flex-1 bg-muted/20">
      {graph && diagram ? (
        <UmlDiagram
          graph={graph}
          diagram={diagram}
          onNodePositionChange={onNodePositionChange}
          onNodeSelect={onNodeSelect}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Open a project to generate the UML view.
        </div>
      )}
    </div>
  </div>
);
