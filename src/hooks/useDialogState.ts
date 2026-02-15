import { useCallback, useState } from "react";

import type { ObjectInstance } from "../models/objectBench";
import type { UmlConstructor, UmlMethod, UmlNode } from "../models/uml";

export const useDialogState = () => {
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addConstructorOpen, setAddConstructorOpen] = useState(false);
  const [addMethodOpen, setAddMethodOpen] = useState(false);

  const [fieldTarget, setFieldTarget] = useState<UmlNode | null>(null);
  const [constructorTarget, setConstructorTarget] = useState<UmlNode | null>(null);
  const [methodTarget, setMethodTarget] = useState<UmlNode | null>(null);

  const [createObjectOpen, setCreateObjectOpen] = useState(false);
  const [createObjectTarget, setCreateObjectTarget] = useState<UmlNode | null>(null);
  const [createObjectConstructor, setCreateObjectConstructor] = useState<UmlConstructor | null>(
    null
  );

  const [callMethodOpen, setCallMethodOpen] = useState(false);
  const [callMethodTarget, setCallMethodTarget] = useState<ObjectInstance | null>(null);
  const [callMethodInfo, setCallMethodInfo] = useState<UmlMethod | null>(null);

  const [methodReturnOpen, setMethodReturnOpen] = useState(false);
  const [methodReturnValue, setMethodReturnValue] = useState<string | null>(null);
  const [methodReturnLabel, setMethodReturnLabel] = useState("");

  const [removeClassOpen, setRemoveClassOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UmlNode | null>(null);
  const [missingRecentProjectOpen, setMissingRecentProjectOpen] = useState(false);
  const [missingRecentProjectPath, setMissingRecentProjectPath] = useState<string | null>(null);

  const openAddClassDialog = useCallback(() => {
    setAddClassOpen(true);
  }, []);

  const openAddFieldDialog = useCallback((node: UmlNode) => {
    setFieldTarget(node);
    setAddFieldOpen(true);
  }, []);

  const openAddConstructorDialog = useCallback((node: UmlNode) => {
    setConstructorTarget(node);
    setAddConstructorOpen(true);
  }, []);

  const openAddMethodDialog = useCallback((node: UmlNode) => {
    setMethodTarget(node);
    setAddMethodOpen(true);
  }, []);

  const handleAddFieldOpenChange = useCallback((open: boolean) => {
    setAddFieldOpen(open);
    if (!open) {
      setFieldTarget(null);
    }
  }, []);

  const handleAddConstructorOpenChange = useCallback((open: boolean) => {
    setAddConstructorOpen(open);
    if (!open) {
      setConstructorTarget(null);
    }
  }, []);

  const handleAddMethodOpenChange = useCallback((open: boolean) => {
    setAddMethodOpen(open);
    if (!open) {
      setMethodTarget(null);
    }
  }, []);

  const openCreateObjectDialog = useCallback((node: UmlNode, constructor: UmlConstructor) => {
    setCreateObjectTarget(node);
    setCreateObjectConstructor(constructor);
    setCreateObjectOpen(true);
  }, []);

  const handleCreateObjectOpenChange = useCallback((open: boolean) => {
    setCreateObjectOpen(open);
    if (!open) {
      setCreateObjectTarget(null);
      setCreateObjectConstructor(null);
    }
  }, []);

  const openCallMethodDialog = useCallback((object: ObjectInstance, method: UmlMethod) => {
    setCallMethodTarget(object);
    setCallMethodInfo(method);
    setCallMethodOpen(true);
  }, []);

  const handleCallMethodOpenChange = useCallback((open: boolean) => {
    setCallMethodOpen(open);
    if (!open) {
      setCallMethodTarget(null);
      setCallMethodInfo(null);
    }
  }, []);

  const openMethodReturnDialog = useCallback((label: string, value: string | null) => {
    setMethodReturnLabel(label);
    setMethodReturnValue(value);
    setMethodReturnOpen(true);
  }, []);

  const handleMethodReturnOpenChange = useCallback((open: boolean) => {
    setMethodReturnOpen(open);
    if (!open) {
      setMethodReturnValue(null);
      setMethodReturnLabel("");
    }
  }, []);

  const requestRemoveClass = useCallback((node: UmlNode) => {
    setRemoveTarget(node);
    setRemoveClassOpen(true);
  }, []);

  const handleRemoveClassOpenChange = useCallback((open: boolean) => {
    setRemoveClassOpen(open);
    if (!open) {
      setRemoveTarget(null);
    }
  }, []);

  const closeRemoveClassDialog = useCallback(() => {
    setRemoveClassOpen(false);
    setRemoveTarget(null);
  }, []);

  const openMissingRecentProjectDialog = useCallback((path: string) => {
    setMissingRecentProjectPath(path);
    setMissingRecentProjectOpen(true);
  }, []);

  const handleMissingRecentProjectOpenChange = useCallback((open: boolean) => {
    setMissingRecentProjectOpen(open);
    if (!open) {
      setMissingRecentProjectPath(null);
    }
  }, []);

  return {
    addClassOpen,
    setAddClassOpen,
    addFieldOpen,
    addConstructorOpen,
    addMethodOpen,
    createObjectOpen,
    createObjectTarget,
    createObjectConstructor,
    callMethodOpen,
    callMethodTarget,
    callMethodInfo,
    methodReturnOpen,
    methodReturnValue,
    methodReturnLabel,
    removeClassOpen,
    removeTarget,
    missingRecentProjectOpen,
    missingRecentProjectPath,
    fieldTarget,
    constructorTarget,
    methodTarget,
    openAddClassDialog,
    openAddFieldDialog,
    openAddConstructorDialog,
    openAddMethodDialog,
    handleAddFieldOpenChange,
    handleAddConstructorOpenChange,
    handleAddMethodOpenChange,
    openCreateObjectDialog,
    handleCreateObjectOpenChange,
    openCallMethodDialog,
    handleCallMethodOpenChange,
    openMethodReturnDialog,
    handleMethodReturnOpenChange,
    requestRemoveClass,
    handleRemoveClassOpenChange,
    closeRemoveClassDialog,
    openMissingRecentProjectDialog,
    handleMissingRecentProjectOpenChange
  };
};

