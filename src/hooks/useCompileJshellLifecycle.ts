import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { ObjectInstance } from "../models/objectBench";
import type { UmlGraph } from "../models/uml";
import { jshellEval, jshellInspect, jshellStart, jshellStop } from "../services/jshell";
import { getUmlSignature } from "../services/umlGraph";

type UseCompileJshellLifecycleArgs = {
  projectPath: string | null;
  umlGraph: UmlGraph | null;
  compileStatus: "success" | "failed" | null;
  requestPackedArchiveSync: (delayMs?: number) => void;
  setStatus: (status: string) => void;
  setJshellReady: Dispatch<SetStateAction<boolean>>;
  setObjectBench: Dispatch<SetStateAction<ObjectInstance[]>>;
  formatStatus: (input: unknown) => string;
  trimStatus: (input: string, max?: number) => string;
  appendDebugOutput?: (text: string) => void;
};

type UseCompileJshellLifecycleResult = {
  lastCompileOutDirRef: MutableRefObject<string | null>;
  handleCompileSuccess: (outDir: string) => Promise<{ ready: boolean; reason?: string }>;
  onCompileRequested: () => Promise<void>;
  waitForJshellReady: () => Promise<boolean>;
};

const JSHELL_WARMUP_TIMEOUT_MS = 10_000;
const PACKED_SYNC_AFTER_COMPILE_DELAY_MS = 1_500;
const JSHELL_STOP_TIMEOUT_MS = 5_000;
const JSHELL_START_TIMEOUT_MS = 5_000;

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });

