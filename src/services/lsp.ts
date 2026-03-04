import { z } from "zod";
import { invokeValidated, stringSchema } from "./tauriValidation";

export type LspPosition = {
  line: number;
  character: number;
};

export type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

export type LspDiagnostic = {
  range: LspRange;
  severity?: number;
  message: string;
  source?: string;
};

export type LsDiagnosticsEvent = {
  uri: string;
  diagnostics: LspDiagnostic[];
};

export type LspTextEdit = {
  range: LspRange;
  newText: string;
};

export type LspMarkupContent = {
  kind: "markdown" | "plaintext" | string;
  value: string;
};

export type LspInsertReplaceEdit = {
  newText: string;
  insert: LspRange;
  replace: LspRange;
};

export type LspCompletionItemKind = number;

export type LspCompletionItemLabel = {
  label: string;
  detail?: string;
  description?: string;
};

export type LspCompletionItem = {
  label: string | LspCompletionItemLabel;
  kind?: LspCompletionItemKind;
  detail?: string;
  documentation?: string | LspMarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: LspTextEdit | LspInsertReplaceEdit;
  additionalTextEdits?: LspTextEdit[];
  commitCharacters?: string[];
  preselect?: boolean;
};

export type LspCompletionList = {
  isIncomplete?: boolean;
  items: LspCompletionItem[];
};

const lspPositionSchema = z
  .object({
    line: z.number(),
    character: z.number()
  })
  .loose();

const lspRangeSchema = z
  .object({
    start: lspPositionSchema,
    end: lspPositionSchema
  })
  .loose();

const lspDiagnosticSchema = z
  .object({
    range: lspRangeSchema,
    severity: z.number().nullish().transform((value) => value ?? undefined),
    message: z.string(),
    source: z.string().nullish().transform((value) => value ?? undefined)
  })
  .loose();

const lsDiagnosticsEventSchema = z
  .object({
    uri: z.string(),
    diagnostics: z.array(lspDiagnosticSchema)
  })
  .loose();

const lspTextEditSchema = z
  .object({
    range: lspRangeSchema,
    newText: z.string()
  })
  .loose();

const lspMarkupContentSchema = z
  .object({
    kind: z.string(),
    value: z.string()
  })
  .loose();

const lspInsertReplaceEditSchema = z
  .object({
    newText: z.string(),
    insert: lspRangeSchema,
    replace: lspRangeSchema
  })
  .loose();

const lspCompletionItemLabelSchema = z
  .object({
    label: z.string(),
    detail: z.string().optional(),
    description: z.string().optional()
  })
  .loose();

const lspCompletionLabelSchema = z.union([z.string(), lspCompletionItemLabelSchema]);

const lspCompletionItemSchema = z
  .object({
    label: lspCompletionLabelSchema,
    kind: z.number().optional(),
    detail: z.string().optional(),
    documentation: z.union([z.string(), lspMarkupContentSchema]).optional(),
    sortText: z.string().optional(),
    filterText: z.string().optional(),
    insertText: z.string().optional(),
    insertTextFormat: z.number().optional(),
    textEdit: z.union([lspTextEditSchema, lspInsertReplaceEditSchema]).optional(),
    additionalTextEdits: z.array(lspTextEditSchema).optional(),
    commitCharacters: z.array(z.string()).optional(),
    preselect: z.boolean().optional()
  })
  .loose();

const lspCompletionListSchema = z
  .object({
    isIncomplete: z.boolean().optional(),
    items: z.array(lspCompletionItemSchema)
  })
  .loose();

export const isTextEdit = (value: unknown): value is LspTextEdit =>
  lspTextEditSchema.safeParse(value).success;

export const isInsertReplaceEdit = (value: unknown): value is LspInsertReplaceEdit =>
  lspInsertReplaceEditSchema.safeParse(value).success;

export const isCompletionList = (value: unknown): value is LspCompletionList =>
  lspCompletionListSchema.safeParse(value).success;

