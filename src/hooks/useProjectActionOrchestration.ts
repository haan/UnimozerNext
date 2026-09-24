import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

import type { RecentProjectEntry } from "../models/settings";
import { useProjectActionFlow, type ProjectAction, type ProjectOpenTarget } from "./useProjectActionFlow";
import { useWindowCloseGuard } from "./useWindowCloseGuard";

type UseProjectActionOrchestrationArgs = {
  busy: boolean;
  updateInstallBusy: boolean;
  projectPath: string | null;
  hasPendingProjectChanges: boolean;
  projectDropPendingRef: MutableRefObject<boolean>;
  awaitBeforeExit: () => Promise<void>;
  handleOpenProject: () => Promise<void>;
  handleOpenFolderProject: () => Promise<void>;
  handleOpenFolderProjectPath: (path: string) => Promise<void>;
  handleOpenPackedProjectPath: (path: string) => Promise<void>;
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
  saveAndConfirmProjectAction: () => Promise<void>;
  confirmProjectAction: () => void;
  onConfirmProjectActionOpenChange: (open: boolean) => void;
  onRequestNewProject: () => void;
  onRequestOpenProject: () => void;
  onRequestOpenFolderProject: () => void;
  onRequestOpenRecentProject: (entry: RecentProjectEntry) => void;
  onRequestOpenProjectPath: (target: ProjectOpenTarget) => Promise<void>;
  isProjectActionPending: () => boolean;
  onRequestExit: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export const useProjectActionOrchestration = ({
  busy,
  updateInstallBusy,
  projectPath,
  hasPendingProjectChanges,
  projectDropPendingRef,
  awaitBeforeExit,
  handleOpenProject,
  handleOpenFolderProject,
  handleOpenFolderProjectPath,
  handleOpenPackedProjectPath,
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
  const projectActionBusy = busy || updateInstallBusy;

  const guardedExit = useWindowCloseGuard({
    awaitBeforeExit,
    onCloseRequested: () => requestProjectActionRef.current("exit"),
    shouldHandleCloseRequest: () => !updateInstallBusy
  });

  const {
    confirmProjectActionOpen,
    pendingProjectAction,
    projectActionConfirmBusy,
    requestProjectAction,
    isProjectActionPending,
    saveAndConfirmProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange
  } = useProjectActionFlow({
    busy: projectActionBusy,
    projectPath,
    hasPendingProjectChanges,
    projectDropPendingRef,
    onOpenProjectPath: (target) => target.kind === "folder"
      ? handleOpenFolderProjectPath(target.path)
      : handleOpenPackedProjectPath(target.path),
    onOpenProject: handleOpenProject,
    onOpenFolderProject: handleOpenFolderProject,
    onOpenRecentProject: () => {
      const entry = pendingRecentProjectRef.current;
      pendingRecentProjectRef.current = null;
      if (entry) {
        return handleOpenRecentProject(entry);
      }
    },
    onNewProject: handleNewProject,
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
    if (projectActionBusy) {
      return;
    }
    requestProjectAction("new");
  }, [projectActionBusy, requestProjectAction]);

  const onRequestOpenProject = useCallback(() => {
    if (projectActionBusy) {
      return;
    }
    requestProjectAction("open");
  }, [projectActionBusy, requestProjectAction]);

  const onRequestOpenFolderProject = useCallback(() => {
    if (projectActionBusy) {
      return;
    }
    requestProjectAction("openFolder");
  }, [projectActionBusy, requestProjectAction]);

  const onRequestOpenRecentProject = useCallback(
    (entry: RecentProjectEntry) => {
      if (projectActionBusy || isProjectActionPending() || projectDropPendingRef.current) {
        return;
      }
      pendingRecentProjectRef.current = entry;
      requestProjectAction("openRecent");
    },
    [isProjectActionPending, projectActionBusy, projectDropPendingRef, requestProjectAction]
  );

  const onRequestOpenProjectPath = useCallback(
    (target: ProjectOpenTarget) => {
      if (projectActionBusy) return Promise.resolve();
      return requestProjectAction({ type: "openPath", target });
    },
    [projectActionBusy, requestProjectAction]
  );

  const handleConfirmProjectActionOpenChange = useCallback(
    (open: boolean) => {
      onConfirmProjectActionOpenChange(open);
      if (!open && !isProjectActionPending()) {
        pendingRecentProjectRef.current = null;
      }
    },
    [isProjectActionPending, onConfirmProjectActionOpenChange]
  );

  const onRequestExit = useCallback(() => {
    if (projectActionBusy) {
      return;
    }
    requestProjectAction("exit");
  }, [projectActionBusy, requestProjectAction]);

  const onSave = useCallback(() => {
    if (isProjectActionPending() || projectDropPendingRef.current) return;
    void handleSave();
  }, [handleSave, isProjectActionPending, projectDropPendingRef]);

  const onSaveAs = useCallback(() => {
    if (isProjectActionPending() || projectDropPendingRef.current) return;
    void handleSaveAs();
  }, [handleSaveAs, isProjectActionPending, projectDropPendingRef]);

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
    onRequestOpenProjectPath,
    isProjectActionPending,
    onRequestExit,
    onSave,
    onSaveAs
  };
};
