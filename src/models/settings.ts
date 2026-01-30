export type UmlSettings = {
  showDependencies: boolean;
  panelBackground: string | null;
};

export type AppSettings = {
  uml: UmlSettings;
};

export const createDefaultSettings = (): AppSettings => ({
  uml: {
    showDependencies: true,
    panelBackground: null
  }
});
