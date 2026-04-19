import { describe, it, expect } from "vitest";
import {
  computeScopeLineInfo,
  shouldRefreshScopeForContentChanges,
} from "../scopeHighlighting";
import type { ScopeLineInfo } from "../scopeHighlighting";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(source: string) {
  return computeScopeLineInfo(source);
}

function line(source: string, index = 0): ScopeLineInfo {
  return computeScopeLineInfo(source)[index]!;
}

// ---------------------------------------------------------------------------
// Line count
// ---------------------------------------------------------------------------

describe("line count", () => {
  it("single line with no newline produces one entry", () => {
    expect(lines("int x = 0;")).toHaveLength(1);
  });

  it("two lines produce two entries", () => {
    expect(lines("int x = 0;\nint y = 1;")).toHaveLength(2);
  });

  it("CRLF line endings count as one line each", () => {
    expect(lines("a\r\nb")).toHaveLength(2);
  });

  it("empty string produces one (empty) entry", () => {
    expect(lines("")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Depth tracking
// ---------------------------------------------------------------------------

describe("depth tracking", () => {
  it("startDepth is 0 for the first line", () => {
    expect(line("public class Foo {")).toMatchObject({ startDepth: 0 });
  });

  it("class body line starts at depth 1", () => {
    const src = "public class Foo {\n    int x = 0;\n}";
    expect(lines(src)[1]).toMatchObject({ startDepth: 1 });
  });

  it("method body inside class starts at depth 2", () => {
    const src = "class Foo {\n    void m() {\n        int x;\n    }\n}";
    // line 0: class Foo {   depth 0→1
    // line 1: void m() {   depth 1→2
    // line 2: int x;       depth 2
    expect(lines(src)[2]).toMatchObject({ startDepth: 2 });
  });

  it("closing brace line starts at the pre-close depth", () => {
    // The } line starts at depth 1 (before the } is processed)
    const src = "class Foo {\n}";
    expect(lines(src)[1]).toMatchObject({ startDepth: 1, leadingCloseCount: 1 });
  });

  it("depth never goes below 0", () => {
    const result = lines("}}}");
    expect(result[0]!.startDepth).toBe(0);
  });

  it("triple-nested if reaches depth 3 inside class+method", () => {
    const src = [
      "class C {",        // 0→1
      "  void m() {",     // 1→2
      "    if (a) {",     // 2→3
      "      x++;",       // 3
      "    }",            // 3→2
      "  }",              // 2→1
      "}",                // 1→0
    ].join("\n");
    expect(lines(src)[3]).toMatchObject({ startDepth: 3 });
  });
});

// ---------------------------------------------------------------------------
// openCount / closeCount
// ---------------------------------------------------------------------------

describe("openCount and closeCount", () => {
  it("line with { increments openCount", () => {
    expect(line("class Foo {")).toMatchObject({ openCount: 1, closeCount: 0 });
  });

  it("line with } increments closeCount", () => {
    expect(line("}")).toMatchObject({ openCount: 0, closeCount: 1 });
  });

  it("line with both { and } on same line counts each", () => {
    expect(line("} else {")).toMatchObject({ openCount: 1, closeCount: 1 });
  });

  it("blank line has zero counts", () => {
    expect(line("")).toMatchObject({ openCount: 0, closeCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// leadingCloseCount
// ---------------------------------------------------------------------------

describe("leadingCloseCount", () => {
  it("leading } is counted", () => {
    expect(line("}")).toMatchObject({ leadingCloseCount: 1 });
  });

  it("} after code is not leading", () => {
    // "} else {" — the } comes first, so it IS leading
    expect(line("} else {")).toMatchObject({ leadingCloseCount: 1 });
  });

  it("} after non-whitespace on same line is not leading", () => {
    // e.g. "int[] a = new int[]{};" — the } follows code
    expect(line("int[] a = new int[]{};")).toMatchObject({ leadingCloseCount: 0 });
  });

  it("two leading closing braces", () => {
    const src = "class C {\n  void m() {\n    if (x) {\n    }\n  }\n}";
    // Last two lines: "  }" and "}" — each has leadingCloseCount 1
    const result = lines(src);
    expect(result[result.length - 2]).toMatchObject({ leadingCloseCount: 1 });
    expect(result[result.length - 1]).toMatchObject({ leadingCloseCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// Braces inside strings — from HighlightCases.java mixedControl()
// ---------------------------------------------------------------------------

describe("braces inside string literals", () => {
  it("braces in string literal are not counted (HighlightCases.java line 58)", () => {
    expect(line('    String bracesInString = "{ not a real block }";'))
      .toMatchObject({ openCount: 0, closeCount: 0, hasCodeToken: true });
  });

  it("brace in char literal is not counted (HighlightCases.java line 59)", () => {
    expect(line("    char openBrace = '{';"))
      .toMatchObject({ openCount: 0, closeCount: 0, hasCodeToken: true });
  });

  it("escaped quote inside string does not end the string early", () => {
    // If the \" were treated as end-of-string, the { after it would be counted
    expect(line('String s = "say \\"hello\\" { not a brace }";'))
      .toMatchObject({ openCount: 0, closeCount: 0 });
  });

  it("escaped backslash followed by quote closes the string correctly", () => {
    // "\\" is an escaped backslash; the " after it closes the string
    // so { after the string IS real
    expect(line('String s = "path\\\\"; int x = {'))
      .toMatchObject({ openCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// Braces inside comments
// ---------------------------------------------------------------------------

describe("braces inside line comments", () => {
  it("braces after // are not counted (HighlightCases.java line 61)", () => {
    expect(line("        // Use next level color for control structure line."))
      .toMatchObject({ openCount: 0, closeCount: 0, hasCommentToken: true, hasCodeToken: false });
  });

  it("line comment with brace has hasCommentToken=true", () => {
    expect(line("// { brace in comment }"))
      .toMatchObject({ hasCommentToken: true, openCount: 0 });
  });
});

describe("braces inside block comments", () => {
  it("block comment opening line has hasCommentToken=true", () => {
    const result = lines("/*\n * { brace }\n */");
    expect(result[0]).toMatchObject({ hasCommentToken: true, openCount: 0 });
  });

  it("block comment body line has hasCommentToken=true, no brace counted", () => {
    const result = lines("/*\n * { brace }\n */");
    expect(result[1]).toMatchObject({ hasCommentToken: true, openCount: 0, closeCount: 0 });
  });

  it("block comment closing line has hasCommentToken=true", () => {
    const result = lines("/*\n * text\n */");
    expect(result[2]).toMatchObject({ hasCommentToken: true });
  });

  it("code after block comment on same line is processed", () => {
    // "/* c */ {" — block comment ends, then { is real code
    expect(line("/* c */ {")).toMatchObject({ openCount: 1, hasCommentToken: true });
  });
});

// ---------------------------------------------------------------------------
// Javadoc comments (block comment variant)
// ---------------------------------------------------------------------------

describe("Javadoc comments", () => {
  it("/** line is treated as block comment", () => {
    expect(line("/**")).toMatchObject({ hasCommentToken: true, openCount: 0 });
  });

  it("javadoc body lines are comment-only", () => {
    const src = "/**\n * Sequential instructions only.\n */";
    expect(lines(src)[1]).toMatchObject({ hasCommentToken: true, hasCodeToken: false });
  });
});

// ---------------------------------------------------------------------------
// Text blocks (Java """)
// ---------------------------------------------------------------------------

describe("text blocks", () => {
  it("braces inside text block are not counted", () => {
    const src = 'String s = """\n    { not a brace }\n    """;';
    const result = lines(src);
    // All lines should have openCount: 0, closeCount: 0
    for (const l of result) {
      expect(l.openCount).toBe(0);
      expect(l.closeCount).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// hasCodeToken / hasCommentToken flags
// ---------------------------------------------------------------------------

describe("hasCodeToken and hasCommentToken", () => {
  it("blank line has neither token", () => {
    const src = "class Foo {\n\n}";
    expect(lines(src)[1]).toMatchObject({ hasCodeToken: false, hasCommentToken: false });
  });

  it("code-only line has hasCodeToken=true", () => {
    expect(line("int x = 1;")).toMatchObject({ hasCodeToken: true, hasCommentToken: false });
  });

  it("comment-only line has hasCommentToken=true, hasCodeToken=false", () => {
    expect(line("// just a comment")).toMatchObject({ hasCodeToken: false, hasCommentToken: true });
  });

  it("line with code then comment has both flags", () => {
    expect(line("int x = 1; // comment")).toMatchObject({ hasCodeToken: true, hasCommentToken: true });
  });
});

// ---------------------------------------------------------------------------
// Full method from HighlightCases.java: mixedControl()
// Verifies the combined effect of strings, char literals, and control flow
// ---------------------------------------------------------------------------

describe("HighlightCases.java — mixedControl() key lines", () => {
  const METHOD = [
    "    public int mixedControl(int value) {",   // 0: depth 1 → 2
    '        String bracesInString = "{ not a real block }";', // 1: depth 2, no brace counts
    "        char openBrace = '{';",               // 2: depth 2, no brace counts
    "        if (value < 0) {",                   // 3: depth 2 → 3
    "            // Use next level color for control structure line.", // 4: comment only
    "            return -value + bracesInString.length() + openBrace;", // 5: depth 3
    "        }",                                  // 6: depth 3 → 2, leading close
    "    }",                                      // last: depth 2 → 1, leading close
  ].join("\n");

  const result = computeScopeLineInfo(METHOD);

  it("method signature line opens one brace", () => {
    // Fragment starts at depth 0 (no class wrapper)
    expect(result[0]).toMatchObject({ openCount: 1, closeCount: 0, startDepth: 0 });
  });

  it("string-with-braces line has no brace counts", () => {
    expect(result[1]).toMatchObject({ openCount: 0, closeCount: 0, startDepth: 1 });
  });

  it("char-literal-with-brace line has no brace counts", () => {
    expect(result[2]).toMatchObject({ openCount: 0, closeCount: 0, startDepth: 1 });
  });

  it("if-block line opens one brace", () => {
    expect(result[3]).toMatchObject({ openCount: 1, startDepth: 1 });
  });

  it("inline comment line is comment-only", () => {
    expect(result[4]).toMatchObject({ hasCommentToken: true, hasCodeToken: false, openCount: 0 });
  });

  it("closing brace of if block has leadingCloseCount=1", () => {
    expect(result[6]).toMatchObject({ leadingCloseCount: 1, closeCount: 1, startDepth: 2 });
  });
});

// ---------------------------------------------------------------------------
// Full class from HighlightCommentPlayground.java
// Verifies block comments between control structures
// ---------------------------------------------------------------------------

describe("HighlightCommentPlayground.java — parseAndCount() key lines", () => {
  const SOURCE = [
    "/**",                                          //  0: javadoc open
    " * Comment stress sample.",                   //  1: javadoc body
    " */",                                          //  2: javadoc close
    "public class HighlightCommentPlayground {",   //  3: depth 0→1
    "",                                             //  4: blank
    "    /**",                                      //  5: method javadoc
    "     * Javadoc should align with following block color.", // 6
    "     */",                                      //  7
    "    public int parseAndCount(String input) {", //  8: depth 1→2
    "        // inline comment on a white sequential line", // 9: comment
    "        int count = 0;",                       // 10: depth 2
    "",                                             // 11: blank
    "        /*",                                   // 12: block comment open
    "         * Regular block comments should not affect brace depth.", // 13
    "         */",                                  // 14: block comment close
    "        if (input == null || input.isEmpty()) {", // 15: depth 2→3
    "            return 0;",                        // 16: depth 3
    "        }",                                    // 17: depth 3→2, leading close
    "    }",                                        // 18: depth 2→1, leading close
    "}",                                            // 19: depth 1→0, leading close
  ].join("\n");

  const result = computeScopeLineInfo(SOURCE);

  it("javadoc lines have no brace counts", () => {
    expect(result[0]).toMatchObject({ openCount: 0, hasCommentToken: true });
    expect(result[1]).toMatchObject({ openCount: 0, hasCommentToken: true });
    expect(result[2]).toMatchObject({ openCount: 0, hasCommentToken: true });
  });

  it("class declaration opens one brace at depth 0", () => {
    expect(result[3]).toMatchObject({ startDepth: 0, openCount: 1 });
  });

  it("blank line inside class has no tokens", () => {
    expect(result[4]).toMatchObject({ hasCodeToken: false, hasCommentToken: false });
  });

  it("method declaration opens one brace at depth 1", () => {
    expect(result[8]).toMatchObject({ startDepth: 1, openCount: 1 });
  });

  it("inline comment line is comment-only at depth 2", () => {
    expect(result[9]).toMatchObject({ startDepth: 2, hasCommentToken: true, hasCodeToken: false });
  });

  it("block comment lines have no brace counts", () => {
    expect(result[12]).toMatchObject({ hasCommentToken: true, openCount: 0 });
    expect(result[13]).toMatchObject({ hasCommentToken: true, openCount: 0 });
    expect(result[14]).toMatchObject({ hasCommentToken: true, openCount: 0 });
  });

  it("if statement after block comment is at depth 2", () => {
    expect(result[15]).toMatchObject({ startDepth: 2, openCount: 1 });
  });

  it("closing braces have correct leadingCloseCount and startDepth", () => {
    expect(result[17]).toMatchObject({ leadingCloseCount: 1, startDepth: 3 }); // closes if
    expect(result[18]).toMatchObject({ leadingCloseCount: 1, startDepth: 2 }); // closes method
    expect(result[19]).toMatchObject({ leadingCloseCount: 1, startDepth: 1 }); // closes class
  });
});

// ---------------------------------------------------------------------------
// shouldRefreshScopeForContentChanges
// ---------------------------------------------------------------------------

describe("shouldRefreshScopeForContentChanges", () => {
  const refresh = (changes: { rangeLength: number; text: string }[]) =>
    shouldRefreshScopeForContentChanges({ changes });

  it("returns false for empty changes", () => {
    expect(refresh([])).toBe(false);
  });

  it("returns true when a character was deleted (rangeLength > 0)", () => {
    expect(refresh([{ rangeLength: 1, text: "" }])).toBe(true);
  });

  it("returns true when { is inserted", () => {
    expect(refresh([{ rangeLength: 0, text: "{" }])).toBe(true);
  });

  it("returns true when } is inserted", () => {
    expect(refresh([{ rangeLength: 0, text: "}" }])).toBe(true);
  });

  it('returns true when " is inserted', () => {
    expect(refresh([{ rangeLength: 0, text: '"' }])).toBe(true);
  });

  it("returns true when newline is inserted", () => {
    expect(refresh([{ rangeLength: 0, text: "\n" }])).toBe(true);
  });

  it("returns false for regular letter insert", () => {
    expect(refresh([{ rangeLength: 0, text: "a" }])).toBe(false);
  });

  it("returns false for digit insert", () => {
    expect(refresh([{ rangeLength: 0, text: "5" }])).toBe(false);
  });

  it("returns true if any change in a batch triggers refresh", () => {
    expect(refresh([
      { rangeLength: 0, text: "a" },
      { rangeLength: 0, text: "{" },
    ])).toBe(true);
  });
});
