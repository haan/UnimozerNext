export type UmlSettings = {
  showDependencies: boolean;
  panelBackground: string | null;
  codeHighlight: boolean;
  showPackages: boolean;
  showSwingAttributes: boolean;
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
};

export type StructogramSettings = {
  loopHeaderColor: string;
  ifHeaderColor: string;
  switchHeaderColor: string;
  tryWrapperColor: string;
};

export type GeneralSettings = {
  fontSize: number;
};

export type ObjectBenchSettings = {
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  useObjectParameterDropdowns: boolean;
};

export type AppSettings = {
  general: GeneralSettings;
  uml: UmlSettings;
  objectBench: ObjectBenchSettings;
  editor: EditorSettings;
  advanced: AdvancedSettings;
  structogram: StructogramSettings;
  layout: {
    umlSplitRatio: number;
    consoleSplitRatio: number;
    objectBenchSplitRatio: number;
  };
};
