import { useRef, useState, type ComponentPropsWithoutRef } from "react";

import { DialogContent } from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../ui/alert-dialog";

type FormDialogContentProps = Omit<
  ComponentPropsWithoutRef<typeof DialogContent>,
  "onPointerDownOutside" | "onInteractOutside" | "onEscapeKeyDown"
> & {
  dirty: boolean;
  busy?: boolean;
  onDiscard: () => void;
};

/** Protect wizard drafts without changing dismissal behavior for other dialogs. */
export const FormDialogContent = ({
  dirty,
  busy,
  onDiscard,
  children,
  ...props
}: FormDialogContentProps) => {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  return (
    <>
      <DialogContent
        {...props}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy || dirty) event.preventDefault();
          if (busy || !dirty) return;
          previousFocus.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
          setConfirmDiscard(true);
        }}
      >
        {children}
      </DialogContent>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (previousFocus.current?.isConnected) previousFocus.current.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your entries in this dialog will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={onDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
