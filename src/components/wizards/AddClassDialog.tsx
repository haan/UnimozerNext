import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";

export type AddClassForm = {
  name: string;
  isInterface: boolean;
  extendsName: string;
  packageName: string;
  isFinal: boolean;
  isAbstract: boolean;
  includeMain: boolean;
  includeJavadoc: boolean;
  advancedOpen: boolean;
};

type AddClassDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: AddClassForm) => Promise<void> | void;
  busy?: boolean;
};

const defaultForm: AddClassForm = {
  name: "",
  isInterface: false,
  extendsName: "",
  packageName: "",
  isFinal: false,
  isAbstract: false,
  includeMain: false,
  includeJavadoc: false,
  advancedOpen: false
};

export const AddClassDialog = ({
  open,
  onOpenChange,
  onSubmit,
  busy
}: AddClassDialogProps) => {
  const [form, setForm] = useState<AddClassForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(defaultForm);
      setSubmitting(false);
    }
  }, [open]);

  const update = (patch: Partial<AddClassForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = busy || submitting;
  const nameValue = form.name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[90vw] p-6">
        <DialogTitle className="mb-4 text-base">Add a new class</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Name:</label>
              <input
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>

          <fieldset className="rounded-md border border-border px-3 pb-3 pt-2">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Code generation
            </legend>
            <div className="space-y-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeMain}
                  disabled={form.isInterface}
                  onChange={(event) => update({ includeMain: event.target.checked })}
                />
                Main Method
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeJavadoc}
                  onChange={(event) => update({ includeJavadoc: event.target.checked })}
                />
                JavaDoc Comments
              </label>
            </div>
          </fieldset>

          <div>
            <button
              type="button"
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => update({ advancedOpen: !form.advancedOpen })}
            >
              {form.advancedOpen ? "▾" : "▸"} Advanced
            </button>
          </div>

          {form.advancedOpen ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[90px_1fr] items-center gap-3">
                <label className="text-sm font-medium">Extends:</label>
                <input
                  className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                  value={form.extendsName}
                  onChange={(event) => update({ extendsName: event.target.value })}
                />
              </div>

              <div className="grid grid-cols-[90px_1fr] items-center gap-3">
                <label className="text-sm font-medium">Package:</label>
                <input
                  className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                  value={form.packageName}
                  onChange={(event) => update({ packageName: event.target.value })}
                />
              </div>

              <fieldset className="rounded-md border border-border px-3 pb-3 pt-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  Type & Modifiers
                </legend>
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isInterface}
                      disabled={form.isAbstract || form.isFinal}
                      onChange={(event) =>
                        update({
                          isInterface: event.target.checked,
                          isFinal: event.target.checked ? false : form.isFinal,
                          isAbstract: event.target.checked ? false : form.isAbstract,
                          includeMain: event.target.checked ? false : form.includeMain
                        })
                      }
                    />
                    interface
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isFinal}
                      disabled={form.isInterface || form.isAbstract}
                      onChange={(event) =>
                        update({
                          isFinal: event.target.checked,
                          isAbstract: event.target.checked ? false : form.isAbstract
                        })
                      }
                    />
                    final
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isAbstract}
                      disabled={form.isInterface || form.isFinal}
                      onChange={(event) =>
                        update({
                          isAbstract: event.target.checked,
                          isFinal: event.target.checked ? false : form.isFinal
                        })
                      }
                    />
                    abstract
                  </label>
                </div>
              </fieldset>
            </div>
          ) : null}
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
            <Button type="submit" disabled={disabled || !nameValue}>
              OK
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
