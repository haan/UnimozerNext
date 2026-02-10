import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { isValidJavaIdentifier } from "../../services/java";
import { ParameterList } from "./ParameterList";
import { type ParameterRow, createParameterRow } from "./parameters";
import { TypeSelect } from "./TypeSelect";

export type AddMethodForm = {
  name: string;
  returnType: string;
  visibility: "private" | "public" | "protected" | "package";
  isStatic: boolean;
  isAbstract: boolean;
  includeJavadoc: boolean;
  params: ParameterRow[];
};

type AddMethodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: AddMethodForm) => Promise<void> | void;
  className?: string | null;
  busy?: boolean;
};

const defaultForm: AddMethodForm = {
  name: "",
  returnType: "void",
  visibility: "public",
  isStatic: false,
  isAbstract: false,
  includeJavadoc: false,
  params: []
};

export const AddMethodDialog = ({
  open,
  onOpenChange,
  onSubmit,
  className,
  busy
}: AddMethodDialogProps) => {
  const [form, setForm] = useState<AddMethodForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(defaultForm);
      setSubmitting(false);
      setAdvancedOpen(false);
    }
  }, [open]);

  const update = (patch: Partial<AddMethodForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateParam = (id: string, patch: Partial<ParameterRow>) => {
    setForm((prev) => ({
      ...prev,
      params: prev.params.map((param) =>
        param.id === id ? { ...param, ...patch } : param
      )
    }));
  };

  const addParam = () => {
    setForm((prev) => ({ ...prev, params: [...prev.params, createParameterRow()] }));
  };

  const removeParam = (id: string) => {
    setForm((prev) => ({
      ...prev,
      params: prev.params.filter((param) => param.id !== id)
    }));
  };

  const invalidParamIds = useMemo(() => {
    const invalid = new Set<string>();
    form.params.forEach((param) => {
      const name = param.name.trim();
      const type = param.type.trim();
      if (!name || !type || !isValidJavaIdentifier(name)) {
        invalid.add(param.id);
      }
    });
    return invalid;
  }, [form.params]);

  const handleSubmit = async () => {
    if (!form.name.trim() || invalidParamIds.size > 0) return;
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
  const isNameValid = isValidJavaIdentifier(nameValue);
  const canSubmit = isNameValid && invalidParamIds.size === 0;
  const disableAbstract = form.isStatic;
  const specialReturnTypes = useMemo(
    () =>
      className
        ? [{ value: className, label: className, tooltip: "Current class" }]
        : [],
    [className]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[92vw] p-6">
        <DialogTitle className="mb-4 text-base">
          Add method{className ? ` to ${className}` : ""}
        </DialogTitle>
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
              <label className="text-sm font-medium">Return:</label>
              <TypeSelect
                value={form.returnType}
                includeVoid
                specialOptions={specialReturnTypes}
                onValueChange={(value) => update({ returnType: value })}
              />
            </div>

            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Visibility:</label>
              <Select
                value={form.visibility}
                onValueChange={(value) => update({ visibility: value as AddMethodForm["visibility"] })}
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

            <ParameterList
              params={form.params}
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
                      onChange={(event) =>
                        update({
                          isStatic: event.target.checked,
                          isAbstract: event.target.checked ? false : form.isAbstract
                        })
                      }
                    />
                    static
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isAbstract}
                      disabled={disableAbstract}
                      onChange={(event) => update({ isAbstract: event.target.checked })}
                    />
                    abstract
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
            <Button type="submit" disabled={disabled || !nameValue || !canSubmit}>
              OK
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
