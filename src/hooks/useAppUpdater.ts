import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { UpdateChannel, UpdateSummary } from "../services/updater";
import { updaterCheck, updaterInstall } from "../services/updater";
import { trimStatusText } from "../services/status";

type UseAppUpdaterArgs = {
  channel: UpdateChannel;
  setStatus: (status: string) => void;
};

type UpdateMenuState = "default" | "checking" | "available";

type UseAppUpdaterResult = {
  updateMenuState: UpdateMenuState;
  updateAvailableOpen: boolean;
  updateInstallBusy: boolean;
  updateSummary: UpdateSummary | null;
  blockedReason: string | null;
  checkForUpdates: () => void;
  openUpdateDialog: () => void;
  handleUpdateAvailableOpenChange: (open: boolean) => void;
  installUpdate: () => void;
};

const BLOCKED_UPDATE_MESSAGE =
  "Update found, but this installation cannot self-update on this computer.";

export const useAppUpdater = ({
  channel,
  setStatus
}: UseAppUpdaterArgs): UseAppUpdaterResult => {
  const [checking, setChecking] = useState(false);
  const [manualCheckInProgress, setManualCheckInProgress] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [updateAvailableOpen, setUpdateAvailableOpen] = useState(false);
  const activeCheckTokenRef = useRef(0);

  const performCheck = useCallback(
    async (manual: boolean) => {
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

        if (update && installability.installable) {
          setUpdateSummary(update);
          setBlockedReason(null);
          if (manual) {
            setStatus(`Update ${update.version} is available.`);
            setUpdateAvailableOpen(true);
          }
          return;
        }

        setUpdateSummary(null);
        if (update && !installability.installable) {
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
    [channel, setStatus]
  );

  useEffect(() => {
    setUpdateSummary(null);
    setBlockedReason(null);
    setUpdateAvailableOpen(false);
    void performCheck(false);
  }, [channel, performCheck]);

  const checkForUpdates = useCallback(() => {
    if (checking || installing) {
      return;
    }
    void performCheck(true);
  }, [checking, installing, performCheck]);

  const openUpdateDialog = useCallback(() => {
    if (!updateSummary) {
      return;
    }
    setUpdateAvailableOpen(true);
  }, [updateSummary]);

  const handleUpdateAvailableOpenChange = useCallback((open: boolean) => {
    setUpdateAvailableOpen(open);
  }, []);

  const installUpdate = useCallback(async () => {
    if (installing) {
      return;
    }
    setStatus("Installing update...");
    setInstalling(true);
    try {
      const result = await updaterInstall(channel);
      const message =
        result.message?.trim() || "Update installed. Restart Unimozer Next to apply.";
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
  }, [channel, installing, setStatus]);

  const updateMenuState = useMemo<UpdateMenuState>(() => {
    if (manualCheckInProgress) {
      return "checking";
    }
    if (updateSummary) {
      return "available";
    }
    return "default";
  }, [manualCheckInProgress, updateSummary]);

  return {
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
