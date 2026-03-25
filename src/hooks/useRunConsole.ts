import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CONSOLE_FLUSH_DELAY_MS, CONSOLE_MAX_LINES } from "../constants/console";
import {
  compileProjectResultSchema,
  parseSchemaOrNull,
  parseSchemaOrThrow,
  runCompleteEventSchema,
  runOutputEventSchema,
  runStartEventSchema
} from "../services/tauriValidation";

import type { UmlNode } from "../models/uml";
import type { FileDraft } from "../models/drafts";

type UseRunConsoleArgs = {
  projectPath: string | null;
  fileDrafts: Record<string, FileDraft>;
  compileStatus: "success" | "failed" | null;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  formatStatus: (input: unknown) => string;
  preserveConsoleOnCompile?: boolean;
  onCompileInputsSaved?: () => Promise<void>;
  onCompileSuccess?: (outDir: string) => Promise<{ ready: boolean; reason?: string }>;
  onCompileRequested?: () => Promise<void> | void;
};

type UseRunConsoleResult = {
  consoleOutput: string;
  compileStatus: "success" | "failed" | null;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  runSessionId: number | null;
  appendConsoleOutput: (text: string) => void;
  replaceLastConsoleLine: (text: string) => void;
  resetConsoleOutput: (text?: string) => void;
  handleCompileProject: () => Promise<void>;
  handleCompileClass: (node: UmlNode) => Promise<void>;
  handleRunMain: (node: UmlNode) => Promise<void>;
  handleCancelRun: () => Promise<void>;
};

