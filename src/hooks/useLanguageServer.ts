import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { useMonaco, type Monaco } from "@monaco-editor/react";
import {
  LS_CHANGE_DEBOUNCE_MS,
  LS_DIAGNOSTIC_SEVERITY_ERROR,
  LS_INITIAL_DOCUMENT_VERSION
} from "../constants/languageServer";

import type {
  LsDiagnosticsEvent,
  LspCompletionItem,
  LspCompletionItemLabel,
  LspMarkupContent,
  LspRange,
  LspTextEdit
} from "../services/lsp";
import {
  isInsertReplaceEdit,
  isTextEdit,
  normalizeCompletionResponse,
  toFileUri
} from "../services/lsp";

type LsCrashedEvent = {
  projectRoot: string;
  code?: number | null;
};

type LsReadyEvent = {
  projectRoot?: string;
};

type LsErrorEvent = {
  projectRoot?: string;
};

const COMPLETION_MAX_RESULTS = 60;
const COMPLETION_MAX_RESULTS_SHORT_PREFIX = 400;
const COMPLETION_SHORT_PREFIX_LENGTH = 2;
const COMPLETION_BLOCKED_PREFIXES = ["jdk.", "com.sun.", "sun."] as const;
const COMPLETION_RUNTIME_PACKAGE_PREFIXES = ["java.", "javax.", "jdk.", "sun.", "com.sun."] as const;
const PACKAGE_DECLARATION_REGEX = /^\s*package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;/m;
const SIMPLE_PACKAGE_REGEX = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/;
const QUALIFIED_TYPE_REGEX = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\.([A-Za-z_$][\w$]*)/g;

const toCompletionLabel = (
  label: string | LspCompletionItemLabel
): string | { label: string; detail?: string; description?: string } => {
  if (typeof label === "string") {
    return label;
  }
  return {
    label: label.label,
    detail: label.detail,
    description: label.description
  };
};

const completionLabelText = (label: string | LspCompletionItemLabel): string =>
  typeof label === "string" ? label : label.label;

const completionPrimaryLabel = (label: string | LspCompletionItemLabel): string => {
  const text = completionLabelText(label);
  const withNoType = text.split(" : ")[0] ?? text;
  return withNoType.split(" - ")[0] ?? withNoType;
};

const parseCurrentPackage = (source: string): string | null => {
  const match = PACKAGE_DECLARATION_REGEX.exec(source);
  return (match?.[1] ?? null)?.toLowerCase() ?? null;
};

const parseCurrentClassNameFromUriPath = (uriPath: string): string | null => {
  const decodedPath = (() => {
    try {
      return decodeURIComponent(uriPath);
    } catch {
      return uriPath;
    }
  })();
  const normalizedPath = decodedPath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? "";
  if (!fileName.toLowerCase().endsWith(".java")) {
    return null;
  }
  return fileName.slice(0, -5).toLowerCase();
};

