import { useCallback, useEffect, useRef } from "react";

import { useProjectActionFlow, type ProjectAction } from "./useProjectActionFlow";
import { useWindowCloseGuard } from "./useWindowCloseGuard";

type UseProjectActionOrchestrationArgs = {
  busy: boolean;
  projectPath: string | null;
  hasPendingProjectChanges: boolean;
  awaitBeforeExit: () => Promise<void>;
  handleOpenProject: () => Promise<void>;
  handleOpenFolderProject: () => Promise<void>;
  handleNewProject: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
};

type UseProjectActionOrchestrationResult = {
  confirmProjectActionOpen: boolean;
  pendingProjectAction: ProjectAction | null;
  confirmProjectAction: () => void;
  onConfirmProjectActionOpenChange: (open: boolean) => void;
  onRequestNewProject: () => void;
  onRequestOpenProject: () => void;
  onRequestOpenFolderProject: () => void;
  onRequestExit: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export const useProjectActionOrchestration = ({
  busy,
  projectPath,
  hasPendingProjectChanges,
  awaitBeforeExit,
  handleOpenProject,
  handleOpenFolderProject,
  handleNewProject,
  handleSave,
  handleSaveAs,
  handleZoomIn,
  handleZoomOut,
  handleZoomReset
}: UseProjectActionOrchestrationArgs): UseProjectActionOrchestrationResult => {
  const requestProjectActionRef = useRef<(action: ProjectAction) => void>(() => undefined);

  const guardedExit = useWindowCloseGuard({
    awaitBeforeExit,
    onCloseRequested: () => requestProjectActionRef.current("exit")
  });

  const {
    confirmProjectActionOpen,
    pendingProjectAction,
    requestProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange
  } = useProjectActionFlow({
    busy,
    projectPath,
    hasPendingProjectChanges,
    onOpenProject: () => {
      void handleOpenProject();
    },
    onOpenFolderProject: () => {
      void handleOpenFolderProject();
    },
    onNewProject: () => {
      void handleNewProject();
    },
    onExit: guardedExit,
    onSave: () => {
      void handleSave();
    },
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomReset: handleZoomReset
  });

  useEffect(() => {
    requestProjectActionRef.current = requestProjectAction;
  }, [requestProjectAction]);

  const onRequestNewProject = useCallback(() => {
    requestProjectAction("new");
  }, [requestProjectAction]);

  const onRequestOpenProject = useCallback(() => {
    requestProjectAction("open");
  }, [requestProjectAction]);

  const onRequestOpenFolderProject = useCallback(() => {
    requestProjectAction("openFolder");
  }, [requestProjectAction]);

  const onRequestExit = useCallback(() => {
    requestProjectAction("exit");
  }, [requestProjectAction]);

  const onSave = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const onSaveAs = useCallback(() => {
    void handleSaveAs();
  }, [handleSaveAs]);

  return {
    confirmProjectActionOpen,
    pendingProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange,
    onRequestNewProject,
    onRequestOpenProject,
    onRequestOpenFolderProject,
    onRequestExit,
    onSave,
    onSaveAs
  };
};
