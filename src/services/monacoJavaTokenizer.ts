import { conf as javaLanguageConf, language as javaMonarchLanguage } from "monaco-editor/esm/vs/basic-languages/java/java";
import type * as Monaco from "monaco-editor";

let javaTokenizerRegistered = false;

const JAVA_REFERENCE_TYPE_PATTERN =
  "(?:[A-Z_$][\\w$]*|(?:[a-z_][\\w$]*\\.)+[A-Z_$][\\w$]*)";
const JAVA_PRIMITIVE_OR_VAR_TYPE_PATTERN =
  "(?:var|void|boolean|byte|short|int|long|float|double|char)";
// Keep this broad so nested generic declarations like Map<String, List<Integer>>
// are still treated as type declarations by the tokenizer.
const JAVA_GENERIC_SUFFIX_PATTERN = "(?:\\s*<[^\\n;(){}=]+>)?";
const JAVA_ARRAY_SUFFIX_PATTERN = "(?:\\s*\\[\\s*\\])*";
const JAVA_SIMPLE_TYPE_PATTERN =
  `(?:${JAVA_PRIMITIVE_OR_VAR_TYPE_PATTERN}|${JAVA_REFERENCE_TYPE_PATTERN}${JAVA_GENERIC_SUFFIX_PATTERN})`;
const JAVA_TYPE_PATTERN = `${JAVA_SIMPLE_TYPE_PATTERN}${JAVA_ARRAY_SUFFIX_PATTERN}`;

const JAVA_DECLARATION_TOKENIZER_RULES: Monaco.languages.IMonarchLanguageRule[] = [
  [
    /(\b(?:class|interface|enum|record)\b)(\s+)([A-Za-z_$][\w$]*)/,
    ["keyword", "", "identifier"]
  ],
  [
    new RegExp(
      `(^\\s*(?:@\\s*[A-Za-z_$][\\w$]*(?:\\([^\\n)]*\\))?\\s*)*)((?:(?:public|protected|private|static|final|abstract|synchronized|native|strictfp|default)\\s+)*)(?:<[^\\n>{};=]*>\\s+)?(${JAVA_TYPE_PATTERN})(\\s+)([A-Za-z_$][\\w$]*)(\\s*)(\\()`
    ),
    ["", "keyword", "declaration.type", "", "identifier", "", "@brackets"]
  ],
  [
    /(^\s*(?:@\s*[A-Za-z_$][\w$]*(?:\([^\n)]*\))?\s*)*)((?:(?:public|protected|private)\s+)+)([A-Za-z_$][\w$]*)(\s*)(\()/,
    ["", "keyword", "identifier", "", "@brackets"]
  ],
  [
    new RegExp(
      `(^\\s*)((?:(?:public|protected|private|static|final|volatile|transient)\\s+)*)(?:(${JAVA_TYPE_PATTERN})(\\s+)([A-Za-z_$][\\w$]*))(\\s*)(?=[=;,)])`
    ),
    ["", "keyword", "declaration.type", "", "", ""]
  ],
  [
    new RegExp(
      `(^\\s*)((?:(?:public|protected|private|static|final|volatile|transient)\\s+)*)(?:(${JAVA_SIMPLE_TYPE_PATTERN})(\\s+)([A-Za-z_$][\\w$]*))(\\s*)(\\[\\s*\\](?:\\s*\\[\\s*\\])*)(\\s*)(?=[=;,)])`
    ),
    ["", "keyword", "declaration.type", "", "", "", "declaration.type", ""]
  ],
  [
    new RegExp(
      `([,(]\\s*)(${JAVA_TYPE_PATTERN})(\\s+)([A-Za-z_$][\\w$]*)(?=\\s*(?:,|\\)|=))`
    ),
    ["", "declaration.type", "", ""]
  ]
];

const countCapturingGroups = (regex: RegExp): number => {
  const source = regex.source;
  let count = 0;
  let inCharacterClass = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (!char) continue;

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (char === "[") {
      inCharacterClass = true;
      continue;
    }

    if (char === "]") {
      inCharacterClass = false;
      continue;
    }

    if (inCharacterClass || char !== "(") {
      continue;
    }

    const next = source[index + 1] ?? "";
    if (next !== "?") {
      count += 1;
      continue;
    }

    const extension = source[index + 2] ?? "";
    if (extension === ":" || extension === "=" || extension === "!") {
      continue;
    }
    if (extension === "<") {
      const lookbehindMarker = source[index + 3] ?? "";
      if (lookbehindMarker === "=" || lookbehindMarker === "!") {
        continue;
      }
      // `(?<name>...)` named capturing group.
      count += 1;
      continue;
    }

    // Treat unknown `(?...)` forms conservatively as non-capturing.
  }

  return count;
};

const getRegexRuleActionCount = (
  rule: Monaco.languages.IMonarchLanguageRule
): { regex: RegExp; actionCount: number } | null => {
  if (!Array.isArray(rule) || rule.length !== 2) {
    return null;
  }
  const candidate = rule as unknown as [unknown, unknown];
  const [regex, actions] = candidate;
  if (!(regex instanceof RegExp) || !Array.isArray(actions)) {
    return null;
  }
  return { regex, actionCount: actions.length };
};

const sanitizeDeclarationTokenizerRules = (
  rules: Monaco.languages.IMonarchLanguageRule[]
) => {
  const sanitized: Monaco.languages.IMonarchLanguageRule[] = [];
  for (const rule of rules) {
    const actionInfo = getRegexRuleActionCount(rule);
    if (!actionInfo) {
      sanitized.push(rule);
      continue;
    }

    const { regex, actionCount } = actionInfo;
    const groupCount = countCapturingGroups(regex);
    if (groupCount !== actionCount) {
      // Prevent runtime tokenizer crashes by dropping malformed custom rules.
      console.error(
        `[monaco] dropped invalid java tokenizer rule (groups=${groupCount}, actions=${actionCount}): ${regex.source}`
      );
      continue;
    }
    sanitized.push(rule);
  }
  return sanitized;
};

export const registerMonacoJavaTokenizer = (monaco: typeof Monaco) => {
  if (javaTokenizerRegistered) {
    return;
  }

  const baseTokenizerRoot = javaMonarchLanguage.tokenizer?.root ?? [];
  const safeDeclarationRules = sanitizeDeclarationTokenizerRules(
    JAVA_DECLARATION_TOKENIZER_RULES
  );
  const tokenizer = {
    ...javaMonarchLanguage.tokenizer,
    root: [...safeDeclarationRules, ...baseTokenizerRoot]
  };

  monaco.languages.setLanguageConfiguration("java", javaLanguageConf);
  try {
    monaco.languages.setMonarchTokensProvider("java", {
      ...javaMonarchLanguage,
      tokenizer
    });
    // Smoke test representative declaration patterns so invalid rules fail fast
    // and do not blank the app at runtime when opening a Java class.
    monaco.editor.tokenize("public class Demo {}", "java");
    monaco.editor.tokenize(
      "public int test(int min, int max) { return (int) Math.random(); }",
      "java"
    );
    monaco.editor.tokenize("@Override public void run() {}", "java");
    monaco.editor.tokenize("private int[][] values;", "java");
  } catch (error) {
    console.error("[monaco] failed to register custom java tokenizer, falling back", error);
    monaco.languages.setMonarchTokensProvider("java", javaMonarchLanguage);
  }

  javaTokenizerRegistered = true;
};
