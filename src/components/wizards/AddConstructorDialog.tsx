import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { isValidJavaIdentifier } from "../../services/java";
import { ParameterList } from "./ParameterList";
import { type ParameterRow, createParameterRow } from "./parameters";

export type AddConstructorForm = {
  params: ParameterRow[];
  includeJavadoc: boolean;
};

type AddConstructorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: AddConstructorForm) => Promise<void> | void;
  className?: string | null;
  busy?: boolean;
};

export const AddConstructorDialog = ({
  open,
  onOpenChange,
  onSubmit,
  className,
  busy
}: AddConstructorDialogProps) => {
  const [params, setParams] = useState<ParameterRow[]>([]);
  const [includeJavadoc, setIncludeJavadoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setParams([]);
      setIncludeJavadoc(false);
      setSubmitting(false);
    }
  }, [open]);

  const updateParam = (id: string, patch: Partial<ParameterRow>) => {
    setParams((prev) =>
      prev.map((param) => (param.id === id ? { ...param, ...patch } : param))
    );
  };

  const addParam = () => {
    setParams((prev) => [...prev, createParameterRow()]);
  };

  const removeParam = (id: string) => {
    setParams((prev) => prev.filter((param) => param.id !== id));
  };

  const invalidParamIds = useMemo(() => {
    const invalid = new Set<string>();
    params.forEach((param) => {
      const name = param.name.trim();
      const type = param.type.trim();
      if (!name || !type || !isValidJavaIdentifier(name)) {
        invalid.add(param.id);
      }
    });
    return invalid;
  }, [params]);

  const handleSubmit = async () => {
    if (invalidParamIds.size > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ params, includeJavadoc });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = busy || submitting;
  const canSubmit = invalidParamIds.size === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[92vw] p-6">
        <DialogTitle className="mb-4 text-base">
          Add constructor{className ? ` to ${className}` : ""}
        </DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-3 text-sm">
            <ParameterList
              params={params}
              invalidIds={invalidParamIds}
              onAdd={addParam}
              onUpdate={updateParam}
              onRemove={removeParam}
            />
            <fieldset className="rounded-md border border-border px-3 pb-3 pt-2">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Code generation
              </legend>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeJavadoc}
                    onChange={(event) => setIncludeJavadoc(event.target.checked)}
                  />
                  JavaDoc Comments
                </label>
              </div>
            </fieldset>
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
            <Button type="submit" disabled={disabled || !canSubmit}>
              OK
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
