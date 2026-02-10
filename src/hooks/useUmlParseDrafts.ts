import { useEffect, useMemo, useState } from "react";

import type { FileDraft } from "../models/drafts";
import { UML_PARSE_DRAFT_DEBOUNCE_MS } from "../constants/app";

type UseUmlParseDraftsArgs = {
  projectPath: string | null;
  fileDrafts: Record<string, FileDraft>;
};

export const useUmlParseDrafts = ({
  projectPath,
  fileDrafts
}: UseUmlParseDraftsArgs): Record<string, FileDraft> => {
  const [umlParseDrafts, setUmlParseDrafts] = useState(fileDrafts);

  useEffect(() => {
    if (!projectPath) {
      return;
    }
    const timer = window.setTimeout(() => {
      setUmlParseDrafts(fileDrafts);
    }, UML_PARSE_DRAFT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fileDrafts, projectPath]);

  return useMemo(
    () => (projectPath ? umlParseDrafts : {}),
    [projectPath, umlParseDrafts]
  );
};
