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
  autoFormatOnSave: boolean;
};

export type AdvancedSettings = {
  debugLogging: boolean;
};

export type GeneralSettings = {
  fontSize: number;
};

export type ObjectBenchSettings = {
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
};

export type AppSettings = {
  general: GeneralSettings;
  uml: UmlSettings;
  objectBench: ObjectBenchSettings;
  editor: EditorSettings;
  advanced: AdvancedSettings;
  layout: {
    umlSplitRatio: number;
    consoleSplitRatio: number;
    objectBenchSplitRatio: number;
  };
};

export const createDefaultSettings = (): AppSettings => ({
  general: {
    fontSize: 14
  },
  uml: {
    showDependencies: true,
    panelBackground: null,
    codeHighlight: true,
    showPackages: true,
    showSwingAttributes: true
  },
  objectBench: {
    showPrivateObjectFields: true,
    showInheritedObjectFields: true,
    showStaticObjectFields: true
  },
  editor: {
    theme: "default",
    tabSize: 4,
    insertSpaces: true,
    autoCloseBrackets: false,
    autoCloseQuotes: false,
    autoCloseComments: false,
    wordWrap: true,
    autoFormatOnSave: true
  },
  advanced: {
    debugLogging: false
  },
  layout: {
    umlSplitRatio: 0.5,
    consoleSplitRatio: 0.7,
    objectBenchSplitRatio: 0.75
  }
});
