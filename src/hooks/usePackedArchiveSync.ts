import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import type { ProjectStorageMode } from "./useProjectIO";

const PACKED_SYNC_ERROR_TOAST_ID = "packed-archive-sync-error";

type UsePackedArchiveSyncArgs = {
  projectStorageMode: ProjectStorageMode | null;
  projectPath: string | null;
  packedArchivePath: string | null;
  formatStatus: (input: unknown) => string;
  trimStatus: (input: string) => string;
  setStatus: (status: string) => void;
  setDiagramLayoutDirty: (value: boolean) => void;
  setPackedArchiveSyncFailed: (value: boolean) => void;
};

type UsePackedArchiveSyncResult = {
  requestPackedArchiveSync: () => void;
  awaitPackedArchiveSync: () => Promise<void>;
  clearPackedArchiveSyncError: () => void;
};

export const usePackedArchiveSync = ({
  projectStorageMode,
  projectPath,
  packedArchivePath,
  formatStatus,
  trimStatus,
  setStatus,
  setDiagramLayoutDirty,
  setPackedArchiveSyncFailed
}: UsePackedArchiveSyncArgs): UsePackedArchiveSyncResult => {
  const syncInFlightRef = useRef(false);
  const syncTaskRef = useRef<Promise<void> | null>(null);
  const syncPendingRef = useRef(false);
  const syncProjectRootRef = useRef<string | null>(null);
  const syncArchivePathRef = useRef<string | null>(null);
  const flushPackedArchiveSyncRef = useRef<() => Promise<void>>(async () => {});

  const clearPackedArchiveSyncError = useCallback(() => {
    syncPendingRef.current = false;
    setPackedArchiveSyncFailed(false);
    toast.dismiss(PACKED_SYNC_ERROR_TOAST_ID);
  }, [setPackedArchiveSyncFailed]);

  const flushPackedArchiveSync = useCallback((): Promise<void> => {
    if (syncInFlightRef.current) {
      return syncTaskRef.current ?? Promise.resolve();
    }

    syncInFlightRef.current = true;
    const task = (async () => {
      while (syncPendingRef.current) {
        syncPendingRef.current = false;
        const root = syncProjectRootRef.current;
        const archivePath = syncArchivePathRef.current;
        if (!root || !archivePath) {
          continue;
        }

        try {
          await invoke("save_packed_project", {
            projectRoot: root,
            archivePath
          });
          setDiagramLayoutDirty(false);
          setPackedArchiveSyncFailed(false);
          toast.dismiss(PACKED_SYNC_ERROR_TOAST_ID);
        } catch (error) {
          setDiagramLayoutDirty(true);
          setPackedArchiveSyncFailed(true);
          setStatus(`Archive sync failed: ${trimStatus(formatStatus(error))}`);
          toast.error("Failed to sync project archive.", {
            id: PACKED_SYNC_ERROR_TOAST_ID,
            description: trimStatus(formatStatus(error))
          });
        }
      }
    })().finally(() => {
      syncInFlightRef.current = false;
      syncTaskRef.current = null;
      if (syncPendingRef.current) {
        void flushPackedArchiveSyncRef.current();
      }
    });

    syncTaskRef.current = task;
    return task;
  }, [
    formatStatus,
    setDiagramLayoutDirty,
    setPackedArchiveSyncFailed,
    setStatus,
    trimStatus
  ]);

  useEffect(() => {
    flushPackedArchiveSyncRef.current = flushPackedArchiveSync;
  }, [flushPackedArchiveSync]);

  const awaitPackedArchiveSync = useCallback(async () => {
    if (syncPendingRef.current && !syncInFlightRef.current) {
      await flushPackedArchiveSync();
      return;
    }
    if (syncTaskRef.current) {
      await syncTaskRef.current;
    }
  }, [flushPackedArchiveSync]);

  const requestPackedArchiveSync = useCallback(() => {
    if (projectStorageMode !== "packed" || !projectPath || !packedArchivePath) {
      return;
    }

    syncProjectRootRef.current = projectPath;
    syncArchivePathRef.current = packedArchivePath;
    syncPendingRef.current = true;

    if (syncInFlightRef.current) {
      return;
    }
    void flushPackedArchiveSync();
  }, [flushPackedArchiveSync, packedArchivePath, projectPath, projectStorageMode]);

  useEffect(() => {
    if (projectStorageMode === "packed" && projectPath && packedArchivePath) {
      syncProjectRootRef.current = projectPath;
      syncArchivePathRef.current = packedArchivePath;
      return;
    }

    syncPendingRef.current = false;
    syncProjectRootRef.current = null;
    syncArchivePathRef.current = null;
    const resetTimer = window.setTimeout(() => {
      clearPackedArchiveSyncError();
      setDiagramLayoutDirty(false);
    }, 0);
    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [
    clearPackedArchiveSyncError,
    packedArchivePath,
    projectPath,
    projectStorageMode,
    setDiagramLayoutDirty
  ]);

  return {
    requestPackedArchiveSync,
    awaitPackedArchiveSync,
    clearPackedArchiveSyncError
  };
};
