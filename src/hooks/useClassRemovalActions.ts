import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Monaco } from "@monaco-editor/react";

import type { FileNode } from "../models/files";
import type { FileDraft } from "../models/drafts";
import type { OpenFile } from "../models/openFile";
import type { UmlNode } from "../models/uml";
import { basename } from "../services/paths";
import { toFileUri } from "../services/lsp";

type UseClassRemovalActionsArgs = {
  projectPath: string | null;
  openFilePath: string | null;
  selectedClassId: string | null;
  removeTarget: UmlNode | null;
  monacoRef: RefObject<Monaco | null>;
  notifyLsClose: (path: string) => void;
  closeRemoveClassDialog: () => void;
  setTree: Dispatch<SetStateAction<FileNode | null>>;
  setOpenFile: Dispatch<SetStateAction<OpenFile | null>>;
  setContent: Dispatch<SetStateAction<string>>;
  setLastSavedContent: Dispatch<SetStateAction<string>>;
  setFileDrafts: Dispatch<SetStateAction<Record<string, FileDraft>>>;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  formatStatus: (input: unknown) => string;
};

type UseClassRemovalActionsResult = {
  confirmRemoveClass: () => Promise<void>;
};

export const useClassRemovalActions = ({
  projectPath,
  openFilePath,
  selectedClassId,
  removeTarget,
  monacoRef,
  notifyLsClose,
  closeRemoveClassDialog,
  setTree,
  setOpenFile,
  setContent,
  setLastSavedContent,
  setFileDrafts,
  setCompileStatus,
  setSelectedClassId,
  setBusy,
  setStatus,
  formatStatus
}: UseClassRemovalActionsArgs): UseClassRemovalActionsResult => {
  const handleRemoveClass = useCallback(
    async (node: UmlNode) => {
      if (!projectPath) {
        setStatus("Open a project before removing a class.");
        return;
      }

      setBusy(true);
      try {
        const name = basename(node.path);
        await invoke("remove_text_file", { path: node.path });
        notifyLsClose(node.path);
        const monaco = monacoRef.current;
        if (monaco) {
          const uri = toFileUri(node.path);
          const model = monaco.editor.getModel(monaco.Uri.parse(uri));
          if (model) {
            model.dispose();
          }
        }
        const nextTree = await invoke<FileNode>("list_project_tree", { root: projectPath });
        setTree(nextTree);

        if (openFilePath && openFilePath === node.path) {
          setOpenFile(null);
          setContent("");
          setLastSavedContent("");
        }

        setFileDrafts((prev) => {
          const next = { ...prev };
          delete next[node.path];
          return next;
        });

        setCompileStatus(null);
        setStatus(`Removed ${name}`);
        if (selectedClassId === node.id) {
          setSelectedClassId(null);
        }
      } catch (error) {
        setStatus(`Failed to remove class: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      formatStatus,
      monacoRef,
      notifyLsClose,
      openFilePath,
      projectPath,
      selectedClassId,
      setBusy,
      setCompileStatus,
      setContent,
      setFileDrafts,
      setLastSavedContent,
      setOpenFile,
      setSelectedClassId,
      setStatus,
      setTree
    ]
  );

  const confirmRemoveClass = useCallback(async () => {
    if (!removeTarget) return;
    closeRemoveClassDialog();
    await handleRemoveClass(removeTarget);
  }, [closeRemoveClassDialog, handleRemoveClass, removeTarget]);

  return {
    confirmRemoveClass
  };
};
