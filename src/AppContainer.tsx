/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import { AppMenu } from "./components/app/AppMenu";
import { AppWorkspacePanels } from "./components/app/AppWorkspacePanels";
import type { DiagramViewMode } from "./components/diagram/DiagramPanel";
import { AppDialogs } from "./components/app/AppDialogs";
import { Toaster } from "./components/ui/sonner";
import type { DiagramState } from "./models/diagram";
import type { FileNode } from "./models/files";
import type { UmlGraph } from "./models/uml";
import type { ObjectInstance } from "./models/objectBench";
import type { OpenFile } from "./models/openFile";
import type { AppSettings, RecentProjectEntry } from "./models/settings";
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
import { useDiagramInteractions } from "./hooks/useDiagramInteractions";
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
import { useUmlParseDrafts } from "./hooks/useUmlParseDrafts";
import { useWorkspaceUiControllers } from "./hooks/useWorkspaceUiControllers";
import { useProjectDiskReload } from "./hooks/useProjectDiskReload";
import { useWebviewGuard } from "./hooks/useWebviewGuard";
import { useAppUpdater } from "./hooks/useAppUpdater";
import {
  CONSOLE_MIN_HEIGHT_PX,
  EDITOR_MIN_HEIGHT_PX,
  UML_DIAGRAM_MIN_HEIGHT_PX
} from "./constants/layout";
import { ensureDebugLogPrefix, type DebugLogCategory } from "./constants/debugLogging";
import { formatStatusText as formatStatus, trimStatusText as trimStatus } from "./services/status";
import {
  removeRecentProject as removeRecentProjectFromList,
  upsertRecentProject
} from "./services/recentProjects";
import { toDisplayPath } from "./services/paths";

export type AppContainerProps = {
  settings: AppSettings;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  updateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
  updateObjectBenchSplitRatioSetting: (ratio: number) => void;
};

