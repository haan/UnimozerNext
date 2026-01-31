import MonacoEditor from "@monaco-editor/react";
import type { editor as MonacoEditorType } from "monaco-editor";
import { memo } from "react";

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
  tabSize: number;
  insertSpaces: boolean;
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoCloseComments: boolean;
  wordWrap: boolean;
  darkTheme: boolean;
  onChange: (value: string) => void;
  onEditorMount?: (editor: MonacoEditorType.IStandaloneCodeEditor) => void;
};

export const CodePanel = memo(
  ({
    openFile,
    fileUri,
    content,
    fontSize,
    tabSize,
    insertSpaces,
    autoCloseBrackets,
    autoCloseQuotes,
    autoCloseComments,
    wordWrap,
    darkTheme,
    onChange,
    onEditorMount
  }: CodePanelProps) => (
  <div className="flex h-full flex-col overflow-hidden">
    <div className="flex-1 min-h-0">
      {openFile ? (
        <MonacoEditor
          key={openFile.path}
          language="java"
          theme={darkTheme ? "vs-dark" : "vs"}
          defaultValue={content}
          path={fileUri ?? undefined}
          onMount={(editor) => {
            onEditorMount?.(editor);
          }}
          onChange={(value) => {
            const next = value ?? "";
            onChange(next);
          }}
          options={{
            fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
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
  )
);
