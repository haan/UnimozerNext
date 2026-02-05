import type { DiagramState } from "../../models/diagram";
import type { UmlConstructor, UmlGraph, UmlNode } from "../../models/uml";
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
  showPackages?: boolean;
  fontSize?: number;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect: (id: string) => void;
  onCompileClass: (node: UmlNode) => void;
  onRunMain?: (node: UmlNode) => void;
  onCreateObject?: (node: UmlNode, constructor: UmlConstructor) => void;
  onRegisterZoom?: (controls: ZoomControls | null) => void;
  onAddClass?: () => void;
  onRemoveClass?: (node: UmlNode) => void;
  onAddField?: (node: UmlNode) => void;
  onAddConstructor?: (node: UmlNode) => void;
  onAddMethod?: (node: UmlNode) => void;
  onFieldSelect?: (field: UmlNode["fields"][number], node: UmlNode) => void;
  onMethodSelect?: (method: UmlNode["methods"][number], node: UmlNode) => void;
};

export const DiagramPanel = ({
  graph,
  diagram,
  compiled,
  backgroundColor,
  showPackages,
  fontSize,
  onNodePositionChange,
  onNodeSelect,
  onCompileClass,
  onRunMain,
  onCreateObject,
  onRegisterZoom,
  onAddClass,
  onRemoveClass,
  onAddField,
  onAddConstructor,
  onAddMethod,
  onFieldSelect,
  onMethodSelect
}: DiagramPanelProps) => (
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <div className="flex h-full flex-col">
        <div
          className="flex-1 bg-white"
          style={backgroundColor ? { backgroundColor } : undefined}
        >
          {graph && diagram ? (
            <UmlDiagram
              graph={graph}
              diagram={diagram}
              compiled={compiled}
              showPackages={showPackages}
              fontSize={fontSize}
              onNodePositionChange={onNodePositionChange}
              onNodeSelect={onNodeSelect}
              onCompileClass={onCompileClass}
              onRunMain={onRunMain}
              onCreateObject={onCreateObject}
              onRemoveClass={onRemoveClass}
              onAddField={onAddField}
              onAddConstructor={onAddConstructor}
              onAddMethod={onAddMethod}
              onFieldSelect={onFieldSelect}
              onMethodSelect={onMethodSelect}
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
        <span className="inline-flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Class
        </span>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);
