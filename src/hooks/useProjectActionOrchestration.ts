import { useCallback, useEffect, useRef } from "react";

import type { RecentProjectEntry } from "../models/settings";
import { useProjectActionFlow, type ProjectAction } from "./useProjectActionFlow";
import { useWindowCloseGuard } from "./useWindowCloseGuard";

type UseProjectActionOrchestrationArgs = {
  busy: boolean;
  projectPath: string | null;
  hasPendingProjectChanges: boolean;
  awaitBeforeExit: () => Promise<void>;
  handleOpenProject: () => Promise<void>;
  handleOpenFolderProject: () => Promise<void>;
  handleOpenRecentProject: (entry: RecentProjectEntry) => Promise<void>;
  handleNewProject: () => Promise<void>;
  handleSave: () => Promise<boolean>;
  handleSaveAs: () => Promise<boolean>;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
};

type UseProjectActionOrchestrationResult = {
  confirmProjectActionOpen: boolean;
  pendingProjectAction: ProjectAction | null;
  projectActionConfirmBusy: boolean;
  saveAndConfirmProjectAction: () => void;
  confirmProjectAction: () => void;
  onConfirmProjectActionOpenChange: (open: boolean) => void;
  onRequestNewProject: () => void;
  onRequestOpenProject: () => void;
  onRequestOpenFolderProject: () => void;
  onRequestOpenRecentProject: (entry: RecentProjectEntry) => void;
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
  handleOpenRecentProject,
  handleNewProject,
  handleSave,
  handleSaveAs,
  handleZoomIn,
  handleZoomOut,
  handleZoomReset
}: UseProjectActionOrchestrationArgs): UseProjectActionOrchestrationResult => {
  const requestProjectActionRef = useRef<(action: ProjectAction) => void>(() => undefined);
  const pendingRecentProjectRef = useRef<RecentProjectEntry | null>(null);

  const guardedExit = useWindowCloseGuard({
    awaitBeforeExit,
    onCloseRequested: () => requestProjectActionRef.current("exit")
  });

  const {
    confirmProjectActionOpen,
    pendingProjectAction,
    projectActionConfirmBusy,
    requestProjectAction,
    saveAndConfirmProjectAction,
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
    onOpenRecentProject: () => {
      const entry = pendingRecentProjectRef.current;
      pendingRecentProjectRef.current = null;
      if (entry) {
        void handleOpenRecentProject(entry);
      }
    },
    onNewProject: () => {
      void handleNewProject();
    },
    onExit: guardedExit,
    onSave: handleSave,
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

  const onRequestOpenRecentProject = useCallback(
    (entry: RecentProjectEntry) => {
      pendingRecentProjectRef.current = entry;
      requestProjectAction("openRecent");
    },
    [requestProjectAction]
  );

  const handleConfirmProjectActionOpenChange = useCallback(
    (open: boolean) => {
      onConfirmProjectActionOpenChange(open);
      if (!open) {
        pendingRecentProjectRef.current = null;
      }
    },
    [onConfirmProjectActionOpenChange]
  );

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
    projectActionConfirmBusy,
    saveAndConfirmProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange: handleConfirmProjectActionOpenChange,
    onRequestNewProject,
    onRequestOpenProject,
    onRequestOpenFolderProject,
    onRequestOpenRecentProject,
    onRequestExit,
    onSave,
    onSaveAs
  };
};
