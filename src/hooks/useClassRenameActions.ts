import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Monaco } from "@monaco-editor/react";

import type { RenameClassForm } from "../components/wizards/RenameClassDialog";
import type { DiagramState } from "../models/diagram";
import type { FileDraft } from "../models/drafts";
import type { FileNode } from "../models/files";
import type { OpenFile } from "../models/openFile";
import type { UmlNode } from "../models/uml";
import { isValidJavaIdentifier } from "../services/java";
import { basename, joinPath } from "../services/paths";
import {
  fileNodeSchema,
  invokeValidated,
  renameClassResponseSchema,
  voidResponseSchema
} from "../services/tauriValidation";

type UseClassRenameActionsArgs = {
  projectPath: string | null;
  openFilePath: string | null;
  renameTarget: UmlNode | null;
  diagramPath: string | null;
  diagramState: DiagramState | null;
  requestPackedArchiveSync: () => void;
  monacoRef: RefObject<Monaco | null>;
  getInternalFileUri: (path: string) => string;
  notifyLsClose: (path: string) => void;
  notifyLsOpen: (path: string, text: string) => void;
  fileDrafts: Record<string, FileDraft>;
  setDiagramState: Dispatch<SetStateAction<DiagramState | null>>;
  setTree: Dispatch<SetStateAction<FileNode | null>>;
  setOpenFile: Dispatch<SetStateAction<OpenFile | null>>;
  setContent: Dispatch<SetStateAction<string>>;
  setLastSavedContent: Dispatch<SetStateAction<string>>;
  setFileDrafts: Dispatch<SetStateAction<Record<string, FileDraft>>>;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  openRenameClassErrorDialog: (message: string) => void;
  formatStatus: (input: unknown) => string;
};

type UseClassRenameActionsResult = {
  handleRenameClass: (form: RenameClassForm) => Promise<void>;
};

export const deriveRenamedClassId = (classId: string, oldName: string, newName: string): string | null => {
  if (classId === oldName) {
    return newName;
  }
  if (classId.endsWith(`.${oldName}`)) {
    return `${classId.slice(0, classId.length - oldName.length)}${newName}`;
  }
  return null;
};

export const useClassRenameActions = ({
  projectPath,
  openFilePath,
  renameTarget,
  diagramPath,
  diagramState,
  requestPackedArchiveSync,
  monacoRef,
  getInternalFileUri,
  notifyLsClose,
  notifyLsOpen,
  fileDrafts,
  setDiagramState,
  setTree,
  setOpenFile,
  setContent,
  setLastSavedContent,
  setFileDrafts,
  setCompileStatus,
  setSelectedClassId,
  setBusy,
  setStatus,
  openRenameClassErrorDialog,
  formatStatus
}: UseClassRenameActionsArgs): UseClassRenameActionsResult => {
  const handleRenameClass = useCallback(
    async (form: RenameClassForm) => {
      if (!projectPath) {
        setStatus("Open a project before renaming a class.");
        return;
      }
      if (!renameTarget) {
        setStatus("Select a class before renaming.");
        return;
      }

      const oldName = renameTarget.name.trim();
      const newName = form.name.trim().replace(/\.java$/i, "");
      if (!newName) {
        setStatus("Class name is required.");
        return;
      }
      if (!isValidJavaIdentifier(newName)) {
        setStatus("Class name must be a valid Java identifier.");
        return;
      }
      if (newName === oldName) {
        setStatus("New class name must be different.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[renameTarget.path];
        if (existingDraft && existingDraft.content !== existingDraft.lastSavedContent) {
          await invokeValidated("write_text_file", voidResponseSchema, "write_text_file response", {
            path: renameTarget.path,
            contents: existingDraft.content
          });
        }

        const response = await invokeValidated(
          "rename_class_in_file",
          renameClassResponseSchema,
          "rename_class_in_file response",
          {
            projectRoot: projectPath,
            filePath: renameTarget.path,
            oldClassName: oldName,
            newClassName: newName
          }
        );

        notifyLsClose(response.oldPath);
        const monaco = monacoRef.current;
        if (monaco) {
          const uri = getInternalFileUri(response.oldPath);
          const model = monaco.editor.getModel(monaco.Uri.parse(uri));
          if (model) {
            model.dispose();
          }
        }

        const wasOpen = openFilePath === response.oldPath;
        if (wasOpen) {
          setOpenFile({ name: basename(response.newPath), path: response.newPath });
          setContent(response.content);
          setLastSavedContent(response.content);
          notifyLsOpen(response.newPath, response.content);
        }

        setFileDrafts((prev) => {
          const next = { ...prev };
          const previousDraft = next[response.oldPath];
          delete next[response.oldPath];
          if (wasOpen || previousDraft) {
            next[response.newPath] = {
              content: response.content,
              lastSavedContent: response.content
            };
          }
          return next;
        });

        const nextTree = await invokeValidated(
          "list_project_tree",
          fileNodeSchema,
          "list_project_tree response",
          { root: projectPath }
        );

        const renamedClassId = deriveRenamedClassId(renameTarget.id, oldName, newName);
        let nextDiagramState: DiagramState | null = null;
        if (renamedClassId && renamedClassId !== renameTarget.id) {
          const oldPosition = diagramState?.nodes[renameTarget.id];
          if (diagramState && oldPosition) {
            const nextNodes = { ...diagramState.nodes };
            delete nextNodes[renameTarget.id];
            nextNodes[renamedClassId] = { x: oldPosition.x, y: oldPosition.y };
            nextDiagramState = {
              ...diagramState,
              nodes: nextNodes
            };
            setDiagramState(nextDiagramState);
          }
        }

        if (nextDiagramState) {
          const persistedDiagramPath = diagramPath ?? joinPath(projectPath, "unimozer.json");
          await invokeValidated("write_text_file", voidResponseSchema, "write_text_file response", {
            path: persistedDiagramPath,
            contents: JSON.stringify(nextDiagramState, null, 2)
          });
        }
        setTree(nextTree);

        setSelectedClassId((current) => {
          if (!current || current !== renameTarget.id) {
            return current;
          }
          return deriveRenamedClassId(current, oldName, newName);
        });
        setCompileStatus(null);
        requestPackedArchiveSync();
        setStatus(`Renamed ${oldName}.java to ${newName}.java`);
      } catch (error) {
        const message = formatStatus(error);
        setStatus(`Failed to rename class: ${message}`);
        openRenameClassErrorDialog(message);
      } finally {
        setBusy(false);
      }
    },
    [
      fileDrafts,
      formatStatus,
      getInternalFileUri,
      monacoRef,
      notifyLsClose,
      notifyLsOpen,
      openFilePath,
      openRenameClassErrorDialog,
      diagramPath,
      diagramState,
      projectPath,
      renameTarget,
      requestPackedArchiveSync,
      setBusy,
      setCompileStatus,
      setContent,
      setDiagramState,
      setFileDrafts,
      setLastSavedContent,
      setOpenFile,
      setSelectedClassId,
      setStatus,
      setTree
    ]
  );

  return {
    handleRenameClass
  };
};
