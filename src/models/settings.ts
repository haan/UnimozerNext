export type UmlSettings = {
  showDependencies: boolean;
  codeHighlight: boolean;
  showPackages: boolean;
  showSwingAttributes: boolean;
  showParameterNames: boolean;
  edgeStrokeWidth: number;
};

export type EditorSettings = {
  theme: string;
  tabSize: number;
  insertSpaces: boolean;
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoCloseComments: boolean;
  wordWrap: boolean;
  scopeHighlighting: boolean;
  autoFormatOnSave: boolean;
};

export type AdvancedSettings = {
  debugLogging: boolean;
  structogramColors: boolean;
  updateChannel: "stable" | "prerelease";
};

export type StructogramSettings = {
  loopHeaderColor: string;
  ifHeaderColor: string;
  switchHeaderColor: string;
  tryWrapperColor: string;
};

export type GeneralSettings = {
  fontSize: number;
  darkMode: boolean;
};

export type ObjectBenchSettings = {
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  useObjectParameterDropdowns: boolean;
};

export type RecentProjectKind = "packed" | "folder";

export type RecentProjectEntry = {
  path: string;
  kind: RecentProjectKind;
};

export type AppSettings = {
  general: GeneralSettings;
  uml: UmlSettings;
  objectBench: ObjectBenchSettings;
  editor: EditorSettings;
  advanced: AdvancedSettings;
  structogram: StructogramSettings;
  recentProjects: RecentProjectEntry[];
  layout: {
    umlSplitRatio: number;
    consoleSplitRatio: number;
    objectBenchSplitRatio: number;
  };
};
