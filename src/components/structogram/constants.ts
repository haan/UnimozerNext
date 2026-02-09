// Structogram
export const STRUCTOGRAM_FONT_SIZE = 12; // Base text size for structogram labels and statements.
export const STRUCTOGRAM_CHAR_WIDTH = 7; // Width estimate per character for structogram text measurement.
export const STRUCTOGRAM_ROW_HEIGHT = 30; // Default row height for simple structogram statements.
export const STRUCTOGRAM_HEADER_HEIGHT = 30; // Header row height for conditional/loop/container blocks.
export const STRUCTOGRAM_SECTION_HEADER_HEIGHT = 24; // Sub-header row height for switch cases and catch/finally sections.
export const STRUCTOGRAM_TEXT_PADDING_X = 10; // Horizontal text padding inside structogram cells.
export const STRUCTOGRAM_TEXT_BASELINE_OFFSET = 8; // Vertical baseline correction for structogram text.
export const STRUCTOGRAM_MIN_NODE_WIDTH = 220; // Minimum width for any structogram block.
export const STRUCTOGRAM_MIN_BRANCH_WIDTH = 140; // Minimum width for decision branch columns.
export const STRUCTOGRAM_CANVAS_PADDING = 12; // Outer padding around structogram SVG content.
export const STRUCTOGRAM_VIEWPORT_PADDING = 8; // Outer viewport padding around the SVG.
export const STRUCTOGRAM_HEADER_TOP_PADDING = 10; // Space above the method signature.
export const STRUCTOGRAM_HEADER_BOTTOM_PADDING = 10; // Space between signature and structogram.
export const STRUCTOGRAM_SVG_STROKE_WIDTH = 1; // Global stroke width for SVG block borders.
export const STRUCTOGRAM_EXPORT_SCALE = 2; // Rasterization scale factor for PNG export/copy.
export const STRUCTOGRAM_EXPORT_PADDING = 8; // Extra SVG padding around exported/captured structograms.
export const STRUCTOGRAM_LABEL_TEXT_OFFSET_Y = 6; // Vertical offset used for T/F corner labels.
export const STRUCTOGRAM_EMPTY_BODY_LABEL = "(empty)"; // Label for empty sequences.
export const STRUCTOGRAM_EMPTY_ELSE_LABEL = "∅"; // Label for implicit else branch in single-if blocks.
export const STRUCTOGRAM_LEGACY_EMPTY_ELSE_LABEL = "(no else)"; // Legacy placeholder accepted during transition.
export const STRUCTOGRAM_ASSIGNMENT_SYMBOL = "←"; // NS assignment symbol used in rendered statements.
export const STRUCTOGRAM_LOOP_BODY_INSET_WIDTH = 28; // Left wrap band width for while-loop NS blocks.
export const STRUCTOGRAM_TRY_FRAME_SIDE_WIDTH = 28; // Left wrap band width for try/catch/finally framed blocks.
export const STRUCTOGRAM_TRY_FRAME_TOP_HEIGHT = STRUCTOGRAM_HEADER_HEIGHT; // Top frame band height for try/catch/finally blocks.
export const STRUCTOGRAM_TRY_FRAME_BOTTOM_HEIGHT = STRUCTOGRAM_HEADER_HEIGHT; // Bottom frame band height for try/catch/finally blocks.
export const STRUCTOGRAM_TRY_HEADER_LABEL = "try"; // Label shown in the top frame band for try/catch/finally blocks.
export const STRUCTOGRAM_IF_HEADER_BASE_HEIGHT = STRUCTOGRAM_HEADER_HEIGHT + 10; // Baseline if-header height before adaptive growth.
export const STRUCTOGRAM_IF_CONDITION_TOP_PADDING = 5; // Top padding for condition text in an if header.
export const STRUCTOGRAM_IF_CONDITION_SIDE_CLEARANCE = 10; // Required side clearance from diagonals to condition box.
export const STRUCTOGRAM_IF_CONDITION_LINE_CLEARANCE = 4; // Extra clearance below condition text to avoid line overlap.
export const STRUCTOGRAM_IF_HEADER_MAX_HEIGHT = STRUCTOGRAM_ROW_HEIGHT * 2; // Upper bound for adaptive if-header growth.
export const STRUCTOGRAM_SWITCH_SELECTOR_BASE_HEIGHT = STRUCTOGRAM_HEADER_HEIGHT; // Baseline top selector band height in switch headers.
export const STRUCTOGRAM_SWITCH_SELECTOR_MAX_HEIGHT = STRUCTOGRAM_ROW_HEIGHT * 2; // Upper bound for selector band growth when avoiding diagonal clipping.
export const STRUCTOGRAM_SWITCH_CONDITION_TOP_PADDING = 5; // Top padding for switch condition text.
export const STRUCTOGRAM_SWITCH_CONDITION_SIDE_CLEARANCE = 10; // Required side clearance between condition box and switch diagonals.
export const STRUCTOGRAM_SWITCH_CONDITION_LINE_CLEARANCE = 4; // Extra clearance below switch condition text to avoid line overlap.
export const STRUCTOGRAM_MIN_CONTENT_WIDTH = Math.max(
  64,
  STRUCTOGRAM_TEXT_PADDING_X * 2 + STRUCTOGRAM_CHAR_WIDTH * 4
); // Minimum readable width for a statement cell.
export type StructogramColors = {
  border: string;
  text: string;
  mutedText: string;
  body: string;
  loopHeader: string;
  ifHeader: string;
  switchHeader: string;
  tryWrapper: string;
  condition: string;
  branch: string;
  section: string;
};

export const STRUCTOGRAM_COLORS: StructogramColors = {
  border: "hsl(var(--foreground) / 0.78)",
  text: "hsl(var(--foreground))",
  mutedText: "hsl(var(--muted-foreground))",
  body: "hsl(var(--background))",
  loopHeader: "var(--structogram-loop-header)",
  ifHeader: "var(--structogram-if-header)",
  switchHeader: "var(--structogram-switch-header)",
  tryWrapper: "var(--structogram-try-wrapper)",
  condition: "hsl(var(--accent) / 0.55)",
  branch: "hsl(var(--muted) / 0.30)",
  section: "hsl(var(--muted) / 0.50)"
}; // Shared color palette for structogram SVG rendering.

export const STRUCTOGRAM_MONOCHROME_COLORS: StructogramColors = {
  border: "hsl(var(--foreground) / 0.78)",
  text: "hsl(var(--foreground))",
  mutedText: "hsl(var(--muted-foreground))",
  body: "hsl(var(--background))",
  loopHeader: "hsl(var(--background))",
  ifHeader: "hsl(var(--background))",
  switchHeader: "hsl(var(--background))",
  tryWrapper: "hsl(var(--background))",
  condition: "hsl(var(--background))",
  branch: "hsl(var(--background))",
  section: "hsl(var(--background))"
}; // Flat palette used when structogram colors are disabled.
