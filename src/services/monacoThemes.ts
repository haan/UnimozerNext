import type * as Monaco from "monaco-editor";

export type ThemeOption = {
  value: string;
  label: string;
};

export type ThemeColors = {
  background: string | null;
  foreground: string | null;
  lineHighlightBorder: string | null;
  lineHighlightBackground: string | null;
};

type ThemeFileOption = ThemeOption & {
  file: string;
  url: string;
};

const defaultOption: ThemeOption = { value: "default", label: "Default" };

const registeredThemes = new Set<string>();
const themeFileMap = new Map<string, ThemeFileOption>();
const themeDataCache = new Map<string, Monaco.editor.IStandaloneThemeData>();
let themeOptionsPromise: Promise<ThemeOption[]> | null = null;

const buildThemeOptionsFromMap = (map: Record<string, string>): ThemeOption[] => {
  const options: ThemeOption[] = [defaultOption];
  themeFileMap.clear();

  Object.entries(map).forEach(([value, label]) => {
    const file = `${label}.json`;
    const url = `/themes/${encodeURIComponent(file)}`;
    themeFileMap.set(value, { value, label, file, url });
    options.push({ value, label });
  });

  return options;
};

export const loadEditorThemeOptions = async (): Promise<ThemeOption[]> => {
  if (themeOptionsPromise) return themeOptionsPromise;
  themeOptionsPromise = (async () => {
    try {
      const themeListResponse = await fetch("/themes/themelist.json");
      if (themeListResponse.ok) {
        const map = (await themeListResponse.json()) as Record<string, string>;
        if (map && typeof map === "object") {
          return buildThemeOptionsFromMap(map);
        }
      }
      return [defaultOption];
    } catch {
      return [defaultOption];
    }
  })();
  return themeOptionsPromise;
};

export const registerMonacoThemes = async (
  monaco: typeof Monaco,
  themeId: string | undefined
) => {
  if (!themeId || themeId === "default") return;
  if (registeredThemes.has(themeId)) return;
  const theme = await fetchThemeData(themeId);
  if (!theme) return;
  monaco.editor.defineTheme(themeId, theme);
  registeredThemes.add(themeId);
};

export const resolveMonacoTheme = (theme: string | undefined) => {
  if (!theme || theme === "default") {
    return "vs";
  }
  return theme;
};

const normalizeColor = (value?: string | null) => {
  if (!value) return null;
  let color = value.trim();
  if (!color) return null;
  if (!color.startsWith("#")) {
    color = `#${color}`;
  }
  return color;
};

const pickThemeColors = (theme: Monaco.editor.IStandaloneThemeData): ThemeColors => {
  const colors = theme.colors ?? {};
  const background =
    normalizeColor(colors["editor.background"]) ??
    normalizeColor(theme.rules?.find((rule) => !rule.token)?.background);
  const foreground =
    normalizeColor(colors["editor.foreground"]) ??
    normalizeColor(theme.rules?.find((rule) => !rule.token)?.foreground);
  const lineHighlightBorder = normalizeColor(colors["editor.lineHighlightBorder"]);
  const lineHighlightBackground = normalizeColor(colors["editor.lineHighlightBackground"]);
  return { background, foreground, lineHighlightBorder, lineHighlightBackground };
};

const fetchThemeData = async (themeId: string) => {
  if (themeDataCache.has(themeId)) {
    return themeDataCache.get(themeId) ?? null;
  }
  const options = await loadEditorThemeOptions();
  if (!options.length) return null;
  const entry = themeFileMap.get(themeId);
  if (!entry) return null;
  const response = await fetch(entry.url);
  if (!response.ok) return null;
  const theme = (await response.json()) as Monaco.editor.IStandaloneThemeData;
  themeDataCache.set(themeId, theme);
  return theme;
};

export const getThemeColors = async (
  themeId: string | undefined
): Promise<ThemeColors | null> => {
  if (!themeId || themeId === "default") return null;
  const theme = await fetchThemeData(themeId);
  if (!theme) return null;
  return pickThemeColors(theme);
};
