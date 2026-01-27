import MonacoEditor from "@monaco-editor/react";

type OpenFile = {
  name: string;
  path: string;
};

export type CodePanelProps = {
  openFile: OpenFile | null;
  content: string;
  dirty: boolean;
  onChange: (value: string) => void;
};

export const CodePanel = ({ openFile, content, onChange }: CodePanelProps) => (
  <div className="flex h-full flex-col">
    <div className="flex-1">
      {openFile ? (
        <MonacoEditor
          language="java"
          theme="vs"
          value={content}
          onChange={(value) => {
            const next = value ?? "";
            onChange(next);
          }}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on"
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
