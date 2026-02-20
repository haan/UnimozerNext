import type { ComponentProps, PointerEvent as ReactPointerEvent, RefObject } from "react";

import { ObjectBenchSection } from "./ObjectBenchSection";
import { SplitHandle } from "../ui/split-handle";
import { CodePanel } from "../editor/CodePanel";
import { ConsolePanel } from "../console/ConsolePanel";
import { DiagramPanel } from "../diagram/DiagramPanel";

type WorkspaceFullscreenMode = "none" | "uml" | "editor";

type AppWorkspacePanelsProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  consoleContainerRef: RefObject<HTMLDivElement | null>;
  splitRatio: number;
  consoleSplitRatio: number;
  fullscreenMode: WorkspaceFullscreenMode;
  onStartUmlResize: (event: ReactPointerEvent<HTMLElement>) => void;
  onStartConsoleResize: (event: ReactPointerEvent<HTMLElement>) => void;
  objectBenchSectionProps: ComponentProps<typeof ObjectBenchSection>;
  codePanelProps: ComponentProps<typeof CodePanel>;
  consolePanelProps: ComponentProps<typeof ConsolePanel>;
  editorMinHeightPx: number;
  consoleMinHeightPx: number;
};

export const AppWorkspacePanels = ({
  containerRef,
  consoleContainerRef,
  splitRatio,
  consoleSplitRatio,
  fullscreenMode,
  onStartUmlResize,
  onStartConsoleResize,
  objectBenchSectionProps,
  codePanelProps,
  consolePanelProps,
  editorMinHeightPx,
  consoleMinHeightPx
}: AppWorkspacePanelsProps) => {
  if (fullscreenMode === "uml") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col bg-background">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <DiagramPanel
                graph={objectBenchSectionProps.graph}
                diagram={objectBenchSectionProps.diagram}
                compiled={objectBenchSectionProps.compiled}
                showPackages={objectBenchSectionProps.showPackages}
                showParameterNames={objectBenchSectionProps.showParameterNames}
                edgeStrokeWidth={objectBenchSectionProps.edgeStrokeWidth}
                fontSize={objectBenchSectionProps.fontSize}
                structogramColorsEnabled={objectBenchSectionProps.structogramColorsEnabled}
                exportDefaultPath={objectBenchSectionProps.exportDefaultPath}
                onExportStatus={objectBenchSectionProps.onExportStatus}
                onNodePositionChange={objectBenchSectionProps.onNodePositionChange}
                onViewportChange={objectBenchSectionProps.onViewportChange}
                onNodeSelect={objectBenchSectionProps.onNodeSelect}
                onCompileProject={objectBenchSectionProps.onCompileProject}
                onCompileClass={objectBenchSectionProps.onCompileClass}
                onRunMain={objectBenchSectionProps.onRunMain}
                onCreateObject={objectBenchSectionProps.onCreateObject}
                onRegisterZoom={objectBenchSectionProps.onRegisterZoom}
                onRegisterExport={objectBenchSectionProps.onRegisterExport}
                onRegisterStructogramExport={objectBenchSectionProps.onRegisterStructogramExport}
                onAddClass={objectBenchSectionProps.onAddClass}
                onRemoveClass={objectBenchSectionProps.onRemoveClass}
                onAddField={objectBenchSectionProps.onAddField}
                onAddConstructor={objectBenchSectionProps.onAddConstructor}
                onAddMethod={objectBenchSectionProps.onAddMethod}
                onFieldSelect={objectBenchSectionProps.onFieldSelect}
                onMethodSelect={objectBenchSectionProps.onMethodSelect}
                viewMode={objectBenchSectionProps.viewMode}
                activeFilePath={objectBenchSectionProps.activeFilePath}
                caretLineNumber={objectBenchSectionProps.caretLineNumber}
                onDebugLog={objectBenchSectionProps.onDebugLog}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (fullscreenMode === "editor") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col bg-background">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <CodePanel {...codePanelProps} />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex flex-1 flex-col bg-background">
        <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
          <div className="h-full min-w-0 overflow-hidden" style={{ width: `${splitRatio * 100}%` }}>
            <ObjectBenchSection {...objectBenchSectionProps} />
          </div>

          <SplitHandle
            orientation="vertical"
            positionPercent={splitRatio * 100}
            ariaLabel="Resize information panel"
            onPointerDown={onStartUmlResize}
          />

          <section className="flex min-w-0 flex-1 flex-col">
            <div
              ref={consoleContainerRef}
              className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div
                className="flex-none overflow-hidden"
                style={{
                  height: `${consoleSplitRatio * 100}%`,
                  minHeight: `${editorMinHeightPx}px`
                }}
              >
                <CodePanel {...codePanelProps} />
              </div>
              <SplitHandle
                orientation="horizontal"
                positionPercent={consoleSplitRatio * 100}
                ariaLabel="Resize console panel"
                onPointerDown={onStartConsoleResize}
              />
              <div
                className="flex-1 overflow-hidden"
                style={{ minHeight: `${consoleMinHeightPx}px` }}
              >
                <ConsolePanel {...consolePanelProps} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
