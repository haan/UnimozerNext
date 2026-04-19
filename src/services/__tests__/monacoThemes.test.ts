import { describe, it, expect } from "vitest";
import type * as Monaco from "monaco-editor";
import {
  normalizeColor,
  matchesRuleToken,
  findRuleColor,
  upsertRuleColor,
  sanitizeThemeRules,
  resolveMonacoTheme,
} from "../monacoThemes";

type ThemeRule = Monaco.editor.ITokenThemeRule;

// ---------------------------------------------------------------------------
// normalizeColor
// ---------------------------------------------------------------------------

describe("normalizeColor", () => {
  it("returns null for undefined", () => {
    expect(normalizeColor(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(normalizeColor(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeColor("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeColor("   ")).toBeNull();
  });

  it("returns null for non-hex string", () => {
    expect(normalizeColor("red")).toBeNull();
  });

  it("returns null for invalid hex length", () => {
    expect(normalizeColor("#12345")).toBeNull();
  });

  it("expands 3-digit hex to 6-digit with # prefix", () => {
    expect(normalizeColor("#abc")).toBe("#aabbcc");
  });

  it("expands 3-digit hex without # prefix", () => {
    expect(normalizeColor("abc")).toBe("#aabbcc");
  });

  it("expands 4-digit hex to 8-digit with # prefix", () => {
    expect(normalizeColor("#abcd")).toBe("#aabbccdd");
  });

  it("returns 6-digit hex unchanged (lowercased)", () => {
    expect(normalizeColor("#AABBCC")).toBe("#aabbcc");
  });

  it("returns 6-digit hex without # prefix with # added", () => {
    expect(normalizeColor("aabbcc")).toBe("#aabbcc");
  });

  it("returns 8-digit hex with # prefix", () => {
    expect(normalizeColor("#aabbccdd")).toBe("#aabbccdd");
  });

  it("lowercases the result", () => {
    expect(normalizeColor("#FFFFFF")).toBe("#ffffff");
  });

  it("trims whitespace before processing", () => {
    expect(normalizeColor("  #fff  ")).toBe("#ffffff");
  });
});

// ---------------------------------------------------------------------------
// matchesRuleToken
// ---------------------------------------------------------------------------

describe("matchesRuleToken", () => {
  it("exact match returns true", () => {
    expect(matchesRuleToken("keyword", "keyword")).toBe(true);
  });

  it("rule starts with 'candidate.' returns true", () => {
    expect(matchesRuleToken("keyword.control", "keyword")).toBe(true);
  });

  it("rule ends with '.candidate' returns true", () => {
    expect(matchesRuleToken("entity.name.type", "type")).toBe(true);
  });

  it("rule contains '.candidate.' returns true", () => {
    expect(matchesRuleToken("entity.name.type.class", "type")).toBe(true);
  });

  it("no match returns false", () => {
    expect(matchesRuleToken("storage.modifier", "keyword")).toBe(false);
  });

  it("partial word match without dot boundary returns false", () => {
    expect(matchesRuleToken("keywords", "keyword")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findRuleColor
// ---------------------------------------------------------------------------

describe("findRuleColor", () => {
  it("returns null for empty rules array", () => {
    expect(findRuleColor([], ["keyword"])).toBeNull();
  });

  it("returns null for empty candidates array", () => {
    expect(findRuleColor([{ token: "keyword", foreground: "0000ff" }], [])).toBeNull();
  });

  it("finds exact token match and returns normalized color", () => {
    const rules = [{ token: "keyword", foreground: "0000ff" }];
    expect(findRuleColor(rules, ["keyword"])).toBe("#0000ff");
  });

  it("first candidate wins when multiple candidates match", () => {
    const rules = [
      { token: "keyword.control", foreground: "ff0000" },
      { token: "keyword", foreground: "0000ff" },
    ];
    expect(findRuleColor(rules, ["keyword", "keyword.control"])).toBe("#0000ff");
  });

  it("falls back to partial token match when no exact match", () => {
    const rules = [{ token: "keyword.control", foreground: "ff0000" }];
    expect(findRuleColor(rules, ["keyword"])).toBe("#ff0000");
  });

  it("returns null when no token matches any candidate", () => {
    const rules = [{ token: "storage.modifier", foreground: "aaaaaa" }];
    expect(findRuleColor(rules, ["keyword"])).toBeNull();
  });

  it("skips rules without a foreground color", () => {
    const rules = [
      { token: "keyword" },
      { token: "keyword.control", foreground: "00ff00" },
    ];
    expect(findRuleColor(rules, ["keyword"])).toBe("#00ff00");
  });

  it("is case-insensitive for candidate matching", () => {
    const rules = [{ token: "KEYWORD", foreground: "0000ff" }];
    expect(findRuleColor(rules, ["keyword"])).toBe("#0000ff");
  });
});

// ---------------------------------------------------------------------------
// upsertRuleColor
// ---------------------------------------------------------------------------

describe("upsertRuleColor", () => {
  it("adds a new rule when token not present", () => {
    const rules: ThemeRule[] = [];
    upsertRuleColor(rules, "keyword", "#0000ff");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ token: "keyword", foreground: "0000ff" });
  });

  it("updates existing rule foreground when token matches", () => {
    const rules = [{ token: "keyword", foreground: "aaaaaa" }];
    upsertRuleColor(rules, "keyword", "#0000ff");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.foreground).toBe("0000ff");
  });

  it("does not add rule when color is invalid", () => {
    const rules: ThemeRule[] = [];
    upsertRuleColor(rules, "keyword", "not-a-color");
    expect(rules).toHaveLength(0);
  });

  it("matches token case-insensitively when updating", () => {
    const rules = [{ token: "KEYWORD", foreground: "aaaaaa" }];
    upsertRuleColor(rules, "keyword", "#0000ff");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.foreground).toBe("0000ff");
  });

  it("stores foreground without # prefix", () => {
    const rules: ThemeRule[] = [];
    upsertRuleColor(rules, "keyword", "#aabbcc");
    expect(rules[0]!.foreground).toBe("aabbcc");
  });
});

// ---------------------------------------------------------------------------
// sanitizeThemeRules
// ---------------------------------------------------------------------------

describe("sanitizeThemeRules", () => {
  it("returns empty array for empty input", () => {
    expect(sanitizeThemeRules([])).toEqual([]);
  });

  it("normalizes 6-digit foreground and strips #", () => {
    const rules = [{ token: "keyword", foreground: "#0000FF" }];
    const result = sanitizeThemeRules(rules);
    expect(result[0]!.foreground).toBe("0000ff");
  });

  it("expands 3-digit foreground and strips #", () => {
    const rules = [{ token: "keyword", foreground: "#00f" }];
    const result = sanitizeThemeRules(rules);
    expect(result[0]!.foreground).toBe("0000ff");
  });

  it("removes foreground when invalid", () => {
    const rules = [{ token: "keyword", foreground: "not-a-color" }];
    const result = sanitizeThemeRules(rules);
    expect("foreground" in result[0]!).toBe(false);
  });

  it("normalizes background the same way", () => {
    const rules = [{ token: "", background: "#FFFFFF" }];
    const result = sanitizeThemeRules(rules);
    expect(result[0]!.background).toBe("ffffff");
  });

  it("removes background when invalid", () => {
    const rules = [{ token: "", background: "invalid" }];
    const result = sanitizeThemeRules(rules);
    expect("background" in result[0]!).toBe(false);
  });

  it("does not mutate the original rules array", () => {
    const original = [{ token: "keyword", foreground: "#0000ff" }];
    sanitizeThemeRules(original);
    expect(original[0]!.foreground).toBe("#0000ff");
  });

  it("preserves non-color fields on the rule", () => {
    const rules = [{ token: "keyword", foreground: "#0000ff", fontStyle: "bold" }];
    const result = sanitizeThemeRules(rules);
    expect(result[0]!.fontStyle).toBe("bold");
  });
});

// ---------------------------------------------------------------------------
// resolveMonacoTheme
// ---------------------------------------------------------------------------

describe("resolveMonacoTheme", () => {
  it("undefined + dark mode → internal dark theme id", () => {
    expect(resolveMonacoTheme(undefined, true)).toMatch(/dark/i);
  });

  it("'default' + dark mode → internal dark theme id", () => {
    expect(resolveMonacoTheme("default", true)).toMatch(/dark/i);
  });

  it("'vs' + dark mode → internal dark theme id", () => {
    expect(resolveMonacoTheme("vs", true)).toMatch(/dark/i);
  });

  it("undefined + light mode → internal light theme id", () => {
    expect(resolveMonacoTheme(undefined, false)).not.toMatch(/dark/i);
  });

  it("'default' + light mode → internal light theme id", () => {
    expect(resolveMonacoTheme("default", false)).not.toMatch(/dark/i);
  });

  it("custom theme id is returned as-is regardless of dark mode", () => {
    expect(resolveMonacoTheme("my-theme", true)).toBe("my-theme");
    expect(resolveMonacoTheme("my-theme", false)).toBe("my-theme");
  });

  it("dark and light resolved ids are different strings", () => {
    expect(resolveMonacoTheme(undefined, true)).not.toBe(resolveMonacoTheme(undefined, false));
  });
});
