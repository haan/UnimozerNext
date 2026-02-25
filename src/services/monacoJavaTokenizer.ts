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
    ["", "keyword", "declaration.type", "", "", "", "declaration.type", "", ""]
  ],
  [
    new RegExp(
      `([,(]\\s*)(${JAVA_TYPE_PATTERN})(\\s+)([A-Za-z_$][\\w$]*)(?=\\s*(?:,|\\)|=))`
    ),
    ["", "declaration.type", "", ""]
  ]
];

export const registerMonacoJavaTokenizer = (monaco: typeof Monaco) => {
  if (javaTokenizerRegistered) {
    return;
  }

  const baseTokenizerRoot = javaMonarchLanguage.tokenizer?.root ?? [];
  const tokenizer = {
    ...javaMonarchLanguage.tokenizer,
    root: [...JAVA_DECLARATION_TOKENIZER_RULES, ...baseTokenizerRoot]
  };

  monaco.languages.setLanguageConfiguration("java", javaLanguageConf);
  monaco.languages.setMonarchTokensProvider("java", {
    ...javaMonarchLanguage,
    tokenizer
  });

  javaTokenizerRegistered = true;
};
