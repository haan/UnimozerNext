import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { ObjectInstance } from "../models/objectBench";
import type { UmlGraph } from "../models/uml";
import { jshellEval, jshellStart, jshellStop } from "../services/jshell";
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
  handleCompileSuccess: (outDir: string) => Promise<void>;
  onCompileRequested: () => Promise<void>;
  waitForJshellReady: () => Promise<boolean>;
};

const JSHELL_WARMUP_TIMEOUT_MS = 10_000;
const PACKED_SYNC_AFTER_COMPILE_DELAY_MS = 1_500;

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
    (startToken: number, rootPath: string, outDir: string): Promise<boolean> => {
      const warmupJshell = async (token: number): Promise<boolean> => {
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
          const warmup = await jshellEval("1 + 1;");
          if (jshellStartTokenRef.current !== token) {
            return false;
          }
          if (!warmup.ok) {
            const details = trimStatus(
              warmup.error || warmup.stderr || "Unknown warmup error"
            );
            logDebug(`JShell warmup failed (token=${token}): ${details}`);
            setStatus(`JShell warmup failed: ${details}`);
            return false;
          } else {
            logDebug(`JShell warmup finished (token=${token})`);
            logDebug(`JShell ready (token=${token}, warmup complete)`);
            setStatus("Object bench runtime ready.");
            return true;
          }
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
          logDebug(`JShell restart canceled before stop (token=${startToken})`);
          return false;
        }

        logDebug(`JShell stop before restart (token=${startToken})`);
        try {
          await jshellStop();
          logDebug(`JShell stop completed before restart (token=${startToken})`);
        } catch {
          // Ignore failures when restarting JShell.
          logDebug(`JShell stop failed before restart (token=${startToken})`);
        }

        if (jshellStartTokenRef.current !== startToken) {
          logDebug(`JShell restart canceled before start (token=${startToken})`);
          return false;
        }

        try {
          logDebug(`JShell start (token=${startToken}, outDir=${outDir})`);
          await jshellStart(rootPath, outDir);

          if (jshellStartTokenRef.current === startToken) {
            setJshellReady(true);
            logDebug(`JShell start completed (token=${startToken})`);
            logDebug(`JShell ready (token=${startToken}, warmup pending)`);
            await warmupJshell(startToken);
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
      if (!projectPath) return;
      lastCompileOutDirRef.current = outDir;
      requestPackedArchiveSync(PACKED_SYNC_AFTER_COMPILE_DELAY_MS);
      setJshellReady(false);
      setObjectBench([]);

      const startToken = jshellStartTokenRef.current + 1;
      jshellStartTokenRef.current = startToken;
      logDebug(`JShell start executing (token=${startToken})`);
      setStatus("Starting object bench runtime...");
      await startJshellForCompile(startToken, projectPath, outDir);
    },
    [
      logDebug,
      projectPath,
      requestPackedArchiveSync,
      setStatus,
      startJshellForCompile,
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
      await jshellStop();
      logDebug("JShell stop completed before compile");
    } catch {
      // Ignore failures while preparing compile.
      logDebug("JShell stop failed before compile");
    }
  }, [logDebug, setJshellReady, setObjectBench]);

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