export const useCompileJshellLifecycle = ({
  projectPath,
  umlGraph,
  compileStatus,
  requestPackedArchiveSync,
  setStatus,
  setJshellReady,
  setObjectBench,
  formatStatus,
  trimStatus,
  appendDebugOutput
}: UseCompileJshellLifecycleArgs): UseCompileJshellLifecycleResult => {
  const umlSignatureRef = useRef<string>("");
  const lastCompileOutDirRef = useRef<string | null>(null);
  const lastCompileStatusRef = useRef<"success" | "failed" | null>(null);
  const jshellStartTaskRef = useRef<Promise<boolean> | null>(null);
  const jshellStartTokenRef = useRef(0);
  const logDebug = useCallback(
    (text: string) => {
      appendDebugOutput?.(`[${new Date().toLocaleTimeString()}] ${text}`);
    },
    [appendDebugOutput]
  );

  const startJshellForCompile = useCallback(
    (startToken: number, rootPath: string, outDir: string, classIds: string[]): Promise<boolean> => {
      const warmupJshell = async (token: number): Promise<boolean> => {
        const runEvalWarmupStep = async (
          label: string,
          code: string,
          required: boolean
        ): Promise<boolean> => {
          const begin = performance.now();
          const result = await jshellEval(code);
          const elapsedMs = Math.round(performance.now() - begin);
          if (jshellStartTokenRef.current !== token) {
            return false;
          }
          if (!result.ok) {
            const details = trimStatus(
              result.error || result.stderr || "Unknown warmup error"
            );
            if (required) {
              logDebug(`JShell warmup step failed (${label}, ${elapsedMs}ms): ${details}`);
              setStatus(`JShell warmup failed: ${details}`);
              return false;
            }
            logDebug(
              `JShell warmup step skipped (${label}, ${elapsedMs}ms): ${details}`
            );
            return true;
          }
          logDebug(`JShell warmup step finished (${label}, ${elapsedMs}ms)`);
          return true;
        };

        const runInspectWarmupStep = async (
          label: string,
          varName: string,
          required: boolean
        ): Promise<boolean> => {
          const begin = performance.now();
          const inspect = await jshellInspect(varName);
          const elapsedMs = Math.round(performance.now() - begin);
          if (jshellStartTokenRef.current !== token) {
            return false;
          }
          if (!inspect.ok) {
            const details = trimStatus(
              inspect.error || "Unknown inspect warmup error"
            );
            if (required) {
              logDebug(`JShell warmup step failed (${label}, ${elapsedMs}ms): ${details}`);
              setStatus(`JShell warmup failed: ${details}`);
              return false;
            }
            logDebug(
              `JShell warmup step skipped (${label}, ${elapsedMs}ms): ${details}`
            );
            return true;
          }
          logDebug(`JShell warmup step finished (${label}, ${elapsedMs}ms)`);
          return true;
        };

        logDebug(`JShell warmup start (token=${token})`);
        setStatus("Warming up object bench runtime...");
        let timeoutHandle: number | null = window.setTimeout(() => {
          if (jshellStartTokenRef.current !== token) {
            return;
          }
          logDebug(`JShell warmup timeout (token=${token}, ${JSHELL_WARMUP_TIMEOUT_MS}ms)`);
          setStatus("JShell warmup is taking longer than expected.");
        }, JSHELL_WARMUP_TIMEOUT_MS);

        try {
          // Required baseline warmup: confirms eval path is responsive.
          const baselineReady = await runEvalWarmupStep(
            "eval-baseline",
            "1 + 1;",
            true
          );
          if (!baselineReady) {
            return false;
          }

          // Optional preheat: reflection + inspect path used by first object creation.
          const reflectionReady = await runEvalWarmupStep(
            "eval-reflection",
            'Class.forName("java.lang.String").getDeclaredConstructor().newInstance();',
            false
          );
          if (reflectionReady) {
            await runInspectWarmupStep("inspect-first-result", "$2", false);
          }

          // Warm up JVM reflection metadata for each user class so that the first
          // Inspector.inspect() call on a user object doesn't hit a cold getDeclaredFields /
          // getMethods / setAccessible path.  Each step is optional — a missing or
          // unloadable class is silently skipped by Inspector.warm() itself.
          for (const classId of classIds) {
            if (jshellStartTokenRef.current !== token) break;
            await runEvalWarmupStep(
              `reflect-class-${classId}`,
              `com.unimozer.jshell.Inspector.warm("${classId}");`,
              false
            );
          }

          logDebug(`JShell warmup finished (token=${token})`);
          logDebug(`JShell ready (token=${token}, warmup complete)`);
          setStatus("Object bench runtime ready.");
          return true;
        } catch (error) {
          if (jshellStartTokenRef.current !== token) {
            return false;
          }
          logDebug(`JShell warmup threw (token=${token}): ${trimStatus(formatStatus(error))}`);
          setStatus(`JShell warmup failed: ${trimStatus(formatStatus(error))}`);
          return false;
        } finally {
          if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
        }
      };

      const startTask = (async (): Promise<boolean> => {
        if (jshellStartTokenRef.current !== startToken) {
          logDebug(`JShell restart canceled before start (token=${startToken})`);
          return false;
        }

        try {
          const startBegin = performance.now();
          logDebug(`JShell start (token=${startToken}, outDir=${outDir})`);
          await withTimeout(
            jshellStart(rootPath, outDir),
            JSHELL_START_TIMEOUT_MS,
            `JShell start timed out after ${JSHELL_START_TIMEOUT_MS}ms`
          );
          const startMs = Math.round(performance.now() - startBegin);

          if (jshellStartTokenRef.current === startToken) {
            setJshellReady(true);
            logDebug(`JShell start completed (token=${startToken}, ${startMs}ms)`);
            logDebug(`JShell ready (token=${startToken}, warmup pending)`);
            const warmupReady = await warmupJshell(startToken);
            if (!warmupReady) {
              setJshellReady(false);
              return false;
            }
          }
          return jshellStartTokenRef.current === startToken;
        } catch (error) {
          if (jshellStartTokenRef.current === startToken) {
            setJshellReady(false);
            logDebug(
              `JShell start failed (token=${startToken}): ${trimStatus(formatStatus(error))}`
            );
            setStatus(`JShell failed to start: ${trimStatus(formatStatus(error))}`);
          }
          return false;
        } finally {
          if (jshellStartTokenRef.current === startToken) {
            jshellStartTaskRef.current = null;
          }
        }
      })();

      jshellStartTaskRef.current = startTask;
      return startTask;
    },
    [formatStatus, logDebug, setJshellReady, setStatus, trimStatus]
  );

  useEffect(() => {
    if (!projectPath) {
      jshellStartTaskRef.current = null;
      jshellStartTokenRef.current += 1;
      setObjectBench([]);
      setJshellReady(false);
      logDebug("JShell stop due to empty project path");
      void jshellStop();
      return;
    }
    return () => {
      jshellStartTaskRef.current = null;
      jshellStartTokenRef.current += 1;
      logDebug("JShell stop on lifecycle cleanup");
      void jshellStop();
      setObjectBench([]);
      setJshellReady(false);
    };
  }, [logDebug, projectPath, setJshellReady, setObjectBench]);

  useEffect(() => {
    const signature = getUmlSignature(umlGraph);
    if (!signature) {
      umlSignatureRef.current = "";
      setObjectBench([]);
      return;
    }
    if (signature !== umlSignatureRef.current) {
      umlSignatureRef.current = signature;
      setObjectBench([]);
    }
  }, [umlGraph, setObjectBench]);

  const handleCompileSuccess = useCallback(
    async (outDir: string) => {
      if (!projectPath) {
        return { ready: false, reason: "Project path missing." };
      }
      lastCompileOutDirRef.current = outDir;
      requestPackedArchiveSync(PACKED_SYNC_AFTER_COMPILE_DELAY_MS);
      setJshellReady(false);
      setObjectBench([]);

      const startToken = jshellStartTokenRef.current + 1;
      jshellStartTokenRef.current = startToken;
      logDebug(`JShell start executing (token=${startToken})`);
      setStatus("Starting object bench runtime...");
      const classIds = umlGraph?.nodes.map((node) => node.id).filter(Boolean) ?? [];
      const ready = await startJshellForCompile(startToken, projectPath, outDir, classIds);
      if (!ready) {
        return { ready: false, reason: "JShell start or warmup failed." };
      }
      return { ready: true };
    },
    [
      logDebug,
      projectPath,
      requestPackedArchiveSync,
      setStatus,
      startJshellForCompile,
      umlGraph,
      setJshellReady,
      setObjectBench,
    ]
  );

  const onCompileRequested = useCallback(async () => {
    logDebug("Compile requested: stop/reset JShell lifecycle");
    jshellStartTokenRef.current += 1;
    jshellStartTaskRef.current = null;
    setJshellReady(false);
    setObjectBench([]);
    try {
      logDebug("JShell stop before compile");
      const stopBegin = performance.now();
      await withTimeout(
        jshellStop(),
        JSHELL_STOP_TIMEOUT_MS,
        `JShell stop timed out after ${JSHELL_STOP_TIMEOUT_MS}ms`
      );
      const stopMs = Math.round(performance.now() - stopBegin);
      logDebug(`JShell stop completed before compile (${stopMs}ms)`);
    } catch (error) {
      // Continue compile even if stop hangs/fails.
      logDebug(`JShell stop failed before compile: ${trimStatus(formatStatus(error))}`);
      setStatus("JShell stop timed out, continuing compile.");
    }
  }, [formatStatus, logDebug, setJshellReady, setObjectBench, setStatus, trimStatus]);

  const waitForJshellReady = useCallback(async (): Promise<boolean> => {
    if (jshellStartTaskRef.current) {
      return jshellStartTaskRef.current;
    }
    return false;
  }, []);

  useEffect(() => {
    if (compileStatus !== "success") {
      setJshellReady(false);
    }
    if (lastCompileStatusRef.current === "success" && compileStatus !== "success") {
      setObjectBench([]);
    }
    lastCompileStatusRef.current = compileStatus;
  }, [compileStatus, setJshellReady, setObjectBench]);

  return {
    lastCompileOutDirRef,
    handleCompileSuccess,
    onCompileRequested,
    waitForJshellReady
  };
};
