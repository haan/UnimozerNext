import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";

export type CallMethodForm = {
  paramValues: string[];
};

type MethodParam = {
  name: string;
  type: string;
};

type CallMethodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectName: string;
  methodLabel: string;
  params: MethodParam[];
  onSubmit: (form: CallMethodForm) => Promise<void> | void;
  busy?: boolean;
};

export const CallMethodDialog = ({
  open,
  onOpenChange,
  objectName,
  methodLabel,
  params,
  onSubmit,
  busy
}: CallMethodDialogProps) => {
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setParamValues([]);
      setSubmitting(false);
      return;
    }
    setParamValues(params.map(() => ""));
  }, [open, params]);

  const updateParam = (index: number, value: string) => {
    setParamValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const hasEmptyParams = params.some((_, index) => (paramValues[index] ?? "").trim().length === 0);

  const handleSubmit = async () => {
    if (busy || submitting || hasEmptyParams) return;
    setSubmitting(true);
    try {
      await onSubmit({ paramValues });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const displayLabel = useMemo(() => {
    if (methodLabel) return methodLabel;
    return "method()";
  }, [methodLabel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[90vw] p-6">
        <DialogTitle className="mb-4 text-base">Call method</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-sm font-medium">Object:</span>
              <span className="text-sm text-muted-foreground">{objectName}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-sm font-medium">Method:</span>
              <span className="text-sm text-muted-foreground">{displayLabel}</span>
            </div>

            {params.length > 0 ? (
              <div className="space-y-2 rounded-md border border-border px-3 pb-3 pt-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Method parameters
                </div>
                {params.map((param, index) => (
                  <div
                    key={`${param.name}-${index}`}
                    className="grid grid-cols-[160px_1fr] items-center gap-3"
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
            <Button type="submit" disabled={busy || submitting || hasEmptyParams}>
              Call
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
