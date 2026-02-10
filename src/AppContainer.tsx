/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import { ConsolePanel } from "./components/console/ConsolePanel";
import { CodePanel } from "./components/editor/CodePanel";
import { AppMenu } from "./components/app/AppMenu";
import { ObjectBenchSection } from "./components/app/ObjectBenchSection";
import type { DiagramViewMode } from "./components/diagram/DiagramPanel";
import { AppDialogs } from "./components/app/AppDialogs";
import { SplitHandle } from "./components/ui/split-handle";
import { Toaster } from "./components/ui/sonner";
import type { DiagramState } from "./models/diagram";
import type { FileNode } from "./models/files";
import type { UmlGraph } from "./models/uml";
import type { ObjectInstance } from "./models/objectBench";
import type { OpenFile } from "./models/openFile";
import type { AppSettings } from "./models/settings";
import { useSplitRatios } from "./hooks/useSplitRatios";
import { useVerticalSplit } from "./hooks/useVerticalSplit";
import { useRunConsole } from "./hooks/useRunConsole";
import { useLanguageServer } from "./hooks/useLanguageServer";
import { toFileUri } from "./services/lsp";
import { useDrafts } from "./hooks/useDrafts";
import { useUmlGraph } from "./hooks/useUmlGraph";
import { useJshellActions } from "./hooks/useJshellActions";
import { usePackedArchiveSync } from "./hooks/usePackedArchiveSync";
import { useLaunchBootstrap } from "./hooks/useLaunchBootstrap";
import { useAppCapabilities } from "./hooks/useAppCapabilities";
import { useAppMenuState } from "./hooks/useAppMenuState";
import { useProjectSessionState } from "./hooks/useProjectSessionState";
import { useProjectSessionController } from "./hooks/useProjectSessionController";
import { useProjectActionOrchestration } from "./hooks/useProjectActionOrchestration";
import { useDialogState } from "./hooks/useDialogState";
import { useDiagramInteractions, type PendingRevealRequest } from "./hooks/useDiagramInteractions";
import { useClassEditActions } from "./hooks/useClassEditActions";
import { useObjectBenchActions } from "./hooks/useObjectBenchActions";
import { useClassSelectionActions } from "./hooks/useClassSelectionActions";
import { useClassRemovalActions } from "./hooks/useClassRemovalActions";
import { useAppAppearanceEffects } from "./hooks/useAppAppearanceEffects";
import { useCompileJshellLifecycle } from "./hooks/useCompileJshellLifecycle";
import { useMenuCommandActions } from "./hooks/useMenuCommandActions";
import { useEditorActions } from "./hooks/useEditorActions";
import { useProjectViewState } from "./hooks/useProjectViewState";
import { useMenuPreferenceActions } from "./hooks/useMenuPreferenceActions";
import { useAppDerivedState } from "./hooks/useAppDerivedState";
import type { ExportControls } from "./components/diagram/UmlDiagram";
import type { StructogramExportControls } from "./components/structogram/StructogramView";
import {
  UML_PARSE_DRAFT_DEBOUNCE_MS
} from "./constants/app";
import {
  CONSOLE_MIN_HEIGHT_PX,
  EDITOR_MIN_HEIGHT_PX,
  UML_DIAGRAM_MIN_HEIGHT_PX
} from "./constants/layout";
import { formatStatusText as formatStatus, trimStatusText as trimStatus } from "./services/status";

export type AppContainerProps = {
  settings: AppSettings;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
  updateObjectBenchSplitRatioSetting: (ratio: number) => void;
};

