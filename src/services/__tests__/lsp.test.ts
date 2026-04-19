import { describe, it, expect } from "vitest";
import {
  isTextEdit,
  isInsertReplaceEdit,
  isCompletionList,
  parseLsDiagnosticsEvent,
  normalizeCompletionResponse,
  toFileUri,
  sortTextEditsDescending,
  applyTextEdits,
} from "../lsp";
import type { LspTextEdit } from "../lsp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pos(line: number, character: number) {
  return { line, character };
}

function range(startLine: number, startChar: number, endLine: number, endChar: number) {
  return { start: pos(startLine, startChar), end: pos(endLine, endChar) };
}

function textEdit(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
  newText: string
): LspTextEdit {
  return { range: range(startLine, startChar, endLine, endChar), newText };
}

// ---------------------------------------------------------------------------
// isTextEdit
// ---------------------------------------------------------------------------

describe("isTextEdit", () => {
  it("returns true for a valid TextEdit", () => {
    expect(isTextEdit(textEdit(0, 0, 0, 5, "hello"))).toBe(true);
  });

  it("returns false for InsertReplaceEdit (has insert/replace instead of range)", () => {
    expect(isTextEdit({ newText: "x", insert: range(0, 0, 0, 1), replace: range(0, 0, 0, 2) })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTextEdit(null)).toBe(false);
  });

  it("returns false for plain string", () => {
    expect(isTextEdit("hello")).toBe(false);
  });

  it("returns false when range is missing", () => {
    expect(isTextEdit({ newText: "x" })).toBe(false);
  });

  it("returns false when newText is missing", () => {
    expect(isTextEdit({ range: range(0, 0, 0, 1) })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInsertReplaceEdit
// ---------------------------------------------------------------------------

describe("isInsertReplaceEdit", () => {
  it("returns true for valid InsertReplaceEdit", () => {
    const edit = { newText: "foo", insert: range(0, 0, 0, 3), replace: range(0, 0, 0, 5) };
    expect(isInsertReplaceEdit(edit)).toBe(true);
  });

  it("returns false for plain TextEdit", () => {
    expect(isInsertReplaceEdit(textEdit(0, 0, 0, 3, "foo"))).toBe(false);
  });

  it("returns false when insert is missing", () => {
    expect(isInsertReplaceEdit({ newText: "x", replace: range(0, 0, 0, 1) })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isInsertReplaceEdit(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCompletionList
// ---------------------------------------------------------------------------

describe("isCompletionList", () => {
  it("returns true for a valid completion list", () => {
    expect(isCompletionList({ items: [{ label: "foo" }] })).toBe(true);
  });

  it("returns true for an empty items array", () => {
    expect(isCompletionList({ items: [] })).toBe(true);
  });

  it("returns true with isIncomplete flag", () => {
    expect(isCompletionList({ isIncomplete: true, items: [] })).toBe(true);
  });

  it("returns false when items is missing", () => {
    expect(isCompletionList({ isIncomplete: false })).toBe(false);
  });

  it("returns false for an array (not a list object)", () => {
    expect(isCompletionList([{ label: "foo" }])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCompletionList(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseLsDiagnosticsEvent
// ---------------------------------------------------------------------------

describe("parseLsDiagnosticsEvent", () => {
  it("parses a valid diagnostics event", () => {
    const input = {
      uri: "file:///proj/Main.java",
      diagnostics: [
        { range: range(0, 0, 0, 5), severity: 1, message: "undefined variable" }
      ]
    };
    const result = parseLsDiagnosticsEvent(input);
    expect(result).not.toBeNull();
    expect(result!.uri).toBe("file:///proj/Main.java");
    expect(result!.diagnostics).toHaveLength(1);
    expect(result!.diagnostics[0]!.message).toBe("undefined variable");
  });

  it("parses event with empty diagnostics array", () => {
    const result = parseLsDiagnosticsEvent({ uri: "file:///a.java", diagnostics: [] });
    expect(result).not.toBeNull();
    expect(result!.diagnostics).toHaveLength(0);
  });

  it("converts null severity to undefined", () => {
    const input = { uri: "file:///a.java", diagnostics: [{ range: range(0, 0, 0, 1), severity: null, message: "x" }] };
    const result = parseLsDiagnosticsEvent(input);
    expect(result!.diagnostics[0]!.severity).toBeUndefined();
  });

  it("returns null for invalid input", () => {
    expect(parseLsDiagnosticsEvent({ uri: "x" })).toBeNull();
    expect(parseLsDiagnosticsEvent(null)).toBeNull();
    expect(parseLsDiagnosticsEvent("not an object")).toBeNull();
  });

  it("ignores unknown extra fields (loose schema)", () => {
    const input = { uri: "file:///a.java", diagnostics: [], extraField: true };
    expect(parseLsDiagnosticsEvent(input)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeCompletionResponse
// ---------------------------------------------------------------------------

describe("normalizeCompletionResponse", () => {
  it("returns items from a CompletionList object", () => {
    const result = normalizeCompletionResponse({ items: [{ label: "foo" }, { label: "bar" }] });
    expect(result.items).toHaveLength(2);
    expect(result.isIncomplete).toBe(false);
  });

  it("passes isIncomplete flag from CompletionList", () => {
    const result = normalizeCompletionResponse({ isIncomplete: true, items: [] });
    expect(result.isIncomplete).toBe(true);
  });

  it("returns items from a bare array", () => {
    const result = normalizeCompletionResponse([{ label: "foo" }, { label: "bar" }]);
    expect(result.items).toHaveLength(2);
    expect(result.isIncomplete).toBe(false);
  });

  it("filters invalid items from bare array", () => {
    const result = normalizeCompletionResponse([{ label: "ok" }, null, "bad", { label: 42 }]);
    expect(result.items).toHaveLength(1);
  });

  it("returns empty items for null", () => {
    const result = normalizeCompletionResponse(null);
    expect(result.items).toHaveLength(0);
    expect(result.isIncomplete).toBe(false);
  });

  it("returns empty items for empty object", () => {
    expect(normalizeCompletionResponse({}).items).toHaveLength(0);
  });

  it("accepts label as object with label field", () => {
    const result = normalizeCompletionResponse({ items: [{ label: { label: "foo", detail: "Bar" } }] });
    expect(result.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// toFileUri
// ---------------------------------------------------------------------------

describe("toFileUri", () => {
  it("converts Unix absolute path to file URI", () => {
    expect(toFileUri("/home/user/project/Main.java")).toBe("file:///home/user/project/Main.java");
  });

  it("converts Windows drive path to file URI", () => {
    expect(toFileUri("C:\\Projects\\Main.java")).toBe("file:///C:/Projects/Main.java");
  });

  it("converts Windows drive path with forward slashes", () => {
    expect(toFileUri("C:/Projects/Main.java")).toBe("file:///C:/Projects/Main.java");
  });

  it("converts UNC path to file URI", () => {
    expect(toFileUri("\\\\server\\share\\proj\\Main.java")).toBe("file://server/share/proj/Main.java");
  });

  it("strips Windows extended path prefix \\\\?\\", () => {
    expect(toFileUri("\\\\?\\C:\\Projects\\Main.java")).toBe("file:///C:/Projects/Main.java");
  });

  it("strips Windows extended UNC prefix \\\\?\\UNC\\", () => {
    expect(toFileUri("\\\\?\\UNC\\server\\share\\file.java")).toBe("file://server/share/file.java");
  });

  it("percent-encodes spaces in path", () => {
    expect(toFileUri("/home/user/my project/Main.java")).toBe("file:///home/user/my%20project/Main.java");
  });

  it("percent-encodes # in path", () => {
    expect(toFileUri("/proj/file#1.java")).toBe("file:///proj/file%231.java");
  });

  it("percent-encodes ? in path", () => {
    expect(toFileUri("/proj/file?name.java")).toBe("file:///proj/file%3Fname.java");
  });
});

// ---------------------------------------------------------------------------
// sortTextEditsDescending
// ---------------------------------------------------------------------------

describe("sortTextEditsDescending", () => {
  it("sorts by start line descending", () => {
    const edits = [
      textEdit(0, 0, 0, 1, "a"),
      textEdit(2, 0, 2, 1, "c"),
      textEdit(1, 0, 1, 1, "b"),
    ];
    edits.sort(sortTextEditsDescending);
    expect(edits[0]!.range.start.line).toBe(2);
    expect(edits[1]!.range.start.line).toBe(1);
    expect(edits[2]!.range.start.line).toBe(0);
  });

  it("sorts by start character descending when lines are equal", () => {
    const edits = [
      textEdit(5, 3, 5, 5, "a"),
      textEdit(5, 10, 5, 12, "b"),
      textEdit(5, 0, 5, 2, "c"),
    ];
    edits.sort(sortTextEditsDescending);
    expect(edits[0]!.range.start.character).toBe(10);
    expect(edits[1]!.range.start.character).toBe(3);
    expect(edits[2]!.range.start.character).toBe(0);
  });

  it("preserves relative order of edits at identical positions", () => {
    const a = textEdit(1, 5, 1, 5, "x");
    const b = textEdit(1, 5, 1, 5, "y");
    expect(sortTextEditsDescending(a, b)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyTextEdits
// ---------------------------------------------------------------------------

describe("applyTextEdits", () => {
  it("returns original text when edits array is empty", () => {
    expect(applyTextEdits("hello", [])).toBe("hello");
  });

  it("inserts text at the beginning (zero-length range)", () => {
    expect(applyTextEdits("world", [textEdit(0, 0, 0, 0, "hello ")])).toBe("hello world");
  });

  it("replaces a word on a single line", () => {
    expect(applyTextEdits("int x = 0;", [textEdit(0, 4, 0, 5, "myVar")])).toBe("int myVar = 0;");
  });

  it("deletes a range (empty newText)", () => {
    expect(applyTextEdits("hello world", [textEdit(0, 5, 0, 11, "")])).toBe("hello");
  });

  it("applies a multi-line replacement", () => {
    const source = "line1\nline2\nline3";
    const result = applyTextEdits(source, [textEdit(1, 0, 1, 5, "replaced")]);
    expect(result).toBe("line1\nreplaced\nline3");
  });

  it("applies multiple non-overlapping edits in reverse order", () => {
    // Replace 'foo' on line 0 and 'bar' on line 1 — must apply bottom-up
    const source = "foo\nbar";
    const result = applyTextEdits(source, [
      textEdit(0, 0, 0, 3, "FOO"),
      textEdit(1, 0, 1, 3, "BAR"),
    ]);
    expect(result).toBe("FOO\nBAR");
  });

  it("applies edits that add newlines", () => {
    const source = "a b";
    const result = applyTextEdits(source, [textEdit(0, 1, 0, 2, "\n")]);
    expect(result).toBe("a\nb");
  });

  it("replaces across multiple lines", () => {
    const source = "start\nmiddle\nend";
    // Replace 'middle' (line 1 chars 0-6) with nothing
    const result = applyTextEdits(source, [textEdit(1, 0, 1, 6, "X")]);
    expect(result).toBe("start\nX\nend");
  });

  it("handles edit at the very end of text", () => {
    const source = "hello";
    const result = applyTextEdits(source, [textEdit(0, 5, 0, 5, "!")]);
    expect(result).toBe("hello!");
  });

  it("handles consecutive edits on the same line sorted correctly", () => {
    // Two replacements on line 0: char 0-3 and char 4-7
    const source = "foo bar baz";
    const result = applyTextEdits(source, [
      textEdit(0, 0, 0, 3, "AAA"),
      textEdit(0, 4, 0, 7, "BBB"),
    ]);
    expect(result).toBe("AAA BBB baz");
  });

  it("applies format-style edits to a multi-line Java snippet", () => {
    const source = "class Foo{\nvoid m(){}\n}";
    // Insert space before { on class line
    const result = applyTextEdits(source, [textEdit(0, 9, 0, 9, " ")]);
    expect(result).toBe("class Foo {\nvoid m(){}\n}");
  });
});
