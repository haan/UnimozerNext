import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { openExternalUrl } from "../../services/externalLinks";
import { DepthLogo } from "./DepthLogo";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const APP_REPOSITORY_URL = "https://github.com/haan/UnimozerNext";
const MAINTAINER_NAME = "Laurent Haan";
const MAINTAINER_EMAIL = "laurent.haan@education.lu";
const MAINTAINER_WEBSITE_URL = "https://www.haan.lu";
const ORIGINAL_AUTHOR_NAME = "Bob Fisch";
const ORIGINAL_AUTHOR_WEBSITE_URL = "https://fisch.lu/";
const ORIGINAL_UNIMOZER_WEBSITE_URL = "https://unimozer.fisch.lu/";
const ORIGINAL_UNIMOZER_REPOSITORY_URL = "https://github.com/fesch/Unimozer";

const linkClass =
  "break-all cursor-pointer text-primary underline underline-offset-2 transition hover:text-primary/80";

export const AboutDialog = ({ open, onOpenChange }: AboutDialogProps) => {
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    const loadVersion = async () => {
      try {
        const version = await getVersion();
        if (active) {
          setAppVersion(version);
        }
      } catch {
        if (active) {
          setAppVersion("");
        }
      }
    };
    void loadVersion();
    return () => {
      active = false;
    };
  }, [open]);

  const openLink = useCallback((url: string) => {
    void openExternalUrl(url).catch(() => {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[700px] max-w-[94vw] overflow-hidden p-0">
      <div className="relative border-b border-border bg-muted/45 px-6 py-6 text-center dark:bg-background">
        {appVersion ? (
          <div className="absolute right-4 top-3 text-xs font-medium text-muted-foreground">
            v{appVersion}
          </div>
        ) : null}
        <DepthLogo open={open} className="mx-auto h-44 w-44" ariaLabel="Unimozer Next logo" />
        <DialogTitle className="mt-4 text-2xl">Unimozer Next</DialogTitle>
        <DialogDescription className="mx-auto mt-1 max-w-xl text-sm">
          A modern desktop rewrite of Unimozer for UML-first Java learning.
        </DialogDescription>
      </div>

      <div className="max-h-[260px] space-y-5 overflow-y-auto px-6 py-5">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What This App Includes
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>UML class diagram editing and synchronization with Java source code.</li>
            <li>Monaco-based Java editor with diagnostics and optional scope highlighting.</li>
            <li>Compile/run workflow with console output and object bench integration.</li>
            <li>Structogram view and image export for UML and structogram diagrams.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Maintainer
          </h3>
          <div className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">Name</span>
            <span>{MAINTAINER_NAME}</span>
            <span className="text-muted-foreground">Email</span>
            <button
              type="button"
              onClick={() => {
                openLink(`mailto:${MAINTAINER_EMAIL}`);
              }}
              className={`${linkClass} text-left`}
            >
              {MAINTAINER_EMAIL}
            </button>
            <span className="text-muted-foreground">Website</span>
            <button
              type="button"
              onClick={() => {
                openLink(MAINTAINER_WEBSITE_URL);
              }}
              className={`${linkClass} text-left`}
            >
              {MAINTAINER_WEBSITE_URL}
            </button>
            <span className="text-muted-foreground">Repository</span>
            <button
              type="button"
              onClick={() => {
                openLink(APP_REPOSITORY_URL);
              }}
              className={`${linkClass} text-left`}
            >
              {APP_REPOSITORY_URL}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Original Unimozer
          </h3>
          <div className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">Original author</span>
            <span>{ORIGINAL_AUTHOR_NAME}</span>
            <span className="text-muted-foreground">Author website</span>
            <button
              type="button"
              onClick={() => {
                openLink(ORIGINAL_AUTHOR_WEBSITE_URL);
              }}
              className={`${linkClass} text-left`}
            >
              {ORIGINAL_AUTHOR_WEBSITE_URL}
            </button>
            <span className="text-muted-foreground">Original website</span>
            <button
              type="button"
              onClick={() => {
                openLink(ORIGINAL_UNIMOZER_WEBSITE_URL);
              }}
              className={`${linkClass} text-left`}
            >
              {ORIGINAL_UNIMOZER_WEBSITE_URL}
            </button>
            <span className="text-muted-foreground">Original repository</span>
            <button
              type="button"
              onClick={() => {
                openLink(ORIGINAL_UNIMOZER_REPOSITORY_URL);
              }}
              className={`${linkClass} text-left`}
            >
              {ORIGINAL_UNIMOZER_REPOSITORY_URL}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Why A Turtle?
          </h3>
          <p className="text-sm leading-relaxed">
            Long ago, someone chose a turtle as the Unimozer logo. Why? No one knows anymore. The
            original explanation disappeared many years ago, and now only guesses remain. Maybe the
            turtle was picked because it is calm and patient. Maybe it was just very cute. In any
            case, the mystery lives on, and the turtle has become part of Unimozer history.
          </p>
          <img
            src="/icon/original_icon.png"
            alt="Original Unimozer turtle icon"
            className="mx-auto mt-3 h-20 w-20 object-contain"
          />
          <p className="text-center text-xs text-muted-foreground">
            "It&apos;s turtles all the way down."
          </p>
        </section>
      </div>

      <div className="border-t border-border bg-muted/35 px-6 py-4 dark:bg-background">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </DialogContent>
    </Dialog>
  );
};
