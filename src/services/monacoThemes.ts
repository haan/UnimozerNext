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

type ThemeRule = Monaco.editor.ITokenThemeRule;

const defaultOption: ThemeOption = { value: "default", label: "Default" };

const registeredThemes = new Set<string>();
const themeFileMap = new Map<string, ThemeFileOption>();
const themeDataCache = new Map<string, Monaco.editor.IStandaloneThemeData>();
let themeOptionsPromise: Promise<ThemeOption[]> | null = null;

const INTERNAL_DEFAULT_LIGHT_THEME_ID = "unimozer-default-light";
const INTERNAL_DEFAULT_DARK_THEME_ID = "unimozer-default-dark";

const DECLARATION_TYPE_TOKEN = "declaration.type";

const FALLBACK_LIGHT_TYPE_COLOR = "#0f5d9c";
const FALLBACK_DARK_TYPE_COLOR = "#8ec9ff";
const FALLBACK_LIGHT_KEYWORD_COLOR = "#0000ff";
const FALLBACK_DARK_KEYWORD_COLOR = "#569cd6";
const CSS_VAR_EDITOR_TOKEN_KEYWORD_FALLBACK = "--editor-token-keyword-fallback";
const CSS_VAR_EDITOR_TOKEN_TYPE_FALLBACK = "--editor-token-type-fallback";
const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const TYPE_COLOR_CANDIDATES = [
  "declaration.type",
  "type",
  "class",
  "interface",
  "enum",
  "record",
  "struct",
  "entity.name.type",
  "entity.name.class",
  "entity.name.type.class",
  "support.type",
  "support.class",
  "storage.type"
];

const KEYWORD_COLOR_CANDIDATES = [
  "keyword.int",
  "keyword.long",
  "keyword.short",
  "keyword.byte",
  "keyword.float",
  "keyword.double",
  "keyword.boolean",
  "keyword.char",
  "keyword.void",
  "keyword",
  "storage",
  "keyword.type"
];

const isInternalDefaultThemeId = (themeId: string): boolean =>
  themeId === INTERNAL_DEFAULT_LIGHT_THEME_ID || themeId === INTERNAL_DEFAULT_DARK_THEME_ID;

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

  if (isInternalDefaultThemeId(themeId)) {
    const baseTheme = themeId === INTERNAL_DEFAULT_DARK_THEME_ID ? "vs-dark" : "vs";
    const theme = withJavaDeclarationTokenColors({
      base: baseTheme,
      inherit: true,
      rules: [],
      colors: {}
    });
    monaco.editor.defineTheme(themeId, theme);
    registeredThemes.add(themeId);
    return;
  }

  const theme = await fetchThemeData(themeId);
  if (!theme) return;
  monaco.editor.defineTheme(themeId, withJavaDeclarationTokenColors(theme));
  registeredThemes.add(themeId);
};

export const resolveMonacoTheme = (theme: string | undefined, darkMode: boolean) => {
  if (!theme || theme === "default") {
    return darkMode ? INTERNAL_DEFAULT_DARK_THEME_ID : INTERNAL_DEFAULT_LIGHT_THEME_ID;
  }
  return theme;
};

const normalizeColor = (value?: string | null) => {
  if (!value) return null;
  const color = value.trim();
  if (!color) return null;
  const match = HEX_COLOR_PATTERN.exec(color);
  if (!match) {
    return null;
  }
  let hex = match[1] ?? "";
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((char) => `${char}${char}`).join("");
  }
  return `#${hex.toLowerCase()}`;
};

const normalizeRuleColor = (rule: ThemeRule | undefined): string | null =>
  normalizeColor(typeof rule?.foreground === "string" ? rule.foreground : null);

const normalizeTokenColor = (value?: string | null): string | null => {
  const normalized = normalizeColor(value);
  return normalized ? normalized.slice(1) : null;
};

const sanitizeThemeRules = (rules: ThemeRule[]): ThemeRule[] =>
  rules.map((rule) => {
    const next: ThemeRule = { ...rule };
    const normalizedForeground = normalizeTokenColor(
      typeof next.foreground === "string" ? next.foreground : null
    );
    if (normalizedForeground) {
      next.foreground = normalizedForeground;
    } else {
      delete next.foreground;
    }
    const normalizedBackground = normalizeTokenColor(
      typeof next.background === "string" ? next.background : null
    );
    if (normalizedBackground) {
      next.background = normalizedBackground;
    } else {
      delete next.background;
    }
    return next;
  });