export default function AppContainer({
  settings,
  settingsOpen,
  setSettingsOpen,
  handleSettingsChange,
  updateUmlSplitRatioSetting,
  updateConsoleSplitRatioSetting,
  updateObjectBenchSplitRatioSetting
}: AppContainerProps) {
  const {
    projectPath,
    projectStorageMode,
    packedArchivePath,
    status,
    busy,
    compileStatus,
    diagramLayoutDirty,
    packedArchiveSyncFailed,
    setProjectPath,
    setProjectStorageMode,
    setPackedArchivePath,
    setStatus,
    setBusy,
    setCompileStatus,
    setDiagramLayoutDirty,
    setPackedArchiveSyncFailed
  } = useProjectSessionState();
  const [tree, setTree] = useState<FileNode | null>(null);
  const [umlGraph, setUmlGraph] = useState<UmlGraph | null>(null);
  const [diagramState, setDiagramState] = useState<DiagramState | null>(null);
  const [diagramPath, setDiagramPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [leftPanelViewMode, setLeftPanelViewMode] = useState<DiagramViewMode>("uml");
  const [editorCaret, setEditorCaret] = useState<{ lineNumber: number; column: number } | null>(
    null
  );
  const [objectBench, setObjectBench] = useState<ObjectInstance[]>([]);
  const [jshellReady, setJshellReady] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const {
    addClassOpen,
    setAddClassOpen,
    addFieldOpen,
    addConstructorOpen,
    addMethodOpen,
    createObjectOpen,
    createObjectTarget,
    createObjectConstructor,
    callMethodOpen,
    callMethodTarget,
    callMethodInfo,
    methodReturnOpen,
    methodReturnValue,
    methodReturnLabel,
    removeClassOpen,
    removeTarget,
    fieldTarget,
    constructorTarget,
    methodTarget,
    openAddClassDialog,
    openAddFieldDialog,
    openAddConstructorDialog,
    openAddMethodDialog,
    handleAddFieldOpenChange,
    handleAddConstructorOpenChange,
    handleAddMethodOpenChange,
    openCreateObjectDialog,
    handleCreateObjectOpenChange,
    openCallMethodDialog,
    handleCallMethodOpenChange,
    openMethodReturnDialog,
    handleMethodReturnOpenChange,
    requestRemoveClass,
    handleRemoveClassOpenChange,
    closeRemoveClassDialog
  } = useDialogState();
  const debugLogging = settings.advanced.debugLogging;
  const structogramColorsEnabled = settings.advanced.structogramColors;
  const structogramLoopHeaderColor = settings.structogram.loopHeaderColor;
  const structogramIfHeaderColor = settings.structogram.ifHeaderColor;
  const structogramSwitchHeaderColor = settings.structogram.switchHeaderColor;
  const structogramTryWrapperColor = settings.structogram.tryWrapperColor;
  const codeHighlightEnabled = settings.uml.codeHighlight;
  const showDependencies = settings.uml.showDependencies;
  const showPackages = settings.uml.showPackages;
  const fontSize = settings.general.fontSize;
  const showPrivateObjectFields =
    settings.objectBench.showPrivateObjectFields;
  const showInheritedObjectFields =
    settings.objectBench.showInheritedObjectFields;
  const showStaticObjectFields =
    settings.objectBench.showStaticObjectFields;
  const showSwingAttributes = settings.uml.showSwingAttributes;
  const wordWrap = settings.editor.wordWrap;
  const {
    containerRef,
    consoleContainerRef,
    splitRatio,
    consoleSplitRatio,
    startUmlResize,
    startConsoleResize
  } = useSplitRatios({
    umlSplitRatio: settings.layout.umlSplitRatio,
    consoleSplitRatio: settings.layout.consoleSplitRatio,
    onCommitUmlSplitRatio: updateUmlSplitRatioSetting,
    onCommitConsoleSplitRatio: updateConsoleSplitRatioSetting
  });
  const {
    containerRef: benchContainerRef,
    splitRatio: objectBenchSplitRatio,
    startResize: startBenchResize
  } = useVerticalSplit({
    ratio: settings.layout.objectBenchSplitRatio,
    onCommit: updateObjectBenchSplitRatioSetting,
    minTop: UML_DIAGRAM_MIN_HEIGHT_PX
  });
  const openFilePath = openFile?.path ?? null;
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const pendingRevealRef = useRef<PendingRevealRequest | null>(null);
  const zoomControlsRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  } | null>(null);
  const exportControlsRef = useRef<ExportControls | null>(null);
  const structogramExportControlsRef = useRef<StructogramExportControls | null>(null);
  const [hasDiagramExportControls, setHasDiagramExportControls] = useState(false);
  const [hasStructogramExportControls, setHasStructogramExportControls] = useState(false);
  const {
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsClose,
    notifyLsChange,
    notifyLsChangeImmediate,
    resetLsState
  } = useLanguageServer({
    projectPath,
    openFilePath,
    openFileContent: content
  });

  const {
    requestPackedArchiveSync,
    awaitPackedArchiveSync,
    clearPackedArchiveSyncError
  } = usePackedArchiveSync({
    projectStorageMode,
    projectPath,
    packedArchivePath,
    formatStatus,
    trimStatus,
    setStatus,
    setDiagramLayoutDirty,
    setPackedArchiveSyncFailed
  });

  const {
    fileDrafts,
    setFileDrafts,
    updateDraftForPath,
    formatAndSaveUmlFiles,
    hasUnsavedChanges
  } = useDrafts({
    umlGraph,
    openFilePath,
    setContent,
    setLastSavedContent,
    settingsEditor: settings.editor,
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsChangeImmediate,
    notifyLsClose,
    setStatus
  });
  const [umlParseDrafts, setUmlParseDrafts] = useState(fileDrafts);

  useEffect(() => {
    if (!projectPath) {
      setUmlParseDrafts({});
      return;
    }
    const timer = window.setTimeout(() => {
      setUmlParseDrafts(fileDrafts);
    }, UML_PARSE_DRAFT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fileDrafts, projectPath]);

  const { scratchHasClasses, dirty, visibleGraph, isMac } = useAppDerivedState({
    tree,
    openFile,
    content,
    lastSavedContent,
    umlGraph,
    showDependencies,
    showSwingAttributes
  });
  const {
    canUseStructogramMode,
    selectedNode,
    projectName,
    exportDefaultPath
  } = useProjectViewState({
    openFilePath,
    selectedClassId,
    setSelectedClassId,
    umlGraph,
    leftPanelViewMode,
    setLeftPanelViewMode,
    projectStorageMode,
    packedArchivePath,
    projectPath
  });

  const applyPendingReveal = useCallback(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    const expiresAtMs = pending.requestedAtMs + pending.durationSeconds * 1000;
    if (Date.now() > expiresAtMs) {
      pendingRevealRef.current = null;
      return;
    }
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const modelPath = model.uri?.fsPath ?? "";
    if (modelPath && modelPath.toLowerCase() !== pending.path.toLowerCase()) return;
    const maxLine = model.getLineCount();
    const line = Math.min(Math.max(pending.line, 1), maxLine);
    const maxColumn = model.getLineMaxColumn(line);
    const column = Math.min(Math.max(pending.column, 1), maxColumn);
    editor.setPosition({ lineNumber: line, column });
    editor.revealPositionInCenter({ lineNumber: line, column });
    editor.focus();
    pendingRevealRef.current = null;
  }, [monacoRef]);

  const clearPendingReveal = useCallback(() => {
    pendingRevealRef.current = null;
  }, []);

  useEffect(() => {
    if (!openFile) {
      editorRef.current = null;
    }
  }, [openFile]);

  const {
    lastCompileOutDirRef,
    handleCompileSuccess,
    onCompileRequested
  } = useCompileJshellLifecycle({
    projectPath,
    umlGraph,
    compileStatus,
    requestPackedArchiveSync,
    setStatus,
    setJshellReady,
    setObjectBench,
    formatStatus,
    trimStatus
  });

  const {
    consoleOutput,
    runSessionId,
    appendConsoleOutput,
    resetConsoleOutput,
    handleCompileProject,
    handleCompileClass,
    handleRunMain,
    handleCancelRun
  } = useRunConsole({
    projectPath,
    fileDrafts,
    compileStatus,
    setCompileStatus,
    formatAndSaveUmlFiles,
    setBusy,
    setStatus,
    formatStatus,
    onCompileSuccess: handleCompileSuccess,
    onCompileRequested
  });

  const clearConsole = useCallback(() => {
    resetConsoleOutput();
  }, [resetConsoleOutput]);

  const appendDebugOutput = useCallback(
    (text: string) => {
      if (!debugLogging) return;
      appendConsoleOutput(text);
    },
    [appendConsoleOutput, debugLogging]
  );


  useAppAppearanceEffects({
    titlePrefix: "Unimozer Next",
    projectPath,
    projectStorageMode,
    packedArchivePath,
    editorTheme: settings.editor.theme,
    structogramLoopHeaderColor,
    structogramIfHeaderColor,
    structogramSwitchHeaderColor,
    structogramTryWrapperColor,
    debugLogging,
    appendConsoleOutput
  });

  const { umlStatus, lastGoodGraphRef } = useUmlGraph({
    projectPath,
    projectStorageMode,
    includeStructogramIr: leftPanelViewMode === "structogram",
    tree,
    fileDrafts: umlParseDrafts,
    setUmlGraph,
    onDebugLog: debugLogging ? appendDebugOutput : undefined,
    formatStatus
  });

  const {
    getPublicMethodsForObject,
    handleCreateObject: createObjectWithJshell,
    executeMethodCall
  } = useJshellActions({
    projectPath,
    umlGraph,
    jshellReady,
    setJshellReady,
    objectBench,
    setObjectBench,
    lastCompileOutDirRef,
    appendConsoleOutput,
    resetConsoleOutput,
    appendDebugOutput: debugLogging ? appendDebugOutput : undefined,
    setStatus,
    setBusy,
    formatStatus,
    trimStatus
  });

  const {
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenPackedProjectPath,
    handleNewProject,
    openFileByPath,
    loadDiagramState,
    handleSave,
    handleSaveAs
  } = useProjectSessionController({
    projectPath,
    projectStorageMode,
    packedArchivePath,
    setProjectPath,
    setProjectStorageMode,
    setPackedArchivePath,
    setCompileStatus,
    setBusy,
    setStatus,
    setDiagramLayoutDirty,
    fileDrafts,
    lastGoodGraphRef,
    setTree,
    setUmlGraph,
    setDiagramState,
    setDiagramPath,
    setOpenFile,
    setContent,
    setLastSavedContent,
    setFileDrafts,
    clearConsole,
    resetLsState,
    notifyLsOpen,
    updateDraftForPath,
    formatAndSaveUmlFiles,
    formatStatus,
    awaitPackedArchiveSync,
    clearPackedArchiveSyncError,
    setObjectBench,
    setJshellReady
  });

  useLaunchBootstrap({
    projectPath,
    appendDebugOutput,
    handleOpenPackedProjectPath,
    handleNewProject,
    formatStatus,
    trimStatus
  });
  const {
    editDisabled,
    zoomDisabled,
    canAddClass,
    canAddField,
    canAddConstructor,
    canAddMethod,
    canCompileClass,
    canExportDiagram,
    canExportStructogram,
    hasPendingProjectChanges
  } = useAppCapabilities({
    busy,
    openFile,
    umlGraph,
    diagramState,
    projectPath,
    openFilePath,
    selectedNode,
    visibleGraph,
    hasDiagramExportControls,
    hasStructogramExportControls,
    hasUnsavedChanges,
    diagramLayoutDirty,
    projectStorageMode,
    scratchHasClasses,
    hasPackedArchiveSyncChanges: projectStorageMode === "packed" && packedArchiveSyncFailed
  });
  const appMenuState = useAppMenuState({
    busy,
    hasPendingProjectChanges,
    projectName,
    isMac,
    editDisabled,
    zoomDisabled,
    canAddClass,
    canAddConstructor,
    canAddField,
    canAddMethod,
    canCompileClass,
    canExportDiagram,
    canExportStructogram,
    showPrivateObjectFields,
    showInheritedObjectFields,
    showStaticObjectFields,
    showDependencies,
    showPackages,
    showSwingAttributes,
    canUseStructogramMode,
    leftPanelViewMode,
    structogramColorsEnabled,
    wordWrap
  });


  const { triggerEditorAction, handlePaste, handleContentChange } = useEditorActions({
    editorRef,
    compileStatus,
    openFilePath,
    fileDrafts,
    lastSavedContent,
    setCompileStatus,
    setContent,
    updateDraftForPath,
    notifyLsChange
  });

  useEffect(() => {
    setEditorCaret(null);
  }, [openFilePath]);

  useEffect(() => {
    if (!projectPath || !umlGraph) return;
    void loadDiagramState(projectPath, umlGraph);
  }, [projectPath, umlGraph, loadDiagramState]);


  const {
    handleNodePositionChange,
    handleNodeSelect,
    handleFieldSelect,
    handleMethodSelect
  } = useDiagramInteractions({
    umlGraph,
    diagramPath,
    setDiagramState,
    requestPackedArchiveSync,
    pendingRevealRef,
    appendDebugOutput,
    openFileByPath,
    openFilePath,
    applyPendingReveal,
    clearPendingReveal,
    setSelectedClassId
  });

  const { confirmRemoveClass } = useClassRemovalActions({
    projectPath,
    openFilePath,
    selectedClassId,
    removeTarget,
    monacoRef,
    notifyLsClose,
    closeRemoveClassDialog,
    setTree,
    setOpenFile,
    setContent,
    setLastSavedContent,
    setFileDrafts,
    setCompileStatus,
    setSelectedClassId,
    setBusy,
    setStatus,
    formatStatus
  });

  const {
    handleMenuAddClass,
    handleMenuAddField,
    handleMenuAddConstructor,
    handleMenuAddMethod,
    handleMenuCompileProject,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleExportStatus,
    handleCopyDiagramPng,
    handleExportDiagramPng,
    handleCopyStructogramPng,
    handleExportStructogramPng
  } = useMenuCommandActions({
    selectedNode,
    zoomControlsRef,
    exportControlsRef,
    structogramExportControlsRef,
    openAddClassDialog,
    openAddFieldDialog,
    openAddConstructorDialog,
    openAddMethodDialog,
    handleCompileProject,
    setStatus
  });
  const {
    handleToggleShowPrivate,
    handleToggleShowInherited,
    handleToggleShowStatic,
    handleToggleShowDependencies,
    handleToggleShowPackages,
    handleToggleShowSwingAttributes,
    handleToggleStructogramMode,
    handleToggleStructogramColors,
    handleToggleWordWrap
  } = useMenuPreferenceActions({
    settings,
    handleSettingsChange,
    setLeftPanelViewMode
  });

  const {
    confirmProjectActionOpen,
    pendingProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange,
    onRequestNewProject,
    onRequestOpenProject,
    onRequestOpenFolderProject,
    onRequestExit,
    onSave: onSaveProject,
    onSaveAs: onSaveProjectAs
  } = useProjectActionOrchestration({
    busy,
    projectPath,
    hasPendingProjectChanges,
    awaitBeforeExit: awaitPackedArchiveSync,
    handleOpenProject,
    handleOpenFolderProject,
    handleNewProject,
    handleSave,
    handleSaveAs,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset
  });

  const {
    handleOpenAddField,
    handleOpenAddConstructor,
    handleOpenAddMethod
  } = useClassSelectionActions({
    setSelectedClassId,
    openAddFieldDialog,
    openAddConstructorDialog,
    openAddMethodDialog
  });

  const {
    handleCreateClass,
    handleCreateField,
    handleCreateConstructor,
    handleCreateMethod
  } = useClassEditActions({
    projectPath,
    selectedNode,
    fieldTarget,
    constructorTarget,
    methodTarget,
    fileDrafts,
    openFilePath,
    openFileByPath,
    clearPendingReveal,
    updateDraftForPath,
    notifyLsChangeImmediate,
    notifyLsOpen,
    setTree,
    setOpenFile,
    setContent,
    setLastSavedContent,
    setCompileStatus,
    setBusy,
    setStatus,
    formatStatus
  });
  const {
    handleOpenCreateObject,
    handleOpenCallMethod,
    handleCreateObject,
    handleCallMethod,
    handleRemoveObject
  } = useObjectBenchActions({
    jshellReady,
    createObjectTarget,
    createObjectConstructor,
    callMethodTarget,
    callMethodInfo,
    createObjectWithJshell,
    executeMethodCall,
    setSelectedClassId,
    openCreateObjectDialog,
    openCallMethodDialog,
    openMethodReturnDialog,
    setObjectBench,
    setStatus
  });

  return (
    <div className="flex h-full flex-col">
      <AppMenu
        {...appMenuState}
        onRequestNewProject={onRequestNewProject}
        onRequestOpenProject={onRequestOpenProject}
        onRequestOpenFolderProject={onRequestOpenFolderProject}
        onSave={onSaveProject}
        onSaveAs={onSaveProjectAs}
        onOpenSettings={() => setSettingsOpen(true)}
        onExit={onRequestExit}
        onUndo={() => triggerEditorAction("undo")}
        onRedo={() => triggerEditorAction("redo")}
        onCut={() => triggerEditorAction("editor.action.clipboardCutAction")}
        onCopy={() => triggerEditorAction("editor.action.clipboardCopyAction")}
        onPaste={() => {
          void handlePaste();
        }}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onToggleShowPrivate={handleToggleShowPrivate}
        onToggleShowInherited={handleToggleShowInherited}
        onToggleShowStatic={handleToggleShowStatic}
        onToggleShowDependencies={handleToggleShowDependencies}
        onToggleShowPackages={handleToggleShowPackages}
        onToggleShowSwingAttributes={handleToggleShowSwingAttributes}
        onToggleStructogramMode={handleToggleStructogramMode}
        onToggleStructogramColors={handleToggleStructogramColors}
        onToggleWordWrap={handleToggleWordWrap}
        onAddClass={handleMenuAddClass}
        onAddConstructor={handleMenuAddConstructor}
        onAddField={handleMenuAddField}
        onAddMethod={handleMenuAddMethod}
        onCompileClass={handleMenuCompileProject}
        onCopyDiagramPng={handleCopyDiagramPng}
        onExportDiagramPng={handleExportDiagramPng}
        onCopyStructogramPng={handleCopyStructogramPng}
        onExportStructogramPng={handleExportStructogramPng}
      />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col bg-background">
          <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
            <div
              className="h-full min-w-0 overflow-hidden"
              style={{ width: `${splitRatio * 100}%` }}
            >
                <ObjectBenchSection
                  benchContainerRef={benchContainerRef}
                  objectBenchSplitRatio={objectBenchSplitRatio}
                  startBenchResize={startBenchResize}
                  graph={visibleGraph}
                  diagram={diagramState}
                  compiled={compileStatus === "success"}
                  backgroundColor={settings.uml.panelBackground}
                  showPackages={showPackages}
                  fontSize={fontSize}
                  structogramColorsEnabled={structogramColorsEnabled}
                  exportDefaultPath={exportDefaultPath}
                  onExportStatus={handleExportStatus}
                  onNodePositionChange={handleNodePositionChange}
                  onNodeSelect={handleNodeSelect}
                  onCompileProject={canCompileClass ? handleMenuCompileProject : undefined}
                  onCompileClass={handleCompileClass}
                  onRunMain={handleRunMain}
                  onCreateObject={handleOpenCreateObject}
                  onRemoveClass={requestRemoveClass}
                  onAddField={handleOpenAddField}
                  onAddConstructor={handleOpenAddConstructor}
                  onAddMethod={handleOpenAddMethod}
                  onFieldSelect={codeHighlightEnabled ? handleFieldSelect : undefined}
                  onMethodSelect={codeHighlightEnabled ? handleMethodSelect : undefined}
                  onRegisterZoom={(controls) => {
                    zoomControlsRef.current = controls;
                  }}
                  onRegisterExport={(controls) => {
                    exportControlsRef.current = controls;
                    setHasDiagramExportControls(Boolean(controls));
                  }}
                  onRegisterStructogramExport={(controls) => {
                    structogramExportControlsRef.current = controls;
                    setHasStructogramExportControls(Boolean(controls));
                  }}
                  onAddClass={canAddClass ? () => setAddClassOpen(true) : undefined}
                  viewMode={leftPanelViewMode}
                  activeFilePath={openFilePath}
                  caretLineNumber={editorCaret?.lineNumber ?? null}
                  onDebugLog={debugLogging ? appendDebugOutput : undefined}
                objectBench={objectBench}
                showPrivate={showPrivateObjectFields}
                showInherited={showInheritedObjectFields}
                showStatic={showStaticObjectFields}
                getMethodsForObject={getPublicMethodsForObject}
                onCallMethod={handleOpenCallMethod}
                onRemoveObject={handleRemoveObject}
              />
            </div>

            <SplitHandle
              orientation="vertical"
              positionPercent={splitRatio * 100}
              ariaLabel="Resize information panel"
              onPointerDown={startUmlResize}
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
                    minHeight: `${EDITOR_MIN_HEIGHT_PX}px`
                  }}
                >
                    <CodePanel
                      openFile={openFile}
                      fileUri={openFilePath ? toFileUri(openFilePath) : null}
                      content={content}
                      dirty={dirty}
                      fontSize={fontSize}
                      theme={settings.editor.theme}
                      tabSize={settings.editor.tabSize}
                      insertSpaces={settings.editor.insertSpaces}
                      autoCloseBrackets={settings.editor.autoCloseBrackets}
                      autoCloseQuotes={settings.editor.autoCloseQuotes}
                      autoCloseComments={settings.editor.autoCloseComments}
                      wordWrap={settings.editor.wordWrap}
                      onChange={handleContentChange}
                      debugLogging={debugLogging}
                      onDebugLog={debugLogging ? appendDebugOutput : undefined}
                      onEditorMount={(editor) => {
                        editorRef.current = editor;
                        applyPendingReveal();
                      }}
                      onCaretChange={(position) => {
                        setEditorCaret(position);
                      }}
                    />
                </div>
                <SplitHandle
                  orientation="horizontal"
                  positionPercent={consoleSplitRatio * 100}
                  ariaLabel="Resize console panel"
                  onPointerDown={startConsoleResize}
                />
                <div
                  className="flex-1 overflow-hidden"
                  style={{ minHeight: `${CONSOLE_MIN_HEIGHT_PX}px` }}
                >
                  <ConsolePanel
                    output={consoleOutput}
                    fontSize={fontSize}
                    running={runSessionId !== null}
                    onStop={handleCancelRun}
                  />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        {status}
        {umlStatus ? ` • ${umlStatus}` : ""}
      </footer>

      <AppDialogs
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        addClassOpen={addClassOpen}
        onAddClassOpenChange={setAddClassOpen}
        onCreateClass={handleCreateClass}
        addFieldOpen={addFieldOpen}
        onAddFieldOpenChange={handleAddFieldOpenChange}
        onCreateField={handleCreateField}
        addConstructorOpen={addConstructorOpen}
        onAddConstructorOpenChange={handleAddConstructorOpenChange}
        addConstructorClassName={constructorTarget?.name ?? selectedNode?.name}
        onCreateConstructor={handleCreateConstructor}
        addMethodOpen={addMethodOpen}
        onAddMethodOpenChange={handleAddMethodOpenChange}
        addMethodClassName={methodTarget?.name ?? selectedNode?.name}
        onCreateMethod={handleCreateMethod}
        createObjectOpen={createObjectOpen}
        onCreateObjectOpenChange={handleCreateObjectOpenChange}
        onCreateObject={handleCreateObject}
        createObjectClassName={createObjectTarget?.name ?? selectedNode?.name ?? ""}
        createObjectConstructorLabel={createObjectConstructor?.signature ?? ""}
        createObjectParams={createObjectConstructor?.params ?? []}
        existingObjectNames={objectBench.map((item) => item.name)}
        callMethodOpen={callMethodOpen}
        onCallMethodOpenChange={handleCallMethodOpenChange}
        onCallMethod={handleCallMethod}
        callMethodObjectName={callMethodTarget?.name ?? ""}
        callMethodLabel={callMethodInfo?.signature ?? ""}
        callMethodParams={callMethodInfo?.params ?? []}
        removeClassOpen={removeClassOpen}
        onRemoveClassOpenChange={handleRemoveClassOpenChange}
        removeTargetName={removeTarget?.name ?? null}
        onConfirmRemoveClass={() => {
          void confirmRemoveClass();
        }}
        confirmProjectActionOpen={confirmProjectActionOpen}
        onConfirmProjectActionOpenChange={onConfirmProjectActionOpenChange}
        canConfirmProjectAction={Boolean(pendingProjectAction)}
        onConfirmProjectAction={confirmProjectAction}
        methodReturnOpen={methodReturnOpen}
        onMethodReturnOpenChange={handleMethodReturnOpenChange}
        methodReturnLabel={methodReturnLabel}
        methodReturnValue={methodReturnValue}
        busy={busy}
      />
      <Toaster />
    </div>
  );
}
