import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { parseSchemaOrThrow } from "./tauriValidation";

const jshellFieldSchema = z.object({
  name: z.string(),
  type: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  visibility: z.enum(["public", "protected", "private", "package"]),
  isStatic: z.boolean(),
  isInherited: z.boolean().optional()
});

const jshellMethodSchema = z.object({
  name: z.string(),
  returnType: z.string().nullable().optional(),
  paramTypes: z.array(z.string()).nullish(),
  visibility: z.string().nullish(),
  isStatic: z.boolean().optional()
});

const jshellInheritedMethodGroupSchema = z.object({
  className: z.string(),
  methods: z.array(jshellMethodSchema).nullish()
});

const jshellInspectResultSchema = z.object({
  ok: z.boolean(),
  typeName: z.string().nullish(),
  fields: z.array(jshellFieldSchema).nullish(),
  inheritedMethods: z.array(jshellInheritedMethodGroupSchema).nullish(),
  error: z.string().nullable().optional()
});

const jshellEvalResultSchema = z.object({
  ok: z.boolean(),
  value: z.string().nullable().optional(),
  stdout: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  error: z.string().nullable().optional()
});

const jshellVarsResponseSchema = z.object({
  vars: z.array(jshellFieldSchema)
});
const jshellForceStopResponseSchema = z.boolean();

export type JshellField = z.infer<typeof jshellFieldSchema>;
export type JshellMethod = z.infer<typeof jshellMethodSchema>;
export type JshellInheritedMethodGroup = z.infer<typeof jshellInheritedMethodGroupSchema>;
export type JshellInspectResult = z.infer<typeof jshellInspectResultSchema>;
export type JshellEvalResult = z.infer<typeof jshellEvalResultSchema>;

export type JshellStartOptions = {
  jvmArgs?: string[];
  remoteVmOptions?: string[];
  envRemove?: string[];
  envSet?: Record<string, string>;
  userHome?: string;
  prefsUserRoot?: string;
  prefsSystemRoot?: string;
  tempDir?: string;
};

export const jshellStart = (root: string, classpath: string, options?: JshellStartOptions) =>
  invoke<void>("jshell_start", { root, classpath, options });

export const jshellStop = () => invoke<void>("jshell_stop");
export const jshellForceStop = async (): Promise<boolean> => {
  const raw = await invoke<unknown>("jshell_force_stop");
  return parseSchemaOrThrow(jshellForceStopResponseSchema, raw, "jshell_force_stop response");
};

export const jshellEval = async (code: string): Promise<JshellEvalResult> => {
  const raw = await invoke<unknown>("jshell_eval", { code });
  return parseSchemaOrThrow(jshellEvalResultSchema, raw, "jshell_eval response");
};

export const jshellInspect = async (varName: string): Promise<JshellInspectResult> => {
  const raw = await invoke<unknown>("jshell_inspect", { varName });
  return parseSchemaOrThrow(jshellInspectResultSchema, raw, "jshell_inspect response");
};

export const jshellVars = async (): Promise<{ vars: JshellField[] }> => {
  const raw = await invoke<unknown>("jshell_vars");
  return parseSchemaOrThrow(jshellVarsResponseSchema, raw, "jshell_vars response");
};