export const parseLsDiagnosticsEvent = (value: unknown): LsDiagnosticsEvent | null => {
  const parsed = lsDiagnosticsEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const normalizeCompletionResponse = (
  result: unknown
): { isIncomplete: boolean; items: LspCompletionItem[] } => {
  const parsedList = lspCompletionListSchema.safeParse(result);
  if (parsedList.success) {
    return {
      isIncomplete: parsedList.data.isIncomplete === true,
      items: parsedList.data.items
    };
  }

  if (Array.isArray(result)) {
    const items: LspCompletionItem[] = [];
    result.forEach((item) => {
      const parsed = lspCompletionItemSchema.safeParse(item);
      if (parsed.success) {
        items.push(parsed.data);
      }
    });
    return {
      isIncomplete: false,
      items
    };
  }

  return { isIncomplete: false, items: [] };
};

const encodeUriPath = (value: string): string =>
  encodeURI(value).replace(/\?/g, "%3F").replace(/#/g, "%23");

const normalizeWindowsExtendedPath = (path: string): string => {
  const trimmed = path.trim();

  const extendedUncMatch = /^\\\\\?\\UNC\\(.+)$/i.exec(trimmed);
  if (extendedUncMatch) {
    return `\\\\${extendedUncMatch[1]}`;
  }

  const extendedLocalMatch = /^\\\\\?\\([A-Za-z]:\\.+)$/.exec(trimmed);
  if (extendedLocalMatch) {
    return extendedLocalMatch[1];
  }

  return trimmed;
};

const normalizeInternalUriCacheKey = (path: string): string => {
  const normalized = normalizeWindowsExtendedPath(path).trim();

  // Windows local and UNC paths are case-insensitive in practice.
  if (/^[a-zA-Z]:[\\/]/.test(normalized) || /^\\\\[^\\]/.test(normalized)) {
    return normalized.replace(/\//g, "\\").toLowerCase();
  }

  // Keep POSIX paths case-sensitive.
  return normalized.replace(/\\/g, "/");
};

export const toFileUri = (path: string) => {
  const normalizedPath = normalizeWindowsExtendedPath(path).replace(/\\/g, "/");

  // Windows drive path, e.g. C:/project/src/Main.java
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${encodeUriPath(normalizedPath)}`;
  }

  // UNC path, e.g. //server/share/project/src/Main.java
  if (/^\/\/[^/]/.test(normalizedPath)) {
    const withoutPrefix = normalizedPath.replace(/^\/+/, "");
    const firstSlash = withoutPrefix.indexOf("/");
    const authority = firstSlash >= 0 ? withoutPrefix.slice(0, firstSlash) : withoutPrefix;
    const pathPart = firstSlash >= 0 ? withoutPrefix.slice(firstSlash) : "/";
    return `file://${authority}${encodeUriPath(pathPart)}`;
  }

  // POSIX absolute path
  if (normalizedPath.startsWith("/")) {
    return `file://${encodeUriPath(normalizedPath)}`;
  }

  // Fallback for relative/unknown input; produce an absolute-like file URI.
  return `file://${encodeUriPath(`/${normalizedPath}`)}`;
};

const resolvedInternalUriByPath = new Map<string, string>();

export const getCachedInternalFileUri = (path: string): string =>
  resolvedInternalUriByPath.get(normalizeInternalUriCacheKey(path)) ?? toFileUri(path);

export const resolveInternalFileUri = async (path: string): Promise<string> => {
  const cacheKey = normalizeInternalUriCacheKey(path);
  const cached = resolvedInternalUriByPath.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const resolved = await invokeValidated(
      "resolve_file_uri",
      stringSchema,
      "resolve_file_uri response",
      { path }
    );
    resolvedInternalUriByPath.set(cacheKey, resolved);
    return resolved;
  } catch {
    const fallback = toFileUri(path);
    resolvedInternalUriByPath.set(cacheKey, fallback);
    return fallback;
  }
};

export const sortTextEditsDescending = (a: LspTextEdit, b: LspTextEdit) => {
  if (a.range.start.line !== b.range.start.line) {
    return b.range.start.line - a.range.start.line;
  }
  return b.range.start.character - a.range.start.character;
};

export const applyTextEdits = (text: string, edits: LspTextEdit[]) => {
  if (!edits || edits.length === 0) return text;
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const toOffset = (position: LspPosition) => {
    const lineStart = lineStarts[position.line] ?? text.length;
    return lineStart + position.character;
  };
  const normalized = edits.map((edit) => ({
    start: toOffset(edit.range.start),
    end: toOffset(edit.range.end),
    newText: edit.newText
  }));
  normalized.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = text;
  for (const edit of normalized) {
    result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`;
  }
  return result;
};
