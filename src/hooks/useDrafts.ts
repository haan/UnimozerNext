import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { MutableRefObject } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "../models/settings";
import type { FileDraft } from "../models/drafts";
import type { UmlGraph } from "../models/uml";
import type { LspTextEdit } from "../services/lsp";
import { applyTextEdits, sortTextEditsDescending, toFileUri } from "../services/lsp";
import type { Monaco } from "@monaco-editor/react";

type UseDraftsArgs = {
  umlGraph: UmlGraph | null;
  openFilePath: string | null;
  setContent: (next: string) => void;
  setLastSavedContent: (next: string) => void;
  settingsEditor: AppSettings["editor"];
  monacoRef: RefObject<Monaco | null>;
  lsReadyRef: MutableRefObject<boolean>;
  isLsOpen: (path: string) => boolean;
  notifyLsOpen: (path: string, text: string) => void;
  notifyLsChangeImmediate: (path: string, text: string) => void;
  notifyLsClose: (path: string) => void;
  setStatus: (status: string) => void;
};

type UseDraftsResult = {
  fileDrafts: Record<string, FileDraft>;
  setFileDrafts: Dispatch<SetStateAction<Record<string, FileDraft>>>;
  updateDraftForPath: (path: string, nextContent: string, savedOverride?: string) => void;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  hasUnsavedChanges: boolean;
};

export const useDrafts = ({
  umlGraph,
  openFilePath,
  setContent,
  setLastSavedContent,
  settingsEditor,
  monacoRef,
  lsReadyRef,
  isLsOpen,
  notifyLsOpen,
  notifyLsChangeImmediate,
  notifyLsClose,
  setStatus
}: UseDraftsArgs): UseDraftsResult => {
  const [fileDrafts, setFileDrafts] = useState<Record<string, FileDraft>>({});

  const updateDraftForPath = useCallback(
    (path: string, nextContent: string, savedOverride?: string) => {
      setFileDrafts((prev) => {
        const existing = prev[path];
        const lastSaved = savedOverride ?? existing?.lastSavedContent ?? nextContent;
        if (existing && existing.content === nextContent && existing.lastSavedContent === lastSaved) {
          return prev;
        }
        return {
          ...prev,
          [path]: {
            content: nextContent,
            lastSavedContent: lastSaved
          }
        };
      });
    },
    []
  );

  const hasUnsavedChanges = useMemo(
    () => Object.values(fileDrafts).some((draft) => draft.content !== draft.lastSavedContent),
    [fileDrafts]
  );

  const formatAndSaveUmlFiles = useCallback(
    async (setStatusMessage: boolean) => {
      const dirtyDraftPaths = Object.entries(fileDrafts)
        .filter(([, draft]) => draft.content !== draft.lastSavedContent)
        .map(([path]) => path);
      const umlNodePaths = umlGraph?.nodes?.length
        ? umlGraph.nodes.map((node) => node.path)
        : [];
      const targetPaths =
        umlNodePaths.length > 0
          ? Array.from(new Set([...umlNodePaths, ...dirtyDraftPaths]))
          : Object.keys(fileDrafts);
      if (targetPaths.length === 0) return 0;

      const entries: { path: string; content: string; hasDraft: boolean }[] = [];
      for (const path of targetPaths) {
        const draft = fileDrafts[path];
        if (draft) {
          entries.push({ path, content: draft.content, hasDraft: true });
          continue;
        }
        try {
          const text = await invoke<string>("read_text_file", { path });
          entries.push({ path, content: text, hasDraft: false });
        } catch {
          // Skip files we cannot read.
        }
      }
      if (entries.length === 0) return 0;

      const formatted: Record<string, string> = {};
      const tempOpened: string[] = [];
      const monacoInstance = monacoRef.current;

      if (lsReadyRef.current && settingsEditor.autoFormatOnSave) {
        for (const entry of entries) {
          const path = entry.path;
          const text = entry.content;
          if (!isLsOpen(path)) {
            notifyLsOpen(path, text);
            tempOpened.push(path);
          } else {
            notifyLsChangeImmediate(path, text);
          }
        }

        for (const entry of entries) {
          const path = entry.path;
          const draftContent = entry.content;
          const uri = toFileUri(path);
          const model = monacoInstance
            ? monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri))
            : null;
          const tabSize = settingsEditor.tabSize;
          const insertSpaces = settingsEditor.insertSpaces;

          try {
            const edits = await invoke<LspTextEdit[]>("ls_format_document", {
              uri,
              tabSize,
              insertSpaces
            });
            if (edits && edits.length > 0) {
              let next = draftContent;
              const editedOpenModel = Boolean(model && openFilePath === path);
              if (model && monacoInstance) {
                const monacoEdits = [...edits]
                  .sort(sortTextEditsDescending)
                  .map((edit) => ({
                    range: new monacoInstance.Range(
                      edit.range.start.line + 1,
                      edit.range.start.character + 1,
                      edit.range.end.line + 1,
                      edit.range.end.character + 1
                    ),
                    text: edit.newText
                  }));
                model.pushEditOperations([], monacoEdits, () => null);
                next = model.getValue();
                if (openFilePath === path) {
                  setContent(next);
                }
              } else {
                next = applyTextEdits(draftContent, edits);
              }
              formatted[path] = next;
              if (entry.hasDraft) {
                updateDraftForPath(path, next);
              }
              if (!editedOpenModel) {
                notifyLsChangeImmediate(path, next);
              }
            }
          } catch {
            // Formatting failed; keep original content.
          }
        }

        for (const path of tempOpened) {
          notifyLsClose(path);
        }
      }

      for (const entry of entries) {
        const path = entry.path;
        const contents = formatted[path] ?? entry.content;
        await invoke("write_text_file", { path, contents });
        if (entry.hasDraft) {
          updateDraftForPath(path, contents, contents);
        }
        if (openFilePath === path) {
          setLastSavedContent(contents);
          if (formatted[path]) {
            setContent(contents);
          }
        }
      }

      if (setStatusMessage) {
        setStatus(entries.length === 1 ? "Saved 1 file." : `Saved ${entries.length} files.`);
      }
      return entries.length;
    },
    [
      fileDrafts,
      isLsOpen,
      lsReadyRef,
      monacoRef,
      notifyLsChangeImmediate,
      notifyLsClose,
      notifyLsOpen,
      openFilePath,
      setContent,
      setLastSavedContent,
      setStatus,
      settingsEditor,
      umlGraph,
      updateDraftForPath
    ]
  );

  return {
    fileDrafts,
    setFileDrafts,
    updateDraftForPath,
    formatAndSaveUmlFiles,
    hasUnsavedChanges
  };
};
