import type { PointerEvent, RefObject } from "react";
import type { DiagramState } from "../../models/diagram";
import type { ObjectInstance } from "../../models/objectBench";
import type { UmlConstructor, UmlGraph, UmlMethod, UmlNode } from "../../models/uml";
import { DiagramPanel } from "../diagram/DiagramPanel";
import type { ZoomControls } from "../diagram/UmlDiagram";
import { ObjectBenchPanel } from "../objectBench/ObjectBenchPanel";

type ObjectBenchSectionProps = {
  benchContainerRef: RefObject<HTMLDivElement>;
  objectBenchSplitRatio: number;
  startBenchResize: (event: PointerEvent<HTMLDivElement>) => void;
  graph: UmlGraph | null;
  diagram: DiagramState | null;
  compiled: boolean;
  backgroundColor?: string | null;
  showPackages?: boolean;
  fontSize: number;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect: (id: string) => void;
  onCompileClass: (node: UmlNode) => void;
  onRunMain?: (node: UmlNode) => void;
  onCreateObject?: (node: UmlNode, constructor: UmlConstructor) => void;
  onRemoveClass?: (node: UmlNode) => void;
  onAddField?: (node: UmlNode) => void;
  onAddConstructor?: (node: UmlNode) => void;
  onAddMethod?: (node: UmlNode) => void;
  onFieldSelect?: (field: UmlNode["fields"][number], node: UmlNode) => void;
  onMethodSelect?: (method: UmlNode["methods"][number], node: UmlNode) => void;
  onRegisterZoom?: (controls: ZoomControls | null) => void;
  onAddClass?: () => void;
  objectBench: ObjectInstance[];
  showPrivate: boolean;
  showInherited: boolean;
  showStatic: boolean;
  getMethodsForObject: (object: ObjectInstance) => UmlMethod[];
  onCallMethod: (object: ObjectInstance, method: UmlMethod) => void;
  onRemoveObject: (object: ObjectInstance) => void;
};

export const ObjectBenchSection = ({
  benchContainerRef,
  objectBenchSplitRatio,
  startBenchResize,
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
  onRemoveClass,
  onAddField,
  onAddConstructor,
  onAddMethod,
  onFieldSelect,
  onMethodSelect,
  onRegisterZoom,
  onAddClass,
  objectBench,
  showPrivate,
  showInherited,
  showStatic,
  getMethodsForObject,
  onCallMethod,
  onRemoveObject
}: ObjectBenchSectionProps) => (
  <section className="flex h-full flex-col border-r border-border">
    <div ref={benchContainerRef} className="relative flex h-full flex-col">
      <div
        className="min-h-0 flex-none overflow-hidden"
        style={{ height: `${objectBenchSplitRatio * 100}%` }}
      >
        <DiagramPanel
          graph={graph}
          diagram={diagram}
          compiled={compiled}
          backgroundColor={backgroundColor}
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
          onAddClass={onAddClass}
        />
      </div>
      <div
        className="absolute left-0 z-10 h-3 w-full -translate-y-1.5 cursor-row-resize transition hover:bg-border/40"
        style={{ top: `${objectBenchSplitRatio * 100}%` }}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize object bench panel"
        onPointerDown={startBenchResize}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
      </div>
      <div className="min-h-[var(--bench-min-height)] flex-1 overflow-hidden">
        <ObjectBenchPanel
          objects={objectBench}
          fontSize={fontSize}
          showPrivate={showPrivate}
          showInherited={showInherited}
          showStatic={showStatic}
          getMethodsForObject={getMethodsForObject}
          onCallMethod={onCallMethod}
          onRemoveObject={onRemoveObject}
        />
      </div>
    </div>
  </section>
);
