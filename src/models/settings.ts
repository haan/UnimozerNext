export type UmlSettings = {
  showDependencies: boolean;
};

export type AppSettings = {
  uml: UmlSettings;
};

export const createDefaultSettings = (): AppSettings => ({
  uml: {
    showDependencies: true
  }
});
