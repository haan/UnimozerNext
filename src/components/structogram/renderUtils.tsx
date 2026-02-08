import {
  STRUCTOGRAM_COLORS,
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_TEXT_BASELINE_OFFSET,
  STRUCTOGRAM_TEXT_PADDING_X
} from "./constants";

const textBaseline = (top: number, rowHeight: number) =>
  top + rowHeight / 2 + STRUCTOGRAM_TEXT_BASELINE_OFFSET / 2;

export const renderLeftAlignedText = (
  value: string,
  x: number,
  y: number,
  rowHeight: number,
  fill: string,
  key: string
) => (
  <text
    key={key}
    x={x + STRUCTOGRAM_TEXT_PADDING_X}
    y={textBaseline(y, rowHeight)}
    fontSize={STRUCTOGRAM_FONT_SIZE}
    fill={fill}
  >
    {value}
  </text>
);

export const renderCenteredText = (
  value: string,
  x: number,
  y: number,
  width: number,
  rowHeight: number,
  key: string
) => (
  <text
    key={key}
    x={x + width / 2}
    y={textBaseline(y, rowHeight)}
    textAnchor="middle"
    fontSize={STRUCTOGRAM_FONT_SIZE}
    fill={STRUCTOGRAM_COLORS.text}
  >
    {value}
  </text>
);

export const renderPaddedRemainder = (
  x: number,
  y: number,
  width: number,
  contentHeight: number,
  fullHeight: number,
  key: string
) => {
  if (contentHeight >= fullHeight) {
    return null;
  }
  return (
    <rect
      key={key}
      x={x}
      y={y + contentHeight}
      width={width}
      height={fullHeight - contentHeight}
      fill={STRUCTOGRAM_COLORS.body}
      stroke={STRUCTOGRAM_COLORS.border}
    />
  );
};

export const fitColumnWidths = (baseWidths: number[], targetWidth: number): number[] => {
  if (baseWidths.length === 0) {
    return [];
  }
  const baseTotal = baseWidths.reduce((sum, width) => sum + width, 0);
  if (baseTotal <= 0 || targetWidth <= 0) {
    return baseWidths;
  }
  if (Math.abs(baseTotal - targetWidth) < 0.5) {
    return baseWidths;
  }

  const scaled = baseWidths.map((width) => Math.floor((width / baseTotal) * targetWidth));
  let used = scaled.reduce((sum, width) => sum + width, 0);
  let remainder = targetWidth - used;
  const widths = [...scaled];
  let index = 0;
  while (remainder > 0) {
    widths[index % widths.length] += 1;
    remainder -= 1;
    index += 1;
  }
  used = widths.reduce((sum, width) => sum + width, 0);
  if (used !== targetWidth) {
    widths[widths.length - 1] += targetWidth - used;
  }
  return widths;
};
