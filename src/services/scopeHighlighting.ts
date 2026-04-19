export type ScopeLineInfo = {
  startDepth: number;
  leadingCloseCount: number;
  openCount: number;
  closeCount: number;
  hasCodeToken: boolean;
  hasCommentToken: boolean;
};

export const SCOPE_STRUCTURAL_INSERT_PATTERN = /[{}"'/\\*\r\n]/;

export const computeScopeLineInfo = (source: string): ScopeLineInfo[] => {
  const lines: ScopeLineInfo[] = [];
  let depth = 0;
  let line: ScopeLineInfo = {
    startDepth: 0,
    leadingCloseCount: 0,
    openCount: 0,
    closeCount: 0,
    hasCodeToken: false,
    hasCommentToken: false
  };
  let leadingPhase = true;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let inChar = false;
  let inTextBlock = false;
  let escaped = false;

  const pushLine = () => {
    lines.push(line);
    line = {
      startDepth: depth,
      leadingCloseCount: 0,
      openCount: 0,
      closeCount: 0,
      hasCodeToken: false,
      hasCommentToken: false
    };
    leadingPhase = true;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";
    const nextNext = source[index + 2] ?? "";

    if (char === "\r") {
      continue;
    }

    if (inLineComment) {
      line.hasCommentToken = true;
      if (char === "\n") {
        inLineComment = false;
        pushLine();
      }
      continue;
    }

    if (inBlockComment) {
      line.hasCommentToken = true;
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
        continue;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (inTextBlock) {
      if (char === '"' && next === '"' && nextNext === '"') {
        inTextBlock = false;
        index += 2;
        continue;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (inChar) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "'") {
        inChar = false;
      }
      if (char === "\n") {
        pushLine();
      }
      continue;
    }

    if (char === "/" && next === "/") {
      line.hasCommentToken = true;
      leadingPhase = false;
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      line.hasCommentToken = true;
      leadingPhase = false;
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' && next === '"' && nextNext === '"') {
      leadingPhase = false;
      inTextBlock = true;
      index += 2;
      continue;
    }
    if (char === '"') {
      leadingPhase = false;
      inString = true;
      continue;
    }
    if (char === "'") {
      leadingPhase = false;
      inChar = true;
      continue;
    }
    if (char === " " || char === "\t") {
      continue;
    }
    if (char === "{") {
      line.hasCodeToken = true;
      line.openCount += 1;
      leadingPhase = false;
      depth += 1;
      continue;
    }
    if (char === "}") {
      line.hasCodeToken = true;
      line.closeCount += 1;
      if (leadingPhase) {
        line.leadingCloseCount += 1;
      } else {
        leadingPhase = false;
      }
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "\n") {
      pushLine();
      continue;
    }
    line.hasCodeToken = true;
    leadingPhase = false;
  }

  lines.push(line);
  return lines;
};

type ContentChange = { rangeLength: number; text: string };

export const shouldRefreshScopeForContentChanges = (event: {
  changes: ContentChange[];
}): boolean => {
  for (const change of event.changes) {
    if (change.rangeLength > 0) {
      return true;
    }
    if (SCOPE_STRUCTURAL_INSERT_PATTERN.test(change.text)) {
      return true;
    }
  }
  return false;
};
