import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { reportFrontendCrash } from "../../services/crashLogging";
import { Button } from "../ui/button";

type CrashBoundaryProps = {
  children: React.ReactNode;
};

type CrashBoundaryState = {
  hasError: boolean;
  message: string;
  stack: string[];
  copied: boolean;
  copiedPath: boolean;
  crashLogPath: string | null;
};

export class CrashBoundary extends React.Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = {
    hasError: false,
    message: "",
    stack: [],
    copied: false,
    copiedPath: false,
    crashLogPath: null
  };

  static getDerivedStateFromError(error: Error): CrashBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unknown UI error",
      stack: (error.stack ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 18),
      copied: false,
      copiedPath: false,
      crashLogPath: null
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportFrontendCrash("react.boundary", error, [
      `componentStack=${info.componentStack || "<none>"}`
    ]);
  }

  componentDidUpdate(_prevProps: CrashBoundaryProps, prevState: CrashBoundaryState): void {
    if (
      this.state.hasError &&
      !prevState.hasError &&
      this.state.crashLogPath === null
    ) {
      void this.loadCrashLogPath();
    }
  }

  private async loadCrashLogPath(): Promise<void> {
    try {
      const crashLogPath = await invoke<string>("get_crash_log_path");
      this.setState({ crashLogPath });
    } catch {
      // Keep fallback hint when backend path lookup fails.
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const crashLogLocationHint =
        this.state.crashLogPath ??
        "Could not resolve crash log path. Check app data folder for frontend-crash.log.";
      const crashText = [
        `Message: ${this.state.message}`,
        `Crash log path: ${crashLogLocationHint}`,
        ...this.state.stack.map((line) => `Stack: ${line}`)
      ].join("\n");
      const copyCrashDetails = async () => {
        try {
          await navigator.clipboard.writeText(crashText);
          this.setState({ copied: true });
          window.setTimeout(() => this.setState({ copied: false }), 1500);
        } catch {
          this.setState({ copied: false });
        }
      };
      const copyCrashPath = async () => {
        if (!this.state.crashLogPath) {
          return;
        }
        try {
          await navigator.clipboard.writeText(this.state.crashLogPath);
          this.setState({ copiedPath: true });
          window.setTimeout(() => this.setState({ copiedPath: false }), 1500);
        } catch {
          this.setState({ copiedPath: false });
        }
      };
      return (
        <div className="flex h-full items-center justify-center bg-background px-4 py-8">
          <section className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
            <header className="px-8 pt-8">
              <h1 className="text-lg font-semibold text-foreground">
                Oh no, it looks like we crashed!
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Please restart the app and send the crash details to{" "}
                <a
                  className="font-medium text-primary underline underline-offset-2"
                  href="mailto:laurent.haan@education.lu"
                >
                  laurent.haan@education.lu
                </a>
                .
              </p>
            </header>
            <div className="space-y-5 px-8 pb-8 pt-5">
              <div className="flex justify-center pt-1">
                <img
                  src="/icon/turtle_crash.png"
                  alt="Turtle crash illustration"
                  className="max-h-72 w-auto rounded-md"
                />
              </div>

              <div className="rounded-lg bg-muted/40 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Crash log
                </p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{crashLogLocationHint}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => window.location.reload()}>
                  Reload UI
                </Button>
                <Button variant="secondary" onClick={() => void copyCrashDetails()}>
                  {this.state.copied ? "Copied" : "Copy crash details"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void copyCrashPath()}
                  disabled={!this.state.crashLogPath}
                >
                  {this.state.copiedPath ? "Path copied" : "Copy crash log path"}
                </Button>
              </div>

              {this.state.stack.length > 0 ? (
                <details className="rounded-lg bg-muted/30 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    Stack trace
                  </summary>
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-3 text-xs text-muted-foreground">
                    {this.state.stack.join("\n")}
                  </pre>
                </details>
              ) : null}
            </div>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}
