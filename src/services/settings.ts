import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../models/settings";

export const readSettings = () => invoke<AppSettings>("read_settings");

export const writeSettings = (settings: AppSettings) =>
  invoke<void>("write_settings", { settings });
