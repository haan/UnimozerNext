import type { AppSettings } from "../models/settings";
import { appSettingsSchema, invokeValidated, voidResponseSchema } from "./tauriValidation";

export const readSettings = () =>
  invokeValidated<AppSettings>("read_settings", appSettingsSchema, "read_settings response");

export const readDefaultSettings = () =>
  invokeValidated<AppSettings>(
    "read_default_settings",
    appSettingsSchema,
    "read_default_settings response"
  );

export const writeSettings = async (settings: AppSettings) => {
  await invokeValidated("write_settings", voidResponseSchema, "write_settings response", {
    settings
  });
};
