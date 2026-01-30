import MonacoEditor from "@monaco-editor/react";
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
  onChange: (value: string) => void;
};

export const CodePanel = memo(({ openFile, fileUri, content, onChange }: CodePanelProps) => (
  <div className="flex h-full flex-col overflow-hidden">
    <div className="flex-1 min-h-0">
      {openFile ? (
        <MonacoEditor
          key={openFile.path}
          language="java"
          theme="vs"
          defaultValue={content}
          path={fileUri ?? undefined}
          onChange={(value) => {
            const next = value ?? "";
            onChange(next);
          }}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            suggestOnTriggerCharacters: false,
            quickSuggestions: false,
            wordBasedSuggestions: "off",
            glyphMargin: true,
            renderValidationDecorations: "on"
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Open a Java file from the diagram to start editing.
        </div>
      )}
    </div>
  </div>
));
