import MonacoEditor from "@monaco-editor/react";
import type { editor as MonacoEditorType } from "monaco-editor";
import { memo, useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { registerMonacoThemes, resolveMonacoTheme } from "../../services/monacoThemes";
import { registerMonacoJavaTokenizer } from "../../services/monacoJavaTokenizer";

type OpenFile = {
  name: string;
  path: string;
};

export type CodePanelProps = {
  openFile: OpenFile | null;
  fileUri: string | null;
  content: string;
  dirty: boolean;
  darkMode: boolean;
  fontSize: number;
  theme: string;
  tabSize: number;
  insertSpaces: boolean;
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoCloseComments: boolean;
  wordWrap: boolean;
  scopeHighlighting: boolean;
  onChange: (value: string) => void;
  onEditorMount?: (editor: MonacoEditorType.IStandaloneCodeEditor) => void;
  onCaretChange?: (position: { lineNumber: number; column: number }) => void;
  debugLogging?: boolean;
  onDebugLog?: (message: string) => void;
};

type Disposable = { dispose: () => void };

const SCOPE_COLOR_COUNT = 6;

type ScopeLineInfo = {
  startDepth: number;
  leadingCloseCount: number;
  openCount: number;
  closeCount: number;
  hasCodeToken: boolean;
  hasCommentToken: boolean;
};

type SelectionLike = {
  selectionStartLineNumber: number;
  selectionStartColumn: number;
  positionLineNumber: number;
  positionColumn: number;
};

const SCOPE_STRUCTURAL_INSERT_PATTERN = /[{}"'/\\*\r\n]/;

const computeScopeLineInfo = (source: string): ScopeLineInfo[] => {
  const lines: ScopeLineInfo[] = [];
  let depth = 0;
  let line: ScopeLineInfo = {
    startDepth: 0,
    leadingCloseCount: 0,
    openCount: 0,
    closeCount: 0,
    hasCodeToken: false,
    hasCommentToken: false
  };
  let leadingPhase = true;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let inChar = false;
  let inTextBlock = false;
  let escaped = false;

  const pushLine = () => {
    lines.push(line);
    line = {
      startDepth: depth,
      leadingCloseCount: 0,
      openCount: 0,
      closeCount: 0,
      hasCodeToken: false,
      hasCommentToken: false
    };
    leadingPhase = true;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";
    const nextNext = source[index + 2] ?? "";

    if (char === "\r") {
      continue;
    }

    if (inLineComment) {
      line.hasCommentToken = true;
      if (char === "\n") {
        inLineComment = false;
        pushLine();
      }
      continue;
    }

    if (inBlockComment) {
      line.hasCommentToken = true;
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
        continue;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (inTextBlock) {
      if (char === '"' && next === '"' && nextNext === '"') {
        inTextBlock = false;
        index += 2;
        continue;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (inChar) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "'") {
        inChar = false;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (char === "/" && next === "/") {
      line.hasCommentToken = true;
      leadingPhase = false;
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      line.hasCommentToken = true;
      leadingPhase = false;
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' && next === '"' && nextNext === '"') {
      leadingPhase = false;
      inTextBlock = true;
      index += 2;
      continue;
    }
    if (char === '"') {
      leadingPhase = false;
      inString = true;
      continue;
    }
    if (char === "'") {
      leadingPhase = false;
      inChar = true;
      continue;
    }
    if (char === " " || char === "\t") {
      continue;
    }
    if (char === "{") {
      line.hasCodeToken = true;
      line.openCount += 1;
      leadingPhase = false;
      depth += 1;
      continue;
    }
    if (char === "}") {
      line.hasCodeToken = true;
      line.closeCount += 1;
      if (leadingPhase) {
        line.leadingCloseCount += 1;
      } else {
        leadingPhase = false;
      }
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "\n") {
      pushLine();
      continue;
    }
    line.hasCodeToken = true;
    leadingPhase = false;
  }

  lines.push(line);
  return lines;
};

const createScopeDecorations = (
  monaco: typeof import("monaco-editor"),
  model: MonacoEditorType.ITextModel
): MonacoEditorType.IModelDeltaDecoration[] => {
  const scopeLineInfo = computeScopeLineInfo(model.getValue());
  const lineCount = model.getLineCount();
  const lineTexts = Array.from({ length: lineCount }, (_, index) =>
    model.getLineContent(index + 1)
  );
  const stripeDepths: number[] = new Array(lineCount).fill(0);
  const fillDepths: number[] = new Array(lineCount).fill(0);
  const decorations: MonacoEditorType.IModelDeltaDecoration[] = [];

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const info = scopeLineInfo[lineNumber - 1] ?? {
      startDepth: 0,
      leadingCloseCount: 0,
      openCount: 0,
      closeCount: 0,
      hasCodeToken: false,
      hasCommentToken: false
    };
    const effectiveDepth = Math.max(0, info.startDepth - info.leadingCloseCount);
    stripeDepths[lineNumber - 1] = Math.min(effectiveDepth, SCOPE_COLOR_COUNT);

    let fillDepth = 0;
    if (info.openCount > 0) {
      fillDepth = Math.min(effectiveDepth + 1, SCOPE_COLOR_COUNT);
    } else if (info.leadingCloseCount > 0) {
      fillDepth = Math.min(info.startDepth, SCOPE_COLOR_COUNT);
    }
    fillDepths[lineNumber - 1] = fillDepth;
  }

  const resolveFollowingBlockFillDepth = (lineNumber: number): number => {
    for (let scanLine = lineNumber + 1; scanLine <= lineCount; scanLine += 1) {
      const trimmed = lineTexts[scanLine - 1]?.trim() ?? "";
      if (trimmed.length === 0) {
        continue;
      }
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("*/")
      ) {
        continue;
      }
      if (trimmed.startsWith("}")) {
        return 0;
      }
      const info = scopeLineInfo[scanLine - 1];
      if (info && info.openCount > 0) {
        const effectiveDepth = Math.max(0, info.startDepth - info.leadingCloseCount);
        return Math.min(effectiveDepth + 1, SCOPE_COLOR_COUNT);
      }
      if (trimmed.includes(";")) {
        return 0;
      }
    }
    return 0;
  };

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const info = scopeLineInfo[lineNumber - 1];
    if (!info) {
      continue;
    }
    if (fillDepths[lineNumber - 1] !== 0) {
      continue;
    }
    if (!info.hasCommentToken || info.hasCodeToken) {
      continue;
    }
    const effectiveDepth = Math.max(0, info.startDepth - info.leadingCloseCount);
    if (effectiveDepth > 0) {
      fillDepths[lineNumber - 1] = Math.min(effectiveDepth, SCOPE_COLOR_COUNT);
      continue;
    }
    fillDepths[lineNumber - 1] = resolveFollowingBlockFillDepth(lineNumber);
  }

  let javadocStartLine: number | null = null;
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const trimmed = lineTexts[lineNumber - 1]?.trim() ?? "";
    if (javadocStartLine === null) {
      if (!trimmed.startsWith("/**")) {
        continue;
      }
      javadocStartLine = lineNumber;
    }
    if (!trimmed.includes("*/")) {
      continue;
    }
    const blockFillDepth = resolveFollowingBlockFillDepth(lineNumber);
    if (blockFillDepth > 0 && javadocStartLine !== null) {
      for (
        let javadocLine = javadocStartLine;
        javadocLine <= lineNumber;
        javadocLine += 1
      ) {
        fillDepths[javadocLine - 1] = blockFillDepth;
      }
    }
    javadocStartLine = null;
  }

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const stripeDepth = stripeDepths[lineNumber - 1] ?? 0;
    const fillDepth = fillDepths[lineNumber - 1] ?? 0;
    if (stripeDepth === 0 && fillDepth === 0) {
      continue;
    }
    decorations.push({
      range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
      options: {
        isWholeLine: true,
        className: `editor-scope-line editor-scope-stripes-${stripeDepth} editor-scope-fill-${fillDepth}`
      }
    });
  }

  return decorations;
};

