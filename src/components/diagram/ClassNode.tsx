import type { DiagramState } from "../../models/diagram";
import type { UmlNode } from "../../models/uml";
import { HEADER_HEIGHT, ROW_HEIGHT, SECTION_PADDING } from "./constants";

type UmlNodeLayout = UmlNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClassNodeProps = {
  node: UmlNodeLayout;
  diagram: DiagramState;
  onHeaderPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
};

export const ClassNode = ({ node, diagram, onHeaderPointerDown }: ClassNodeProps) => {
  const fields = diagram.showFields ? node.fields : [];
  const methods = diagram.showMethods ? node.methods : [];
  let cursorY = HEADER_HEIGHT + SECTION_PADDING;

  return (
    <g transform={`translate(${node.x}, ${node.y})`}>
      <rect
        width={node.width}
        height={node.height}
        rx={2}
        ry={2}
        style={{ fill: "#fdf2cc", stroke: "hsl(var(--foreground) / 0.2)", strokeWidth: 1 }}
        filter="url(#node-shadow)"
      />
      <rect
        width={node.width}
        height={HEADER_HEIGHT}
        rx={2}
        ry={2}
        style={{ fill: "#fdf2cc", cursor: "grab" }}
        onPointerDown={onHeaderPointerDown}
      />
      <text
        x={node.width / 2}
        y={HEADER_HEIGHT / 2 + 5}
        textAnchor="middle"
        style={{
          fill: "hsl(var(--accent-foreground))",
          fontSize: 12,
          fontWeight: 600,
          pointerEvents: "none"
        }}
      >
        {node.name}
      </text>

      {fields.length > 0 && (
        <g>
          {fields.map((field) => {
            const y = cursorY;
            cursorY += ROW_HEIGHT;
            return (
              <text
                key={`${node.id}-field-${field}`}
                x={12}
                y={y}
                style={{ fill: "hsl(var(--foreground))", fontSize: 12, pointerEvents: "none" }}
              >
                {field}
              </text>
            );
          })}
        </g>
      )}

      {methods.length > 0 && (
        <g>
          {methods.map((method) => {
            const y = cursorY;
            cursorY += ROW_HEIGHT;
            return (
              <text
                key={`${node.id}-method-${method}`}
                x={12}
                y={y}
                style={{ fill: "hsl(var(--foreground))", fontSize: 12, pointerEvents: "none" }}
              >
                {method}
              </text>
            );
          })}
        </g>
      )}

      {node.height > HEADER_HEIGHT && (
        <line
          x1={0}
          x2={node.width}
          y1={HEADER_HEIGHT}
          y2={HEADER_HEIGHT}
          style={{ stroke: "hsl(var(--border))" }}
        />
      )}
    </g>
  );
};