const extractPackageFromCandidate = (
  candidate: string,
  simpleName: string
): string | null => {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const dashedTail = trimmed.includes(" - ")
    ? (trimmed.split(" - ").pop()?.trim() ?? "")
    : "";
  if (dashedTail && SIMPLE_PACKAGE_REGEX.test(dashedTail)) {
    return dashedTail.toLowerCase();
  }

  if (SIMPLE_PACKAGE_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const normalizedSimpleName = simpleName.toLowerCase();
  QUALIFIED_TYPE_REGEX.lastIndex = 0;
  let firstPackage: string | null = null;
  let match = QUALIFIED_TYPE_REGEX.exec(trimmed);
  while (match) {
    const packagePart = (match[1] ?? "").toLowerCase();
    const typePart = (match[2] ?? "").toLowerCase();
    if (!firstPackage && packagePart) {
      firstPackage = packagePart;
    }
    if (packagePart && normalizedSimpleName && typePart === normalizedSimpleName) {
      return packagePart;
    }
    match = QUALIFIED_TYPE_REGEX.exec(trimmed);
  }

  return firstPackage;
};

const completionItemPackage = (item: LspCompletionItem): string | null => {
  const simpleName = completionPrimaryLabel(item.label);
  const candidates = [
    completionLabelText(item.label),
    item.detail,
    item.filterText,
    item.insertText
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    const parsedPackage = extractPackageFromCandidate(candidate, simpleName);
    if (parsedPackage) {
      return parsedPackage;
    }
  }
  return null;
};

const isRuntimePackage = (packageName: string): boolean =>
  COMPLETION_RUNTIME_PACKAGE_PREFIXES.some((prefix) => packageName.startsWith(prefix));

const completionItemRelevanceRank = (
  item: LspCompletionItem,
  currentPackage: string | null,
  currentClassName: string | null
): number => {
  const labelLower = completionPrimaryLabel(item.label).toLowerCase();
  const rawLabelLower = completionLabelText(item.label).toLowerCase();
  const itemPackage = completionItemPackage(item);

  if (
    rawLabelLower.startsWith("this.") ||
    labelLower.startsWith("this.") ||
    (currentClassName !== null && labelLower === currentClassName)
  ) {
    return 0;
  }

  if (currentPackage !== null && itemPackage === currentPackage) {
    return 1;
  }

  if (itemPackage === null || !isRuntimePackage(itemPackage)) {
    return 2;
  }

  if (itemPackage === "java.lang") {
    return 3;
  }
  if (itemPackage === "java.util" || itemPackage.startsWith("java.util.")) {
    return 4;
  }

  return 5;
};

const completionPrefixQuality = (item: LspCompletionItem, prefix: string): number => {
  if (!prefix) return 2;
  const primary = completionPrimaryLabel(item.label).trim().toLowerCase();
  if (primary === prefix) return 0;
  if (primary.startsWith(prefix)) return 1;
  return 2;
};

const compareCompletionItems = (
  left: LspCompletionItem,
  right: LspCompletionItem,
  typedPrefix: string,
  currentPackage: string | null,
  currentClassName: string | null
): number => {
  const rankDiff =
    completionItemRelevanceRank(left, currentPackage, currentClassName) -
    completionItemRelevanceRank(right, currentPackage, currentClassName);
  if (rankDiff !== 0) return rankDiff;

  const prefixDiff = completionPrefixQuality(left, typedPrefix) - completionPrefixQuality(right, typedPrefix);
  if (prefixDiff !== 0) return prefixDiff;

  const leftSortText = left.sortText ?? "";
  const rightSortText = right.sortText ?? "";
  if (leftSortText !== rightSortText) {
    return leftSortText.localeCompare(rightSortText);
  }

  const leftLabel = completionPrimaryLabel(left.label).toLowerCase();
  const rightLabel = completionPrimaryLabel(right.label).toLowerCase();
  if (leftLabel.length !== rightLabel.length) {
    return leftLabel.length - rightLabel.length;
  }
  return leftLabel.localeCompare(rightLabel);
};

const completionCandidateMatchesPrefix = (candidate: string, prefix: string): boolean => {
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith(prefix)) return true;

  const withoutThis = normalized.startsWith("this.") ? normalized.slice(5) : normalized;
  if (withoutThis.startsWith(prefix)) return true;

  const lastDot = normalized.lastIndexOf(".");
  if (lastDot >= 0 && normalized.slice(lastDot + 1).startsWith(prefix)) return true;

  return false;
};

