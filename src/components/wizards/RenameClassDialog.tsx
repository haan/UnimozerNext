import { useMemo, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { isValidJavaIdentifier } from "../../services/java";

export type RenameClassForm = {
  name: string;
};

type RenameClassDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  onSubmit: (form: RenameClassForm) => Promise<void> | void;
  busy?: boolean;
};

export const RenameClassDialog = ({
  open,
  onOpenChange,
  className,
  onSubmit,
  busy
}: RenameClassDialogProps) => {
  const [name, setName] = useState(className);
  const [submitting, setSubmitting] = useState(false);
  const reset = () => {
    setName(className);
    setSubmitting(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const normalizedName = useMemo(() => name.trim().replace(/\.java$/i, ""), [name]);
  const isNameValid = normalizedName.length > 0 && isValidJavaIdentifier(normalizedName);
  const hasChanged = normalizedName !== className;
  const disabled = busy || submitting;

  const handleSubmit = async () => {
    if (!isNameValid || !hasChanged) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: normalizedName });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[420px] max-w-[90vw] p-6" aria-describedby={undefined}>
        <DialogTitle className="mb-4 text-base">Rename class</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">New name:</label>
              <input
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive"
                value={name}
                required
                autoFocus
                aria-invalid={normalizedName ? !isNameValid : false}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={disabled}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={disabled || !isNameValid || !hasChanged}>
              Rename
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
