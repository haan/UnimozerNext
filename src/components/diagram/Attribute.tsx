import type { UmlField } from "../../models/uml";
import { TEXT_PADDING, UML_FONT_SIZE } from "./constants";

export type UmlAttributeProps = {
  field: UmlField;
  y: number;
  onSelect?: () => void;
};

export const UmlAttribute = ({ field, y, onSelect }: UmlAttributeProps) => {
  const visibility = field.visibility ?? "";
  const signature = field.signature ?? "";
  return (
    <text
      x={TEXT_PADDING}
      y={y}
      dominantBaseline="text-before-edge"
      onPointerDown={(event) => {
        if (!onSelect) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      style={{
        fill: "hsl(var(--foreground))",
        fontSize: UML_FONT_SIZE,
        fontFamily: "var(--uml-font)",
        pointerEvents: onSelect ? "auto" : "none",
        cursor: onSelect ? "pointer" : "default"
      }}
    >
      <tspan>{visibility ? `${visibility} ` : ""}</tspan>
      <tspan style={{ textDecoration: field.isStatic ? "underline" : "none" }}>
        {signature}
      </tspan>
    </text>
  );
};
