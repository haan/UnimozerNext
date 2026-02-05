import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { UmlNode } from "../models/uml";
import type { FileDraft } from "../models/drafts";

type RunStartEvent = {
  runId: number;
};

type RunOutputEvent = {
  runId: number;
  stream: string;
  line: string;
};

type RunCompleteEvent = {
  runId: number;
  ok: boolean;
  code?: number | null;
};

type UseRunConsoleArgs = {
  projectPath: string | null;
  fileDrafts: Record<string, FileDraft>;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  formatStatus: (input: unknown) => string;
  onCompileSuccess?: (outDir: string) => void;
  onCompileRequested?: () => void;
};

type UseRunConsoleResult = {
  consoleOutput: string;
  compileStatus: "success" | "failed" | null;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  runSessionId: number | null;
  appendConsoleOutput: (text: string) => void;
  resetConsoleOutput: (text?: string) => void;
  handleCompileProject: () => Promise<void>;
  handleCompileClass: (node: UmlNode) => Promise<void>;
  handleRunMain: (node: UmlNode) => Promise<void>;
  handleCancelRun: () => Promise<void>;
};

export const useRunConsole = ({
  projectPath,
  fileDrafts,
  formatAndSaveUmlFiles,
  setBusy,
  setStatus,
  formatStatus,
  onCompileSuccess,
  onCompileRequested
}: UseRunConsoleArgs): UseRunConsoleResult => {
  const [compileStatus, setCompileStatus] = useState<"success" | "failed" | null>(null);
  const [runSessionId, setRunSessionId] = useState<number | null>(null);
  const [consoleOutput, setConsoleOutput] = useState("");
  const runSessionRef = useRef<number | null>(null);
  const consoleLinesRef = useRef<string[]>([]);
  const consoleDroppedRef = useRef(0);
  const consoleFlushRef = useRef<number | null>(null);

  const setRunSession = useCallback((id: number | null) => {
    runSessionRef.current = id;
    setRunSessionId(id);
  }, []);

  const flushConsole = useCallback(() => {
    if (consoleFlushRef.current !== null) return;
    consoleFlushRef.current = window.setTimeout(() => {
      consoleFlushRef.current = null;
      const lines = consoleLinesRef.current;
      const dropped = consoleDroppedRef.current;
      const text = dropped > 0 ? [...lines, `... ${dropped} lines truncated ...`].join("\n") : lines.join("\n");
      setConsoleOutput(text);
    }, 50);
  }, []);

  const appendConsole = useCallback(
    (text: string) => {
      const lines = consoleLinesRef.current;
      const incoming = text.split(/\r?\n/);
      for (const line of incoming) {
        lines.push(line);
      }
      const maxLines = 2000;
      if (lines.length > maxLines) {
        const excess = lines.length - maxLines;
        lines.splice(0, excess);
        consoleDroppedRef.current += excess;
      }
      flushConsole();
    },
    [flushConsole]
  );

  const resetConsole = useCallback((text = "") => {
    if (consoleFlushRef.current !== null) {
      window.clearTimeout(consoleFlushRef.current);
      consoleFlushRef.current = null;
    }
    consoleDroppedRef.current = 0;
    if (text) {
      consoleLinesRef.current = text.split(/\r?\n/);
    } else {
      consoleLinesRef.current = [];
    }
    setConsoleOutput(text);
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenStart: (() => void) | null = null;
    let unlistenOutput: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;

    const setup = async () => {
      const startUnlisten = await listen<RunStartEvent>("run-start", (event) => {
        setRunSession(event.payload.runId);
      });
      if (!active) {
        startUnlisten();
        return;
      }
      unlistenStart = startUnlisten;

      const outputUnlisten = await listen<RunOutputEvent>("run-output", (event) => {
        const activeId = runSessionRef.current;
        if (activeId === null || event.payload.runId !== activeId) return;
        const prefix = event.payload.stream === "stderr" ? "[stderr] " : "";
        if (event.payload.line) {
          appendConsole(`${prefix}${event.payload.line}`);
        }
      });
      if (!active) {
        outputUnlisten();
        return;
      }
      unlistenOutput = outputUnlisten;

      const completeUnlisten = await listen<RunCompleteEvent>("run-complete", (event) => {
        const activeId = runSessionRef.current;
        if (activeId === null || event.payload.runId !== activeId) return;
        const exitLabel = event.payload.ok
          ? "Run finished."
          : `Run failed (exit ${event.payload.code ?? "?"}).`;
        appendConsole(exitLabel);
        setStatus(event.payload.ok ? "Run main succeeded." : "Run main failed.");
        setRunSession(null);
      });
      if (!active) {
        completeUnlisten();
        return;
      }
      unlistenComplete = completeUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenStart) unlistenStart();
      if (unlistenOutput) unlistenOutput();
      if (unlistenComplete) unlistenComplete();
    };
  }, [appendConsole, setRunSession, setStatus]);

  const runCompile = useCallback(
    async (label?: string) => {
      if (!projectPath) return;
      const overrides = Object.entries(fileDrafts)
        .filter(([, draft]) => draft.content !== draft.lastSavedContent)
        .map(([path, draft]) => ({
          path,
          content: draft.content
        }));

      setBusy(true);
      const startedAt = new Date().toLocaleTimeString();
      resetConsole();
      setCompileStatus(null);
      onCompileRequested?.();
      const labelSuffix = label ? ` for ${label}` : "";
      appendConsole(`[${startedAt}] Compile requested${labelSuffix}`);
      try {
        await formatAndSaveUmlFiles(false);
        const result = await invoke<{
          ok: boolean;
          stdout: string;
          stderr: string;
          outDir: string;
        }>("compile_project", {
          root: projectPath,
          srcRoot: "src",
          overrides
        });
        if (result.stdout) {
          appendConsole(result.stdout.trim());
        }
        if (result.stderr) {
          appendConsole(result.stderr.trim());
        }
        if (result.ok) {
          appendConsole("Compilation succeeded.");
          setCompileStatus("success");
          if (result.outDir && onCompileSuccess) {
            onCompileSuccess(result.outDir);
          }
        } else if (!result.stderr && !result.stdout) {
          appendConsole("Compilation failed.");
        }
        if (!result.ok) {
          setCompileStatus("failed");
        }
        setStatus(result.ok ? "Compile succeeded." : "Compile failed.");
      } catch (error) {
        appendConsole(`Compile failed: ${formatStatus(error)}`);
        setCompileStatus("failed");
        setStatus("Compile failed.");
      } finally {
        setBusy(false);
      }
    },
    [
      appendConsole,
      fileDrafts,
      formatAndSaveUmlFiles,
      formatStatus,
      onCompileRequested,
      onCompileSuccess,
      projectPath,
      resetConsole,
      setBusy,
      setStatus
    ]
  );

  const handleCompileProject = useCallback(async () => {
    await runCompile();
  }, [runCompile]);

  const handleCompileClass = useCallback(
    async (node: UmlNode) => {
      await runCompile(node.name);
    },
    [runCompile]
  );

  const handleRunMain = useCallback(
    async (node: UmlNode) => {
      if (!projectPath) return;
      const startedAt = new Date().toLocaleTimeString();
      resetConsole();
      appendConsole(`[${startedAt}] Run main requested for ${node.name}`);
      try {
        if (runSessionRef.current !== null) {
          await invoke("cancel_run");
          setRunSession(null);
        }
        await invoke<number>("run_main", {
          root: projectPath,
          mainClass: node.id
        });
        setStatus("Run main started.");
      } catch (error) {
        appendConsole(`Run main failed: ${formatStatus(error)}`);
        setStatus("Run main failed.");
        setRunSession(null);
      }
    },
    [appendConsole, formatStatus, projectPath, resetConsole, setRunSession, setStatus]
  );

  const handleCancelRun = useCallback(async () => {
    if (runSessionRef.current === null) return;
    try {
      await invoke("cancel_run");
      appendConsole("Run cancellation requested.");
      setStatus("Cancelling run...");
    } catch (error) {
      appendConsole(`Cancel failed: ${formatStatus(error)}`);
      setStatus("Cancel failed.");
    }
  }, [appendConsole, formatStatus, setStatus]);

  return {
    consoleOutput,
    compileStatus,
    setCompileStatus,
    runSessionId,
    appendConsoleOutput: appendConsole,
    resetConsoleOutput: resetConsole,
    handleCompileProject,
    handleCompileClass,
    handleRunMain,
    handleCancelRun
  };
};
