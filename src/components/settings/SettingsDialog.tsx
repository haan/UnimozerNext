import { useEffect, useMemo, useState } from "react";
import type { AppSettings } from "../../models/settings";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Slider } from "../ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { Switch } from "../ui/switch";
import { cn } from "../../lib/utils";
import { ChromePicker } from "react-color";
import { loadEditorThemeOptions, type ThemeOption } from "../../services/monacoThemes";

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
  const [themeOptions, setThemeOptions] = useState<ThemeOption[]>([
    { value: "default", label: "Default" }
  ]);

  const options = useMemo(
    () =>
      groups.map((group) => ({
        label: group,
        value: group
      })),
    []
  );

  useEffect(() => {
    let active = true;
    const loadThemes = async () => {
      const loaded = await loadEditorThemeOptions();
      if (active) setThemeOptions(loaded);
    };
    void loadThemes();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-160 w-215 max-w-[90vw] overflow-hidden p-0">
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

          <section className="flex flex-1 flex-col overflow-y-auto p-6">
            <h2 className="text-lg font-semibold">{activeGroup}</h2>

            {activeGroup === "UML" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">UML font size</p>
                    <p className="text-xs text-muted-foreground">
                      Adjust the font size used in UML class boxes.
                    </p>
                  </div>
                  <div className="flex w-44 items-center gap-3">
                    <Slider
                      value={[settings.uml.fontSize]}
                      min={10}
                      max={40}
                      step={1}
                      onValueChange={(value) =>
                        onChange({
                          ...settings,
                          uml: {
                            ...settings.uml,
                            fontSize: value[0] ?? 12
                          }
                        })
                      }
                    />
                    <span className="w-8 text-right text-xs text-muted-foreground">
                      {settings.uml.fontSize}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Show packages</p>
                    <p className="text-xs text-muted-foreground">
                      Group classes by package with a background container.
                    </p>
                  </div>
                  <Switch
                    checked={settings.uml.showPackages}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        uml: {
                          ...settings.uml,
                          showPackages: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Code highlight</p>
                    <p className="text-xs text-muted-foreground">
                      Jump to code location when selecting UML members.
                    </p>
                  </div>
                  <Switch
                    checked={settings.uml.codeHighlight}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        uml: {
                          ...settings.uml,
                          codeHighlight: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">UML panel background</p>
                    <p className="text-xs text-muted-foreground">
                      Pick a background color for the UML diagram area.
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full border border-border transition hover:border-foreground/40"
                        style={{
                          backgroundColor: settings.uml.panelBackground ?? "transparent"
                        }}
                        aria-label="Pick UML panel background color"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3">
                      <ChromePicker
                        color={settings.uml.panelBackground ?? "#f3f4f6"}
                        onChange={(color) =>
                          onChange({
                            ...settings,
                            uml: {
                              ...settings.uml,
                              panelBackground: color.hex
                            }
                          })
                        }
                        disableAlpha
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : activeGroup === "Editor" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Font size</p>
                    <p className="text-xs text-muted-foreground">
                      Adjust the editor font size.
                    </p>
                  </div>
                  <div className="flex w-44 items-center gap-3">
                    <Slider
                      value={[settings.editor.fontSize]}
                      min={10}
                      max={40}
                      step={1}
                      onValueChange={(value) =>
                        onChange({
                          ...settings,
                          editor: {
                            ...settings.editor,
                            fontSize: value[0] ?? 14
                          }
                        })
                      }
                    />
                    <span className="w-8 text-right text-xs text-muted-foreground">
                      {settings.editor.fontSize}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Editor theme</p>
                    <p className="text-xs text-muted-foreground">
                      Choose a color theme for Monaco.
                    </p>
                  </div>
                  <div className="w-56">
                    <Select
                      value={settings.editor.theme}
                      onValueChange={(value) =>
                        onChange({
                          ...settings,
                          editor: {
                            ...settings.editor,
                            theme: value
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        {themeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Auto format on save</p>
                    <p className="text-xs text-muted-foreground">
                      Format Java files automatically when saving.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.autoFormatOnSave}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          autoFormatOnSave: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Tab size</p>
                    <p className="text-xs text-muted-foreground">
                      Number of spaces that a tab represents.
                    </p>
                  </div>
                  <input
                    type="number"
                    min={2}
                    max={8}
                    value={settings.editor.tabSize}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          tabSize: Number.parseInt(event.target.value || "4", 10)
                        }
                      })
                    }
                    className="h-9 w-16 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Insert spaces</p>
                    <p className="text-xs text-muted-foreground">
                      Use spaces instead of tabs for indentation.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.insertSpaces}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          insertSpaces: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Auto close brackets</p>
                    <p className="text-xs text-muted-foreground">
                      Insert a matching closing bracket automatically.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.autoCloseBrackets}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          autoCloseBrackets: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Auto close quotes</p>
                    <p className="text-xs text-muted-foreground">
                      Insert a matching closing quote automatically.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.autoCloseQuotes}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          autoCloseQuotes: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Auto close comments</p>
                    <p className="text-xs text-muted-foreground">
                      Insert a matching closing comment automatically.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.autoCloseComments}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          autoCloseComments: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Word wrap</p>
                    <p className="text-xs text-muted-foreground">
                      Wrap long lines at the editor width.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.wordWrap}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          wordWrap: checked
                        }
                      })
                    }
                  />
                </div>
              </div>
            ) : activeGroup === "Advanced" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Debug logging</p>
                    <p className="text-xs text-muted-foreground">
                      Show internal diagnostics in the console.
                    </p>
                  </div>
                  <Switch
                    checked={settings.advanced.debugLogging}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        advanced: {
                          ...settings.advanced,
                          debugLogging: checked
                        }
                      })
                    }
                  />
                </div>
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
