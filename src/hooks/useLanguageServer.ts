import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { useMonaco, type Monaco } from "@monaco-editor/react";

import type { LsDiagnosticsEvent } from "../services/lsp";
import { toFileUri } from "../services/lsp";

type LsCrashedEvent = {
  projectRoot: string;
  code?: number | null;
};

type UseLanguageServerArgs = {
  projectPath: string | null;
  openFilePath: string | null;
  openFileContent: string;
};

type UseLanguageServerResult = {
  monacoRef: RefObject<Monaco | null>;
  lsReadyRef: MutableRefObject<boolean>;
  isLsOpen: (path: string) => boolean;
  notifyLsOpen: (path: string, text: string) => void;
  notifyLsClose: (path: string) => void;
  notifyLsChange: (path: string, text: string) => void;
  notifyLsChangeImmediate: (path: string, text: string) => void;
  resetLsState: () => void;
};

const LS_CHANGE_DEBOUNCE_MS = 150;

export const useLanguageServer = ({
  projectPath,
  openFilePath,
  openFileContent
}: UseLanguageServerArgs): UseLanguageServerResult => {
  const monaco = useMonaco();
  const monacoRef = useRef<ReturnType<typeof useMonaco> | null>(null);
  const lsOpenRef = useRef<Set<string>>(new Set());
  const lsVersionRef = useRef<Record<string, number>>({});
  const lsGlyphRef = useRef<Record<string, string[]>>({});
  const lsDiagnosticFingerprintRef = useRef<Record<string, string>>({});
  const lsPendingTextRef = useRef<Record<string, string>>({});
  const lsPendingTimerRef = useRef<Record<string, number>>({});
  const prevOpenFileRef = useRef<string | null>(null);
  const lsReadyRef = useRef(false);

  useEffect(() => {
    if (monaco) {
      monacoRef.current = monaco;
    }
  }, [monaco]);

  const notifyLsOpen = useCallback((path: string, text: string) => {
    if (!lsReadyRef.current) return;
    if (lsOpenRef.current.has(path)) return;
    lsOpenRef.current.add(path);
    lsVersionRef.current[path] = 1;
    void invoke("ls_did_open", {
      uri: toFileUri(path),
      text,
      languageId: "java"
    }).catch(() => undefined);
  }, []);

  const clearPendingLsChange = useCallback((path: string) => {
    const timer = lsPendingTimerRef.current[path];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete lsPendingTimerRef.current[path];
    }
    delete lsPendingTextRef.current[path];
  }, []);

  const clearAllPendingLsChanges = useCallback(() => {
    Object.values(lsPendingTimerRef.current).forEach((timer) => {
      window.clearTimeout(timer);
    });
    lsPendingTimerRef.current = {};
    lsPendingTextRef.current = {};
  }, []);

  const sendLsDidChange = useCallback(
    (path: string, text: string) => {
      if (!lsReadyRef.current) return;
      if (!lsOpenRef.current.has(path)) {
        notifyLsOpen(path, text);
        return;
      }
      const nextVersion = (lsVersionRef.current[path] ?? 1) + 1;
      lsVersionRef.current[path] = nextVersion;
      void invoke("ls_did_change", {
        uri: toFileUri(path),
        version: nextVersion,
        text
      }).catch(() => undefined);
    },
    [notifyLsOpen]
  );

  const flushLsChange = useCallback(
    (path: string) => {
      const pendingText = lsPendingTextRef.current[path];
      if (pendingText === undefined) return;
      clearPendingLsChange(path);
      sendLsDidChange(path, pendingText);
    },
    [clearPendingLsChange, sendLsDidChange]
  );

  useEffect(() => {
    return () => {
      clearAllPendingLsChanges();
    };
  }, [clearAllPendingLsChanges]);

  const notifyLsClose = useCallback((path: string) => {
    clearPendingLsChange(path);
    if (!lsReadyRef.current) return;
    if (!lsOpenRef.current.has(path)) return;
    lsOpenRef.current.delete(path);
    delete lsVersionRef.current[path];
    void invoke("ls_did_close", { uri: toFileUri(path) }).catch(() => undefined);
    const monacoInstance = monacoRef.current;
    if (monacoInstance) {
      const uri = toFileUri(path);
      const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
      if (model) {
        monacoInstance.editor.setModelMarkers(model, "jdtls", []);
        const existing = lsGlyphRef.current[uri] ?? [];
        if (existing.length > 0) {
          model.deltaDecorations(existing, []);
        }
      }
      delete lsGlyphRef.current[uri];
      delete lsDiagnosticFingerprintRef.current[uri];
    }
  }, [clearPendingLsChange]);

  const notifyLsChange = useCallback(
    (path: string, text: string) => {
      lsPendingTextRef.current[path] = text;
      const existingTimer = lsPendingTimerRef.current[path];
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      lsPendingTimerRef.current[path] = window.setTimeout(() => {
        flushLsChange(path);
      }, LS_CHANGE_DEBOUNCE_MS);
    },
    [flushLsChange]
  );

  const notifyLsChangeImmediate = useCallback(
    (path: string, text: string) => {
      lsPendingTextRef.current[path] = text;
      flushLsChange(path);
    },
    [flushLsChange]
  );

  const isLsOpen = useCallback((path: string) => lsOpenRef.current.has(path), []);

  const resetLsState = useCallback(() => {
    clearAllPendingLsChanges();
    lsOpenRef.current.clear();
    lsVersionRef.current = {};
    prevOpenFileRef.current = null;
    lsReadyRef.current = false;
    const monacoInstance = monacoRef.current;
    if (monacoInstance) {
      Object.entries(lsGlyphRef.current).forEach(([uri, decorations]) => {
        const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
        if (model) {
          monacoInstance.editor.setModelMarkers(model, "jdtls", []);
          if (decorations.length > 0) {
            model.deltaDecorations(decorations, []);
          }
          delete lsDiagnosticFingerprintRef.current[uri];
        }
      });
    }
    lsGlyphRef.current = {};
    lsDiagnosticFingerprintRef.current = {};
  }, [clearAllPendingLsChanges]);

  useEffect(() => {
    const prev = prevOpenFileRef.current;
    if (prev && prev !== openFilePath) {
      flushLsChange(prev);
      notifyLsClose(prev);
    }
    prevOpenFileRef.current = openFilePath;
  }, [flushLsChange, openFilePath, notifyLsClose]);

  useEffect(() => {
    if (!projectPath) return;
    clearAllPendingLsChanges();
    lsReadyRef.current = false;
    void invoke<string>("ls_start", { projectRoot: projectPath }).catch(() => undefined);
    return () => {
      clearAllPendingLsChanges();
      void invoke("ls_stop").catch(() => undefined);
    };
  }, [clearAllPendingLsChanges, projectPath]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const crashUnlisten = await listen<LsCrashedEvent>("ls_crashed", (event) => {
        if (!active) return;
        lsReadyRef.current = false;
        if (projectPath && event.payload.projectRoot === projectPath) {
          void invoke<string>("ls_start", { projectRoot: projectPath }).catch(() => undefined);
        }
      });
      if (!active) {
        crashUnlisten();
        return;
      }
      unlisten = crashUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [projectPath]);

  useEffect(() => {
    let unlistenReady: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const readyUnlisten = await listen("ls_ready", () => {
        lsReadyRef.current = true;
        if (openFilePath) {
          notifyLsOpen(openFilePath, openFileContent);
        }
      });
      if (!active) {
        readyUnlisten();
        return;
      }
      unlistenReady = readyUnlisten;

      const errorUnlisten = await listen("ls_error", () => {
        lsReadyRef.current = false;
      });
      if (!active) {
        errorUnlisten();
        return;
      }
      unlistenError = errorUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenReady) unlistenReady();
      if (unlistenError) unlistenError();
    };
  }, [notifyLsOpen, openFileContent, openFilePath]);

  useEffect(() => {
    let unlistenDiagnostics: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const diagnosticsUnlisten = await listen<LsDiagnosticsEvent>(
        "ls_diagnostics",
        (event) => {
          const monacoInstance = monacoRef.current;
          if (!monacoInstance) return;
          const uri = event.payload.uri;
          const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
          if (!model) return;
          const diagnostics = event.payload.diagnostics ?? [];
          const markers = diagnostics
            .filter((diag) => diag.severity === 1)
            .map((diag) => ({
            startLineNumber: diag.range.start.line + 1,
            startColumn: diag.range.start.character + 1,
            endLineNumber: diag.range.end.line + 1,
            endColumn: diag.range.end.character + 1,
            message: diag.message,
            severity: monacoInstance.MarkerSeverity.Error,
            source: diag.source ?? "jdtls"
          }));
          const fingerprint = [...markers]
            .sort((a, b) => {
              if (a.startLineNumber !== b.startLineNumber) {
                return a.startLineNumber - b.startLineNumber;
              }
              if (a.startColumn !== b.startColumn) {
                return a.startColumn - b.startColumn;
              }
              if (a.endLineNumber !== b.endLineNumber) {
                return a.endLineNumber - b.endLineNumber;
              }
              if (a.endColumn !== b.endColumn) {
                return a.endColumn - b.endColumn;
              }
              return a.message.localeCompare(b.message);
            })
            .map((marker) =>
              `${marker.startLineNumber}:${marker.startColumn}-${marker.endLineNumber}:${marker.endColumn}|${marker.source}|${marker.message}`
            )
            .join("\n");
          const previousFingerprint = lsDiagnosticFingerprintRef.current[uri];
          if (previousFingerprint === fingerprint) {
            return;
          }
          lsDiagnosticFingerprintRef.current[uri] = fingerprint;
          monacoInstance.editor.setModelMarkers(model, "jdtls", markers);
          const existing = lsGlyphRef.current[uri] ?? [];
          const glyphDecorations = markers.map((marker) => ({
            range: new monacoInstance.Range(
              marker.startLineNumber,
              1,
              marker.startLineNumber,
              1
            ),
            options: {
              isWholeLine: true,
              glyphMarginClassName: "codicon codicon-error",
              glyphMarginHoverMessage: { value: marker.message }
            }
          }));
          const next = model.deltaDecorations(existing, glyphDecorations);
          lsGlyphRef.current[uri] = next;
        }
      );
      if (!active) {
        diagnosticsUnlisten();
        return;
      }
      unlistenDiagnostics = diagnosticsUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenDiagnostics) unlistenDiagnostics();
    };
  }, []);

  return {
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsClose,
    notifyLsChange,
    notifyLsChangeImmediate,
    resetLsState
  };
};
