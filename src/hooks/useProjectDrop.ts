import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

import { invokeValidated, projectPathKindSchema } from "../services/tauriValidation";
import type { ProjectOpenTarget } from "./useProjectActionFlow";

type UseProjectDropArgs = {
  blocked: boolean;
  projectDropPendingRef: MutableRefObject<boolean>;
  isProjectActionPending: () => boolean;
  onOpenProjectPath: (target: ProjectOpenTarget) => Promise<void>;
  onDropError: (message: string) => void;
  setStatus: (message: string) => void;
  formatStatus: (error: unknown) => string;
};

export const useProjectDrop = (args: UseProjectDropArgs): void => {
  const latestRef = useRef(args);
  useEffect(() => {
    latestRef.current = args;
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const reportDropError = (message: string) => {
      const latest = latestRef.current;
      latest.setStatus(message);
      latest.onDropError(message);
    };
    const handleDrop = async (paths: string[]) => {
      const current = latestRef.current;
      if (disposed || current.blocked || current.isProjectActionPending() ||
          current.projectDropPendingRef.current || paths.length === 0) return;
      if (paths.length !== 1) {
        reportDropError("Drop one folder or .umz file at a time.");
        return;
      }

      current.projectDropPendingRef.current = true;
      try {
        const kind = await invokeValidated(
          "classify_project_path", projectPathKindSchema, "classify_project_path response",
          { path: paths[0] }
        );
        const latest = latestRef.current;
        if (disposed || latest.blocked || latest.isProjectActionPending()) return;
        if (kind === "unsupported") {
          reportDropError("Drop a project folder or .umz file.");
          return;
        }
        // The promise stays pending through Save / Discard / Cancel and project opening.
        await latest.onOpenProjectPath({ path: paths[0], kind });
      } catch (error) {
        if (!disposed) {
          const latest = latestRef.current;
          reportDropError(`Failed to open dropped project: ${latest.formatStatus(error)}`);
        }
      } finally {
        current.projectDropPendingRef.current = false;
      }
    };

    const register = async () => {
      try {
        unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          if (event.payload.type === "drop") void handleDrop(event.payload.paths);
        });
        if (disposed) unlisten();
      } catch (error) {
        if (!disposed) {
          const latest = latestRef.current;
          latest.setStatus(`Project drag and drop unavailable: ${latest.formatStatus(error)}`);
        }
      }
    };
    void register();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
};
