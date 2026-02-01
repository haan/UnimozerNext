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
};

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
    onEditorMount
  }: CodePanelProps) => {
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const resolvedTheme = resolveMonacoTheme(theme);

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

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          {openFile ? (
            <MonacoEditor
              key={openFile.path}
              language="java"
              theme={resolvedTheme}
              value={content}
              path={fileUri ?? undefined}
              beforeMount={(monaco) => {
                monacoRef.current = monaco;
                void applyTheme(monaco);
              }}
              onMount={(editor) => {
                onEditorMount?.(editor);
              }}
              onChange={(value) => {
                const next = value ?? "";
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
