import MonacoEditor from "@monaco-editor/react";
import type { editor as MonacoEditorType } from "monaco-editor";
import { memo, useCallback, useEffect, useRef } from "react";

import { registerMonacoThemes, resolveMonacoTheme } from "../../services/monacoThemes";

type OpenFile = {
  name: string;
  path: string;
};

export type CodePanelProps = {
  openFile: OpenFile | null;
  fileUri: string | null;
  content: string;
  dirty: boolean;
  fontSize: number;
  theme: string;
  tabSize: number;
  insertSpaces: boolean;
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoCloseComments: boolean;
  wordWrap: boolean;
  onChange: (value: string) => void;
  onEditorMount?: (editor: MonacoEditorType.IStandaloneCodeEditor) => void;
  debugLogging?: boolean;
  onDebugLog?: (message: string) => void;
};

type Disposable = { dispose: () => void };

export const CodePanel = memo(
  ({
    openFile,
    fileUri,
    content,
    fontSize,
    theme,
    tabSize,
    insertSpaces,
    autoCloseBrackets,
    autoCloseQuotes,
    autoCloseComments,
    wordWrap,
    onChange,
    onEditorMount,
    debugLogging,
    onDebugLog
  }: CodePanelProps) => {
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
    const subscriptionsRef = useRef<Disposable[]>([]);
    const lastEditorValueRef = useRef<string | null>(null);
    const resolvedTheme = resolveMonacoTheme(theme);

    const logEvent = useCallback(
      (message: string) => {
        if (!debugLogging || !onDebugLog) return;
        onDebugLog(`[Editor] ${new Date().toLocaleTimeString()} ${message}`);
      },
      [debugLogging, onDebugLog]
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
      return () => {
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
        logEvent(
          `prop content differs from model (len ${content.length} vs ${modelValue.length})`
        );
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
        logEvent(`synced content into model (len ${content.length})`);
      },
      [content, logEvent, openFile]
    );

    useEffect(() => {
      syncExternalContent(editorRef.current);
    }, [syncExternalContent]);

    const registerEditorEventListeners = useCallback(
      (editor: MonacoEditorType.IStandaloneCodeEditor) => {
        subscriptionsRef.current.forEach((subscription) => subscription.dispose());
        subscriptionsRef.current = [
          editor.onDidChangeCursorPosition((event) => {
            logEvent(
              `cursor ${event.position.lineNumber}:${event.position.column} reason=${event.reason}`
            );
          }),
          editor.onDidChangeModel((event) => {
            logEvent(
              `model change${event.newModelUrl ? ` -> ${event.newModelUrl.toString()}` : ""}`
            );
          }),
          editor.onDidChangeModelContent((event) => {
            const model = editor.getModel();
            logEvent(
              `content change (changes=${event.changes.length}) version=${model?.getVersionId() ?? "?"}`
            );
          }),
          editor.onDidFocusEditorText(() => {
            logEvent("focus");
          }),
          editor.onDidBlurEditorText(() => {
            logEvent("blur");
          })
        ];
      },
      [logEvent]
    );

    useEffect(() => {
      if (!editorRef.current) return;
      registerEditorEventListeners(editorRef.current);
    }, [registerEditorEventListeners]);

    return (
      <div className="flex h-full flex-col overflow-hidden">
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
                void applyTheme(monaco);
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                registerEditorEventListeners(editor);
                onEditorMount?.(editor);
                syncExternalContent(editor);
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
                suggestOnTriggerCharacters: false,
                quickSuggestions: false,
                wordBasedSuggestions: "off",
                glyphMargin: true,
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
              Open a Java file from the diagram to start editing.
            </div>
          )}
        </div>
      </div>
    );
  }
);