const completionItemMatchesPrefix = (
  item: LspCompletionItem,
  prefix: string
): boolean => {
  if (!prefix) return true;

  const candidates = [
    completionPrimaryLabel(item.label),
    completionLabelText(item.label),
    item.filterText,
    item.insertText
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return candidates.some((candidate) => completionCandidateMatchesPrefix(candidate, prefix));
};

const completionItemIsBlocked = (item: LspCompletionItem): boolean => {
  const tokens = [
    completionLabelText(item.label),
    completionPrimaryLabel(item.label),
    item.detail,
    item.filterText,
    item.insertText
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());

  return COMPLETION_BLOCKED_PREFIXES.some((blockedPrefix) =>
    tokens.some((token) => token.includes(blockedPrefix))
  );
};

const completionDocumentation = (
  documentation: string | LspMarkupContent | undefined
): string | undefined => {
  if (!documentation) return undefined;
  if (typeof documentation === "string") return documentation;
  return typeof documentation.value === "string" ? documentation.value : undefined;
};

type MonacoCompletionRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

const toMonacoRange = (range: LspRange) => ({
  startLineNumber: range.start.line + 1,
  startColumn: range.start.character + 1,
  endLineNumber: range.end.line + 1,
  endColumn: range.end.character + 1
});

const monacoRangeContainsPosition = (
  range: MonacoCompletionRange,
  lineNumber: number,
  column: number
): boolean => {
  if (lineNumber < range.startLineNumber || lineNumber > range.endLineNumber) {
    return false;
  }
  if (lineNumber === range.startLineNumber && column < range.startColumn) {
    return false;
  }
  if (lineNumber === range.endLineNumber && column > range.endColumn) {
    return false;
  }
  return true;
};

const mapLspCompletionKind = (
  monacoInstance: Monaco,
  kind: number | undefined
): number => {
  const monacoKinds = monacoInstance.languages.CompletionItemKind;
  switch (kind) {
    case 1:
      return monacoKinds.Text;
    case 2:
      return monacoKinds.Method;
    case 3:
      return monacoKinds.Function;
    case 4:
      return monacoKinds.Constructor;
    case 5:
      return monacoKinds.Field;
    case 6:
      return monacoKinds.Variable;
    case 7:
      return monacoKinds.Class;
    case 8:
      return monacoKinds.Interface;
    case 9:
      return monacoKinds.Module;
    case 10:
      return monacoKinds.Property;
    case 11:
      return monacoKinds.Unit;
    case 12:
      return monacoKinds.Value;
    case 13:
      return monacoKinds.Enum;
    case 14:
      return monacoKinds.Keyword;
    case 15:
      return monacoKinds.Snippet;
    case 16:
      return monacoKinds.Color;
    case 17:
      return monacoKinds.File;
    case 18:
      return monacoKinds.Reference;
    case 19:
      return monacoKinds.Folder;
    case 20:
      return monacoKinds.EnumMember;
    case 21:
      return monacoKinds.Constant;
    case 22:
      return monacoKinds.Struct;
    case 23:
      return monacoKinds.Event;
    case 24:
      return monacoKinds.Operator;
    case 25:
      return monacoKinds.TypeParameter;
    default:
      return monacoKinds.Text;
  }
};

type UseLanguageServerArgs = {
  projectPath: string | null;
  openFilePath: string | null;
  openFileContent: string;
  onDebugLog?: (message: string) => void;
};

type UseLanguageServerResult = {
  monacoRef: RefObject<Monaco | null>;
  lsReadyRef: MutableRefObject<boolean>;
  isLsOpen: (path: string) => boolean;
  notifyLsOpen: (path: string, text: string) => void;
  notifyLsClose: (path: string) => void;
  notifyLsChange: (path: string, text: string) => void;
  notifyLsChangeImmediate: (path: string, text: string) => void;
  resetLsState: () => void;
};

export const useLanguageServer = ({
  projectPath,
  openFilePath,
  openFileContent,
  onDebugLog
}: UseLanguageServerArgs): UseLanguageServerResult => {
  const monaco = useMonaco();
  const monacoRef = useRef<ReturnType<typeof useMonaco> | null>(null);
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null);
  const completionRequestSeqRef = useRef(0);
  const sendLsDidChangeRef = useRef<(path: string, text: string) => Promise<void>>(async () => {});
  const lsOpenRef = useRef<Set<string>>(new Set());
  const lsLastSyncedTextRef = useRef<Record<string, string>>({});
  const lsVersionRef = useRef<Record<string, number>>({});
  const lsGlyphRef = useRef<Record<string, string[]>>({});
  const lsDiagnosticFingerprintRef = useRef<Record<string, string>>({});
  const lsPendingTextRef = useRef<Record<string, string>>({});
  const lsPendingTimerRef = useRef<Record<string, number>>({});
  const prevOpenFileRef = useRef<string | null>(null);
  const latestProjectPathRef = useRef<string | null>(projectPath);
  const latestOpenFilePathRef = useRef<string | null>(openFilePath);
  const latestOpenFileContentRef = useRef(openFileContent);
  const lsReadyRef = useRef(false);
  const completionDebugEnabled = Boolean(onDebugLog);

  const logCompletionDebug = useCallback(
    (message: string) => {
      if (!completionDebugEnabled || !onDebugLog) return;
      onDebugLog(`[LS-Completion] ${new Date().toLocaleTimeString()} ${message}`);
    },
    [completionDebugEnabled, onDebugLog]
  );

  useEffect(() => {
    if (monaco) {
      monacoRef.current = monaco;
    }
  }, [monaco]);

  useEffect(() => {
    const monacoInstance = monacoRef.current;
    if (!monacoInstance) return;

    completionProviderRef.current?.dispose();
    completionProviderRef.current =
      monacoInstance.languages.registerCompletionItemProvider("java", {
        triggerCharacters: ["."],
        provideCompletionItems: async (model, position, context, token) => {
          if (!lsReadyRef.current) {
            logCompletionDebug("skip: language server not ready");
            return { suggestions: [] };
          }
          if (model.uri.scheme !== "file") {
            logCompletionDebug(`skip: non-file uri scheme=${model.uri.scheme}`);
            return { suggestions: [] };
          }

          completionRequestSeqRef.current += 1;
          const requestSeq = completionRequestSeqRef.current;
          const wordUntil = model.getWordUntilPosition(position);
          const typedPrefix = (wordUntil.word ?? "").trim().toLowerCase();
          const monacoTriggerKind =
            typeof context.triggerKind === "number" ? context.triggerKind : undefined;
          // Always request full/invoked completion from JDTLS.
          // Incremental refresh contexts can return a truncated stale subset.
          const lspTriggerKind = 1;

          logCompletionDebug(
            `req#${requestSeq} start monacoKind=${monacoTriggerKind ?? "-"} lspKind=${
              lspTriggerKind ?? "-"
            } prefix="${typedPrefix}" pos=${position.lineNumber}:${position.column} uri=${
              model.uri.path
            }`
          );

          try {
            const currentOpenFilePath = latestOpenFilePathRef.current;
            if (currentOpenFilePath) {
              const modelText = model.getValue();
              const hasPendingText = lsPendingTextRef.current[currentOpenFilePath] !== undefined;
              const hasTextDrift = lsLastSyncedTextRef.current[currentOpenFilePath] !== modelText;
              if (hasPendingText || hasTextDrift) {
                logCompletionDebug(
                  `req#${requestSeq} syncing editor text before completion pending=${hasPendingText} drift=${hasTextDrift} path=${currentOpenFilePath}`
                );
                const pendingTimer = lsPendingTimerRef.current[currentOpenFilePath];
                if (pendingTimer !== undefined) {
                  window.clearTimeout(pendingTimer);
                  delete lsPendingTimerRef.current[currentOpenFilePath];
                }
                delete lsPendingTextRef.current[currentOpenFilePath];
                await sendLsDidChangeRef.current(currentOpenFilePath, modelText);
              }
            } else {
              logCompletionDebug(
                `req#${requestSeq} skipped pre-sync because no open file path is tracked`
              );
            }

            const completionArgs: Record<string, unknown> = {
              uri: model.uri.toString(),
              line: position.lineNumber - 1,
              character: position.column - 1
            };
            completionArgs.trigger_kind = lspTriggerKind;

            const result = await invoke<unknown>("ls_completion", completionArgs);

            if (token.isCancellationRequested || requestSeq !== completionRequestSeqRef.current) {
              logCompletionDebug(
                `req#${requestSeq} canceled token=${token.isCancellationRequested} stale=${
                  requestSeq !== completionRequestSeqRef.current
                }`
              );
              return { suggestions: [] };
            }

            const { isIncomplete: serverIncomplete, items } = normalizeCompletionResponse(result);
            const currentPackage = parseCurrentPackage(model.getValue());
            const currentClassName = parseCurrentClassNameFromUriPath(model.uri.path);
            const fallbackRange = {
              startLineNumber: position.lineNumber,
              startColumn: wordUntil.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: wordUntil.endColumn
            };

            const nonBlockedItems = items.filter((item) => !completionItemIsBlocked(item));
            const prefixMatchedItems = nonBlockedItems.filter((item) =>
              completionItemMatchesPrefix(item, typedPrefix)
            );

            const filteredItems = prefixMatchedItems
              .sort((left, right) =>
                compareCompletionItems(
                  left,
                  right,
                  typedPrefix,
                  currentPackage,
                  currentClassName
                )
              );

            const maxResults =
              typedPrefix.length <= COMPLETION_SHORT_PREFIX_LENGTH
                ? COMPLETION_MAX_RESULTS_SHORT_PREFIX
                : COMPLETION_MAX_RESULTS;
            const truncatedItems = filteredItems.slice(0, maxResults);

            logCompletionDebug(
              `req#${requestSeq} counts total=${items.length} nonBlocked=${nonBlockedItems.length} prefixMatched=${prefixMatchedItems.length} returned=${truncatedItems.length}/${maxResults} serverIncomplete=${serverIncomplete}`
            );

            if (truncatedItems.length > 0) {
              const topLabels = truncatedItems
                .slice(0, 5)
                .map((item) => completionLabelText(item.label))
                .join(" | ");
              logCompletionDebug(`req#${requestSeq} top=${topLabels}`);
            }

            let fallbackRangeReuseCount = 0;
            const suggestions = truncatedItems.map((item: LspCompletionItem) => {
              const label = toCompletionLabel(item.label);
              let insertText =
                typeof item.insertText === "string"
                  ? item.insertText
                  : completionLabelText(item.label);
              let range:
                | {
                    startLineNumber: number;
                    startColumn: number;
                    endLineNumber: number;
                    endColumn: number;
                  }
                | {
                    insert: {
                      startLineNumber: number;
                      startColumn: number;
                      endLineNumber: number;
                      endColumn: number;
                    };
                    replace: {
                      startLineNumber: number;
                      startColumn: number;
                      endLineNumber: number;
                      endColumn: number;
                    };
                  } = fallbackRange;

              if (isInsertReplaceEdit(item.textEdit)) {
                insertText = item.textEdit.newText;
                const insertRange = toMonacoRange(item.textEdit.insert);
                const replaceRange = toMonacoRange(item.textEdit.replace);
                if (
                  monacoRangeContainsPosition(
                    replaceRange,
                    position.lineNumber,
                    position.column
                  )
                ) {
                  range = {
                    insert: insertRange,
                    replace: replaceRange
                  };
                } else {
                  fallbackRangeReuseCount += 1;
                }
              } else if (isTextEdit(item.textEdit)) {
                insertText = item.textEdit.newText;
                const textEditRange = toMonacoRange(item.textEdit.range);
                if (
                  monacoRangeContainsPosition(
                    textEditRange,
                    position.lineNumber,
                    position.column
                  )
                ) {
                  range = textEditRange;
                } else {
                  fallbackRangeReuseCount += 1;
                }
              }

              const additionalTextEdits = Array.isArray(item.additionalTextEdits)
                ? item.additionalTextEdits
                    .filter((edit): edit is LspTextEdit => isTextEdit(edit))
                    .map((edit) => ({
                      range: toMonacoRange(edit.range),
                      text: edit.newText
                    }))
                : undefined;

              return {
                label,
                kind: mapLspCompletionKind(monacoInstance, item.kind),
                detail: item.detail,
                documentation: completionDocumentation(item.documentation),
                sortText: item.sortText,
                preselect: item.preselect,
                commitCharacters: Array.isArray(item.commitCharacters)
                  ? item.commitCharacters.filter(
                      (character): character is string => typeof character === "string"
                    )
                  : undefined,
                insertText,
                insertTextRules:
                  item.insertTextFormat === 2
                    ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : undefined,
                range,
                additionalTextEdits:
                  additionalTextEdits && additionalTextEdits.length > 0
                    ? additionalTextEdits
                    : undefined
              };
            });

            if (fallbackRangeReuseCount > 0) {
              logCompletionDebug(
                `req#${requestSeq} used fallback range for ${fallbackRangeReuseCount} item(s) due out-of-position textEdit ranges`
              );
            }

            return {
              suggestions,
              // Keep Monaco in refresh mode while suggest is open so transitions like
              // "Ma" -> "Math." reliably switch from type suggestions to member suggestions.
              incomplete: true
            };
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : typeof error === "string" ? error : "unknown";
            logCompletionDebug(`req#${requestSeq} error=${reason}`);
            return { suggestions: [] };
          }
        }
      });

    return () => {
      completionProviderRef.current?.dispose();
      completionProviderRef.current = null;
      completionRequestSeqRef.current += 1;
    };
  }, [logCompletionDebug, monaco]);

  useEffect(() => {
    latestProjectPathRef.current = projectPath;
  }, [projectPath]);

  useEffect(() => {
    latestOpenFilePathRef.current = openFilePath;
    latestOpenFileContentRef.current = openFileContent;
  }, [openFileContent, openFilePath]);

  const notifyLsOpen = useCallback((path: string, text: string) => {
    if (!lsReadyRef.current) return;
    if (lsOpenRef.current.has(path)) return;
    lsOpenRef.current.add(path);
    lsVersionRef.current[path] = LS_INITIAL_DOCUMENT_VERSION;
    lsLastSyncedTextRef.current[path] = text;
    void invoke("ls_did_open", {
      uri: toFileUri(path),
      text,
      languageId: "java"
    }).catch(() => undefined);
  }, []);

  const clearPendingLsChange = useCallback((path: string) => {
    const timer = lsPendingTimerRef.current[path];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete lsPendingTimerRef.current[path];
    }
    delete lsPendingTextRef.current[path];
  }, []);

  const clearAllPendingLsChanges = useCallback(() => {
    Object.values(lsPendingTimerRef.current).forEach((timer) => {
      window.clearTimeout(timer);
    });
    lsPendingTimerRef.current = {};
    lsPendingTextRef.current = {};
  }, []);

  const sendLsDidChange = useCallback(async (path: string, text: string) => {
    if (!lsReadyRef.current) return;
    const uri = toFileUri(path);

    if (!lsOpenRef.current.has(path)) {
      lsOpenRef.current.add(path);
      lsVersionRef.current[path] = LS_INITIAL_DOCUMENT_VERSION;
      try {
        await invoke("ls_did_open", {
          uri,
          text,
          languageId: "java"
        });
        lsLastSyncedTextRef.current[path] = text;
      } catch {
        // Ignore LS sync failures; next change/completion will retry.
      }
      return;
    }

    const nextVersion = (lsVersionRef.current[path] ?? LS_INITIAL_DOCUMENT_VERSION) + 1;
    lsVersionRef.current[path] = nextVersion;
    try {
      await invoke("ls_did_change", {
        uri,
        version: nextVersion,
        text
      });
      lsLastSyncedTextRef.current[path] = text;
    } catch {
      // Ignore LS sync failures; completion gracefully degrades.
    }
  }, []);

  useEffect(() => {
    sendLsDidChangeRef.current = sendLsDidChange;
  }, [sendLsDidChange]);

  const flushLsChange = useCallback(
    async (path: string) => {
      const pendingText = lsPendingTextRef.current[path];
      if (pendingText === undefined) return;
      clearPendingLsChange(path);
      await sendLsDidChange(path, pendingText);
    },
    [clearPendingLsChange, sendLsDidChange]
  );

  useEffect(() => {
    return () => {
      clearAllPendingLsChanges();
    };
  }, [clearAllPendingLsChanges]);

  const notifyLsClose = useCallback((path: string) => {
    clearPendingLsChange(path);
    const uri = toFileUri(path);
    delete lsLastSyncedTextRef.current[path];
    if (!lsReadyRef.current) return;
    if (!lsOpenRef.current.has(path)) return;
    lsOpenRef.current.delete(path);
    delete lsVersionRef.current[path];
    void invoke("ls_did_close", { uri }).catch(() => undefined);
    const monacoInstance = monacoRef.current;
    if (monacoInstance) {
      const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
      if (model) {
        monacoInstance.editor.setModelMarkers(model, "jdtls", []);
        const existing = lsGlyphRef.current[uri] ?? [];
        if (existing.length > 0) {
          model.deltaDecorations(existing, []);
        }
      }
      delete lsGlyphRef.current[uri];
      delete lsDiagnosticFingerprintRef.current[uri];
    }
  }, [clearPendingLsChange]);

  const notifyLsChange = useCallback(
    (path: string, text: string) => {
      lsPendingTextRef.current[path] = text;
      const existingTimer = lsPendingTimerRef.current[path];
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      lsPendingTimerRef.current[path] = window.setTimeout(() => {
        void flushLsChange(path);
      }, LS_CHANGE_DEBOUNCE_MS);
    },
    [flushLsChange]
  );

  const notifyLsChangeImmediate = useCallback(
    (path: string, text: string) => {
      lsPendingTextRef.current[path] = text;
      void flushLsChange(path);
    },
    [flushLsChange]
  );

  const isLsOpen = useCallback((path: string) => lsOpenRef.current.has(path), []);

  const resetLsState = useCallback(() => {
    clearAllPendingLsChanges();
    lsOpenRef.current.clear();
    lsVersionRef.current = {};
    lsLastSyncedTextRef.current = {};
    prevOpenFileRef.current = null;
    lsReadyRef.current = false;
    const monacoInstance = monacoRef.current;
    if (monacoInstance) {
      Object.entries(lsGlyphRef.current).forEach(([uri, decorations]) => {
        const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
        if (model) {
          monacoInstance.editor.setModelMarkers(model, "jdtls", []);
          if (decorations.length > 0) {
            model.deltaDecorations(decorations, []);
          }
          delete lsDiagnosticFingerprintRef.current[uri];
        }
      });
    }
    lsGlyphRef.current = {};
    lsDiagnosticFingerprintRef.current = {};
  }, [clearAllPendingLsChanges]);

  useEffect(() => {
    const prev = prevOpenFileRef.current;
    if (prev && prev !== openFilePath) {
      void (async () => {
        await flushLsChange(prev);
        notifyLsClose(prev);
      })();
    }
    prevOpenFileRef.current = openFilePath;
  }, [flushLsChange, openFilePath, notifyLsClose]);

  useEffect(() => {
    if (!projectPath) return;
    clearAllPendingLsChanges();
    lsReadyRef.current = false;
    void invoke<string>("ls_start", { projectRoot: projectPath }).catch(() => undefined);
    return () => {
      clearAllPendingLsChanges();
      void invoke("ls_stop").catch(() => undefined);
    };
  }, [clearAllPendingLsChanges, projectPath]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const crashUnlisten = await listen<LsCrashedEvent>("ls_crashed", (event) => {
        if (!active) return;
        const currentProjectPath = latestProjectPathRef.current;
        if (currentProjectPath && event.payload.projectRoot === currentProjectPath) {
          resetLsState();
          void invoke<string>("ls_start", { projectRoot: currentProjectPath }).catch(
            () => undefined
          );
        }
      });
      if (!active) {
        crashUnlisten();
        return;
      }
      unlisten = crashUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [resetLsState]);

  useEffect(() => {
    let unlistenReady: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const readyUnlisten = await listen<LsReadyEvent>("ls_ready", (event) => {
        const currentProjectPath = latestProjectPathRef.current;
        if (!currentProjectPath) return;
        if (event.payload.projectRoot && event.payload.projectRoot !== currentProjectPath) {
          return;
        }
        lsReadyRef.current = true;
        const currentOpenFilePath = latestOpenFilePathRef.current;
        if (currentOpenFilePath) {
          notifyLsOpen(currentOpenFilePath, latestOpenFileContentRef.current);
        }
      });
      if (!active) {
        readyUnlisten();
        return;
      }
      unlistenReady = readyUnlisten;

      const errorUnlisten = await listen<LsErrorEvent>("ls_error", (event) => {
        const currentProjectPath = latestProjectPathRef.current;
        if (
          currentProjectPath &&
          event.payload.projectRoot &&
          event.payload.projectRoot !== currentProjectPath
        ) {
          return;
        }
        lsReadyRef.current = false;
      });
      if (!active) {
        errorUnlisten();
        return;
      }
      unlistenError = errorUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenReady) unlistenReady();
      if (unlistenError) unlistenError();
    };
  }, [notifyLsOpen]);

  useEffect(() => {
    let unlistenDiagnostics: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      const diagnosticsUnlisten = await listen<LsDiagnosticsEvent>(
        "ls_diagnostics",
        (event) => {
          const monacoInstance = monacoRef.current;
          if (!monacoInstance) return;
          const uri = event.payload.uri;
          const model = monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri));
          if (!model) return;
          const diagnostics = event.payload.diagnostics ?? [];
          const markers = diagnostics
            .filter((diag) => diag.severity === LS_DIAGNOSTIC_SEVERITY_ERROR)
            .map((diag) => ({
            startLineNumber: diag.range.start.line + 1,
            startColumn: diag.range.start.character + 1,
            endLineNumber: diag.range.end.line + 1,
            endColumn: diag.range.end.character + 1,
            message: diag.message,
            severity: monacoInstance.MarkerSeverity.Error,
            source: diag.source ?? "jdtls"
          }));
          const fingerprint = [...markers]
            .sort((a, b) => {
              if (a.startLineNumber !== b.startLineNumber) {
                return a.startLineNumber - b.startLineNumber;
              }
              if (a.startColumn !== b.startColumn) {
                return a.startColumn - b.startColumn;
              }
              if (a.endLineNumber !== b.endLineNumber) {
                return a.endLineNumber - b.endLineNumber;
              }
              if (a.endColumn !== b.endColumn) {
                return a.endColumn - b.endColumn;
              }
              return a.message.localeCompare(b.message);
            })
            .map((marker) =>
              `${marker.startLineNumber}:${marker.startColumn}-${marker.endLineNumber}:${marker.endColumn}|${marker.source}|${marker.message}`
            )
            .join("\n");
          const previousFingerprint = lsDiagnosticFingerprintRef.current[uri];
          if (previousFingerprint === fingerprint) {
            return;
          }
          lsDiagnosticFingerprintRef.current[uri] = fingerprint;
          monacoInstance.editor.setModelMarkers(model, "jdtls", markers);
          const existing = lsGlyphRef.current[uri] ?? [];
          const glyphDecorations = markers.map((marker) => ({
            range: new monacoInstance.Range(
              marker.startLineNumber,
              1,
              marker.startLineNumber,
              1
            ),
            options: {
              isWholeLine: true,
              glyphMarginClassName: "codicon codicon-error",
              glyphMarginHoverMessage: { value: marker.message }
            }
          }));
          const next = model.deltaDecorations(existing, glyphDecorations);
          lsGlyphRef.current[uri] = next;
        }
      );
      if (!active) {
        diagnosticsUnlisten();
        return;
      }
      unlistenDiagnostics = diagnosticsUnlisten;
    };

    void setup();
    return () => {
      active = false;
      if (unlistenDiagnostics) unlistenDiagnostics();
    };
  }, []);

  return {
    monacoRef,
    lsReadyRef,
    isLsOpen,
    notifyLsOpen,
    notifyLsClose,
    notifyLsChange,
    notifyLsChangeImmediate,
    resetLsState
  };
};
