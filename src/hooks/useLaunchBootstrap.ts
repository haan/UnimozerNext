import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

type UseLaunchBootstrapArgs = {
  projectPath: string | null;
  startupDebugEnabled: boolean;
  appendStartupDebugOutput?: (text: string) => void;
  appendLaunchDebugOutput?: (text: string) => void;
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
  startupDebugEnabled,
  appendStartupDebugOutput,
  appendLaunchDebugOutput,
  handleOpenPackedProjectPath,
  handleNewProject,
  formatStatus,
  trimStatus
}: UseLaunchBootstrapArgs): void => {
  const launchBootstrapStartedRef = useRef(false);
  const appendStartupDebugOutputRef = useRef(appendStartupDebugOutput);
  const appendLaunchDebugOutputRef = useRef(appendLaunchDebugOutput);
  const handleOpenPackedProjectPathRef = useRef(handleOpenPackedProjectPath);
  const handleNewProjectRef = useRef(handleNewProject);
  const formatStatusRef = useRef(formatStatus);
  const trimStatusRef = useRef(trimStatus);

  useEffect(() => {
    appendStartupDebugOutputRef.current = appendStartupDebugOutput;
    appendLaunchDebugOutputRef.current = appendLaunchDebugOutput;
    handleOpenPackedProjectPathRef.current = handleOpenPackedProjectPath;
    handleNewProjectRef.current = handleNewProject;
    formatStatusRef.current = formatStatus;
    trimStatusRef.current = trimStatus;
  }, [
    appendLaunchDebugOutput,
    appendStartupDebugOutput,
    formatStatus,
    handleNewProject,
    handleOpenPackedProjectPath,
    trimStatus
  ]);

  const logLaunch = useCallback((message: string) => {
    appendLaunchDebugOutputRef.current?.(message);
  }, []);

  useEffect(() => {
    if (!startupDebugEnabled) return;
    let active = true;
    const loadStartupLogs = async () => {
      try {
        const lines = await invoke<string[]>("take_startup_logs");
        if (!active || !lines.length) return;
        lines.forEach((line) => appendStartupDebugOutputRef.current?.(line));
      } catch {
        // Ignore startup log failures.
      }
    };
    void loadStartupLogs();
    return () => {
      active = false;
    };
  }, [startupDebugEnabled]);

  const consumeQueuedLaunchPaths = useCallback(async (): Promise<boolean> => {
    const startedAt = performance.now();
    try {
      const launchPaths = await invoke<string[]>("take_launch_open_paths");
      logLaunch(`[launch] queued paths: ${JSON.stringify(launchPaths)}`);
      const packedPath = launchPaths.find((path) => path.toLowerCase().endsWith(".umz"));
      if (packedPath) {
        logLaunch(`[launch] opening packed project from path: ${packedPath}`);
        const openStartedAt = performance.now();
        await handleOpenPackedProjectPathRef.current(packedPath, { clearConsole: false });
        logLaunch(
          `[launch] open packed project completed in ${Math.round(performance.now() - openStartedAt)}ms`
        );
        logLaunch(`[launch] open request completed for path: ${packedPath}`);
        logLaunch(
          `[launch] consume launch queue finished in ${Math.round(performance.now() - startedAt)}ms`
        );
        return true;
      }
      logLaunch("[launch] no .umz path in launch queue");
    } catch (error) {
      const formatter = formatStatusRef.current;
      const trimmer = trimStatusRef.current;
      logLaunch(
        `[launch] failed to read launch queue: ${trimmer(formatter(error))}`
      );
    }
    logLaunch(
      `[launch] consume launch queue finished in ${Math.round(performance.now() - startedAt)}ms`
    );
    return false;
  }, [logLaunch]);

  useEffect(() => {
    if (projectPath || launchBootstrapStartedRef.current) return;
    launchBootstrapStartedRef.current = true;
    let active = true;
    let completed = false;
    const loadLaunchProject = async () => {
      const launchStartedAt = performance.now();
      logLaunch("[launch] startup launch sequence started");
      if (await consumeQueuedLaunchPaths()) {
        completed = true;
        logLaunch(
          `[launch] startup sequence done via .umz in ${Math.round(performance.now() - launchStartedAt)}ms`
        );
        return;
      }
      if (active) {
        logLaunch("[launch] falling back to scratch project");
        const scratchStartedAt = performance.now();
        await handleNewProjectRef.current({ clearConsole: false });
        logLaunch(
          `[launch] scratch project created in ${Math.round(performance.now() - scratchStartedAt)}ms`
        );
        logLaunch(
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
  }, [consumeQueuedLaunchPaths, logLaunch, projectPath]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const register = async () => {
      unlisten = await listen("launch-open-paths-available", () => {
        logLaunch("[launch] received launch-open-paths-available event");
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
  }, [consumeQueuedLaunchPaths, logLaunch]);
};
