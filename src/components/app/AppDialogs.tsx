import { AddClassDialog, type AddClassForm } from "../wizards/AddClassDialog";
import { AddFieldDialog, type AddFieldForm } from "../wizards/AddFieldDialog";
import {
  AddConstructorDialog,
  type AddConstructorForm
} from "../wizards/AddConstructorDialog";
import { AddMethodDialog, type AddMethodForm } from "../wizards/AddMethodDialog";
import { CreateObjectDialog, type CreateObjectForm } from "../wizards/CreateObjectDialog";
import { CallMethodDialog, type CallMethodForm } from "../wizards/CallMethodDialog";
import { SettingsDialog } from "../settings/SettingsDialog";
import { AboutDialog } from "./AboutDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import type { AppSettings } from "../../models/settings";
import type { UpdateSummary } from "../../services/updater";

type AppDialogsProps = {
  aboutOpen: boolean;
  onAboutOpenChange: (open: boolean) => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  addClassOpen: boolean;
  onAddClassOpenChange: (open: boolean) => void;
  onCreateClass: (form: AddClassForm) => void;
  addFieldOpen: boolean;
  onAddFieldOpenChange: (open: boolean) => void;
  onCreateField: (form: AddFieldForm) => void;
  addConstructorOpen: boolean;
  onAddConstructorOpenChange: (open: boolean) => void;
  addConstructorClassName?: string;
  onCreateConstructor: (form: AddConstructorForm) => void;
  addMethodOpen: boolean;
  onAddMethodOpenChange: (open: boolean) => void;
  addMethodClassName?: string;
  onCreateMethod: (form: AddMethodForm) => void;
  createObjectOpen: boolean;
  onCreateObjectOpenChange: (open: boolean) => void;
  onCreateObject: (form: CreateObjectForm) => void;
  createObjectClassName: string;
  createObjectConstructorLabel: string;
  createObjectParams: { name: string; type: string }[];
  existingObjectNames: string[];
  callMethodOpen: boolean;
  onCallMethodOpenChange: (open: boolean) => void;
  onCallMethod: (form: CallMethodForm) => void;
  callMethodObjectName: string;
  callMethodLabel: string;
  callMethodParams: { name: string; type: string }[];
  callMethodUseObjectParameterDropdowns: boolean;
  callMethodAvailableObjects: { name: string; type: string; compatibleTypes?: string[] }[];
  removeClassOpen: boolean;
  onRemoveClassOpenChange: (open: boolean) => void;
  removeTargetName: string | null;
  onConfirmRemoveClass: () => void;
  confirmProjectActionOpen: boolean;
  onConfirmProjectActionOpenChange: (open: boolean) => void;
  canConfirmProjectAction: boolean;
  projectActionConfirmBusy: boolean;
  onSaveBeforeProjectAction: () => void;
  onConfirmProjectAction: () => void;
  missingRecentProjectOpen: boolean;
  missingRecentProjectPath: string | null;
  onMissingRecentProjectOpenChange: (open: boolean) => void;
  reloadFromDiskDialogOpen: boolean;
  onReloadFromDiskDialogOpenChange: (open: boolean) => void;
  onConfirmReloadFromDisk: () => void;
  onIgnoreReloadFromDisk: () => void;
  methodReturnOpen: boolean;
  onMethodReturnOpenChange: (open: boolean) => void;
  methodReturnLabel: string;
  methodReturnValue: string | null;
  updateAvailableOpen: boolean;
  onUpdateAvailableOpenChange: (open: boolean) => void;
  updateSummary: UpdateSummary | null;
  updateHasPendingChanges: boolean;
  blockedUpdateReason: string | null;
  onSaveAndInstallUpdate: () => void;
  onInstallUpdate: () => void;
  updateInstallBusy: boolean;
  busy: boolean;
};

