import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

export type ProjectOpenTarget = { path: string; kind: "folder" | "packed" };

export type ProjectAction =
  | "open"
  | "openFolder"
  | "openRecent"
  | "new"
  | "exit"
  | { type: "openPath"; target: ProjectOpenTarget };

type UseProjectActionFlowArgs = {
  busy: boolean;
  projectPath: string | null;
  hasPendingProjectChanges: boolean;
  projectDropPendingRef: MutableRefObject<boolean>;
  onOpenProjectPath: (target: ProjectOpenTarget) => Promise<void>;
  onOpenProject: () => void | Promise<void>;
  onOpenFolderProject: () => void | Promise<void>;
  onOpenRecentProject: () => void | Promise<void>;
  onNewProject: () => void | Promise<void>;
  onExit: () => void;
  onSave: () => Promise<boolean>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

type UseProjectActionFlowResult = {
  confirmProjectActionOpen: boolean;
  pendingProjectAction: ProjectAction | null;
  projectActionConfirmBusy: boolean;
  requestProjectAction: (action: ProjectAction) => Promise<void>;
  isProjectActionPending: () => boolean;
  saveAndConfirmProjectAction: () => Promise<void>;
  confirmProjectAction: () => void;
  onConfirmProjectActionOpenChange: (open: boolean) => void;
};

export const useProjectActionFlow = ({
  busy,
  projectPath,
  hasPendingProjectChanges,
  projectDropPendingRef,
  onOpenProjectPath,
  onOpenProject,
  onOpenFolderProject,
  onOpenRecentProject,
  onNewProject,
  onExit,
  onSave,
  onZoomIn,
  onZoomOut,
  onZoomReset
}: UseProjectActionFlowArgs): UseProjectActionFlowResult => {
  const [confirmProjectActionOpen, setConfirmProjectActionOpen] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<ProjectAction | null>(null);
  const [projectActionConfirmBusy, setProjectActionConfirmBusy] = useState(false);
  const projectActionConfirmBusyRef = useRef(false);
  // Keep ownership synchronously, including while a picker or project open is awaiting IPC.
  const activeRequestRef = useRef<{
    action: ProjectAction;
    resolve: () => void;
    reject: (error: unknown) => void;
    running: boolean;
  } | null>(null);
  const isProjectActionPending = useCallback(() => activeRequestRef.current !== null, []);

  const setProjectActionConfirmBusyState = useCallback((busyState: boolean) => {
    projectActionConfirmBusyRef.current = busyState;
    setProjectActionConfirmBusy(busyState);
  }, []);

  const runProjectAction = useCallback(
    async (action: ProjectAction) => {
      if (typeof action === "object") {
        await onOpenProjectPath(action.target);
      } else if (action === "open") {
        await onOpenProject();
      } else if (action === "openFolder") {
        await onOpenFolderProject();
      } else if (action === "openRecent") {
        await onOpenRecentProject();
      } else if (action === "exit") {
        onExit();
      } else {
        await onNewProject();
      }
    },
    [
      onExit,
      onNewProject,
      onOpenFolderProject,
      onOpenProject,
      onOpenProjectPath,
      onOpenRecentProject
    ]
  );

  const executeActiveRequest = useCallback(async () => {
    const request = activeRequestRef.current;
    if (!request || request.running) return;
    request.running = true;
    setConfirmProjectActionOpen(false);
    setPendingProjectAction(null);
    try {
      await runProjectAction(request.action);
      request.resolve();
    } catch (error) {
      request.reject(error);
    } finally {
      if (activeRequestRef.current === request) activeRequestRef.current = null;
      setProjectActionConfirmBusyState(false);
    }
  }, [runProjectAction, setProjectActionConfirmBusyState]);

  const requestProjectAction = useCallback(
    (action: ProjectAction): Promise<void> => {
      if (activeRequestRef.current || (projectDropPendingRef.current && typeof action === "string")) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        activeRequestRef.current = { action, resolve, reject, running: false };
        if (!hasPendingProjectChanges) {
          void executeActiveRequest();
          return;
        }
        setPendingProjectAction(action);
        setConfirmProjectActionOpen(true);
      });
    },
    [executeActiveRequest, hasPendingProjectChanges, projectDropPendingRef]
  );

  const confirmProjectAction = useCallback(() => {
    if (projectActionConfirmBusyRef.current || !activeRequestRef.current) {
      return;
    }
    setProjectActionConfirmBusyState(true);
    void executeActiveRequest();
  }, [executeActiveRequest, setProjectActionConfirmBusyState]);

  const saveAndConfirmProjectAction = useCallback(async () => {
    if (projectActionConfirmBusyRef.current) {
      return;
    }
    const request = activeRequestRef.current;
    if (!request || request.running) {
      return;
    }

    setProjectActionConfirmBusyState(true);
    try {
      const saved = await onSave();
      if (saved && activeRequestRef.current === request) {
        await executeActiveRequest();
      }
    } finally {
      setProjectActionConfirmBusyState(false);
    }
  }, [executeActiveRequest, onSave, setProjectActionConfirmBusyState]);

  const onConfirmProjectActionOpenChange = useCallback((open: boolean) => {
    if (projectActionConfirmBusyRef.current) return;
    setConfirmProjectActionOpen(open);
    if (!open) {
      const request = activeRequestRef.current;
      if (request && !request.running) {
        activeRequestRef.current = null;
        request.resolve();
      }
      setPendingProjectAction(null);
      setProjectActionConfirmBusyState(false);
    }
  }, [setProjectActionConfirmBusyState]);

  useEffect(() => () => {
    activeRequestRef.current?.resolve();
    activeRequestRef.current = null;
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
        if (busy || !projectPath || activeRequestRef.current || projectDropPendingRef.current) return;
        void onSave();
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
  }, [busy, onSave, onZoomIn, onZoomOut, onZoomReset, projectDropPendingRef, projectPath, requestProjectAction]);

  return {
    confirmProjectActionOpen,
    pendingProjectAction,
    projectActionConfirmBusy,
    requestProjectAction,
    isProjectActionPending,
    saveAndConfirmProjectAction,
    confirmProjectAction,
    onConfirmProjectActionOpenChange
  };
};
