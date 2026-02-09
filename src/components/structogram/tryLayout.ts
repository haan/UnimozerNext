import {
  STRUCTOGRAM_SECTION_HEADER_HEIGHT,
  STRUCTOGRAM_TRY_FRAME_BOTTOM_HEIGHT,
  STRUCTOGRAM_TRY_FRAME_SIDE_WIDTH,
  STRUCTOGRAM_TRY_FRAME_TOP_HEIGHT
} from "./constants";

export type TryCatchLayout<TBody> = {
  exception: string;
  body: TBody;
};

export type TryLayoutNode<TBody> = {
  kind: "try";
  body: TBody;
  catches: Array<TryCatchLayout<TBody>>;
  finallyBranch: TBody | null;
  width: number;
  height: number;
};

type BuildTryLayoutArgs<TBody extends { width: number; height: number }> = {
  body: TBody;
  catches: Array<TryCatchLayout<TBody>>;
  finallyBranch: TBody | null;
  estimatedTextWidth: (value: string) => number;
};

export const buildTryLayout = <TBody extends { width: number; height: number }>({
  body,
  catches,
  finallyBranch,
  estimatedTextWidth
}: BuildTryLayoutArgs<TBody>): TryLayoutNode<TBody> => {
  const bodyWidth = Math.max(estimatedTextWidth("try"), body.width);
  const catchWidths = catches.map((entry) =>
    Math.max(estimatedTextWidth(`catch (${entry.exception})`), entry.body.width)
  );
  const finallyWidth =
    finallyBranch === null
      ? estimatedTextWidth("finally")
      : Math.max(estimatedTextWidth("finally"), finallyBranch.width);
  const contentWidth = Math.max(bodyWidth, ...catchWidths, finallyWidth);
  const width = contentWidth + STRUCTOGRAM_TRY_FRAME_SIDE_WIDTH;

  let height = STRUCTOGRAM_TRY_FRAME_TOP_HEIGHT + body.height;
  for (const entry of catches) {
    height += STRUCTOGRAM_SECTION_HEADER_HEIGHT + entry.body.height;
  }
  if (finallyBranch) {
    height += STRUCTOGRAM_SECTION_HEADER_HEIGHT + finallyBranch.height;
  }
  height += STRUCTOGRAM_TRY_FRAME_BOTTOM_HEIGHT;

  return {
    kind: "try",
    body,
    catches,
    finallyBranch,
    width,
    height
  };
};
