import type { UmlField } from "../../models/uml";
import { TEXT_PADDING, UML_FONT_SIZE } from "./constants";

export type UmlAttributeProps = {
  field: UmlField;
  y: number;
};

export const UmlAttribute = ({ field, y }: UmlAttributeProps) => {
  const visibility = field.visibility ?? "";
  const signature = field.signature ?? "";
  return (
    <text
      x={TEXT_PADDING}
      y={y}
      dominantBaseline="text-before-edge"
      style={{
        fill: "hsl(var(--foreground))",
        fontSize: UML_FONT_SIZE,
        fontFamily: "var(--uml-font)",
        pointerEvents: "none"
      }}
    >
      <tspan>{visibility ? `${visibility} ` : ""}</tspan>
      <tspan style={{ textDecoration: field.isStatic ? "underline" : "none" }}>
        {signature}
      </tspan>
    </text>
  );
};