export default function AppContainer({
  settings,
  settingsOpen,
  setSettingsOpen,
  updateSettings,
  handleSettingsChange,
  updateUmlSplitRatioSetting,
  updateConsoleSplitRatioSetting,
  updateObjectBenchSplitRatioSetting
}: AppContainerProps) {
  useWebviewGuard();

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
  const [fullscreenMode, setFullscreenMode] = useState<"none" | "uml" | "editor">("none");
  const [editorCaret, setEditorCaret] = useState<{ lineNumber: number; column: number } | null>(
    null
  );
  const [objectBench, setObjectBench] = useState<ObjectInstance[]>([]);
  const [jshellReady, setJshellReady] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const fontSizeRef = useRef(settings.general.fontSize);
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
    closeRemoveClassDialog,
    missingRecentProjectOpen,
    missingRecentProjectPath,
    openMissingRecentProjectDialog,
    handleMissingRecentProjectOpenChange
  } = useDialogState();
  const debugLogging = settings.advanced.debugLogging;
  const debugLogCategories = settings.advanced.debugLogCategories;
  const debugLogSinkRef = useRef<((text: string) => void) | null>(null);
  const appendCategorizedDebugOutput = useCallback(
    (category: DebugLogCategory, text: string) => {
      if (!debugLogging || !debugLogCategories[category]) {
        return;
      }
      debugLogSinkRef.current?.(ensureDebugLogPrefix(category, text));
    },
    [debugLogCategories, debugLogging]
  );
  const appendStartupDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("startup", text);
    },
    [appendCategorizedDebugOutput]
  );
  const appendLaunchDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("launch", text);
    },
    [appendCategorizedDebugOutput]
  );
  const appendLanguageServerDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("languageServer", text);
    },
    [appendCategorizedDebugOutput]
  );
  const appendEditorDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("editor", text);
    },
    [appendCategorizedDebugOutput]
  );
  const appendUmlDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("uml", text);
    },
    [appendCategorizedDebugOutput]
  );
  const appendStructogramDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("structogram", text);
    },
    [appendCategorizedDebugOutput]
  );
  const appendJshellDebugOutput = useCallback(
    (text: string) => {
      appendCategorizedDebugOutput("jshell", text);
    },
    [appendCategorizedDebugOutput]
  );
  const structogramColorsEnabled = settings.advanced.structogramColors;
  const updateChannel = settings.advanced.updateChannel;
  const structogramLoopHeaderColor = settings.structogram.loopHeaderColor;
  const structogramIfHeaderColor = settings.structogram.ifHeaderColor;
  const structogramSwitchHeaderColor = settings.structogram.switchHeaderColor;
  const structogramTryWrapperColor = settings.structogram.tryWrapperColor;
  const codeHighlightEnabled = settings.uml.codeHighlight;
  const showDependencies = settings.uml.showDependencies;
  const showPackages = settings.uml.showPackages;
  const showParameterNames = settings.uml.showParameterNames;
  const edgeStrokeWidth = settings.uml.edgeStrokeWidth;
  const fontSize = settings.general.fontSize;
  const darkMode = settings.general.darkMode;
  const showPrivateObjectFields =
    settings.objectBench.showPrivateObjectFields;
  const showInheritedObjectFields =
    settings.objectBench.showInheritedObjectFields;
  const showStaticObjectFields =
    settings.objectBench.showStaticObjectFields;
  const useObjectParameterDropdowns =
    settings.objectBench.useObjectParameterDropdowns;
  const showSwingAttributes = settings.uml.showSwingAttributes;
  const wordWrap = settings.editor.wordWrap;
  const scopeHighlighting = settings.editor.scopeHighlighting;
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
  const umlFullscreen = fullscreenMode === "uml";
  const editorFullscreen = fullscreenMode === "editor";
  const umlNodeLayoutSignature = useMemo(() => {
    if (!umlGraph) {
      return "";
    }
    return [...umlGraph.nodes.map((node) => node.id)].sort().join("|");
  }, [umlGraph]);
  const lastDiagramLoadKeyRef = useRef<string | null>(null);
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
    openFileContent: content,
    onDebugLog:
      debugLogging && debugLogCategories.languageServer
        ? appendLanguageServerDebugOutput
        : undefined
  });
  const {
    editorRef,
    pendingRevealRef,
    applyPendingReveal,
    clearPendingReveal,
    zoomControlsRef,
    exportControlsRef,
    structogramExportControlsRef,
    hasDiagramExportControls,
    hasStructogramExportControls,
    handleRegisterZoom,
    handleRegisterExport,
    handleRegisterStructogramExport
  } = useWorkspaceUiControllers({
    openFilePath,
    monacoRef
  });

  const markDiskSnapshotCurrentRef = useRef<() => Promise<void>>(async () => {});

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
    setPackedArchiveSyncFailed,
    onPackedArchiveWriteSuccess: () => {
      void markDiskSnapshotCurrentRef.current();
    }
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
  const umlParseDrafts = useUmlParseDrafts({
    projectPath,
    fileDrafts
  });

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

  const {
    lastCompileOutDirRef,
    handleCompileSuccess,
    onCompileRequested,
    waitForJshellReady
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

  useEffect(() => {
    debugLogSinkRef.current = appendConsoleOutput;
    return () => {
      debugLogSinkRef.current = null;
    };
  }, [appendConsoleOutput]);

  const clearConsole = useCallback(() => {
    resetConsoleOutput();
  }, [resetConsoleOutput]);

  const {
    showUpdateMenuItem,
    updateMenuState,
    updateAvailableOpen,
    updateInstallBusy,
    updateSummary,
    blockedReason: blockedUpdateReason,
    checkForUpdates,
    openUpdateDialog,
    handleUpdateAvailableOpenChange,
    installUpdate
  } = useAppUpdater({
    channel: updateChannel,
    setStatus
  });


  useAppAppearanceEffects({
    titlePrefix: "Unimozer Next",
    projectPath,
    projectStorageMode,
    packedArchivePath,
    darkMode,
    structogramLoopHeaderColor,
    structogramIfHeaderColor,
    structogramSwitchHeaderColor,
    structogramTryWrapperColor
  });

  const { umlStatus, lastGoodGraphRef } = useUmlGraph({
    projectPath,
    projectStorageMode,
    includeStructogramIr: leftPanelViewMode === "structogram",
    tree,
    fileDrafts: umlParseDrafts,
    setUmlGraph,
    onDebugLog: debugLogging && debugLogCategories.uml ? appendUmlDebugOutput : undefined,
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
    waitForJshellReady,
    setJshellReady,
    objectBench,
    setObjectBench,
    lastCompileOutDirRef,
    appendConsoleOutput,
    resetConsoleOutput,
    appendDebugOutput: debugLogging && debugLogCategories.jshell ? appendJshellDebugOutput : undefined,
    setStatus,
    setBusy,
    formatStatus,
    trimStatus
  });

  const recordRecentProject = useCallback(
    (entry: RecentProjectEntry) => {
      updateSettings((prev) => ({
        ...prev,
        recentProjects: upsertRecentProject(prev.recentProjects ?? [], entry, 10)
      }));
    },
    [updateSettings]
  );

  const removeRecentProject = useCallback(
    (entry: RecentProjectEntry) => {
      updateSettings((prev) => ({
        ...prev,
        recentProjects: removeRecentProjectFromList(prev.recentProjects ?? [], entry)
      }));
    },
    [updateSettings]
  );

  const clearRecentProjects = useCallback(() => {
    updateSettings((prev) => ({
      ...prev,
      recentProjects: []
    }));
  }, [updateSettings]);

  const {
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenPackedProjectPath,
    handleOpenRecentProject,
    handleNewProject,
    openFileByPath,
    loadDiagramState,
    handleSave,
    handleSaveAs,
    reloadCurrentProjectFromDisk
  } = useProjectSessionController({
    projectPath,
    projectStorageMode,
    packedArchivePath,
    openFilePath,
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
    setJshellReady,
    recordRecentProject,
    removeRecentProject,
    onMissingRecentProject: (path) => openMissingRecentProjectDialog(toDisplayPath(path))
  });

  useLaunchBootstrap({
    projectPath,
    startupDebugEnabled: debugLogging && debugLogCategories.startup,
    appendStartupDebugOutput:
      debugLogging && debugLogCategories.startup ? appendStartupDebugOutput : undefined,
    appendLaunchDebugOutput:
      debugLogging && debugLogCategories.launch ? appendLaunchDebugOutput : undefined,
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

  const reloadCurrentProjectFromDiskWithCaret = useCallback(async () => {
    const previousCaret = editorRef.current?.getPosition() ?? editorCaret;
    const reloaded = await reloadCurrentProjectFromDisk();
    if (!reloaded || !previousCaret) {
      return reloaded;
    }

    window.setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      editor.setPosition(previousCaret);
      editor.revealPositionInCenter(previousCaret);
    }, 0);

    return reloaded;
  }, [editorCaret, editorRef, reloadCurrentProjectFromDisk]);

  const {
    reloadFromDiskDialogOpen,
    onReloadFromDiskDialogOpenChange,
    confirmReloadFromDisk,
    ignoreReloadFromDisk,
    markDiskSnapshotCurrent
  } = useProjectDiskReload({
    projectPath,
    projectStorageMode,
    packedArchivePath,
    busy,
    hasPendingProjectChanges,
    reloadCurrentProjectFromDisk: reloadCurrentProjectFromDiskWithCaret,
    setStatus,
    formatStatus
  });

  useEffect(() => {
    markDiskSnapshotCurrentRef.current = markDiskSnapshotCurrent;
  }, [markDiskSnapshotCurrent]);

  const appMenuState = useAppMenuState({
    busy: busy || updateInstallBusy,
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
    showParameterNames,
    canUseStructogramMode,
    leftPanelViewMode,
    structogramColorsEnabled,
    wordWrap,
    scopeHighlighting,
    umlFullscreen,
    editorFullscreen
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
    if (!projectPath || !umlGraph) {
      lastDiagramLoadKeyRef.current = null;
      return;
    }
    const loadKey = `${projectPath}|${umlNodeLayoutSignature}`;
    if (lastDiagramLoadKeyRef.current === loadKey) {
      return;
    }
    lastDiagramLoadKeyRef.current = loadKey;
    void loadDiagramState(projectPath, umlGraph);
  }, [projectPath, umlGraph, umlNodeLayoutSignature, loadDiagramState]);


  const {
    handleNodePositionChange,
    handleViewportChange,
    handleNodeSelect,
    handleFieldSelect,
    handleMethodSelect,
    awaitDiagramPersistence
  } = useDiagramInteractions({
    umlGraph,
    diagramState,
    diagramPath,
    setDiagramState,
    requestPackedArchiveSync,
    pendingRevealRef,
    appendDebugOutput: appendUmlDebugOutput,
    openFileByPath,
    openFilePath,
    applyPendingReveal,
    clearPendingReveal,
    setSelectedClassId
  });

  const awaitDiagramAndPackedSync = useCallback(async () => {
    await awaitDiagramPersistence();
    await awaitPackedArchiveSync();
  }, [awaitDiagramPersistence, awaitPackedArchiveSync]);

  const { confirmRemoveClass } = useClassRemovalActions({
    projectPath,
    openFilePath,
    selectedClassId,
    removeTarget,
    requestPackedArchiveSync,
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
    handleToggleShowParameterNames,
    handleToggleStructogramMode,
    handleToggleStructogramColors,
    handleToggleWordWrap,
    handleToggleScopeHighlighting
  } = useMenuPreferenceActions({
    settings,
    handleSettingsChange,
    setLeftPanelViewMode
  });

  const handleSaveAndRefreshDiskSnapshot = useCallback(async () => {
    await awaitDiagramPersistence();
    const saved = await handleSave();
    if (saved) {
      await markDiskSnapshotCurrent();
    }
    return saved;
  }, [awaitDiagramPersistence, handleSave, markDiskSnapshotCurrent]);

  const handleSaveAsAndRefreshDiskSnapshot = useCallback(async () => {
    await awaitDiagramPersistence();
    const saved = await handleSaveAs();
    if (saved) {
      await markDiskSnapshotCurrent();
    }
    return saved;
  }, [awaitDiagramPersistence, handleSaveAs, markDiskSnapshotCurrent]);

  const {
    confirmProjectActionOpen,
    pendingProjectAction,
    projectActionConfirmBusy,
    saveAndConfirmProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange,
    onRequestNewProject,
    onRequestOpenProject,
    onRequestOpenFolderProject,
    onRequestOpenRecentProject,
    onRequestExit,
    onSave: onSaveProject,
    onSaveAs: onSaveProjectAs
  } = useProjectActionOrchestration({
    busy: busy || updateInstallBusy,
    updateInstallBusy,
    projectPath,
    hasPendingProjectChanges,
    awaitBeforeExit: awaitDiagramAndPackedSync,
    handleOpenProject,
    handleOpenFolderProject,
    handleOpenRecentProject,
    handleNewProject,
    handleSave: handleSaveAndRefreshDiskSnapshot,
    handleSaveAs: handleSaveAsAndRefreshDiskSnapshot,
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
    compileStatus,
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
  const handleEditorMount = useCallback(
    (editor: MonacoEditorType.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      applyPendingReveal();
    },
    [applyPendingReveal, editorRef]
  );
  const handleEditorCaretChange = useCallback(
    (position: { lineNumber: number; column: number } | null) => {
      setEditorCaret(position);
    },
    []
  );

  useEffect(() => {
    fontSizeRef.current = settings.general.fontSize;
  }, [settings.general.fontSize]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      if (event.deltaY === 0) {
        return;
      }
      const step = event.deltaY < 0 ? 1 : -1;
      const next = Math.max(8, Math.min(40, fontSizeRef.current + step));
      if (next === fontSizeRef.current) {
        return;
      }
      fontSizeRef.current = next;
      handleSettingsChange({
        ...settings,
        general: {
          ...settings.general,
          fontSize: next
        }
      });
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [handleSettingsChange, settings]);
  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, [setSettingsOpen]);
  const handleToggleUmlFullscreen = useCallback((value: boolean) => {
    setFullscreenMode((current) => {
      if (value) {
        return "uml";
      }
      return current === "uml" ? "none" : current;
    });
  }, []);
  const handleToggleEditorFullscreen = useCallback((value: boolean) => {
    setFullscreenMode((current) => {
      if (value) {
        return "editor";
      }
      return current === "editor" ? "none" : current;
    });
  }, []);
  const handleOpenAbout = useCallback(() => {
    setAboutOpen(true);
  }, []);
  const handleConfirmRemoveClass = useCallback(() => {
    void confirmRemoveClass();
  }, [confirmRemoveClass]);
  const handleInstallUpdateWithoutSave = useCallback(() => {
    if (updateInstallBusy) {
      return;
    }
    void installUpdate();
  }, [installUpdate, updateInstallBusy]);
  const handleSaveAndInstallUpdate = useCallback(() => {
    if (updateInstallBusy) {
      return;
    }
    void (async () => {
      const saved = await handleSaveAndRefreshDiskSnapshot();
      if (!saved) {
        return;
      }
      await installUpdate();
    })();
  }, [handleSaveAndRefreshDiskSnapshot, installUpdate, updateInstallBusy]);

  return (
    <div className="flex h-full flex-col">
      <AppMenu
        {...appMenuState}
        onRequestNewProject={onRequestNewProject}
        onRequestOpenProject={onRequestOpenProject}
        onRequestOpenFolderProject={onRequestOpenFolderProject}
        recentProjects={settings.recentProjects}
        onRequestOpenRecentProject={onRequestOpenRecentProject}
        onClearRecentProjects={clearRecentProjects}
        onSave={onSaveProject}
        onSaveAs={onSaveProjectAs}
        onOpenSettings={handleOpenSettings}
        onOpenAbout={handleOpenAbout}
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
        onToggleUmlFullscreen={handleToggleUmlFullscreen}
        onToggleEditorFullscreen={handleToggleEditorFullscreen}
        onToggleShowPrivate={handleToggleShowPrivate}
        onToggleShowInherited={handleToggleShowInherited}
        onToggleShowStatic={handleToggleShowStatic}
        onToggleShowDependencies={handleToggleShowDependencies}
        onToggleShowPackages={handleToggleShowPackages}
        onToggleShowSwingAttributes={handleToggleShowSwingAttributes}
        onToggleShowParameterNames={handleToggleShowParameterNames}
        onToggleStructogramMode={handleToggleStructogramMode}
        onToggleStructogramColors={handleToggleStructogramColors}
        onToggleWordWrap={handleToggleWordWrap}
        onToggleScopeHighlighting={handleToggleScopeHighlighting}
        onAddClass={handleMenuAddClass}
        onAddConstructor={handleMenuAddConstructor}
        onAddField={handleMenuAddField}
        onAddMethod={handleMenuAddMethod}
        onCompileClass={handleMenuCompileProject}
        onCopyDiagramPng={handleCopyDiagramPng}
        onExportDiagramPng={handleExportDiagramPng}
        onCopyStructogramPng={handleCopyStructogramPng}
        onExportStructogramPng={handleExportStructogramPng}
        showUpdateMenuItem={showUpdateMenuItem}
        updateMenuState={updateMenuState}
        onCheckForUpdates={checkForUpdates}
        onOpenUpdateDialog={openUpdateDialog}
      />
      <AppWorkspacePanels
        containerRef={containerRef}
        consoleContainerRef={consoleContainerRef}
        splitRatio={splitRatio}
        consoleSplitRatio={consoleSplitRatio}
        fullscreenMode={fullscreenMode}
        onStartUmlResize={startUmlResize}
        onStartConsoleResize={startConsoleResize}
        objectBenchSectionProps={{
          benchContainerRef,
          objectBenchSplitRatio,
          startBenchResize,
          graph: visibleGraph,
          diagram: diagramState,
          compiled: compileStatus === "success",
          showPackages,
          showParameterNames,
          edgeStrokeWidth,
          fontSize,
          structogramColorsEnabled,
          exportDefaultPath,
          onExportStatus: handleExportStatus,
          onNodePositionChange: handleNodePositionChange,
          onViewportChange: handleViewportChange,
          onNodeSelect: handleNodeSelect,
          onCompileProject: canCompileClass ? handleMenuCompileProject : undefined,
          onCompileClass: handleCompileClass,
          onRunMain: handleRunMain,
          onCreateObject: handleOpenCreateObject,
          onRemoveClass: requestRemoveClass,
          onAddField: handleOpenAddField,
          onAddConstructor: handleOpenAddConstructor,
          onAddMethod: handleOpenAddMethod,
          onFieldSelect: codeHighlightEnabled ? handleFieldSelect : undefined,
          onMethodSelect: codeHighlightEnabled ? handleMethodSelect : undefined,
          onRegisterZoom: handleRegisterZoom,
          onRegisterExport: handleRegisterExport,
          onRegisterStructogramExport: handleRegisterStructogramExport,
          onAddClass: canAddClass ? () => setAddClassOpen(true) : undefined,
          viewMode: leftPanelViewMode,
          activeFilePath: openFilePath,
          caretLineNumber: editorCaret?.lineNumber ?? null,
          onDebugLog:
            debugLogging && debugLogCategories.structogram
              ? appendStructogramDebugOutput
              : undefined,
          objectBench,
          showPrivate: showPrivateObjectFields,
          showInherited: showInheritedObjectFields,
          showStatic: showStaticObjectFields,
          getMethodsForObject: getPublicMethodsForObject,
          onCallMethod: handleOpenCallMethod,
          onRemoveObject: handleRemoveObject
        }}
        codePanelProps={{
          openFile,
          fileUri: openFilePath ? toFileUri(openFilePath) : null,
          content,
          dirty,
          darkMode,
          fontSize,
          theme: settings.editor.theme,
          tabSize: settings.editor.tabSize,
          insertSpaces: settings.editor.insertSpaces,
          autoCloseBrackets: settings.editor.autoCloseBrackets,
          autoCloseQuotes: settings.editor.autoCloseQuotes,
          autoCloseComments: settings.editor.autoCloseComments,
          wordWrap: settings.editor.wordWrap,
          scopeHighlighting: settings.editor.scopeHighlighting,
          onChange: handleContentChange,
          debugLogging: debugLogging && debugLogCategories.editor,
          onDebugLog:
            debugLogging && debugLogCategories.editor ? appendEditorDebugOutput : undefined,
          onEditorMount: handleEditorMount,
          onCaretChange: handleEditorCaretChange
        }}
        consolePanelProps={{
          output: consoleOutput,
          fontSize,
          running: runSessionId !== null,
          onStop: handleCancelRun
        }}
        editorMinHeightPx={EDITOR_MIN_HEIGHT_PX}
        consoleMinHeightPx={CONSOLE_MIN_HEIGHT_PX}
      />

      <footer className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        {status}
        {umlStatus ? ` • ${umlStatus}` : ""}
      </footer>

      <AppDialogs
        aboutOpen={aboutOpen}
        onAboutOpenChange={setAboutOpen}
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
        callMethodUseObjectParameterDropdowns={useObjectParameterDropdowns}
        callMethodAvailableObjects={objectBench.map((object) => ({
          name: object.name,
          type: object.type,
          compatibleTypes: object.compatibleTypes
        }))}
        removeClassOpen={removeClassOpen}
        onRemoveClassOpenChange={handleRemoveClassOpenChange}
        removeTargetName={removeTarget?.name ?? null}
        onConfirmRemoveClass={handleConfirmRemoveClass}
        confirmProjectActionOpen={confirmProjectActionOpen}
        onConfirmProjectActionOpenChange={onConfirmProjectActionOpenChange}
        canConfirmProjectAction={Boolean(pendingProjectAction)}
        projectActionConfirmBusy={projectActionConfirmBusy}
        onSaveBeforeProjectAction={() => {
          void saveAndConfirmProjectAction();
        }}
        onConfirmProjectAction={confirmProjectAction}
        missingRecentProjectOpen={missingRecentProjectOpen}
        missingRecentProjectPath={missingRecentProjectPath}
        onMissingRecentProjectOpenChange={handleMissingRecentProjectOpenChange}
        reloadFromDiskDialogOpen={reloadFromDiskDialogOpen}
        onReloadFromDiskDialogOpenChange={onReloadFromDiskDialogOpenChange}
        onConfirmReloadFromDisk={confirmReloadFromDisk}
        onIgnoreReloadFromDisk={ignoreReloadFromDisk}
        methodReturnOpen={methodReturnOpen}
        onMethodReturnOpenChange={handleMethodReturnOpenChange}
        methodReturnLabel={methodReturnLabel}
        methodReturnValue={methodReturnValue}
        updateAvailableOpen={updateAvailableOpen}
        onUpdateAvailableOpenChange={handleUpdateAvailableOpenChange}
        updateSummary={updateSummary}
        updateHasPendingChanges={hasPendingProjectChanges}
        blockedUpdateReason={blockedUpdateReason}
        onSaveAndInstallUpdate={handleSaveAndInstallUpdate}
        onInstallUpdate={handleInstallUpdateWithoutSave}
        updateInstallBusy={updateInstallBusy}
        busy={busy}
      />
      <Toaster theme={darkMode ? "dark" : "light"} />
    </div>
  );
}