const createScopeSelectionDecorations = (
  monaco: typeof import("monaco-editor"),
  model: MonacoEditorType.ITextModel,
  selections: readonly SelectionLike[]
): MonacoEditorType.IModelDeltaDecoration[] => {
  const decorations: MonacoEditorType.IModelDeltaDecoration[] = [];
  const emptyLineMarkerSet = new Set<number>();
  for (const selection of selections) {
    let startLine = selection.selectionStartLineNumber;
    let startColumn = selection.selectionStartColumn;
    let endLine = selection.positionLineNumber;
    let endColumn = selection.positionColumn;

    if (startLine === endLine && startColumn === endColumn) {
      continue;
    }

    if (startLine > endLine || (startLine === endLine && startColumn > endColumn)) {
      [startLine, endLine] = [endLine, startLine];
      [startColumn, endColumn] = [endColumn, startColumn];
    }

    decorations.push({
      range: new monaco.Range(startLine, startColumn, endLine, endColumn),
      options: {
        inlineClassName: "editor-scope-active-selection",
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    });

    if (endLine - startLine < 2) {
      continue;
    }
    for (let lineNumber = startLine + 1; lineNumber <= endLine - 1; lineNumber += 1) {
      if (model.getLineLength(lineNumber) !== 0) {
        continue;
      }
      emptyLineMarkerSet.add(lineNumber);
    }
  }

  for (const lineNumber of emptyLineMarkerSet) {
    decorations.push({
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        beforeContentClassName: "editor-scope-active-selection-empty",
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    });
  }
  return decorations;
};

const shouldRefreshScopeForContentChanges = (
  event: MonacoEditorType.IModelContentChangedEvent
) => {
  for (const change of event.changes) {
    if (change.rangeLength > 0) {
      return true;
    }
    if (SCOPE_STRUCTURAL_INSERT_PATTERN.test(change.text)) {
      return true;
    }
  }
  return false;
};

const deltaModelDecorations = (
  model: MonacoEditorType.ITextModel,
  trackedByUri: Map<string, string[]>,
  nextDecorations: MonacoEditorType.IModelDeltaDecoration[]
) => {
  const key = model.uri.toString();
  const previous = trackedByUri.get(key) ?? [];
  const next = model.deltaDecorations(previous, nextDecorations);
  if (next.length > 0) {
    trackedByUri.set(key, next);
  } else {
    trackedByUri.delete(key);
  }
  return next;
};

const clearTrackedDecorations = (
  monaco: typeof import("monaco-editor") | null,
  trackedByUri: Map<string, string[]>
) => {
  if (!monaco) {
    trackedByUri.clear();
    return;
  }
  for (const [uri, ids] of trackedByUri) {
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    if (!model) {
      continue;
    }
    model.deltaDecorations(ids, []);
  }
  trackedByUri.clear();
};

export const CodePanel = memo(
  ({
    openFile,
    fileUri,
    content,
    darkMode,
    fontSize,
    theme,
    tabSize,
    insertSpaces,
    autoCloseBrackets,
    autoCloseQuotes,
    autoCloseComments,
    wordWrap,
    scopeHighlighting,
    onChange,
    onEditorMount,
    onCaretChange,
    debugLogging,
    onDebugLog
  }: CodePanelProps) => {
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
    const subscriptionsRef = useRef<Disposable[]>([]);
    const scopeDecorationIdsByUriRef = useRef<Map<string, string[]>>(new Map());
    const selectionDecorationIdsByUriRef = useRef<Map<string, string[]>>(new Map());
    const scopeRefreshFrameRef = useRef<number | null>(null);
    const selectionRefreshFrameRef = useRef<number | null>(null);
    const lastEditorValueRef = useRef<string | null>(null);
    const resolvedTheme = resolveMonacoTheme(theme, darkMode);
    const debugEnabled = Boolean(debugLogging && onDebugLog);

    const logEvent = useCallback(
      (message: string) => {
        if (!debugEnabled || !onDebugLog) return;
        onDebugLog(`${new Date().toLocaleTimeString()} ${message}`);
      },
      [debugEnabled, onDebugLog]
    );

    const applyTheme = useCallback(
      async (monaco: typeof import("monaco-editor") | null) => {
        if (!monaco) return;
        if (resolvedTheme === "vs") {
          monaco.editor.setTheme("vs");
          return;
        }
        await registerMonacoThemes(monaco, resolvedTheme);
        monaco.editor.setTheme(resolvedTheme);
      },
      [resolvedTheme]
    );

    useEffect(() => {
      void applyTheme(monacoRef.current);
    }, [applyTheme]);

  useEffect(() => {
    const scopeDecorationIdsByUri = scopeDecorationIdsByUriRef.current;
    const selectionDecorationIdsByUri = selectionDecorationIdsByUriRef.current;
    return () => {
      if (scopeRefreshFrameRef.current !== null) {
        window.cancelAnimationFrame(scopeRefreshFrameRef.current);
        scopeRefreshFrameRef.current = null;
      }
        if (selectionRefreshFrameRef.current !== null) {
          window.cancelAnimationFrame(selectionRefreshFrameRef.current);
          selectionRefreshFrameRef.current = null;
        }
      clearTrackedDecorations(monacoRef.current, scopeDecorationIdsByUri);
      clearTrackedDecorations(monacoRef.current, selectionDecorationIdsByUri);
      subscriptionsRef.current.forEach((subscription) => subscription.dispose());
      subscriptionsRef.current = [];
    };
  }, []);

    const syncExternalContent = useCallback(
      (editor: MonacoEditorType.IStandaloneCodeEditor | null) => {
        if (!editor || !openFile) return;
        const model = editor.getModel();
        if (!model) return;
        const modelValue = model.getValue();
        if (content === modelValue) {
          lastEditorValueRef.current = content;
          return;
        }
        if (content === lastEditorValueRef.current) return;
        const selection = editor.getSelection();
        if (debugEnabled) {
          logEvent(
            `prop content differs from model (len ${content.length} vs ${modelValue.length})`
          );
        }
        editor.executeEdits("external", [
          {
            range: model.getFullModelRange(),
            text: content,
            forceMoveMarkers: true
          }
        ]);
        if (selection) {
          editor.setSelection(selection);
        }
        lastEditorValueRef.current = content;
        if (debugEnabled) {
          logEvent(`synced content into model (len ${content.length})`);
        }
      },
      [content, debugEnabled, logEvent, openFile]
    );

    const registerEditorEventListeners = useCallback(
      (editor: MonacoEditorType.IStandaloneCodeEditor) => {
        subscriptionsRef.current.forEach((subscription) => subscription.dispose());

        const refreshScopeDecorations = () => {
          if (scopeRefreshFrameRef.current !== null) {
            window.cancelAnimationFrame(scopeRefreshFrameRef.current);
          }
          scopeRefreshFrameRef.current = window.requestAnimationFrame(() => {
            scopeRefreshFrameRef.current = null;
            const model = editor.getModel();
            if (!model) {
              return;
            }
            if (!scopeHighlighting || !monacoRef.current) {
              deltaModelDecorations(
                model,
                scopeDecorationIdsByUriRef.current,
                []
              );
              return;
            }
            const decorations = createScopeDecorations(monacoRef.current, model);
            deltaModelDecorations(
              model,
              scopeDecorationIdsByUriRef.current,
              decorations
            );
          });
        };

        const refreshSelectionDecorations = () => {
          if (selectionRefreshFrameRef.current !== null) {
            window.cancelAnimationFrame(selectionRefreshFrameRef.current);
          }
          selectionRefreshFrameRef.current = window.requestAnimationFrame(() => {
            selectionRefreshFrameRef.current = null;
            const model = editor.getModel();
            if (!model) {
              return;
            }
            if (!scopeHighlighting || !monacoRef.current) {
              deltaModelDecorations(
                model,
                selectionDecorationIdsByUriRef.current,
                []
              );
              return;
            }
            const selections = editor.getSelections() ?? [];
            const decorations = createScopeSelectionDecorations(
              monacoRef.current,
              model,
              selections
            );
            deltaModelDecorations(
              model,
              selectionDecorationIdsByUriRef.current,
              decorations
            );
          });
        };

        const tryAutoCloseBlockComments = () => {
          if (!autoCloseComments) {
            return;
          }
          const monaco = monacoRef.current;
          if (!monaco) {
            return;
          }
          const model = editor.getModel();
          if (!model) {
            return;
          }
          const selections = editor.getSelections() ?? [];
          if (selections.length === 0) {
            return;
          }

          const edits: MonacoEditorType.IIdentifiedSingleEditOperation[] = [];
          const nextSelections = selections.map(
            (selection) =>
              new monaco.Selection(
                selection.selectionStartLineNumber,
                selection.selectionStartColumn,
                selection.positionLineNumber,
                selection.positionColumn
              )
          );

          for (let index = 0; index < selections.length; index += 1) {
            const selection = selections[index]!;
            if (!selection.isEmpty()) {
              continue;
            }
            const { lineNumber, column } = selection.getPosition();
            if (column < 3) {
              continue;
            }
            const blockOpenToken = model.getValueInRange({
              startLineNumber: lineNumber,
              startColumn: column - 2,
              endLineNumber: lineNumber,
              endColumn: column
            });
            const javadocOpenToken =
              column >= 4
                ? model.getValueInRange({
                    startLineNumber: lineNumber,
                    startColumn: column - 3,
                    endLineNumber: lineNumber,
                    endColumn: column
                  })
                : "";
            if (blockOpenToken !== "/*" && javadocOpenToken !== "/**") {
              continue;
            }
            const lineContent = model.getLineContent(lineNumber);
            const afterToken = lineContent.slice(column - 1, column + 1);
            const beforeChar = column > 1 ? lineContent[column - 2] ?? "" : "";
            const afterChar = lineContent[column - 1] ?? "";
            const hasClosingAhead = afterToken === "*/";
            const hasClosingAroundCaret = beforeChar === "*" && afterChar === "/";
            if (hasClosingAhead || hasClosingAroundCaret) {
              continue;
            }

            edits.push({
              range: {
                startLineNumber: lineNumber,
                startColumn: column,
                endLineNumber: lineNumber,
                endColumn: column
              },
              text: "*/",
              forceMoveMarkers: true
            });
            nextSelections[index] = new monaco.Selection(
              lineNumber,
              column,
              lineNumber,
              column
            );
          }

          if (edits.length === 0) {
            return;
          }

          editor.executeEdits("autoCloseComments", edits);
          editor.setSelections(nextSelections);
        };

        const subscriptions: Disposable[] = [
          editor.onDidChangeModel((event) => {
            refreshScopeDecorations();
            refreshSelectionDecorations();
            if (debugEnabled) {
              logEvent(
                `model change${event.newModelUrl ? ` -> ${event.newModelUrl.toString()}` : ""}`
              );
            }
          }),
          editor.onDidChangeModelContent((event) => {
            const shouldTryAutoCloseComments =
              autoCloseComments &&
              event.changes.length > 0 &&
              event.changes.every((change) => change.rangeLength === 0 && change.text === "*");
            if (shouldTryAutoCloseComments) {
              tryAutoCloseBlockComments();
            }
            if (shouldRefreshScopeForContentChanges(event)) {
              refreshScopeDecorations();
            }
            refreshSelectionDecorations();
            if (debugEnabled) {
              const model = editor.getModel();
              logEvent(
                `content change (changes=${event.changes.length}) version=${model?.getVersionId() ?? "?"}`
              );
            }
          }),
          editor.onDidChangeCursorSelection(() => {
            refreshSelectionDecorations();
          }),
          editor.onDidChangeCursorPosition((event) => {
            onCaretChange?.({
              lineNumber: event.position.lineNumber,
              column: event.position.column
            });
            if (debugEnabled) {
              logEvent(
                `cursor ${event.position.lineNumber}:${event.position.column} reason=${event.reason}`
              );
            }
          })
        ];

        if (monacoRef.current) {
          subscriptions.push(
            monacoRef.current.editor.onWillDisposeModel((disposedModel) => {
              const key = disposedModel.uri.toString();
              scopeDecorationIdsByUriRef.current.delete(key);
              selectionDecorationIdsByUriRef.current.delete(key);
            })
          );
        }

        if (debugEnabled) {
          subscriptions.push(
            editor.onDidFocusEditorText(() => {
              logEvent("focus");
            }),
            editor.onDidBlurEditorText(() => {
              logEvent("blur");
            })
          );
        }

        subscriptionsRef.current = subscriptions;
        refreshScopeDecorations();
        refreshSelectionDecorations();
      },
      [autoCloseComments, debugEnabled, logEvent, onCaretChange, scopeHighlighting]
    );

    useEffect(() => {
      if (!editorRef.current) return;
      registerEditorEventListeners(editorRef.current);
    }, [registerEditorEventListeners]);

    useEffect(() => {
      syncExternalContent(editorRef.current);
    }, [syncExternalContent]);

    const scopeStyle = {
      "--scope-indent-step": `${Math.max(1, tabSize)}ch`
    } as CSSProperties;

    return (
      <div
        className={`flex h-full flex-col overflow-hidden${scopeHighlighting ? " scope-highlighting-enabled" : ""}`}
        style={scopeStyle}
      >
        <div className="flex-1 min-h-0">
          {openFile ? (
            <MonacoEditor
              language="java"
              theme={resolvedTheme}
              defaultValue={content}
              path={fileUri ?? undefined}
              saveViewState
              keepCurrentModel
              beforeMount={(monaco) => {
                monacoRef.current = monaco;
                registerMonacoJavaTokenizer(monaco);
                void applyTheme(monaco);
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                registerEditorEventListeners(editor);
                const monaco = monacoRef.current;
                if (monaco) {
                  editor.addCommand(monaco.KeyCode.F1, () => {});
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
                    () => {}
                  );
                }
                onEditorMount?.(editor);
                syncExternalContent(editor);
                const position = editor.getPosition();
                if (position) {
                  onCaretChange?.({
                    lineNumber: position.lineNumber,
                    column: position.column
                  });
                }
              }}
              onChange={(value) => {
                const next = value ?? "";
                lastEditorValueRef.current = next;
                onChange(next);
              }}
              options={{
                fontSize,
                fontFamily: "var(--editor-font)",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                wordWrap: wordWrap ? "on" : "off",
                suggestOnTriggerCharacters: true,
                quickSuggestions: false,
                wordBasedSuggestions: "off",
                "semanticHighlighting.enabled": false,
                suggest: {
                  showInlineDetails: false,
                  showStatusBar: false
                },
                glyphMargin: true,
                contextmenu: false,
                renderValidationDecorations: "on",
                tabSize,
                insertSpaces,
                autoClosingBrackets: autoCloseBrackets ? "always" : "never",
                autoClosingQuotes: autoCloseQuotes ? "always" : "never",
                autoClosingComments: autoCloseComments ? "always" : "never"
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a Java class from the diagram to start editing.
            </div>
          )}
        </div>
      </div>
    );
  }
);
