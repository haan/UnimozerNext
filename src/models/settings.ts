export type UmlSettings = {
  showDependencies: boolean;
  panelBackground: string | null;
  codeHighlight: boolean;
};

export type EditorSettings = {
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoCloseComments: boolean;
  wordWrap: boolean;
  darkTheme: boolean;
  autoFormatOnSave: boolean;
};

export type AdvancedSettings = {
  debugLogging: boolean;
};

export type AppSettings = {
  uml: UmlSettings;
  editor: EditorSettings;
  advanced: AdvancedSettings;
  layout: {
    umlSplitRatio: number;
    consoleSplitRatio: number;
  };
};

export const createDefaultSettings = (): AppSettings => ({
  uml: {
    showDependencies: true,
    panelBackground: null,
    codeHighlight: true
  },
  editor: {
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    autoCloseBrackets: false,
    autoCloseQuotes: false,
    autoCloseComments: false,
    wordWrap: true,
    darkTheme: false,
    autoFormatOnSave: true
  },
  advanced: {
    debugLogging: false
  },
  layout: {
    umlSplitRatio: 0.5,
    consoleSplitRatio: 0.7
  }
});
