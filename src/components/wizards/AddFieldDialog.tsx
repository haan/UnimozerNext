import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { isValidJavaIdentifier } from "../../services/java";
import { TypeSelect } from "./TypeSelect";

export type AddFieldForm = {
  name: string;
  type: string;
  visibility: "private" | "public" | "protected" | "package";
  initialValue: string;
  isStatic: boolean;
  isFinal: boolean;
  includeSetter: boolean;
  useParamPrefix: boolean;
  includeGetter: boolean;
  includeJavadoc: boolean;
};

type AddFieldDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: AddFieldForm) => Promise<void> | void;
  busy?: boolean;
};

const defaultForm: AddFieldForm = {
  name: "",
  type: "int",
  visibility: "private",
  initialValue: "",
  isStatic: false,
  isFinal: false,
  includeSetter: false,
  useParamPrefix: false,
  includeGetter: false,
  includeJavadoc: false
};

export const AddFieldDialog = ({
  open,
  onOpenChange,
  onSubmit,
  busy
}: AddFieldDialogProps) => {
  const [form, setForm] = useState<AddFieldForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(defaultForm);
      setSubmitting(false);
      setAdvancedOpen(false);
    }
  }, [open]);

  const update = (patch: Partial<AddFieldForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.type.trim()) return;
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
  const typeValue = form.type.trim();
  const isNameValid = isValidJavaIdentifier(nameValue);
  const disableSetter = form.isFinal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[90vw] p-6">
        <DialogTitle className="mb-4 text-base">Add a new field</DialogTitle>
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
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive"
                value={form.name}
                required
                aria-invalid={nameValue ? !isNameValid : false}
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Type:</label>
              <TypeSelect
                value={form.type}
                onValueChange={(value) => update({ type: value })}
              />
            </div>

            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Visibility:</label>
              <Select
                value={form.visibility}
                onValueChange={(value) => update({ visibility: value as AddFieldForm["visibility"] })}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">private</SelectItem>
                  <SelectItem value="public">public</SelectItem>
                  <SelectItem value="protected">protected</SelectItem>
                  <SelectItem value="package">package</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Initial value:</label>
              <input
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={form.initialValue}
                onChange={(event) => update({ initialValue: event.target.value })}
                placeholder="Optional"
              />
            </div>

            <fieldset className="rounded-md border border-border px-3 pb-3 pt-2">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Code generation
              </legend>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.includeSetter}
                    disabled={disableSetter}
                    onChange={(event) => update({ includeSetter: event.target.checked })}
                  />
                  Setter
                </label>
                <label className="flex items-center gap-2 pl-6">
                  <input
                    type="checkbox"
                    checked={form.useParamPrefix}
                    disabled={!form.includeSetter || disableSetter}
                    onChange={(event) => update({ useParamPrefix: event.target.checked })}
                  />
                  Use "p" parameter prefix
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.includeGetter}
                    onChange={(event) => update({ includeGetter: event.target.checked })}
                  />
                  Getter
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
                onClick={() => setAdvancedOpen((prev) => !prev)}
              >
                {advancedOpen ? "▾" : "▸"} Advanced
              </button>
            </div>

            {advancedOpen ? (
              <fieldset className="rounded-md border border-border px-3 pb-3 pt-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  Modifiers
                </legend>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isStatic}
                      onChange={(event) => update({ isStatic: event.target.checked })}
                    />
                    static
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isFinal}
                      onChange={(event) =>
                        update({
                          isFinal: event.target.checked,
                          includeSetter: event.target.checked
                            ? false
                            : form.includeSetter
                        })
                      }
                    />
                    final
                  </label>
                </div>
              </fieldset>
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
            <Button type="submit" disabled={disabled || !nameValue || !typeValue || !isNameValid}>
              OK
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