export const useRunConsole = ({
  projectPath,
  fileDrafts,
  compileStatus,
  setCompileStatus,
  formatAndSaveUmlFiles,
  setBusy,
  setStatus,
  formatStatus,
  preserveConsoleOnCompile = false,
  onCompileInputsSaved,
  onCompileSuccess,
  onCompileRequested
}: UseRunConsoleArgs): UseRunConsoleResult => {
  const [runSessionId, setRunSessionId] = useState<number | null>(null);
  const [consoleOutput, setConsoleOutput] = useState("");
  const runSessionRef = useRef<number | null>(null);
  const compileInFlightRef = useRef(false);
  const runCancellationRequestedRef = useRef(false);
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
    }, CONSOLE_FLUSH_DELAY_MS);
  }, []);

  const appendConsole = useCallback(
    (text: string) => {
      const lines = consoleLinesRef.current;
      const incoming = text.split(/\r?\n/);
      for (const line of incoming) {
        lines.push(line);
      }
      if (lines.length > CONSOLE_MAX_LINES) {
        const excess = lines.length - CONSOLE_MAX_LINES;
        lines.splice(0, excess);
        consoleDroppedRef.current += excess;
      }
      flushConsole();
    },
    [flushConsole]
  );

  const replaceLastConsoleLine = useCallback(
    (text: string) => {
      const lines = consoleLinesRef.current;
      if (lines.length === 0) {
        lines.push(text);
      } else {
        lines[lines.length - 1] = text;
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
      const startUnlisten = await listen("run-start", (event) => {
        const payload = parseSchemaOrNull(runStartEventSchema, event.payload);
        if (!payload) {
          return;
        }
        setRunSession(payload.runId);
      });
      if (!active) {
        startUnlisten();
        return;
      }
      unlistenStart = startUnlisten;

      const outputUnlisten = await listen("run-output", (event) => {
        const payload = parseSchemaOrNull(runOutputEventSchema, event.payload);
        if (!payload) {
          return;
        }
        const activeId = runSessionRef.current;
        if (activeId === null || payload.runId !== activeId) return;
        const prefix = payload.stream === "stderr" ? "[stderr] " : "";
        if (payload.line) {
          appendConsole(`${prefix}${payload.line}`);
        }
      });
      if (!active) {
        outputUnlisten();
        return;
      }
      unlistenOutput = outputUnlisten;

      const completeUnlisten = await listen("run-complete", (event) => {
        const payload = parseSchemaOrNull(runCompleteEventSchema, event.payload);
        if (!payload) {
          return;
        }
        const activeId = runSessionRef.current;
        if (activeId === null || payload.runId !== activeId) return;
        const wasCanceled = runCancellationRequestedRef.current;
        runCancellationRequestedRef.current = false;
        if (wasCanceled) {
          replaceLastConsoleLine("Stopping main process...stopped.");
          setStatus("Run main stopped.");
        } else if (payload.ok) {
          appendConsole("Running main process...finished.");
          setStatus("Run main succeeded.");
        } else {
          appendConsole(`Running main process...failed (exit ${payload.code ?? "?"}).`);
          setStatus("Run main failed.");
        }
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
  }, [appendConsole, replaceLastConsoleLine, setRunSession, setStatus]);

  const runCompile = useCallback(
    async (label?: string) => {
      if (!projectPath) return;
      if (compileInFlightRef.current) {
        return;
      }
      compileInFlightRef.current = true;
      const overrides = Object.entries(fileDrafts)
        .filter(([, draft]) => draft.content !== draft.lastSavedContent)
        .map(([path, draft]) => ({
          path,
          content: draft.content
        }));

      setBusy(true);
      const startedAt = new Date().toLocaleTimeString();
      if (!preserveConsoleOnCompile) {
        resetConsole();
      }
      setCompileStatus(null);
      const labelSuffix = label ? ` for ${label}` : "";
      appendConsole(`[${startedAt}] Compile requested${labelSuffix}`);
      try {
        setStatus("Stopping object bench runtime...");
        appendConsole("Phase 1/4: stopping object bench runtime...");
        try {
          await onCompileRequested?.();
          replaceLastConsoleLine("Phase 1/4: stopping object bench runtime...done.");
        } catch (error) {
          replaceLastConsoleLine(
            `Phase 1/4: stopping object bench runtime...failed (${formatStatus(error)}).`
          );
          throw error;
        }

        setStatus("Saving files...");
        appendConsole("Phase 2/4: saving files...");
        let savedFiles = 0;
        try {
          savedFiles = await formatAndSaveUmlFiles(false);
          await onCompileInputsSaved?.();
          replaceLastConsoleLine(
            `Phase 2/4: saving files...saved ${savedFiles} file${
              savedFiles === 1 ? "" : "s"
            } before compile.`
          );
        } catch (error) {
          replaceLastConsoleLine(`Phase 2/4: saving files...failed (${formatStatus(error)}).`);
          throw error;
        }

        setStatus("Compiling Java sources...");
        appendConsole("Phase 3/4: compiling Java sources...");
        let result;
        try {
          const resultRaw = await invoke<unknown>("compile_project", {
            root: projectPath,
            srcRoot: "src",
            overrides
          });
          result = parseSchemaOrThrow(
            compileProjectResultSchema,
            resultRaw,
            "compile_project response"
          );
        } catch (error) {
          replaceLastConsoleLine(
            `Phase 3/4: compiling Java sources...failed (${formatStatus(error)}).`
          );
          throw error;
        }

        if (result.ok) {
          replaceLastConsoleLine("Phase 3/4: compiling Java sources...compilation succeeded.");
        } else {
          replaceLastConsoleLine("Phase 3/4: compiling Java sources...compilation failed.");
        }
        if (result.stdout) {
          appendConsole(result.stdout.trim());
        }
        if (result.stderr) {
          appendConsole(result.stderr.trim());
        }
        let finalStatus = result.ok ? "Compile succeeded." : "Compile failed.";
        if (result.ok) {
          setCompileStatus("success");
          if (result.outDir && onCompileSuccess) {
            setStatus("Starting object bench runtime...");
            appendConsole("Phase 4/4: starting object bench runtime...");
            let runtimeResult;
            try {
              runtimeResult = await onCompileSuccess(result.outDir);
            } catch (error) {
              replaceLastConsoleLine(
                `Phase 4/4: starting object bench runtime...failed (${formatStatus(error)}).`
              );
              throw error;
            }
            if (runtimeResult.ready) {
              replaceLastConsoleLine("Phase 4/4: starting object bench runtime...ready.");
            } else {
              replaceLastConsoleLine(
                `Phase 4/4: starting object bench runtime...failed (${runtimeResult.reason ?? "unknown reason"}).`
              );
              finalStatus = `Compile succeeded, but object bench runtime failed: ${runtimeResult.reason ?? "unknown reason"}`;
            }
          } else {
            appendConsole("Phase 4/4: starting object bench runtime...skipped.");
          }
        } else {
          if (!result.stderr && !result.stdout) {
            appendConsole("Compilation failed.");
          }
        }
        if (!result.ok) {
          setCompileStatus("failed");
        }
        setStatus(finalStatus);
      } catch (error) {
        const formattedError = formatStatus(error);
        appendConsole(`Compile failed: ${formattedError}`);
        if (formattedError === "Unknown error") {
          try {
            appendConsole(`Compile failed (raw): ${String(error)}`);
            const serialized =
              typeof error === "object" && error !== null ? JSON.stringify(error) : "";
            if (serialized && serialized !== "{}") {
              appendConsole(`Compile failed (raw json): ${serialized}`);
            }
          } catch {
            // Ignore secondary formatting failures.
          }
        }
        setCompileStatus("failed");
        setStatus("Compile failed.");
      } finally {
        setBusy(false);
        compileInFlightRef.current = false;
      }
    },
    [
      appendConsole,
      fileDrafts,
      formatAndSaveUmlFiles,
      formatStatus,
      onCompileRequested,
      onCompileInputsSaved,
      onCompileSuccess,
      preserveConsoleOnCompile,
      projectPath,
      replaceLastConsoleLine,
      resetConsole,
      setBusy,
      setCompileStatus,
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
      if (!preserveConsoleOnCompile) {
        resetConsole();
      }
      appendConsole(`[${startedAt}] Run main requested for ${node.name}`);
      try {
        if (runSessionRef.current !== null) {
          runCancellationRequestedRef.current = true;
          await invoke("cancel_run");
          setRunSession(null);
        }
        await invoke<number>("run_main", {
          root: projectPath,
          mainClass: node.id
        });
        runCancellationRequestedRef.current = false;
        setStatus("Run main started.");
      } catch (error) {
        runCancellationRequestedRef.current = false;
        appendConsole(`Running main process...failed (${formatStatus(error)}).`);
        setStatus("Run main failed.");
        setRunSession(null);
      }
    },
    [
      appendConsole,
      formatStatus,
      preserveConsoleOnCompile,
      projectPath,
      resetConsole,
      setRunSession,
      setStatus
    ]
  );

  const handleCancelRun = useCallback(async () => {
    if (runSessionRef.current === null) return;
    appendConsole("Stopping main process...");
    try {
      runCancellationRequestedRef.current = true;
      await invoke("cancel_run");
      setStatus("Cancelling run...");
    } catch (error) {
      runCancellationRequestedRef.current = false;
      replaceLastConsoleLine(`Stopping main process...failed (${formatStatus(error)}).`);
      setStatus("Cancel failed.");
    }
  }, [appendConsole, formatStatus, replaceLastConsoleLine, setStatus]);

  return {
    consoleOutput,
    compileStatus,
    setCompileStatus,
    runSessionId,
    appendConsoleOutput: appendConsole,
    replaceLastConsoleLine,
    resetConsoleOutput: resetConsole,
    handleCompileProject,
    handleCompileClass,
    handleRunMain,
    handleCancelRun
  };
};