const readCssVarColor = (name: string): string | null => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const root = document.documentElement;
  const raw = window.getComputedStyle(root).getPropertyValue(name);
  return normalizeColor(raw);
};

const matchesRuleToken = (ruleToken: string, candidate: string): boolean => {
  if (ruleToken === candidate) return true;
  if (ruleToken.startsWith(`${candidate}.`)) return true;
  if (ruleToken.endsWith(`.${candidate}`)) return true;
  if (ruleToken.includes(`.${candidate}.`)) return true;
  return false;
};

const findRuleColor = (rules: ThemeRule[], candidates: string[]): string | null => {
  const candidateList = candidates
    .map((candidate) => candidate.trim().toLowerCase())
    .filter((candidate) => candidate.length > 0);

  if (candidateList.length === 0) {
    return null;
  }

  for (const candidate of candidateList) {
    const exactRule = rules.find((rule) => (rule.token ?? "").trim().toLowerCase() === candidate);
    const exactColor = normalizeRuleColor(exactRule);
    if (exactColor) {
      return exactColor;
    }
  }

  for (const rule of rules) {
    const token = (rule.token ?? "").trim().toLowerCase();
    if (!token) continue;
    if (!candidateList.some((candidate) => matchesRuleToken(token, candidate))) {
      continue;
    }
    const color = normalizeRuleColor(rule);
    if (color) {
      return color;
    }
  }

  return null;
};

const upsertRuleColor = (rules: ThemeRule[], token: string, color: string) => {
  const normalizedToken = token.trim().toLowerCase();
  const existingIndex = rules.findIndex(
    (rule) => (rule.token ?? "").trim().toLowerCase() === normalizedToken
  );
  const normalizedColor = normalizeTokenColor(color);
  if (!normalizedColor) {
    return;
  }
  if (existingIndex >= 0) {
    rules[existingIndex] = {
      ...rules[existingIndex],
      foreground: normalizedColor
    };
    return;
  }
  rules.push({ token, foreground: normalizedColor });
};

const withJavaDeclarationTokenColors = (
  theme: Monaco.editor.IStandaloneThemeData
): Monaco.editor.IStandaloneThemeData => {
  const rules = Array.isArray(theme.rules) ? sanitizeThemeRules([...theme.rules]) : [];
  const isDark = (theme.base ?? "").toLowerCase().includes("dark");
  const editorForeground = normalizeColor(theme.colors?.["editor.foreground"]);
  const keywordFallback =
    readCssVarColor(CSS_VAR_EDITOR_TOKEN_KEYWORD_FALLBACK) ??
    (isDark ? FALLBACK_DARK_KEYWORD_COLOR : FALLBACK_LIGHT_KEYWORD_COLOR);
  const typeFallback =
    readCssVarColor(CSS_VAR_EDITOR_TOKEN_TYPE_FALLBACK) ??
    (isDark ? FALLBACK_DARK_TYPE_COLOR : FALLBACK_LIGHT_TYPE_COLOR);
  const keywordColor = findRuleColor(rules, KEYWORD_COLOR_CANDIDATES) ?? keywordFallback;

  const typeColor =
    keywordColor ??
    findRuleColor(rules, TYPE_COLOR_CANDIDATES) ??
    editorForeground ??
    typeFallback;

  upsertRuleColor(rules, DECLARATION_TYPE_TOKEN, typeColor);

  return {
    ...theme,
    rules
  };
};

const pickThemeColors = (theme: Monaco.editor.IStandaloneThemeData): ThemeColors => {
  const colors = theme.colors ?? {};
  const background =
    normalizeColor(colors["editor.background"]) ??
    normalizeColor((theme.rules ?? []).find((rule) => !rule.token)?.background);
  const foreground =
    normalizeColor(colors["editor.foreground"]) ??
    normalizeColor((theme.rules ?? []).find((rule) => !rule.token)?.foreground);
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

  const rawTheme = (await response.json()) as Monaco.editor.IStandaloneThemeData;
  const theme: Monaco.editor.IStandaloneThemeData = {
    ...rawTheme,
    rules: sanitizeThemeRules(Array.isArray(rawTheme.rules) ? rawTheme.rules : [])
  };
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
