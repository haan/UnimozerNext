import React from "react";
import { reportFrontendCrash } from "../../services/crashLogging";

type CrashBoundaryProps = {
  children: React.ReactNode;
};

type CrashBoundaryState = {
  hasError: boolean;
};

export class CrashBoundary extends React.Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportFrontendCrash("react.boundary", error, [
      `componentStack=${info.componentStack || "<none>"}`
    ]);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
          Unimozer Next encountered a fatal UI error. Restart the app and check the crash log in
          AppData.
        </div>
      );
    }
    return this.props.children;
  }
}
