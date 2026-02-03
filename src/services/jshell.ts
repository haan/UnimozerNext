import { invoke } from "@tauri-apps/api/core";

export type JshellField = {
  name: string;
  type?: string | null;
  value?: string | null;
  visibility: "public" | "protected" | "private" | "package";
  isStatic: boolean;
  isInherited?: boolean;
};

export type JshellMethod = {
  name: string;
  returnType?: string | null;
  paramTypes?: string[];
  visibility?: string;
  isStatic?: boolean;
};

export type JshellInheritedMethodGroup = {
  className: string;
  methods?: JshellMethod[];
};

export type JshellInspectResult = {
  ok: boolean;
  typeName?: string;
  fields?: JshellField[];
  inheritedMethods?: JshellInheritedMethodGroup[];
  error?: string | null;
};

export type JshellEvalResult = {
  ok: boolean;
  value?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: string | null;
};

export const jshellStart = (root: string, classpath: string) =>
  invoke<void>("jshell_start", { root, classpath });

export const jshellStop = () => invoke<void>("jshell_stop");

export const jshellEval = (code: string) =>
  invoke<JshellEvalResult>("jshell_eval", { code });

export const jshellInspect = (varName: string) =>
  invoke<JshellInspectResult>("jshell_inspect", { varName });

export const jshellVars = () => invoke<{ vars: JshellField[] }>("jshell_vars");
