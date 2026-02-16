import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { UpdateChannel, UpdateSummary } from "../services/updater";
import { detectWindowsInstallerKind, updaterCheck, updaterInstall } from "../services/updater";
import { trimStatusText } from "../services/status";

type UseAppUpdaterArgs = {
  channel: UpdateChannel;
  setStatus: (status: string) => void;
};

type UpdateMenuState = "default" | "checking" | "available" | "installing";

type UseAppUpdaterResult = {
  showUpdateMenuItem: boolean;
  updateMenuState: UpdateMenuState;
  updateAvailableOpen: boolean;
  updateInstallBusy: boolean;
  updateSummary: UpdateSummary | null;
  blockedReason: string | null;
  checkForUpdates: () => void;
  openUpdateDialog: () => void;
  handleUpdateAvailableOpenChange: (open: boolean) => void;
  installUpdate: () => Promise<void>;
};

const BLOCKED_UPDATE_MESSAGE = "This installation cannot self-update on this computer.";
const INSTALLING_UPDATE_MESSAGE =
  "Downloading update... Unimozer Next will close to apply it.";
const INSTALLED_UPDATE_MESSAGE =
  "Update downloaded. Unimozer Next is closing to apply it.";

export const useAppUpdater = ({
  channel,
  setStatus
}: UseAppUpdaterArgs): UseAppUpdaterResult => {
  const [updaterSupport, setUpdaterSupport] = useState<"pending" | "enabled" | "disabled">(
    "pending"
  );
  const [checking, setChecking] = useState(false);
  const [manualCheckInProgress, setManualCheckInProgress] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [updateAvailableOpen, setUpdateAvailableOpen] = useState(false);
  const activeCheckTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const detectSupport = async () => {
      const isWindows =
        typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
      if (!isWindows) {
        if (!cancelled) {
          setUpdaterSupport("enabled");
        }
        return;
      }

      try {
        const installerKind = await detectWindowsInstallerKind();
        if (cancelled) {
          return;
        }
        setUpdaterSupport(installerKind === "nsis" ? "enabled" : "disabled");
      } catch {
        if (cancelled) {
          return;
        }
        setUpdaterSupport("disabled");
      }
    };
    void detectSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  const performCheck = useCallback(
    async (manual: boolean) => {
      if (updaterSupport !== "enabled") {
        return;
      }
      const checkToken = Date.now();
      activeCheckTokenRef.current = checkToken;
      setChecking(true);
      if (manual) {
        setManualCheckInProgress(true);
      }

      try {
        const result = await updaterCheck(channel);
        if (activeCheckTokenRef.current !== checkToken) {
          return;
        }
        const update = result.update ?? null;
        const installability = result.installability;
        if (!installability.installable) {
          setUpdateSummary(null);
          const reason = installability.reason ?? BLOCKED_UPDATE_MESSAGE;
          setBlockedReason(reason);
          if (manual) {
            setStatus(BLOCKED_UPDATE_MESSAGE);
            toast(BLOCKED_UPDATE_MESSAGE, {
              description: trimStatusText(reason, 220)
            });
          }
          return;
        }

        if (update) {
          setUpdateSummary(update);
          setBlockedReason(null);
          if (manual) {
            setStatus(`Update ${update.version} is available.`);
            setUpdateAvailableOpen(true);
          }
          return;
        }

        setUpdateSummary(null);
        setBlockedReason(null);
        if (manual) {
          setStatus("You are up to date.");
          toast.success("You are up to date.");
        }
      } catch (error) {
        if (activeCheckTokenRef.current !== checkToken) {
          return;
        }
        setUpdateSummary(null);
        setBlockedReason(error instanceof Error ? error.message : String(error));
        if (manual) {
          setStatus("Could not check for updates.");
          toast.error("Could not check for updates.");
        }
      } finally {
        if (activeCheckTokenRef.current === checkToken) {
          setChecking(false);
          setManualCheckInProgress(false);
        }
      }
    },
    [channel, setStatus, updaterSupport]
  );

  useEffect(() => {
    setUpdateSummary(null);
    setBlockedReason(null);
    setUpdateAvailableOpen(false);
    if (updaterSupport !== "enabled") {
      return;
    }
    void performCheck(false);
  }, [channel, performCheck, updaterSupport]);

  const checkForUpdates = useCallback(() => {
    if (updaterSupport !== "enabled" || checking || installing) {
      return;
    }
    void performCheck(true);
  }, [checking, installing, performCheck, updaterSupport]);

  const openUpdateDialog = useCallback(() => {
    if (updaterSupport !== "enabled" || !updateSummary) {
      return;
    }
    setUpdateAvailableOpen(true);
  }, [updateSummary, updaterSupport]);

  const handleUpdateAvailableOpenChange = useCallback((open: boolean) => {
    setUpdateAvailableOpen(open);
  }, []);

  const installUpdate = useCallback(async () => {
    if (updaterSupport !== "enabled" || installing) {
      return;
    }
    setStatus(INSTALLING_UPDATE_MESSAGE);
    setInstalling(true);
    try {
      const result = await updaterInstall(channel);
      const message = result.message?.trim() || INSTALLED_UPDATE_MESSAGE;
      if (result.installed) {
        setStatus(message);
        toast.success(message);
        setUpdateAvailableOpen(false);
        setUpdateSummary(null);
        setBlockedReason(null);
      } else {
        setStatus(message);
        toast.error(message);
      }
    } catch (error) {
      const message = trimStatusText(
        error instanceof Error ? error.message : String(error),
        220
      );
      setStatus("Update installation failed.");
      toast.error(`Update installation failed: ${message}`);
    } finally {
      setInstalling(false);
    }
  }, [channel, installing, setStatus, updaterSupport]);

  const updateMenuState = useMemo<UpdateMenuState>(() => {
    if (installing) {
      return "installing";
    }
    if (manualCheckInProgress) {
      return "checking";
    }
    if (updateSummary) {
      return "available";
    }
    return "default";
  }, [installing, manualCheckInProgress, updateSummary]);

  return {
    showUpdateMenuItem: updaterSupport === "enabled",
    updateMenuState,
    updateAvailableOpen,
    updateInstallBusy: installing,
    updateSummary,
    blockedReason,
    checkForUpdates,
    openUpdateDialog,
    handleUpdateAvailableOpenChange,
    installUpdate
  };
};
