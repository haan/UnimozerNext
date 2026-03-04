import { z } from "zod";
import type { FileNode } from "../models/files";

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

export const stringArraySchema = z.array(z.string());

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
