import { useMemo, useState } from "react";
import type { AppSettings } from "../../models/settings";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { cn } from "../../lib/utils";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
};

const groups = ["General", "UML", "Appearance", "Editor", "Advanced"] as const;
type SettingsGroup = (typeof groups)[number];

export const SettingsDialog = ({
  open,
  onOpenChange,
  settings,
  onChange
}: SettingsDialogProps) => {
  const [activeGroup, setActiveGroup] = useState<SettingsGroup>("General");

  const options = useMemo(
    () =>
      groups.map((group) => ({
        label: group,
        value: group
      })),
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[520px] w-[860px] max-w-[90vw] overflow-hidden p-0">
        <div className="flex h-full">
          <aside className="flex w-48 flex-col border-r border-border bg-muted/40 p-4">
            <DialogTitle className="mb-4 text-base">Settings</DialogTitle>
            <nav className="flex flex-1 flex-col gap-1 text-sm">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setActiveGroup(option.value)}
                  className={cn(
                    "rounded-md px-3 py-2 text-left transition",
                    activeGroup === option.value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </nav>
          </aside>

          <section className="flex flex-1 flex-col p-6">
            <h2 className="text-lg font-semibold">{activeGroup}</h2>

            {activeGroup === "UML" ? (
              <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Show dependencies</p>
                  <p className="text-xs text-muted-foreground">
                    Display dependency relationships between classes.
                  </p>
                </div>
                <Switch
                  checked={settings.uml.showDependencies}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...settings,
                      uml: {
                        ...settings.uml,
                        showDependencies: checked
                      }
                    })
                  }
                />
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-border bg-background/60 p-6 text-sm text-muted-foreground">
                {activeGroup} settings will appear here.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
