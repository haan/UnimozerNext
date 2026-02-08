import type { PointerEvent, RefObject } from "react";
import type { DiagramState } from "../../models/diagram";
import type { ObjectInstance } from "../../models/objectBench";
import type { UmlConstructor, UmlGraph, UmlMethod, UmlNode } from "../../models/uml";
import { OBJECT_BENCH_MIN_HEIGHT_PX } from "../../constants/layout";
import { DiagramPanel, type DiagramViewMode } from "../diagram/DiagramPanel";
import type { ExportControls, ZoomControls } from "../diagram/UmlDiagram";
import { ObjectBenchPanel } from "../objectBench/ObjectBenchPanel";

type ObjectBenchSectionProps = {
  benchContainerRef: RefObject<HTMLDivElement | null>;
  objectBenchSplitRatio: number;
  startBenchResize: (event: PointerEvent<HTMLDivElement>) => void;
  graph: UmlGraph | null;
  diagram: DiagramState | null;
  compiled: boolean;
  backgroundColor?: string | null;
  showPackages?: boolean;
  fontSize: number;
  exportDefaultPath?: string | null;
  onExportStatus?: (message: string) => void;
  onNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  onNodeSelect: (id: string) => void;
  onCompileProject?: () => void;
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
  onRegisterExport?: (controls: ExportControls | null) => void;
  onAddClass?: () => void;
  viewMode: DiagramViewMode;
  activeFilePath?: string | null;
  caretLineNumber?: number | null;
  onDebugLog?: (message: string) => void;
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
  exportDefaultPath,
  onExportStatus,
  onNodePositionChange,
  onNodeSelect,
  onCompileProject,
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
  onRegisterExport,
  onAddClass,
  viewMode,
  activeFilePath,
  caretLineNumber,
  onDebugLog,
  objectBench,
  showPrivate,
  showInherited,
  showStatic,
  getMethodsForObject,
  onCallMethod,
  onRemoveObject
}: ObjectBenchSectionProps) => (
  <section className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border">
    <div ref={benchContainerRef} className="relative flex h-full min-w-0 flex-col overflow-hidden">
      <div
        className="min-h-0 min-w-0 flex-none overflow-hidden"
        style={{ height: `${objectBenchSplitRatio * 100}%` }}
      >
        <DiagramPanel
          graph={graph}
          diagram={diagram}
          compiled={compiled}
          backgroundColor={backgroundColor}
          showPackages={showPackages}
          fontSize={fontSize}
          exportDefaultPath={exportDefaultPath}
          onExportStatus={onExportStatus}
          onNodePositionChange={onNodePositionChange}
          onNodeSelect={onNodeSelect}
          onCompileProject={onCompileProject}
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
          onRegisterExport={onRegisterExport}
          onAddClass={onAddClass}
          viewMode={viewMode}
          activeFilePath={activeFilePath}
          caretLineNumber={caretLineNumber}
          onDebugLog={onDebugLog}
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
      <div
        className="flex-1 overflow-hidden"
        style={{ minHeight: `${OBJECT_BENCH_MIN_HEIGHT_PX}px` }}
      >
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
