import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import type { ExportControls, ZoomControls } from "../components/diagram/UmlDiagram";
import type { StructogramExportControls } from "../components/structogram/StructogramView";
import type { PendingRevealRequest } from "./useDiagramInteractions";

type UseWorkspaceUiControllersArgs = {
  openFilePath: string | null;
  monacoRef: MutableRefObject<unknown>;
};

type UseWorkspaceUiControllersResult = {
  editorRef: MutableRefObject<MonacoEditorType.IStandaloneCodeEditor | null>;
  pendingRevealRef: MutableRefObject<PendingRevealRequest | null>;
  applyPendingReveal: () => void;
  clearPendingReveal: () => void;
  zoomControlsRef: MutableRefObject<ZoomControls | null>;
  exportControlsRef: MutableRefObject<ExportControls | null>;
  structogramExportControlsRef: MutableRefObject<StructogramExportControls | null>;
  hasDiagramExportControls: boolean;
  hasStructogramExportControls: boolean;
  handleRegisterZoom: (controls: ZoomControls | null) => void;
  handleRegisterExport: (controls: ExportControls | null) => void;
  handleRegisterStructogramExport: (controls: StructogramExportControls | null) => void;
};

export const useWorkspaceUiControllers = ({
  openFilePath,
  monacoRef
}: UseWorkspaceUiControllersArgs): UseWorkspaceUiControllersResult => {
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const pendingRevealRef = useRef<PendingRevealRequest | null>(null);
  const zoomControlsRef = useRef<ZoomControls | null>(null);
  const exportControlsRef = useRef<ExportControls | null>(null);
  const structogramExportControlsRef = useRef<StructogramExportControls | null>(null);
  const [hasDiagramExportControls, setHasDiagramExportControls] = useState(false);
  const [hasStructogramExportControls, setHasStructogramExportControls] = useState(false);

  const applyPendingReveal = useCallback(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    const expiresAtMs = pending.requestedAtMs + pending.durationSeconds * 1000;
    if (Date.now() > expiresAtMs) {
      pendingRevealRef.current = null;
      return;
    }
    const editor = editorRef.current;
    if (!editor || !monacoRef.current) return;
    const model = editor.getModel();
    if (!model) return;
    const modelPath = model.uri?.fsPath ?? "";
    if (modelPath && modelPath.toLowerCase() !== pending.path.toLowerCase()) return;
    const maxLine = model.getLineCount();
    const line = Math.min(Math.max(pending.line, 1), maxLine);
    const maxColumn = model.getLineMaxColumn(line);
    const column = Math.min(Math.max(pending.column, 1), maxColumn);
    editor.setPosition({ lineNumber: line, column });
    editor.revealPositionInCenter({ lineNumber: line, column });
    editor.focus();
    pendingRevealRef.current = null;
  }, [monacoRef]);

  const clearPendingReveal = useCallback(() => {
    pendingRevealRef.current = null;
  }, []);

  const handleRegisterZoom = useCallback((controls: ZoomControls | null) => {
    zoomControlsRef.current = controls;
  }, []);

  const handleRegisterExport = useCallback((controls: ExportControls | null) => {
    exportControlsRef.current = controls;
    setHasDiagramExportControls(Boolean(controls));
  }, []);

  const handleRegisterStructogramExport = useCallback(
    (controls: StructogramExportControls | null) => {
      structogramExportControlsRef.current = controls;
      setHasStructogramExportControls(Boolean(controls));
    },
    []
  );

  useEffect(() => {
    if (!openFilePath) {
      editorRef.current = null;
    }
  }, [openFilePath]);

  return {
    editorRef,
    pendingRevealRef,
    applyPendingReveal,
    clearPendingReveal,
    zoomControlsRef,
    exportControlsRef,
    structogramExportControlsRef,
    hasDiagramExportControls,
    hasStructogramExportControls,
    handleRegisterZoom,
    handleRegisterExport,
    handleRegisterStructogramExport
  };
};
