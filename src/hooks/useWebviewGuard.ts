import { useEffect } from "react";

const isReloadShortcut = (event: KeyboardEvent) => {
  if (event.key === "F5") {
    return true;
  }
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";
};

export const useWebviewGuard = () => {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      // Keep webview-native actions (refresh/back/etc.) inaccessible.
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isReloadShortcut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
};