export const AppDialogs = ({
  aboutOpen,
  onAboutOpenChange,
  settingsOpen,
  onSettingsOpenChange,
  settings,
  onSettingsChange,
  addClassOpen,
  onAddClassOpenChange,
  onCreateClass,
  addFieldOpen,
  onAddFieldOpenChange,
  onCreateField,
  addConstructorOpen,
  onAddConstructorOpenChange,
  addConstructorClassName,
  onCreateConstructor,
  addMethodOpen,
  onAddMethodOpenChange,
  addMethodClassName,
  onCreateMethod,
  createObjectOpen,
  onCreateObjectOpenChange,
  onCreateObject,
  createObjectClassName,
  createObjectConstructorLabel,
  createObjectParams,
  existingObjectNames,
  callMethodOpen,
  onCallMethodOpenChange,
  onCallMethod,
  callMethodObjectName,
  callMethodLabel,
  callMethodParams,
  callMethodUseObjectParameterDropdowns,
  callMethodAvailableObjects,
  removeClassOpen,
  onRemoveClassOpenChange,
  removeTargetName,
  onConfirmRemoveClass,
  confirmProjectActionOpen,
  onConfirmProjectActionOpenChange,
  canConfirmProjectAction,
  projectActionConfirmBusy,
  onSaveBeforeProjectAction,
  onConfirmProjectAction,
  missingRecentProjectOpen,
  missingRecentProjectPath,
  onMissingRecentProjectOpenChange,
  reloadFromDiskDialogOpen,
  onReloadFromDiskDialogOpenChange,
  onConfirmReloadFromDisk,
  onIgnoreReloadFromDisk,
  methodReturnOpen,
  onMethodReturnOpenChange,
  methodReturnLabel,
  methodReturnValue,
  updateAvailableOpen,
  onUpdateAvailableOpenChange,
  updateSummary,
  updateHasPendingChanges,
  blockedUpdateReason,
  onSaveAndInstallUpdate,
  onInstallUpdate,
  updateInstallBusy,
  busy
}: AppDialogsProps) => (
  <>
    <AboutDialog open={aboutOpen} onOpenChange={onAboutOpenChange} />
    <SettingsDialog
      open={settingsOpen}
      onOpenChange={onSettingsOpenChange}
      settings={settings}
      onChange={onSettingsChange}
    />
    <AddClassDialog
      open={addClassOpen}
      onOpenChange={onAddClassOpenChange}
      onSubmit={onCreateClass}
      busy={busy}
    />
    <AddFieldDialog
      open={addFieldOpen}
      onOpenChange={onAddFieldOpenChange}
      onSubmit={onCreateField}
      busy={busy}
    />
    <AddConstructorDialog
      open={addConstructorOpen}
      onOpenChange={onAddConstructorOpenChange}
      onSubmit={onCreateConstructor}
      className={addConstructorClassName}
      busy={busy}
    />
    <AddMethodDialog
      open={addMethodOpen}
      onOpenChange={onAddMethodOpenChange}
      onSubmit={onCreateMethod}
      className={addMethodClassName}
      busy={busy}
    />
    <CreateObjectDialog
      open={createObjectOpen}
      onOpenChange={onCreateObjectOpenChange}
      onSubmit={onCreateObject}
      className={createObjectClassName}
      constructorLabel={createObjectConstructorLabel}
      params={createObjectParams}
      existingNames={existingObjectNames}
      busy={busy}
    />
    <CallMethodDialog
      open={callMethodOpen}
      onOpenChange={onCallMethodOpenChange}
      onSubmit={onCallMethod}
      objectName={callMethodObjectName}
      methodLabel={callMethodLabel}
      params={callMethodParams}
      useObjectParameterDropdowns={callMethodUseObjectParameterDropdowns}
      availableObjects={callMethodAvailableObjects}
      busy={busy}
    />
    <AlertDialog open={removeClassOpen} onOpenChange={onRemoveClassOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </AlertDialogMedia>
          <AlertDialogTitle>Remove class?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            This will delete{" "}
            <strong>{removeTargetName || "this class"}</strong>. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-6 py-4">
          <AlertDialogCancel
            variant="outline"
            className="w-full"
            disabled={busy}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="w-full bg-destructive/10 text-destructive hover:bg-destructive/20"
            disabled={busy || !removeTargetName}
            onClick={onConfirmRemoveClass}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={confirmProjectActionOpen}
      onOpenChange={onConfirmProjectActionOpenChange}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            You have unsaved changes. Save before continuing, or continue to discard them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-3 gap-3 border-t border-border bg-muted/40 px-6 py-4">
          <AlertDialogCancel
            variant="outline"
            className="w-full"
            disabled={busy || projectActionConfirmBusy}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={busy || projectActionConfirmBusy || !canConfirmProjectAction}
            onClick={onSaveBeforeProjectAction}
          >
            Save
          </Button>
          <AlertDialogAction
            variant="outline"
            className="w-full"
            disabled={busy || projectActionConfirmBusy || !canConfirmProjectAction}
            onClick={onConfirmProjectAction}
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={reloadFromDiskDialogOpen}
      onOpenChange={onReloadFromDiskDialogOpenChange}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle>Files changed on disk</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Your project changed outside Unimozer Next. Reloading will overwrite current unsaved
            changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-6 py-4">
          <AlertDialogCancel
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={onIgnoreReloadFromDisk}
          >
            Ignore
          </AlertDialogCancel>
          <AlertDialogAction
            className="w-full"
            disabled={busy}
            onClick={onConfirmReloadFromDisk}
          >
            Reload
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={missingRecentProjectOpen}
      onOpenChange={onMissingRecentProjectOpenChange}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle>Recent project not found</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            This path no longer exists.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {missingRecentProjectPath ? (
          <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground break-all whitespace-pre-wrap">
            {missingRecentProjectPath}
          </div>
        ) : null}
        <AlertDialogFooter className="-mx-6 -mb-6 mt-4 border-t border-border bg-muted/40 px-6 py-4">
          <AlertDialogAction className="w-full">OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={methodReturnOpen} onOpenChange={onMethodReturnOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle>Method return value</AlertDialogTitle>
          {methodReturnLabel ? (
            <AlertDialogDescription className="text-center">
              {methodReturnLabel}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          {methodReturnValue ?? ""}
        </div>
        <AlertDialogFooter className="-mx-6 -mb-6 mt-4 border-t border-border bg-muted/40 px-6 py-4">
          <AlertDialogAction className="w-full">OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={updateAvailableOpen}
      onOpenChange={(open) => {
        if (updateInstallBusy) {
          return;
        }
        onUpdateAvailableOpenChange(open);
      }}
    >
      <AlertDialogContent size="md">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle>{updateInstallBusy ? "Installing update..." : "Update available"}</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {updateInstallBusy
              ? "Downloading update. Unimozer Next will close automatically when ready."
              : updateSummary
              ? `Version ${updateSummary.version} is ready to install.`
              : "A new version is available."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {updateSummary ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              <div>
                Current: <strong>{updateSummary.currentVersion}</strong>
              </div>
              <div>
                Available: <strong>{updateSummary.version}</strong>
              </div>
              <div>
                Target: <strong>{updateSummary.target}</strong>
              </div>
            </div>
          </div>
        ) : null}
        {updateInstallBusy ? (
          <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.25"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span>Installing update...</span>
          </div>
        ) : null}
        {blockedUpdateReason ? (
          <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {blockedUpdateReason}
          </div>
        ) : null}
        {updateInstallBusy ? (
          <AlertDialogFooter className="-mx-6 -mb-6 mt-4 border-t border-border bg-muted/40 px-6 py-4">
            <Button type="button" size="sm" className="w-full" disabled>
              Installing...
            </Button>
          </AlertDialogFooter>
        ) : updateHasPendingChanges ? (
          <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <AlertDialogCancel
              variant="outline"
              className="w-full"
              disabled={busy}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full border border-input bg-background font-medium shadow-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              disabled={busy || !updateSummary}
              onClick={onInstallUpdate}
            >
              Install without saving
            </Button>
            <Button
              type="button"
              size="sm"
              className="col-span-2 w-full"
              disabled={busy || !updateSummary}
              onClick={onSaveAndInstallUpdate}
            >
              Save and install
            </Button>
          </AlertDialogFooter>
        ) : (
          <AlertDialogFooter className="-mx-6 -mb-6 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <AlertDialogCancel
              variant="outline"
              className="w-full"
              disabled={busy}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy || !updateSummary}
              onClick={onInstallUpdate}
            >
              Install update
            </Button>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  </>
);
