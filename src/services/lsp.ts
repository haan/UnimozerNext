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
