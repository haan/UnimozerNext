import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

import type { FileDraft } from "../models/drafts";

type UseEditorActionsArgs = {
  editorRef: MutableRefObject<MonacoEditorType.IStandaloneCodeEditor | null>;
  compileStatus: "success" | "failed" | null;
  openFilePath: string | null;
  fileDrafts: Record<string, FileDraft>;
  lastSavedContent: string;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  setContent: Dispatch<SetStateAction<string>>;
  updateDraftForPath: (path: string, content: string, savedOverride?: string) => void;
  notifyLsChange: (path: string, text: string) => void;
};

type UseEditorActionsResult = {
  triggerEditorAction: (actionId: string) => void;
  handlePaste: () => Promise<void>;
  handleContentChange: (value: string) => void;
};

export const useEditorActions = ({
  editorRef,
  compileStatus,
  openFilePath,
  fileDrafts,
  lastSavedContent,
  setCompileStatus,
  setContent,
  updateDraftForPath,
  notifyLsChange
}: UseEditorActionsArgs): UseEditorActionsResult => {
  const triggerEditorAction = useCallback((actionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("menu", actionId, null);
  }, [editorRef]);

  const handlePaste = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    let text = "";
    try {
      text = await readText();
    } catch {
      text = "";
    }
    if (text.length > 0) {
      const model = editor.getModel();
      if (!model) return;
      const selections = editor.getSelections() ?? [];
      const edits = (selections.length ? selections : [editor.getSelection()])
        .filter(Boolean)
        .map((selection) => ({
          range: selection!,
          text,
          forceMoveMarkers: true
        }));
      if (edits.length) {
        editor.executeEdits("clipboard", edits);
        return;
      }
    }
    editor.trigger("menu", "editor.action.clipboardPasteAction", null);
  }, [editorRef]);

  const handleContentChange = useCallback((value: string) => {
    if (compileStatus !== null && openFilePath) {
      const baseline = fileDrafts[openFilePath]?.lastSavedContent ?? lastSavedContent;
      if (value !== baseline) {
        setCompileStatus(null);
      }
    }
    setContent(value);
    if (openFilePath) {
      updateDraftForPath(openFilePath, value, lastSavedContent);
      notifyLsChange(openFilePath, value);
    }
  }, [
    compileStatus,
    fileDrafts,
    lastSavedContent,
    notifyLsChange,
    openFilePath,
    setCompileStatus,
    setContent,
    updateDraftForPath
  ]);

  return {
    triggerEditorAction,
    handlePaste,
    handleContentChange
  };
};
