import { invoke } from "@tauri-apps/api/core";

export const openExternalUrl = async (url: string) =>
  invoke<void>("open_url", { url });
