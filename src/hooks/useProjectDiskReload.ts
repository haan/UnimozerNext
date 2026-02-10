import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DISK_RELOAD_POLL_INTERVAL_MS } from "../constants/project";
import type { ProjectStorageMode } from "./useProjectIO";

type UseProjectDiskReloadArgs = {
  projectPath: string | null;
  projectStorageMode: ProjectStorageMode | null;
  packedArchivePath: string | null;
  busy: boolean;
  hasPendingProjectChanges: boolean;
  reloadCurrentProjectFromDisk: () => Promise<boolean>;
  setStatus: (status: string) => void;
  formatStatus: (input: unknown) => string;
};

type UseProjectDiskReloadResult = {
  reloadFromDiskDialogOpen: boolean;
  onReloadFromDiskDialogOpenChange: (open: boolean) => void;
  confirmReloadFromDisk: () => void;
  ignoreReloadFromDisk: () => void;
  markDiskSnapshotCurrent: () => Promise<void>;
};

const reloadScopeKey = (
  mode: ProjectStorageMode | null,
  projectPath: string | null,
  packedArchivePath: string | null
) => {
  if (!mode || !projectPath) {
    return null;
  }
  if (mode === "packed") {
    return packedArchivePath ? `${mode}:${packedArchivePath}` : null;
  }
  if (mode === "folder") {
    return `${mode}:${projectPath}`;
  }
  return null;
};

export const useProjectDiskReload = ({
  projectPath,
  projectStorageMode,
  packedArchivePath,
  busy,
  hasPendingProjectChanges,
  reloadCurrentProjectFromDisk,
  setStatus,
  formatStatus
}: UseProjectDiskReloadArgs): UseProjectDiskReloadResult => {
  const [reloadFromDiskDialogOpen, setReloadFromDiskDialogOpen] = useState(false);
  const pendingDetectedTokenRef = useRef<string | null>(null);
  const pendingBusyTokenRef = useRef<string | null>(null);
  const lastObservedTokenRef = useRef<string | null>(null);
  const reloadInFlightRef = useRef(false);
  const wasBusyRef = useRef(false);

  const scopeKey = useMemo(
    () => reloadScopeKey(projectStorageMode, projectPath, packedArchivePath),
    [packedArchivePath, projectPath, projectStorageMode]
  );

  const readDiskToken = useCallback(async (): Promise<string | null> => {
    if (!scopeKey) {
      return null;
    }
    if (projectStorageMode === "folder" && projectPath) {
      return invoke<string>("folder_java_files_change_token", { root: projectPath });
    }
    if (projectStorageMode === "packed" && packedArchivePath) {
      return invoke<string>("file_change_token", { path: packedArchivePath });
    }
    return null;
  }, [packedArchivePath, projectPath, projectStorageMode, scopeKey]);

  const markDiskSnapshotCurrent = useCallback(async () => {
    try {
      const token = await readDiskToken();
      if (token !== null) {
        lastObservedTokenRef.current = token;
      }
    } catch {
      // Keep current baseline unchanged when snapshot update fails.
    }
  }, [readDiskToken]);

  const performReload = useCallback(async () => {
    if (reloadInFlightRef.current) {
      return false;
    }

    reloadInFlightRef.current = true;
    try {
      const reloaded = await reloadCurrentProjectFromDisk();
      if (reloaded) {
        const token = await readDiskToken();
        if (token !== null) {
          lastObservedTokenRef.current = token;
        }
      }
      return reloaded;
    } finally {
      reloadInFlightRef.current = false;
    }
  }, [readDiskToken, reloadCurrentProjectFromDisk]);

  const confirmReloadFromDisk = useCallback(() => {
    setReloadFromDiskDialogOpen(false);
    void performReload();
  }, [performReload]);

  const ignoreReloadFromDisk = useCallback(() => {
    setReloadFromDiskDialogOpen(false);
    if (pendingDetectedTokenRef.current !== null) {
      lastObservedTokenRef.current = pendingDetectedTokenRef.current;
    }
    pendingDetectedTokenRef.current = null;
    setStatus("External file changes ignored.");
  }, [setStatus]);

  const onReloadFromDiskDialogOpenChange = useCallback((open: boolean) => {
    setReloadFromDiskDialogOpen(open);
    if (!open) {
      pendingDetectedTokenRef.current = null;
    }
  }, []);

  useEffect(() => {
    lastObservedTokenRef.current = null;
    pendingDetectedTokenRef.current = null;
    pendingBusyTokenRef.current = null;
    setReloadFromDiskDialogOpen(false);
  }, [scopeKey]);

  useEffect(() => {
    if (wasBusyRef.current && !busy && pendingBusyTokenRef.current === null) {
      void markDiskSnapshotCurrent();
    }
    wasBusyRef.current = busy;
  }, [busy, markDiskSnapshotCurrent]);

  useEffect(() => {
    if (!scopeKey) {
      return;
    }

    let cancelled = false;
    let pollInFlight = false;

    const handleDetectedChange = async (token: string) => {
      if (busy) {
        pendingBusyTokenRef.current = token;
        return;
      }

      if (hasPendingProjectChanges) {
        pendingDetectedTokenRef.current = token;
        setReloadFromDiskDialogOpen(true);
        setStatus("Files changed on disk. Reload to overwrite local changes or ignore.");
        return;
      }

      setStatus("Files changed on disk. Reloading project...");
      const reloaded = await performReload();
      if (!reloaded) {
        lastObservedTokenRef.current = token;
        return;
      }
      setStatus("Project reloaded from disk.");
    };

    const poll = async () => {
      if (cancelled || pollInFlight || reloadInFlightRef.current) {
        return;
      }
      pollInFlight = true;
      try {
        if (!busy && pendingBusyTokenRef.current !== null) {
          const pendingToken = pendingBusyTokenRef.current;
          pendingBusyTokenRef.current = null;
          await handleDetectedChange(pendingToken);
          return;
        }
        const token = await readDiskToken();
        if (cancelled || token === null) {
          return;
        }
        const previous = lastObservedTokenRef.current;
        if (previous === null) {
          lastObservedTokenRef.current = token;
          return;
        }
        if (token === previous) {
          return;
        }
        await handleDetectedChange(token);
      } catch (error) {
        if (!cancelled) {
          setStatus(`Failed to check disk changes: ${formatStatus(error)}`);
        }
      } finally {
        pollInFlight = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, DISK_RELOAD_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    busy,
    formatStatus,
    hasPendingProjectChanges,
    performReload,
    readDiskToken,
    scopeKey,
    setStatus
  ]);

  return {
    reloadFromDiskDialogOpen,
    onReloadFromDiskDialogOpenChange,
    confirmReloadFromDisk,
    ignoreReloadFromDisk,
    markDiskSnapshotCurrent
  };
};
