import { useMemo } from "react";

import type { UmlMethod } from "../../models/uml";
import {
  STRUCTOGRAM_CANVAS_PADDING,
  STRUCTOGRAM_HEADER_BOTTOM_PADDING_PX,
  STRUCTOGRAM_HEADER_TOP_PADDING_PX,
  STRUCTOGRAM_SVG_STROKE_WIDTH,
  STRUCTOGRAM_VIEWPORT_PADDING_PX
} from "./constants";
import { buildStructogramLayout, toMethodDeclaration } from "./layoutBuilder";
import { renderStructogramNode } from "./renderTree";

type StructogramViewProps = {
  method: UmlMethod;
};

export const StructogramView = ({ method }: StructogramViewProps) => {
  const layout = useMemo(() => buildStructogramLayout(method.controlTree), [method.controlTree]);
  const declaration = useMemo(() => toMethodDeclaration(method), [method]);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No control-tree data available for this method.
      </div>
    );
  }

  const width = layout.width + STRUCTOGRAM_CANVAS_PADDING * 2;
  const height = layout.height + STRUCTOGRAM_CANVAS_PADDING * 2;
  const signatureLeftPaddingPx = STRUCTOGRAM_VIEWPORT_PADDING_PX + STRUCTOGRAM_CANVAS_PADDING;

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col overflow-hidden p-3 text-sm"
      style={{ fontFamily: "var(--uml-font)" }}
    >
      <div
        style={{
          paddingTop: `${STRUCTOGRAM_HEADER_TOP_PADDING_PX}px`,
          paddingBottom: `${STRUCTOGRAM_HEADER_BOTTOM_PADDING_PX}px`,
          paddingLeft: `${signatureLeftPaddingPx}px`,
          paddingRight: `${STRUCTOGRAM_VIEWPORT_PADDING_PX}px`
        }}
      >
        <div className="truncate text-sm font-semibold text-foreground" title={declaration}>
          {declaration}
        </div>
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto bg-background"
        style={{ padding: `${STRUCTOGRAM_VIEWPORT_PADDING_PX}px` }}
      >
        <svg
          className="block"
          width={width}
          height={height}
          strokeWidth={STRUCTOGRAM_SVG_STROKE_WIDTH}
          style={{ fontFamily: "var(--uml-font)" }}
          role="img"
          aria-label="Nassi-Shneiderman structogram"
        >
          {renderStructogramNode(layout, STRUCTOGRAM_CANVAS_PADDING, STRUCTOGRAM_CANVAS_PADDING, layout.width)}
        </svg>
      </div>
    </div>
  );
};
