import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { ObjectInstance } from "../models/objectBench";
import type { UmlGraph } from "../models/uml";
import { jshellStart, jshellStop } from "../services/jshell";
import { getUmlSignature } from "../services/umlGraph";

type UseCompileJshellLifecycleArgs = {
  projectPath: string | null;
  umlGraph: UmlGraph | null;
  compileStatus: "success" | "failed" | null;
  requestPackedArchiveSync: () => void;
  setStatus: (status: string) => void;
  setJshellReady: Dispatch<SetStateAction<boolean>>;
  setObjectBench: Dispatch<SetStateAction<ObjectInstance[]>>;
  formatStatus: (input: unknown) => string;
  trimStatus: (input: string, max?: number) => string;
};

type UseCompileJshellLifecycleResult = {
  lastCompileOutDirRef: MutableRefObject<string | null>;
  handleCompileSuccess: (outDir: string) => Promise<void>;
  onCompileRequested: () => void;
};

export const useCompileJshellLifecycle = ({
  projectPath,
  umlGraph,
  compileStatus,
  requestPackedArchiveSync,
  setStatus,
  setJshellReady,
  setObjectBench,
  formatStatus,
  trimStatus
}: UseCompileJshellLifecycleArgs): UseCompileJshellLifecycleResult => {
  const umlSignatureRef = useRef<string>("");
  const lastCompileOutDirRef = useRef<string | null>(null);
  const lastCompileStatusRef = useRef<"success" | "failed" | null>(null);

  useEffect(() => {
    if (!projectPath) {
      setObjectBench([]);
      setJshellReady(false);
      void jshellStop();
      return;
    }
    return () => {
      void jshellStop();
      setObjectBench([]);
      setJshellReady(false);
    };
  }, [projectPath, setJshellReady, setObjectBench]);

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
      requestPackedArchiveSync();
      try {
        await jshellStop();
      } catch {
        // Ignore failures when restarting JShell.
      }
      try {
        await jshellStart(projectPath, outDir);
        setJshellReady(true);
        setObjectBench([]);
      } catch (error) {
        setJshellReady(false);
        setStatus(`JShell failed to start: ${trimStatus(formatStatus(error))}`);
      }
    },
    [
      formatStatus,
      projectPath,
      requestPackedArchiveSync,
      setJshellReady,
      setObjectBench,
      setStatus,
      trimStatus
    ]
  );

  const onCompileRequested = useCallback(() => {
    setObjectBench([]);
  }, [setObjectBench]);

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
    onCompileRequested
  };
};
