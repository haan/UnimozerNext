import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { ChromePicker, type ColorResult } from "react-color";
import { loadEditorThemeOptions, type ThemeOption } from "../../services/monacoThemes";
import { readDefaultSettings } from "../../services/settings";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
};

const groups = [
  "General",
  "UML",
  "Object Bench",
  "Editor",
  "Structogram",
  "Advanced"
] as const;
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
  const [defaultStructogramSettings, setDefaultStructogramSettings] = useState<
    AppSettings["structogram"] | null
  >(null);

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

  useEffect(() => {
    let active = true;
    const loadDefaultSettings = async () => {
      try {
        const defaults = await readDefaultSettings();
        if (!active) return;
        setDefaultStructogramSettings(defaults.structogram);
      } catch {
        if (!active) return;
        setDefaultStructogramSettings(null);
      }
    };
    void loadDefaultSettings();
    return () => {
      active = false;
    };
  }, []);

  const updateStructogramSettings = useCallback(
    (partial: Partial<AppSettings["structogram"]>) => {
      onChange({
        ...settings,
        structogram: {
          ...settings.structogram,
          ...partial
        }
      });
    },
    [onChange, settings]
  );

  const resetStructogramColors = useCallback(() => {
    if (!defaultStructogramSettings) {
      return;
    }
    onChange({
      ...settings,
      structogram: {
        ...defaultStructogramSettings
      }
    });
  }, [defaultStructogramSettings, onChange, settings]);

  const canResetStructogramColors = useMemo(() => {
    if (!defaultStructogramSettings) {
      return false;
    }
    return (
      settings.structogram.loopHeaderColor !== defaultStructogramSettings.loopHeaderColor ||
      settings.structogram.ifHeaderColor !== defaultStructogramSettings.ifHeaderColor ||
      settings.structogram.switchHeaderColor !== defaultStructogramSettings.switchHeaderColor ||
      settings.structogram.tryWrapperColor !== defaultStructogramSettings.tryWrapperColor
    );
  }, [defaultStructogramSettings, settings.structogram]);

  const fontZoomModifier = useMemo(() => {
    if (typeof navigator === "undefined") {
      return "Ctrl";
    }
    const platformInfo = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    return platformInfo.includes("mac") ? "Cmd" : "Ctrl";
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

            {activeGroup === "General" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Dark mode</p>
                    <p className="text-xs text-muted-foreground">
                      Use a dark color scheme for app panels and controls.
                    </p>
                  </div>
                  <Switch
                    checked={settings.general.darkMode}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        general: {
                          ...settings.general,
                          darkMode: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Font size</p>
                    <p className="text-xs text-muted-foreground">
                      Adjust the font size used in the editor, console, and UML panels.
                    </p>
                  </div>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex w-44 items-center gap-3">
                          <Slider
                            value={[settings.general.fontSize]}
                            min={8}
                            max={40}
                            step={1}
                            onValueChange={(value) =>
                              onChange({
                                ...settings,
                                general: {
                                  ...settings.general,
                                  fontSize: value[0] ?? 12
                                }
                              })
                            }
                          />
                          <span className="w-8 text-right text-xs text-muted-foreground">
                            {settings.general.fontSize}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Tip: Use {fontZoomModifier} + scroll wheel to adjust font size anywhere in
                        the app.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ) : activeGroup === "UML" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Show javax.swing fields</p>
                    <p className="text-xs text-muted-foreground">
                      Include Swing-specific fields in UML class attributes.
                    </p>
                  </div>
                  <Switch
                    checked={settings.uml.showSwingAttributes}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        uml: {
                          ...settings.uml,
                          showSwingAttributes: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Jump to code</p>
                    <p className="text-xs text-muted-foreground">
                      Move the editor cursor when selecting UML members.
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
              </div>
            ) : activeGroup === "Object Bench" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Use object dropdowns in method calls</p>
                    <p className="text-xs text-muted-foreground">
                      Show object selectors for non-primitive/non-String method parameters.
                    </p>
                  </div>
                  <Switch
                    checked={settings.objectBench.useObjectParameterDropdowns}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        objectBench: {
                          ...settings.objectBench,
                          useObjectParameterDropdowns: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Show private fields</p>
                    <p className="text-xs text-muted-foreground">
                      Display private attributes in object cards.
                    </p>
                  </div>
                  <Switch
                    checked={settings.objectBench.showPrivateObjectFields}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        objectBench: {
                          ...settings.objectBench,
                          showPrivateObjectFields: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Show inherited fields</p>
                    <p className="text-xs text-muted-foreground">
                      Include fields inherited from parent classes.
                    </p>
                  </div>
                  <Switch
                    checked={settings.objectBench.showInheritedObjectFields}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        objectBench: {
                          ...settings.objectBench,
                          showInheritedObjectFields: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Show static fields</p>
                    <p className="text-xs text-muted-foreground">
                      Display static attributes shared by all objects.
                    </p>
                  </div>
                  <Switch
                    checked={settings.objectBench.showStaticObjectFields}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        objectBench: {
                          ...settings.objectBench,
                          showStaticObjectFields: checked
                        }
                      })
                    }
                  />
                </div>
              </div>
            ) : activeGroup === "Editor" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Code highlighting</p>
                    <p className="text-xs text-muted-foreground">
                      Show BlueJ-style nested scope colors in the code editor.
                    </p>
                  </div>
                  <Switch
                    checked={settings.editor.scopeHighlighting}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        editor: {
                          ...settings.editor,
                          scopeHighlighting: checked
                        }
                      })
                    }
                  />
                </div>
              </div>
            ) : activeGroup === "Structogram" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Use colors</p>
                    <p className="text-xs text-muted-foreground">
                      Enable colorized headers for structogram blocks.
                    </p>
                  </div>
                  <Switch
                    checked={settings.advanced.structogramColors}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...settings,
                        advanced: {
                          ...settings.advanced,
                          structogramColors: checked
                        }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Loop header color</p>
                    <p className="text-xs text-muted-foreground">
                      Color used for for/while/do-while loop wrappers.
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full border border-border transition hover:border-foreground/40"
                        style={{ backgroundColor: settings.structogram.loopHeaderColor }}
                        aria-label="Pick structogram loop header color"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3">
                      <ChromePicker
                        color={settings.structogram.loopHeaderColor}
                        onChange={(color: ColorResult) =>
                          updateStructogramSettings({ loopHeaderColor: color.hex })
                        }
                        disableAlpha
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">If header color</p>
                    <p className="text-xs text-muted-foreground">
                      Color used for if/else decision headers.
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full border border-border transition hover:border-foreground/40"
                        style={{ backgroundColor: settings.structogram.ifHeaderColor }}
                        aria-label="Pick structogram if header color"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3">
                      <ChromePicker
                        color={settings.structogram.ifHeaderColor}
                        onChange={(color: ColorResult) =>
                          updateStructogramSettings({ ifHeaderColor: color.hex })
                        }
                        disableAlpha
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Switch header color</p>
                    <p className="text-xs text-muted-foreground">
                      Color used for switch selector headers.
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full border border-border transition hover:border-foreground/40"
                        style={{ backgroundColor: settings.structogram.switchHeaderColor }}
                        aria-label="Pick structogram switch header color"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3">
                      <ChromePicker
                        color={settings.structogram.switchHeaderColor}
                        onChange={(color: ColorResult) =>
                          updateStructogramSettings({ switchHeaderColor: color.hex })
                        }
                        disableAlpha
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Try wrapper color</p>
                    <p className="text-xs text-muted-foreground">
                      Color used for try/catch/finally wrapper bands.
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full border border-border transition hover:border-foreground/40"
                        style={{ backgroundColor: settings.structogram.tryWrapperColor }}
                        aria-label="Pick structogram try wrapper color"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3">
                      <ChromePicker
                        color={settings.structogram.tryWrapperColor}
                        onChange={(color: ColorResult) =>
                          updateStructogramSettings({ tryWrapperColor: color.hex })
                        }
                        disableAlpha
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex justify-end rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
                  <button
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canResetStructogramColors}
                    onClick={resetStructogramColors}
                  >
                    Reset colors
                  </button>
                </div>
              </div>
            ) : activeGroup === "Advanced" ? (
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/45 dark:bg-background px-4 py-3">
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


