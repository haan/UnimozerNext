import { invoke } from "@tauri-apps/api/core";

export type UpdateChannel = "stable" | "prerelease";

export type UpdateInstallability = {
  installable: boolean;
  reason?: string | null;
  installPath: string;
};

export type UpdateSummary = {
  currentVersion: string;
  version: string;
  notes?: string | null;
  pubDate?: string | null;
  target: string;
  downloadUrl: string;
};

export type UpdateCheckResult = {
  channel: UpdateChannel;
  target: string;
  update?: UpdateSummary | null;
  installability: UpdateInstallability;
};

export type UpdateInstallResult = {
  installed: boolean;
  version?: string | null;
  message?: string | null;
};

export const updaterCheck = (channel: UpdateChannel) =>
  invoke<UpdateCheckResult>("updater_check", { channel });

export const updaterInstall = (channel: UpdateChannel) =>
  invoke<UpdateInstallResult>("updater_install", { channel });

export const updaterInstallability = () =>
  invoke<UpdateInstallability>("updater_installability");

export const detectWindowsInstallerKind = () =>
  invoke<"msi" | "nsis" | "unknown">("detect_windows_installer_kind");
