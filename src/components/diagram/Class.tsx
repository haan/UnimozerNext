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
  const strokeColor = node.isInvalid ? "var(--uml-class-invalid-border)" : "var(--uml-class-border)";
  const fillColor = node.isInvalid ? "var(--uml-class-invalid-bg)" : "var(--uml-class-bg)";
  const content: React.ReactNode[] = [];

  if (diagram.showFields) {
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
    fields.forEach((field, index) => {
      const y = cursorY;
      content.push(
        <UmlAttribute
          key={`${node.id}-field-${field.signature}-${index}`}
          field={field}
          y={y}
        />
      );
      cursorY += ROW_HEIGHT;
    });
    cursorY += SECTION_PADDING;
  }

  if (diagram.showMethods) {
    const lineY = diagram.showFields ? cursorY : HEADER_HEIGHT;
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
    methods.forEach((method, index) => {
      const y = cursorY;
      content.push(
        <UmlMethod
          key={`${node.id}-method-${method.signature}-${index}`}
          method={method}
          y={y}
        />
      );
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
        style={{ fill: fillColor, cursor: "grab" }}
        filter="url(#node-shadow)"
        onPointerDown={onHeaderPointerDown}
      />
      <rect
        width={node.width}
        height={HEADER_HEIGHT}
        rx={2}
        ry={2}
        style={{ fill: fillColor, cursor: "grab" }}
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
          fontStyle: node.isAbstract ? "italic" : "normal",
          fontFamily: "var(--uml-font)",
          pointerEvents: "none"
        }}
      >
      {node.name}
      </text>
      {node.isInvalid ? (
        <g
          transform={`translate(${node.width - 18}, ${HEADER_HEIGHT / 2 - 7})`}
          style={{ color: "hsl(36 85% 35%)", pointerEvents: "none" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="14"
            height="14"
          >
            <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </g>
      ) : null}

      <g>{content}</g>

    </g>
  );
};
