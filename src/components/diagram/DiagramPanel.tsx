import type { DiagramState } from "../../models/diagram";
import type { UmlGraph, UmlNode } from "../../models/uml";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "../ui/context-menu";
import { UmlDiagram, type ZoomControls } from "./UmlDiagram";

export type DiagramPanelProps = {
  graph: UmlGraph | null;
  diagram: DiagramState | null;
  compiled?: boolean;
  backgroundColor?: string | null;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect: (id: string) => void;
  onCompileClass: (node: UmlNode) => void;
  onRunMain?: (node: UmlNode) => void;
  onRegisterZoom?: (controls: ZoomControls | null) => void;
  onAddClass?: () => void;
  onRemoveClass?: (node: UmlNode) => void;
  onAddField?: (node: UmlNode) => void;
};

export const DiagramPanel = ({
  graph,
  diagram,
  compiled,
  backgroundColor,
  onNodePositionChange,
  onNodeSelect,
  onCompileClass,
  onRunMain,
  onRegisterZoom,
  onAddClass,
  onRemoveClass,
  onAddField
}: DiagramPanelProps) => (
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <div className="flex h-full flex-col">
        <div
          className="flex-1 bg-muted/20"
          style={backgroundColor ? { backgroundColor } : undefined}
        >
          {graph && diagram ? (
            <UmlDiagram
              graph={graph}
              diagram={diagram}
              compiled={compiled}
              onNodePositionChange={onNodePositionChange}
              onNodeSelect={onNodeSelect}
              onCompileClass={onCompileClass}
              onRunMain={onRunMain}
              onRemoveClass={onRemoveClass}
              onAddField={onAddField}
              onRegisterZoom={onRegisterZoom}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Open a project to generate the UML view.
            </div>
          )}
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem disabled={!onAddClass} onSelect={onAddClass}>
        Add Class
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);
