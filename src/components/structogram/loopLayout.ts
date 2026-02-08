import {
  STRUCTOGRAM_HEADER_HEIGHT,
  STRUCTOGRAM_LOOP_BODY_INSET_WIDTH,
  STRUCTOGRAM_ROW_HEIGHT
} from "./constants";

export type LoopLayoutNode<TBody> = {
  kind: "loop";
  header: string;
  footer: string | null;
  bodyInsetWidth: number;
  body: TBody;
  width: number;
  height: number;
};

type BuildLoopLayoutArgs<TBody extends { width: number; height: number }> = {
  loopKind: string | null | undefined;
  condition: string;
  body: TBody;
  estimatedTextWidth: (value: string) => number;
};

const loopHeader = (loopKind: string | null | undefined, condition: string) => {
  const kind = loopKind?.trim() || "loop";
  if (kind === "doWhile") {
    return { header: "do", footer: `while (${condition})` };
  }
  return {
    header: `${kind} (${condition})`,
    footer: null
  };
};

export const buildLoopLayout = <TBody extends { width: number; height: number }>({
  loopKind,
  condition,
  body,
  estimatedTextWidth
}: BuildLoopLayoutArgs<TBody>): LoopLayoutNode<TBody> => {
  const labels = loopHeader(loopKind, condition);

  if (labels.footer) {
    const width = Math.max(
      estimatedTextWidth(labels.header),
      estimatedTextWidth(labels.footer),
      body.width
    );
    const height = STRUCTOGRAM_HEADER_HEIGHT + body.height + STRUCTOGRAM_HEADER_HEIGHT;
    return {
      kind: "loop",
      header: labels.header,
      footer: labels.footer,
      bodyInsetWidth: 0,
      body,
      width,
      height
    };
  }

  const width = Math.max(
    estimatedTextWidth(labels.header),
    body.width + STRUCTOGRAM_LOOP_BODY_INSET_WIDTH
  );
  const height = Math.max(STRUCTOGRAM_ROW_HEIGHT * 2, body.height);
  return {
    kind: "loop",
    header: labels.header,
    footer: labels.footer,
    bodyInsetWidth: STRUCTOGRAM_LOOP_BODY_INSET_WIDTH,
    body,
    width,
    height
  };
};
