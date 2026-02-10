import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { isValidJavaIdentifier } from "../../services/java";

export type CreateObjectForm = {
  objectName: string;
  paramValues: string[];
};

type ConstructorParam = {
  name: string;
  type: string;
};

type CreateObjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  constructorLabel: string;
  params: ConstructorParam[];
  existingNames: string[];
  onSubmit: (form: CreateObjectForm) => Promise<void> | void;
  busy?: boolean;
};

export const CreateObjectDialog = ({
  open,
  onOpenChange,
  className,
  constructorLabel,
  params,
  existingNames,
  onSubmit,
  busy
}: CreateObjectDialogProps) => {
  const [objectName, setObjectName] = useState("");
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const lastSuggestedRef = useRef("");

  const suggestObjectName = (name: string, names: string[]) => {
    const baseRaw = name.trim();
    const base =
      baseRaw.length > 0
        ? `${baseRaw[0].toLowerCase()}${baseRaw.slice(1)}`
        : "object";
    const existing = new Set(names.map((item) => item.toLowerCase()));
    for (let index = 0; index < 10_000; index += 1) {
      const candidate = `${base}${index}`;
      if (!existing.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `${base}${Date.now()}`;
  };

  useEffect(() => {
    if (!open) {
      setObjectName("");
      setParamValues([]);
      setSubmitting(false);
      return;
    }
    setParamValues(params.map(() => ""));
    const suggestion = suggestObjectName(className, existingNames);
    if (!objectName.trim() || objectName === lastSuggestedRef.current) {
      setObjectName(suggestion);
    }
    lastSuggestedRef.current = suggestion;
  }, [open, params, className, existingNames, objectName]);

  const updateParam = (index: number, value: string) => {
    setParamValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const trimmedName = objectName.trim();
  const isNameValid = isValidJavaIdentifier(trimmedName);
  const isNameUnique = !existingNames.some(
    (name) => name.toLowerCase() === trimmedName.toLowerCase()
  );
  const hasEmptyParams = params.some((_, index) => (paramValues[index] ?? "").trim().length === 0);
  const canSubmit =
    trimmedName.length > 0 &&
    isNameValid &&
    isNameUnique &&
    !hasEmptyParams &&
    !busy &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ objectName: trimmedName, paramValues });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const constructorDisplay = useMemo(() => {
    if (constructorLabel) return constructorLabel;
    return `${className}()`;
  }, [className, constructorLabel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] p-6">
        <DialogTitle className="mb-4 text-base">Create new object</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[110px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Object name:</label>
              <input
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive"
                value={objectName}
                required
                aria-invalid={trimmedName ? !isNameValid || !isNameUnique : false}
                onChange={(event) => setObjectName(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-[110px_1fr] items-center gap-3">
              <span className="text-sm font-medium">Constructor:</span>
              <span className="text-sm text-muted-foreground">{constructorDisplay}</span>
            </div>

            {params.length > 0 ? (
              <div className="space-y-2 rounded-md border border-border px-3 pb-3 pt-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Constructor parameters
                </div>
                {params.map((param, index) => (
                  <div
                    key={`${param.name}-${index}`}
                    className="grid grid-cols-[140px_1fr] items-center gap-3"
                  >
                    <label className="text-xs font-medium text-muted-foreground">
                      {param.name}: {param.type}
                    </label>
                    <input
                      className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value={paramValues[index] ?? ""}
                      placeholder="Java expression"
                      required
                      onChange={(event) => updateParam(index, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No parameters.</div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy || submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
