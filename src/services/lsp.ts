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

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPosition = (value: unknown): value is LspPosition => {
  if (!isObjectRecord(value)) return false;
  return typeof value.line === "number" && typeof value.character === "number";
};

const isRange = (value: unknown): value is LspRange => {
  if (!isObjectRecord(value)) return false;
  return isPosition(value.start) && isPosition(value.end);
};

const isCompletionLabel = (value: unknown): value is string | LspCompletionItemLabel => {
  if (typeof value === "string") return true;
  if (!isObjectRecord(value)) return false;
  return typeof value.label === "string";
};

const isCompletionItem = (value: unknown): value is LspCompletionItem => {
  if (!isObjectRecord(value)) return false;
  return isCompletionLabel(value.label);
};

export const isTextEdit = (value: unknown): value is LspTextEdit => {
  if (!isObjectRecord(value)) return false;
  return isRange(value.range) && typeof value.newText === "string";
};

export const isInsertReplaceEdit = (value: unknown): value is LspInsertReplaceEdit => {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.newText === "string" &&
    isRange(value.insert) &&
    isRange(value.replace)
  );
};

export const isCompletionList = (value: unknown): value is LspCompletionList => {
  if (!isObjectRecord(value)) return false;
  return Array.isArray(value.items);
};

export const normalizeCompletionResponse = (
  result: unknown
): { isIncomplete: boolean; items: LspCompletionItem[] } => {
  if (isCompletionList(result)) {
    return {
      isIncomplete: result.isIncomplete === true,
      items: result.items.filter((item) => isCompletionItem(item))
    };
  }

  if (Array.isArray(result)) {
    return {
      isIncomplete: false,
      items: result.filter((item): item is LspCompletionItem => isCompletionItem(item))
    };
  }

  return { isIncomplete: false, items: [] };
};

export const toFileUri = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const withSlash = /^[a-zA-Z]:/.test(normalized) ? `/${normalized}` : normalized;
  return `file://${encodeURI(withSlash)}`;
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
