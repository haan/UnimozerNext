export type UmlSettings = {
  showDependencies: boolean;
  panelBackground: string | null;
  codeHighlight: boolean;
  showPackages: boolean;
  fontSize: number;
};

export type EditorSettings = {
  fontSize: number;
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

export type ViewSettings = {
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  showSwingAttributes: boolean;
};

export type AppSettings = {
  uml: UmlSettings;
  editor: EditorSettings;
  advanced: AdvancedSettings;
  view: ViewSettings;
  layout: {
    umlSplitRatio: number;
    consoleSplitRatio: number;
    objectBenchSplitRatio: number;
  };
};

export const createDefaultSettings = (): AppSettings => ({
  uml: {
    showDependencies: true,
    panelBackground: null,
    codeHighlight: true,
    showPackages: true,
    fontSize: 12
  },
  editor: {
    fontSize: 14,
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
  view: {
    showPrivateObjectFields: true,
    showInheritedObjectFields: true,
    showStaticObjectFields: true,
    showSwingAttributes: true
  },
  layout: {
    umlSplitRatio: 0.5,
    consoleSplitRatio: 0.7,
    objectBenchSplitRatio: 0.75
  }
});
