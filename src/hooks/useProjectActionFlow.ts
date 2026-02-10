import { useCallback, useEffect, useState } from "react";

export type ProjectAction = "open" | "openFolder" | "new" | "exit";

type UseProjectActionFlowArgs = {
  busy: boolean;
  projectPath: string | null;
  hasPendingProjectChanges: boolean;
  onOpenProject: () => void;
  onOpenFolderProject: () => void;
  onNewProject: () => void;
  onExit: () => void;
  onSave: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

type UseProjectActionFlowResult = {
  confirmProjectActionOpen: boolean;
  pendingProjectAction: ProjectAction | null;
  requestProjectAction: (action: ProjectAction) => void;
  confirmProjectAction: () => void;
  onConfirmProjectActionOpenChange: (open: boolean) => void;
};

export const useProjectActionFlow = ({
  busy,
  projectPath,
  hasPendingProjectChanges,
  onOpenProject,
  onOpenFolderProject,
  onNewProject,
  onExit,
  onSave,
  onZoomIn,
  onZoomOut,
  onZoomReset
}: UseProjectActionFlowArgs): UseProjectActionFlowResult => {
  const [confirmProjectActionOpen, setConfirmProjectActionOpen] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<ProjectAction | null>(null);

  const runProjectAction = useCallback(
    (action: ProjectAction) => {
      if (action === "open") {
        onOpenProject();
      } else if (action === "openFolder") {
        onOpenFolderProject();
      } else if (action === "exit") {
        onExit();
      } else {
        onNewProject();
      }
    },
    [onExit, onNewProject, onOpenFolderProject, onOpenProject]
  );

  const requestProjectAction = useCallback(
    (action: ProjectAction) => {
      if (!hasPendingProjectChanges) {
        runProjectAction(action);
        return;
      }
      setPendingProjectAction(action);
      setConfirmProjectActionOpen(true);
    },
    [hasPendingProjectChanges, runProjectAction]
  );

  const confirmProjectAction = useCallback(() => {
    const action = pendingProjectAction;
    setConfirmProjectActionOpen(false);
    setPendingProjectAction(null);
    if (action) {
      runProjectAction(action);
    }
  }, [pendingProjectAction, runProjectAction]);

  const onConfirmProjectActionOpenChange = useCallback((open: boolean) => {
    setConfirmProjectActionOpen(open);
    if (!open) {
      setPendingProjectAction(null);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        if (!busy) {
          requestProjectAction("open");
        }
        return;
      }
      if (key === "n") {
        event.preventDefault();
        if (!busy) {
          requestProjectAction("new");
        }
        return;
      }
      if (key === "s") {
        event.preventDefault();
        if (busy || !projectPath) return;
        onSave();
        return;
      }
      if (key === "+" || key === "=") {
        event.preventDefault();
        onZoomIn();
        return;
      }
      if (key === "-" || key === "_") {
        event.preventDefault();
        onZoomOut();
        return;
      }
      if (key === "0") {
        event.preventDefault();
        onZoomReset();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onSave, onZoomIn, onZoomOut, onZoomReset, projectPath, requestProjectAction]);

  return {
    confirmProjectActionOpen,
    pendingProjectAction,
    requestProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange
  };
};

