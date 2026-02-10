import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AddClassForm } from "../components/wizards/AddClassDialog";
import type { AddFieldForm } from "../components/wizards/AddFieldDialog";
import type { AddConstructorForm } from "../components/wizards/AddConstructorDialog";
import type { AddMethodForm } from "../components/wizards/AddMethodDialog";
import type { FileDraft } from "../models/drafts";
import type { FileNode } from "../models/files";
import type { OpenFile } from "../models/openFile";
import type { UmlNode } from "../models/uml";
import { buildClassSource } from "../services/javaCodegen";
import { basename, joinPath } from "../services/paths";

type UseClassEditActionsArgs = {
  projectPath: string | null;
  selectedNode: UmlNode | null;
  fieldTarget: UmlNode | null;
  constructorTarget: UmlNode | null;
  methodTarget: UmlNode | null;
  fileDrafts: Record<string, FileDraft>;
  openFilePath: string | null;
  openFileByPath: (path: string) => Promise<void>;
  clearPendingReveal: () => void;
  updateDraftForPath: (path: string, content: string, savedOverride?: string) => void;
  notifyLsChangeImmediate: (path: string, text: string) => void;
  notifyLsOpen: (path: string, text: string) => void;
  setTree: Dispatch<SetStateAction<FileNode | null>>;
  setOpenFile: Dispatch<SetStateAction<OpenFile | null>>;
  setContent: Dispatch<SetStateAction<string>>;
  setLastSavedContent: Dispatch<SetStateAction<string>>;
  setCompileStatus: Dispatch<SetStateAction<"success" | "failed" | null>>;
  setBusy: (busy: boolean) => void;
  setStatus: (status: string) => void;
  formatStatus: (input: unknown) => string;
};

type UseClassEditActionsResult = {
  handleCreateClass: (form: AddClassForm) => Promise<void>;
  handleCreateField: (form: AddFieldForm) => Promise<void>;
  handleCreateConstructor: (form: AddConstructorForm) => Promise<void>;
  handleCreateMethod: (form: AddMethodForm) => Promise<void>;
};

