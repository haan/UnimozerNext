export const NODE_WIDTH = 220; // Minimum width for UML class boxes.
export const UML_FONT_SIZE = 12; // Font size for UML text (header, attributes, methods).
export const HEADER_HEIGHT = UML_FONT_SIZE + 2 * 8; // Header height = font size + top/bottom padding.
export const UML_LINE_HEIGHT = 1.6; // Line height multiplier for UML text.
export const ROW_HEIGHT = Math.round(UML_FONT_SIZE * UML_LINE_HEIGHT); // Row height for each attribute/method line.
export const SECTION_PADDING = 8; // Vertical padding above/below attribute and method sections.
export const TEXT_PADDING = 12; // Horizontal padding for text inside class boxes.
export const EDGE_CORNER_GUTTER = 40; // No-attach zone near class box corners for edge anchors.
export const EDGE_RADIUS = 2; // Corner radius for orthogonal edge bends.
export const REFLEXIVE_LOOP_INSET = 15; // How far reflexive loops extend outside the class box.
export const EDGE_SNAP_DELTA = 60; // Snap threshold for near-horizontal/vertical edges.
export const UML_CORNER_RADIUS = 2; // Corner radius for UML class and package boxes.
export const UML_PACKAGE_PADDING = 25; // Extra padding around classes inside package boxes.
