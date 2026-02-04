export type UmlSettings = {
  showDependencies: boolean;
  panelBackground: string | null;
  codeHighlight: boolean;
  showPackages: boolean;
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

export type ViewSettings = {
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  showSwingAttributes: boolean;
};

export type AppSettings = {
  general: GeneralSettings;
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
  general: {
    fontSize: 14
  },
  uml: {
    showDependencies: true,
    panelBackground: null,
    codeHighlight: true,
    showPackages: true
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