export const useClassEditActions = ({
  projectPath,
  selectedNode,
  fieldTarget,
  constructorTarget,
  methodTarget,
  fileDrafts,
  openFilePath,
  openFileByPath,
  clearPendingReveal,
  updateDraftForPath,
  notifyLsChangeImmediate,
  notifyLsOpen,
  setTree,
  setOpenFile,
  setContent,
  setLastSavedContent,
  setCompileStatus,
  setBusy,
  setStatus,
  formatStatus
}: UseClassEditActionsArgs): UseClassEditActionsResult => {
  const applyUpdatedClassDraft = useCallback(
    (path: string, updatedContent: string, savedBaseline: string) => {
      updateDraftForPath(path, updatedContent, savedBaseline);
      if (openFilePath === path) {
        setContent(updatedContent);
        setLastSavedContent(savedBaseline);
        notifyLsChangeImmediate(path, updatedContent);
        return;
      }
      setOpenFile({ name: basename(path), path });
      setContent(updatedContent);
      setLastSavedContent(savedBaseline);
      notifyLsOpen(path, updatedContent);
    },
    [
      notifyLsChangeImmediate,
      notifyLsOpen,
      openFilePath,
      setContent,
      setLastSavedContent,
      setOpenFile,
      updateDraftForPath
    ]
  );

  const handleCreateClass = useCallback(
    async (form: AddClassForm) => {
      if (!projectPath) {
        setStatus("Open a project before creating a class.");
        return;
      }

      const name = form.name.trim().replace(/\.java$/i, "");
      if (!name) {
        setStatus("Class name is required.");
        return;
      }

      const srcRoot = joinPath(projectPath, "src");
      const separator = projectPath.includes("\\") ? "\\" : "/";
      const packageName = form.packageName.trim();
      const packagePath = packageName ? packageName.split(".").join(separator) : "";
      const dirPath = packagePath ? joinPath(srcRoot, packagePath) : srcRoot;
      const filePath = joinPath(dirPath, `${name}.java`);
      const source = buildClassSource(form);

      setBusy(true);
      try {
        try {
          await invoke<string>("read_text_file", { path: filePath });
          setStatus(`Class already exists: ${name}.java`);
          return;
        } catch {
          // File does not exist, continue.
        }

        await invoke("write_text_file", { path: filePath, contents: source });
        const nextTree = await invoke<FileNode>("list_project_tree", { root: projectPath });
        setTree(nextTree);
        setCompileStatus(null);
        clearPendingReveal();
        await openFileByPath(filePath);
        updateDraftForPath(filePath, source, "");
        setContent(source);
        setLastSavedContent("");
        setStatus(`Created ${name}.java`);
      } catch (error) {
        setStatus(`Failed to create class: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      clearPendingReveal,
      formatStatus,
      openFileByPath,
      projectPath,
      setBusy,
      setCompileStatus,
      setContent,
      setLastSavedContent,
      setStatus,
      setTree,
      updateDraftForPath
    ]
  );

  const handleCreateField = useCallback(
    async (form: AddFieldForm) => {
      const target = fieldTarget ?? selectedNode;
      if (!projectPath) {
        setStatus("Open a project before adding a field.");
        return;
      }
      if (!target) {
        setStatus("Select a class before adding a field.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[target.path];
        const originalContent = existingDraft
          ? existingDraft.content
          : await invoke<string>("read_text_file", { path: target.path });
        const savedBaseline = existingDraft?.lastSavedContent ?? originalContent;
        const payload = {
          action: "addField",
          path: target.path,
          classId: target.id,
          content: originalContent,
          field: {
            name: form.name.trim(),
            fieldType: form.type.trim(),
            visibility: form.visibility,
            isStatic: form.isStatic,
            isFinal: form.isFinal,
            initialValue: form.initialValue.trim()
          },
          includeGetter: form.includeGetter,
          includeSetter: form.includeSetter,
          useParamPrefix: form.useParamPrefix,
          includeJavadoc: form.includeJavadoc
        };

        const updated = await invoke<string>("add_field_to_class", { request: payload });
        applyUpdatedClassDraft(target.path, updated, savedBaseline);
        setCompileStatus(null);
        setStatus(`Added field to ${basename(target.path)}`);
      } catch (error) {
        setStatus(`Failed to add field: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      applyUpdatedClassDraft,
      fieldTarget,
      fileDrafts,
      formatStatus,
      projectPath,
      selectedNode,
      setBusy,
      setCompileStatus,
      setStatus
    ]
  );

  const handleCreateConstructor = useCallback(
    async (form: AddConstructorForm) => {
      const target = constructorTarget ?? selectedNode;
      if (!projectPath) {
        setStatus("Open a project before adding a constructor.");
        return;
      }
      if (!target) {
        setStatus("Select a class before adding a constructor.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[target.path];
        const originalContent = existingDraft
          ? existingDraft.content
          : await invoke<string>("read_text_file", { path: target.path });
        const savedBaseline = existingDraft?.lastSavedContent ?? originalContent;
        const payload = {
          action: "addConstructor",
          path: target.path,
          classId: target.id,
          content: originalContent,
          params: form.params.map((param) => ({
            name: param.name.trim(),
            paramType: param.type.trim()
          })),
          includeJavadoc: form.includeJavadoc
        };

        const updated = await invoke<string>("add_constructor_to_class", { request: payload });
        applyUpdatedClassDraft(target.path, updated, savedBaseline);
        setCompileStatus(null);
        setStatus(`Added constructor to ${basename(target.path)}`);
      } catch (error) {
        setStatus(`Failed to add constructor: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      applyUpdatedClassDraft,
      constructorTarget,
      fileDrafts,
      formatStatus,
      projectPath,
      selectedNode,
      setBusy,
      setCompileStatus,
      setStatus
    ]
  );

  const handleCreateMethod = useCallback(
    async (form: AddMethodForm) => {
      const target = methodTarget ?? selectedNode;
      if (!projectPath) {
        setStatus("Open a project before adding a method.");
        return;
      }
      if (!target) {
        setStatus("Select a class before adding a method.");
        return;
      }

      setBusy(true);
      try {
        const existingDraft = fileDrafts[target.path];
        const originalContent = existingDraft
          ? existingDraft.content
          : await invoke<string>("read_text_file", { path: target.path });
        const savedBaseline = existingDraft?.lastSavedContent ?? originalContent;
        const payload = {
          action: "addMethod",
          path: target.path,
          classId: target.id,
          content: originalContent,
          method: {
            name: form.name.trim(),
            returnType: form.returnType.trim(),
            visibility: form.visibility,
            isStatic: form.isStatic,
            isAbstract: form.isAbstract,
            includeJavadoc: form.includeJavadoc
          },
          params: form.params.map((param) => ({
            name: param.name.trim(),
            paramType: param.type.trim()
          }))
        };

        const updated = await invoke<string>("add_method_to_class", { request: payload });
        applyUpdatedClassDraft(target.path, updated, savedBaseline);
        setCompileStatus(null);
        setStatus(`Added method to ${basename(target.path)}`);
      } catch (error) {
        setStatus(`Failed to add method: ${formatStatus(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      applyUpdatedClassDraft,
      fileDrafts,
      formatStatus,
      methodTarget,
      projectPath,
      selectedNode,
      setBusy,
      setCompileStatus,
      setStatus
    ]
  );

  return {
    handleCreateClass,
    handleCreateField,
    handleCreateConstructor,
    handleCreateMethod
  };
};
