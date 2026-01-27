import type { DiagramState } from "../../models/diagram";
import type { UmlNode } from "../../models/uml";
import { HEADER_HEIGHT, ROW_HEIGHT, SECTION_PADDING, UML_FONT_SIZE } from "./constants";
import { UmlAttribute } from "./Attribute";
import { UmlMethod } from "./Method";

type UmlNodeLayout = UmlNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClassProps = {
  node: UmlNodeLayout;
  diagram: DiagramState;
  onHeaderPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
};

export const Class = ({ node, diagram, onHeaderPointerDown }: ClassProps) => {
  const fields = diagram.showFields ? node.fields : [];
  const methods = diagram.showMethods ? node.methods : [];
  let cursorY = HEADER_HEIGHT;
  const strokeColor = "var(--uml-class-border)";
  const content: React.ReactNode[] = [];

  if (fields.length > 0) {
    content.push(
      <line
        key={`${node.id}-fields-separator`}
        x1={0}
        x2={node.width}
        y1={HEADER_HEIGHT}
        y2={HEADER_HEIGHT}
        stroke={strokeColor}
        strokeWidth={1}
        pointerEvents="none"
      />
    );
    cursorY += SECTION_PADDING;
    fields.forEach((field) => {
      const y = cursorY;
      content.push(<UmlAttribute key={`${node.id}-field-${field}`} name={field} y={y} />);
      cursorY += ROW_HEIGHT;
    });
    cursorY += SECTION_PADDING;
  }

  if (methods.length > 0) {
    const lineY = fields.length > 0 ? cursorY : HEADER_HEIGHT;
    content.push(
      <line
        key={`${node.id}-methods-separator`}
        x1={0}
        x2={node.width}
        y1={lineY}
        y2={lineY}
        stroke={strokeColor}
        strokeWidth={1}
        pointerEvents="none"
      />
    );
    cursorY = lineY + SECTION_PADDING;
    methods.forEach((method) => {
      const y = cursorY;
      content.push(<UmlMethod key={`${node.id}-method-${method}`} name={method} y={y} />);
      cursorY += ROW_HEIGHT;
    });
    cursorY += SECTION_PADDING;
  }

  return (
    <g transform={`translate(${node.x}, ${node.y})`}>
      <rect
        width={node.width}
        height={node.height}
        rx={2}
        ry={2}
        style={{ fill: "var(--uml-class-bg)", cursor: "grab" }}
        filter="url(#node-shadow)"
        onPointerDown={onHeaderPointerDown}
      />
      <rect
        width={node.width}
        height={HEADER_HEIGHT}
        rx={2}
        ry={2}
        style={{ fill: "var(--uml-class-bg)", cursor: "grab" }}
        pointerEvents="none"
      />
      <rect
        width={node.width}
        height={node.height}
        rx={2}
        ry={2}
        fill="none"
        style={{ stroke: strokeColor, strokeWidth: 1 }}
      />
      <text
        x={node.width / 2}
        y={HEADER_HEIGHT / 2 + 5}
        textAnchor="middle"
        style={{
          fill: "hsl(var(--accent-foreground))",
          fontSize: UML_FONT_SIZE,
          fontWeight: 600,
          fontFamily: "var(--uml-font)",
          pointerEvents: "none"
        }}
      >
        {node.name}
      </text>

      <g>{content}</g>

    </g>
  );
};
