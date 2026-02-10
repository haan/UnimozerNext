import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { UmlNode } from "../models/uml";

type UseClassSelectionActionsArgs = {
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
  openAddFieldDialog: (node: UmlNode) => void;
  openAddConstructorDialog: (node: UmlNode) => void;
  openAddMethodDialog: (node: UmlNode) => void;
};

type UseClassSelectionActionsResult = {
  handleOpenAddField: (node: UmlNode) => void;
  handleOpenAddConstructor: (node: UmlNode) => void;
  handleOpenAddMethod: (node: UmlNode) => void;
};

export const useClassSelectionActions = ({
  setSelectedClassId,
  openAddFieldDialog,
  openAddConstructorDialog,
  openAddMethodDialog
}: UseClassSelectionActionsArgs): UseClassSelectionActionsResult => {
  const handleOpenAddField = useCallback(
    (node: UmlNode) => {
      setSelectedClassId(node.id);
      openAddFieldDialog(node);
    },
    [openAddFieldDialog, setSelectedClassId]
  );

  const handleOpenAddConstructor = useCallback(
    (node: UmlNode) => {
      setSelectedClassId(node.id);
      openAddConstructorDialog(node);
    },
    [openAddConstructorDialog, setSelectedClassId]
  );

  const handleOpenAddMethod = useCallback(
    (node: UmlNode) => {
      setSelectedClassId(node.id);
      openAddMethodDialog(node);
    },
    [openAddMethodDialog, setSelectedClassId]
  );

  return {
    handleOpenAddField,
    handleOpenAddConstructor,
    handleOpenAddMethod
  };
};
