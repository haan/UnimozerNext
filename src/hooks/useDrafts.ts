import { useCallback, useMemo, useRef, useState } from "react";
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
  openFilePathRef: MutableRefObject<string | null>;
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
  openFilePathRef,
  isLsOpen,
  syncLsDocument,
  notifyLsChangeImmediate,
  notifyLsClose,
  resolveInternalFileUri,
  getInternalFileUri,
  setStatus
}: UseDraftsArgs): UseDraftsResult => {
  const [fileDrafts, setFileDrafts] = useState<Record<string, FileDraft>>({});
  const formatInProgressRef = useRef(false);

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
    async (
      entries: { path: string; content: string }[]
    ): Promise<{ formatted: Record<string, string>; successCount: number }> => {
      const formatted: Record<string, string> = {};
      let successCount = 0;
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
          // Only use the Monaco model for the active file — inactive cached models
          // may be stale relative to fileDrafts and would corrupt the draft.
          // Use the ref so a file switch mid-format doesn't select a stale model.
          const model =
            path === openFilePathRef.current && monacoInstance
              ? monacoInstance.editor.getModel(monacoInstance.Uri.parse(getInternalFileUri(path)))
              : null;
          // Snapshot version before the async roundtrip so we can detect user
          // edits that arrived while waiting for the LSP response.
          const versionBefore = model?.getVersionId();
          // Guard against edits made between the bulk sync loop and this
          // per-file snapshot: if the model already diverged from the draft
          // we synced, the LSP will format stale content — skip it.
          if (model && model.getValue() !== draftContent) {
            continue;
          }

          try {
            const edits = await invokeValidated<LspTextEdit[]>(
              "ls_format_document",
              lspTextEditArraySchema,
              "ls_format_document response",
              { uri, tabSize: settingsEditor.tabSize, insertSpaces: settingsEditor.insertSpaces }
            );
            successCount++;
            if (edits && edits.length > 0) {
              if (model && monacoInstance) {
                if (model.getVersionId() !== versionBefore) {
                  // Content changed during the LSP roundtrip; skip to avoid
                  // applying stale edits to the user's latest typing.
                  continue;
                }
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
                const next = model.getValue();
                // Re-check the ref: a file switch after the version snapshot
                // but before here means this file is no longer active.
                if (openFilePathRef.current === path) {
                  setContent(next);
                }
                formatted[path] = next;
              } else {
                const next = applyTextEdits(draftContent, edits);
                formatted[path] = next;
                notifyLsChangeImmediate(path, next);
              }
            }
          } catch {
            // Formatting failed; keep original content.
          }
        }
      } finally {
        for (const path of tempOpened) {
          // Don't close a file the user opened during formatting — closing it
          // would clear LS state/markers for the now-active document.
          if (path !== openFilePathRef.current) {
            notifyLsClose(path);
          }
        }
      }

      return { formatted, successCount };
    },
    [
      isLsOpen,
      monacoRef,
      notifyLsChangeImmediate,
      notifyLsClose,
      syncLsDocument,
      setContent,
      settingsEditor,
      getInternalFileUri,
      openFilePathRef,
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

      const shouldFormat = lsReadyRef.current && settingsEditor.autoFormatOnSave;
      const formatted: Record<string, string> = shouldFormat
        ? (await applyLspFormats(entries)).formatted
        : {};

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
    if (!lsReadyRef.current || formatInProgressRef.current) return;
    formatInProgressRef.current = true;
    try {
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

      const { formatted, successCount } = await applyLspFormats(entries);
      const formattedCount = Object.keys(formatted).length;

      for (const entry of entries) {
        const next = formatted[entry.path];
        if (next !== undefined) {
          updateDraftForPath(entry.path, next, entry.savedBaseline);
        }
      }

      if (formattedCount > 0) {
        setStatus(formattedCount === 1 ? "Formatted 1 file." : `Formatted ${formattedCount} files.`);
      } else if (successCount > 0) {
        setStatus("Already formatted.");
      }
    } finally {
      formatInProgressRef.current = false;
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
