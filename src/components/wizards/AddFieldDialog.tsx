import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { isValidJavaIdentifier } from "../../services/java";

export type AddFieldForm = {
  name: string;
  type: string;
  visibility: "private" | "public" | "protected" | "package";
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
  const nameError = nameValue && !isNameValid ? "Invalid Java identifier." : "";
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
                aria-invalid={Boolean(nameError)}
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-[90px_1fr] items-center gap-3">
              <label className="text-sm font-medium">Type:</label>
              <Select value={form.type} onValueChange={(value) => update({ type: value })}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <TooltipProvider>
                    <SelectGroup>
                      <SelectLabel>Numeric</SelectLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="int">int</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>32-bit signed integer</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="long">long</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>64-bit signed integer</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="float">float</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>32-bit floating point</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="double">double</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>64-bit floating point</TooltipContent>
                      </Tooltip>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Textual</SelectLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="String">String</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>Text string</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="char">char</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>Single UTF-16 code unit</TooltipContent>
                      </Tooltip>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Logical</SelectLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value="boolean">boolean</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent>true or false</TooltipContent>
                      </Tooltip>
                    </SelectGroup>
                  </TooltipProvider>
                </SelectContent>
              </Select>
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
                  Modifier
                </legend>
                <div className="space-y-1">
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
