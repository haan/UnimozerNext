import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { parseSchemaOrThrow } from "./tauriValidation";

const updateChannelSchema = z.enum(["stable", "prerelease"]);
const updateInstallabilitySchema = z.object({
  installable: z.boolean(),
  reason: z.string().nullable().optional(),
  installPath: z.string()
});
const updateSummarySchema = z.object({
  currentVersion: z.string(),
  version: z.string(),
  notes: z.string().nullable().optional(),
  pubDate: z.string().nullable().optional(),
  target: z.string(),
  downloadUrl: z.string()
});
const updateCheckResultSchema = z.object({
  channel: updateChannelSchema,
  target: z.string(),
  update: updateSummarySchema.nullable().optional(),
  installability: updateInstallabilitySchema
});
const updateInstallResultSchema = z.object({
  installed: z.boolean(),
  version: z.string().nullable().optional(),
  message: z.string().nullable().optional()
});
const windowsInstallerKindSchema = z.enum(["msi", "nsis", "unknown"]);

export type UpdateChannel = z.infer<typeof updateChannelSchema>;
export type UpdateInstallability = z.infer<typeof updateInstallabilitySchema>;
export type UpdateSummary = z.infer<typeof updateSummarySchema>;
export type UpdateCheckResult = z.infer<typeof updateCheckResultSchema>;
export type UpdateInstallResult = z.infer<typeof updateInstallResultSchema>;

export const updaterCheck = async (channel: UpdateChannel): Promise<UpdateCheckResult> => {
  const raw = await invoke<unknown>("updater_check", { channel });
  return parseSchemaOrThrow(updateCheckResultSchema, raw, "updater_check response");
};

export const updaterInstall = async (channel: UpdateChannel): Promise<UpdateInstallResult> => {
  const raw = await invoke<unknown>("updater_install", { channel });
  return parseSchemaOrThrow(updateInstallResultSchema, raw, "updater_install response");
};

export const updaterInstallability = async (): Promise<UpdateInstallability> => {
  const raw = await invoke<unknown>("updater_installability");
  return parseSchemaOrThrow(
    updateInstallabilitySchema,
    raw,
    "updater_installability response"
  );
};

export const detectWindowsInstallerKind = async (): Promise<"msi" | "nsis" | "unknown"> => {
  const raw = await invoke<unknown>("detect_windows_installer_kind");
  return parseSchemaOrThrow(
    windowsInstallerKindSchema,
    raw,
    "detect_windows_installer_kind response"
  );
};

