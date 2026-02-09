import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

type UseLaunchBootstrapArgs = {
  projectPath: string | null;
  appendDebugOutput: (text: string) => void;
  handleOpenPackedProjectPath: (
    archivePath: string,
    options?: { clearConsole?: boolean }
  ) => Promise<void>;
  handleNewProject: (options?: { clearConsole?: boolean }) => Promise<void>;
  formatStatus: (input: unknown) => string;
  trimStatus: (input: string) => string;
};

export const useLaunchBootstrap = ({
  projectPath,
  appendDebugOutput,
  handleOpenPackedProjectPath,
  handleNewProject,
  formatStatus,
  trimStatus
}: UseLaunchBootstrapArgs): void => {
  const launchBootstrapStartedRef = useRef(false);
  const appendDebugOutputRef = useRef(appendDebugOutput);
  const handleOpenPackedProjectPathRef = useRef(handleOpenPackedProjectPath);
  const handleNewProjectRef = useRef(handleNewProject);
  const formatStatusRef = useRef(formatStatus);
  const trimStatusRef = useRef(trimStatus);

  useEffect(() => {
    appendDebugOutputRef.current = appendDebugOutput;
    handleOpenPackedProjectPathRef.current = handleOpenPackedProjectPath;
    handleNewProjectRef.current = handleNewProject;
    formatStatusRef.current = formatStatus;
    trimStatusRef.current = trimStatus;
  }, [appendDebugOutput, formatStatus, handleNewProject, handleOpenPackedProjectPath, trimStatus]);

  const consumeQueuedLaunchPaths = useCallback(async (): Promise<boolean> => {
    const startedAt = performance.now();
    try {
      const launchPaths = await invoke<string[]>("take_launch_open_paths");
      appendDebugOutputRef.current(`[launch] queued paths: ${JSON.stringify(launchPaths)}`);
      const packedPath = launchPaths.find((path) => path.toLowerCase().endsWith(".umz"));
      if (packedPath) {
        appendDebugOutputRef.current(`[launch] opening packed project from path: ${packedPath}`);
        const openStartedAt = performance.now();
        await handleOpenPackedProjectPathRef.current(packedPath, { clearConsole: false });
        appendDebugOutputRef.current(
          `[launch] open packed project completed in ${Math.round(performance.now() - openStartedAt)}ms`
        );
        appendDebugOutputRef.current(`[launch] open request completed for path: ${packedPath}`);
        appendDebugOutputRef.current(
          `[launch] consume launch queue finished in ${Math.round(performance.now() - startedAt)}ms`
        );
        return true;
      }
      appendDebugOutputRef.current("[launch] no .umz path in launch queue");
    } catch (error) {
      const formatter = formatStatusRef.current;
      const trimmer = trimStatusRef.current;
      appendDebugOutputRef.current(
        `[launch] failed to read launch queue: ${trimmer(formatter(error))}`
      );
    }
    appendDebugOutputRef.current(
      `[launch] consume launch queue finished in ${Math.round(performance.now() - startedAt)}ms`
    );
    return false;
  }, []);

  useEffect(() => {
    if (projectPath || launchBootstrapStartedRef.current) return;
    launchBootstrapStartedRef.current = true;
    let active = true;
    let completed = false;
    const loadLaunchProject = async () => {
      const launchStartedAt = performance.now();
      appendDebugOutputRef.current("[launch] startup launch sequence started");
      if (await consumeQueuedLaunchPaths()) {
        completed = true;
        appendDebugOutputRef.current(
          `[launch] startup sequence done via .umz in ${Math.round(performance.now() - launchStartedAt)}ms`
        );
        return;
      }
      if (active) {
        appendDebugOutputRef.current("[launch] falling back to scratch project");
        const scratchStartedAt = performance.now();
        await handleNewProjectRef.current({ clearConsole: false });
        appendDebugOutputRef.current(
          `[launch] scratch project created in ${Math.round(performance.now() - scratchStartedAt)}ms`
        );
        appendDebugOutputRef.current(
          `[launch] startup launch sequence finished in ${Math.round(performance.now() - launchStartedAt)}ms`
        );
      }
      completed = true;
    };
    void loadLaunchProject();
    return () => {
      active = false;
      if (!completed) {
        launchBootstrapStartedRef.current = false;
      }
    };
  }, [consumeQueuedLaunchPaths, projectPath]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const register = async () => {
      unlisten = await listen("launch-open-paths-available", () => {
        appendDebugOutputRef.current("[launch] received launch-open-paths-available event");
        void consumeQueuedLaunchPaths();
      });
      if (disposed && unlisten) {
        unlisten();
        unlisten = null;
      }
    };
    void register();
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [consumeQueuedLaunchPaths]);
};
