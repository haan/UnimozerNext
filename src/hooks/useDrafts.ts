import { useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { MutableRefObject } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "../models/settings";
import type { FileDraft } from "../models/drafts";
import type { UmlGraph } from "../models/uml";
import type { LspTextEdit } from "../services/lsp";
import { applyTextEdits, sortTextEditsDescending } from "../services/lsp";
import {
  invokeValidated,
  lspTextEditArraySchema,
  stringSchema,
  voidResponseSchema
} from "../services/tauriValidation";
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
  syncLsDocument: (path: string, text: string) => Promise<void>;
  notifyLsChangeImmediate: (path: string, text: string) => void;
  notifyLsClose: (path: string) => void;
  resolveInternalFileUri: (path: string) => Promise<string>;
  getInternalFileUri: (path: string) => string;
  setStatus: (status: string) => void;
};

type UseDraftsResult = {
  fileDrafts: Record<string, FileDraft>;
  setFileDrafts: Dispatch<SetStateAction<Record<string, FileDraft>>>;
  updateDraftForPath: (path: string, nextContent: string, savedOverride?: string) => void;
  formatAndSaveUmlFiles: (setStatusMessage: boolean) => Promise<number>;
  formatUmlFiles: () => Promise<void>;
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
  syncLsDocument,
  notifyLsChangeImmediate,
  notifyLsClose,
  resolveInternalFileUri,
  getInternalFileUri,
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

  const applyLspFormats = useCallback(
    async (entries: { path: string; content: string }[]): Promise<Record<string, string>> => {
      const formatted: Record<string, string> = {};
      const tempOpened: string[] = [];
      const monacoInstance = monacoRef.current;

      for (const entry of entries) {
        const wasOpen = isLsOpen(entry.path);
        await syncLsDocument(entry.path, entry.content);
        if (!wasOpen) {
          tempOpened.push(entry.path);
        }
      }

      try {
        for (const entry of entries) {
          const { path, content: draftContent } = entry;
          const uri = await resolveInternalFileUri(path);
          const model = monacoInstance
            ? monacoInstance.editor.getModel(monacoInstance.Uri.parse(getInternalFileUri(path)))
            : null;

          try {
            const edits = await invokeValidated<LspTextEdit[]>(
              "ls_format_document",
              lspTextEditArraySchema,
              "ls_format_document response",
              { uri, tabSize: settingsEditor.tabSize, insertSpaces: settingsEditor.insertSpaces }
            );
            if (edits && edits.length > 0) {
              let next = draftContent;
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
              if (openFilePath !== path || !model) {
                notifyLsChangeImmediate(path, next);
              }
            }
          } catch {
            // Formatting failed; keep original content.
          }
        }
      } finally {
        for (const path of tempOpened) {
          notifyLsClose(path);
        }
      }

      return formatted;
    },
    [
      isLsOpen,
      monacoRef,
      notifyLsChangeImmediate,
      notifyLsClose,
      syncLsDocument,
      openFilePath,
      setContent,
      settingsEditor,
      getInternalFileUri,
      resolveInternalFileUri
    ]
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
          const text = await invokeValidated(
            "read_text_file",
            stringSchema,
            "read_text_file response",
            { path }
          );
          entries.push({ path, content: text, hasDraft: false });
        } catch {
          // Skip files we cannot read.
        }
      }
      if (entries.length === 0) return 0;

      const formatted: Record<string, string> =
        lsReadyRef.current && settingsEditor.autoFormatOnSave
          ? await applyLspFormats(entries)
          : {};

      if (lsReadyRef.current && settingsEditor.autoFormatOnSave) {
        for (const entry of entries) {
          if (entry.hasDraft && formatted[entry.path]) {
            updateDraftForPath(entry.path, formatted[entry.path]);
          }
        }
      }

      for (const entry of entries) {
        const path = entry.path;
        const contents = formatted[path] ?? entry.content;
        await invokeValidated("write_text_file", voidResponseSchema, "write_text_file response", {
          path,
          contents
        });
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
      applyLspFormats,
      fileDrafts,
      lsReadyRef,
      openFilePath,
      setContent,
      setLastSavedContent,
      setStatus,
      settingsEditor,
      umlGraph,
      updateDraftForPath
    ]
  );

  const formatUmlFiles = useCallback(async () => {
    if (!lsReadyRef.current) return;
    const umlNodePaths = umlGraph?.nodes?.length ? umlGraph.nodes.map((node) => node.path) : [];
    const targetPaths =
      umlNodePaths.length > 0
        ? Array.from(new Set([...umlNodePaths, ...Object.keys(fileDrafts)]))
        : Object.keys(fileDrafts);
    if (targetPaths.length === 0) return;

    const entries: { path: string; content: string; savedBaseline?: string }[] = [];
    for (const path of targetPaths) {
      const draft = fileDrafts[path];
      if (draft) {
        entries.push({ path, content: draft.content });
        continue;
      }
      try {
        const text = await invokeValidated("read_text_file", stringSchema, "read_text_file response", { path });
        // savedBaseline preserves the unformatted disk content so the draft is
        // marked dirty after formatting (format without save must not silently
        // discard the change indicator for files not yet in the draft map).
        entries.push({ path, content: text, savedBaseline: text });
      } catch {
        // Skip files we cannot read.
      }
    }
    if (entries.length === 0) return;

    const formatted = await applyLspFormats(entries);
    const formattedCount = Object.keys(formatted).length;

    for (const entry of entries) {
      const next = formatted[entry.path];
      if (next !== undefined) {
        updateDraftForPath(entry.path, next, entry.savedBaseline);
      }
    }

    if (formattedCount > 0) {
      setStatus(formattedCount === 1 ? "Formatted 1 file." : `Formatted ${formattedCount} files.`);
    } else {
      setStatus("Already formatted.");
    }
  }, [applyLspFormats, fileDrafts, lsReadyRef, setStatus, umlGraph, updateDraftForPath]);

  return {
    fileDrafts,
    setFileDrafts,
    updateDraftForPath,
    formatAndSaveUmlFiles,
    formatUmlFiles,
    hasUnsavedChanges
  };
};
