import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { CreateObjectForm } from "../components/wizards/CreateObjectDialog";
import type { CallMethodForm } from "../components/wizards/CallMethodDialog";
import type { ObjectInstance } from "../models/objectBench";
import type { UmlConstructor, UmlMethod, UmlNode } from "../models/uml";

type CreateObjectWithJshell = (args: {
  form: CreateObjectForm;
  target: UmlNode;
  constructor: UmlConstructor;
}) => Promise<void>;

type ExecuteMethodCall = (args: {
  target: ObjectInstance;
  method: UmlMethod;
  paramValues: string[];
  onReturn?: (label: string, value: string | null) => void;
}) => Promise<void>;

type UseObjectBenchActionsArgs = {
  compileStatus: "success" | "failed" | null;
  createObjectTarget: UmlNode | null;
  createObjectConstructor: UmlConstructor | null;
  callMethodTarget: ObjectInstance | null;
  callMethodInfo: UmlMethod | null;
  createObjectWithJshell: CreateObjectWithJshell;
  executeMethodCall: ExecuteMethodCall;
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
  openCreateObjectDialog: (node: UmlNode, constructor: UmlConstructor) => void;
  openCallMethodDialog: (object: ObjectInstance, method: UmlMethod) => void;
  openMethodReturnDialog: (label: string, value: string | null) => void;
  setObjectBench: Dispatch<SetStateAction<ObjectInstance[]>>;
  setStatus: (status: string) => void;
};

type UseObjectBenchActionsResult = {
  handleOpenCreateObject: (node: UmlNode, constructor: UmlConstructor) => void;
  handleOpenCallMethod: (object: ObjectInstance, method: UmlMethod) => void;
  handleCreateObject: (form: CreateObjectForm) => Promise<void>;
  handleCallMethod: (form: CallMethodForm) => Promise<void>;
  handleRemoveObject: (object: ObjectInstance) => void;
};

export const useObjectBenchActions = ({
  compileStatus,
  createObjectTarget,
  createObjectConstructor,
  callMethodTarget,
  callMethodInfo,
  createObjectWithJshell,
  executeMethodCall,
  setSelectedClassId,
  openCreateObjectDialog,
  openCallMethodDialog,
  openMethodReturnDialog,
  setObjectBench,
  setStatus
}: UseObjectBenchActionsArgs): UseObjectBenchActionsResult => {
  const handleOpenCreateObject = useCallback(
    (node: UmlNode, constructor: UmlConstructor) => {
      if (compileStatus !== "success") {
        setStatus("Compile the project before creating objects.");
        return;
      }
      setSelectedClassId(node.id);
      openCreateObjectDialog(node, constructor);
    },
    [compileStatus, openCreateObjectDialog, setSelectedClassId, setStatus]
  );

  const handleOpenCallMethod = useCallback(
    (object: ObjectInstance, method: UmlMethod) => {
      if (compileStatus !== "success") {
        setStatus("Compile the project before calling methods.");
        return;
      }
      const params = method.params ?? [];
      if (params.length === 0) {
        void executeMethodCall({
          target: object,
          method,
          paramValues: [],
          onReturn: openMethodReturnDialog
        });
        return;
      }
      openCallMethodDialog(object, method);
    },
    [
      compileStatus,
      executeMethodCall,
      openCallMethodDialog,
      openMethodReturnDialog,
      setStatus
    ]
  );

  const handleCreateObject = useCallback(
    async (form: CreateObjectForm) => {
      const target = createObjectTarget;
      const constructor = createObjectConstructor;
      if (!target || !constructor) {
        setStatus("Select a constructor before creating an object.");
        return;
      }
      await createObjectWithJshell({ form, target, constructor });
    },
    [createObjectConstructor, createObjectTarget, createObjectWithJshell, setStatus]
  );

  const handleCallMethod = useCallback(
    async (form: CallMethodForm) => {
      const target = callMethodTarget;
      const method = callMethodInfo;
      if (!target || !method) {
        setStatus("Select a method before calling it.");
        return;
      }
      await executeMethodCall({
        target,
        method,
        paramValues: form.paramValues,
        onReturn: openMethodReturnDialog
      });
    },
    [callMethodInfo, callMethodTarget, executeMethodCall, openMethodReturnDialog, setStatus]
  );

  const handleRemoveObject = useCallback(
    (object: ObjectInstance) => {
      setObjectBench((prev) => prev.filter((item) => item.name !== object.name));
      setStatus(`Removed ${object.name}.`);
    },
    [setObjectBench, setStatus]
  );

  return {
    handleOpenCreateObject,
    handleOpenCallMethod,
    handleCreateObject,
    handleCallMethod,
    handleRemoveObject
  };
};
