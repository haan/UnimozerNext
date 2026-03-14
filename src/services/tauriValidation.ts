import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../models/files";
import type { AppSettings } from "../models/settings";
import type { UmlGraph } from "../models/uml";

export const parseSchemaOrNull = <T>(schema: z.ZodType<T>, value: unknown): T | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const parseSchemaOrThrow = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string
): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join(" | ");
    throw new Error(`Invalid ${label} payload${issues ? ` (${issues})` : ""}`);
  }
  return parsed.data;
};

export const invokeValidated = async <T>(
  command: string,
  schema: z.ZodType<T>,
  label: string,
  args?: Record<string, unknown>
): Promise<T> => {
  const raw = args === undefined ? await invoke<unknown>(command) : await invoke<unknown>(command, args);
  return parseSchemaOrThrow(schema, raw, label);
};

export const stringArraySchema = z.array(z.string());
export const stringSchema = z.string();
export const voidResponseSchema = z
  .union([z.null(), z.undefined()])
  .transform(() => undefined);

export const runStartEventSchema = z.object({
  runId: z.number()
});

export const runOutputEventSchema = z.object({
  runId: z.number(),
  stream: z.string(),
  line: z.string()
});

export const runCompleteEventSchema = z.object({
  runId: z.number(),
  ok: z.boolean(),
  code: z.number().nullable().optional()
});

export const compileProjectResultSchema = z.object({
  ok: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  outDir: z.string()
});

export const renameClassResponseSchema = z
  .object({
    oldPath: z.string(),
    newPath: z.string(),
    content: z.string()
  })
  .loose();

export const openPackedProjectResponseSchema = z.object({
  archivePath: z.string(),
  workspaceDir: z.string(),
  projectRoot: z.string(),
  projectName: z.string()
});

export const openScratchProjectResponseSchema = z.object({
  projectRoot: z.string(),
  projectName: z.string()
});

const umlFieldSchema = z
  .object({
    signature: z.string()
  })
  .loose();

const umlMethodSchema = z
  .object({
    signature: z.string()
  })
  .loose();

const umlNodeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["class", "interface", "enum", "record"]),
    path: z.string(),
    fields: z.array(umlFieldSchema),
    methods: z.array(umlMethodSchema)
  })
  .loose();

const umlEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["extends", "implements", "association", "dependency", "reflexive-association"])
});

export const umlGraphSchema: z.ZodType<UmlGraph> = z
  .object({
    nodes: z.array(umlNodeSchema),
    edges: z.array(umlEdgeSchema),
    failedFiles: z.array(z.string()).optional()
  })
  .loose();

export const parseUmlGraphResponseSchema = z.object({
  graph: umlGraphSchema,
  raw: z.string()
});

const recentProjectEntrySchema = z.object({
  path: z.string(),
  kind: z.enum(["packed", "folder"])
});

export const appSettingsSchema: z.ZodType<AppSettings> = z.object({
  general: z.object({
    fontSize: z.number(),
    darkMode: z.boolean()
  }),
  uml: z.object({
    showDependencies: z.boolean(),
    codeHighlight: z.boolean(),
    showPackages: z.boolean(),
    showSwingAttributes: z.boolean(),
    showParameterNames: z.boolean(),
    edgeStrokeWidth: z.number()
  }),
  objectBench: z.object({
    showPrivateObjectFields: z.boolean(),
    showInheritedObjectFields: z.boolean(),
    showStaticObjectFields: z.boolean(),
    useObjectParameterDropdowns: z.boolean()
  }),
  editor: z.object({
    theme: z.string(),
    tabSize: z.number(),
    insertSpaces: z.boolean(),
    autoCloseBrackets: z.boolean(),
    autoCloseQuotes: z.boolean(),
    autoCloseComments: z.boolean(),
    wordWrap: z.boolean(),
    scopeHighlighting: z.boolean(),
    autoFormatOnSave: z.boolean()
  }),
  advanced: z.object({
    debugLogging: z.boolean(),
    debugLogCategories: z.object({
      startup: z.boolean(),
      launch: z.boolean(),
      languageServer: z.boolean(),
      editor: z.boolean(),
      uml: z.boolean(),
      structogram: z.boolean(),
      jshell: z.boolean()
    }),
    structogramColors: z.boolean(),
    updateChannel: z.enum(["stable", "prerelease"]),
    jshellWarmupDiagnosticMode: z.enum(["quick", "full"])
  }),
  structogram: z.object({
    loopHeaderColor: z.string(),
    ifHeaderColor: z.string(),
    switchHeaderColor: z.string(),
    tryWrapperColor: z.string()
  }),
  recentProjects: z.array(recentProjectEntrySchema),
  layout: z.object({
    umlSplitRatio: z.number(),
    consoleSplitRatio: z.number(),
    objectBenchSplitRatio: z.number()
  })
});

const lspPositionSchema = z
  .object({
    line: z.number(),
    character: z.number()
  })
  .loose();

const lspRangeSchema = z
  .object({
    start: lspPositionSchema,
    end: lspPositionSchema
  })
  .loose();

const lspTextEditSchema = z
  .object({
    range: lspRangeSchema,
    newText: z.string()
  })
  .loose();

export const lspTextEditArraySchema = z.array(lspTextEditSchema);

export const fileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    kind: z.enum(["file", "dir"]),
    children: z.array(fileNodeSchema).nullable().optional().transform((value) => value ?? undefined)
  })
);

export const lsCrashedEventSchema = z.object({
  projectRoot: z.string(),
  code: z.number().nullable().optional()
});

export const lsReadyEventSchema = z.object({
  projectRoot: z.string().optional()
});

export const lsErrorEventSchema = z.object({
  projectRoot: z.string().optional()
});
