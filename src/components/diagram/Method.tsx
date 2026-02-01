import type { UmlMethod } from "../../models/uml";
import { TEXT_PADDING, UML_FONT_SIZE } from "./constants";

export type UmlMethodProps = {
  method: UmlMethod;
  y: number;
  onSelect?: () => void;
};

export const UmlMethod = ({ method, y, onSelect }: UmlMethodProps) => {
  const visibility = method.visibility ?? "";
  const signature = method.signature ?? "";
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
        fontStyle: method.isAbstract ? "italic" : "normal",
        pointerEvents: onSelect ? "auto" : "none",
        cursor: onSelect ? "pointer" : "default"
      }}
    >
      <tspan>{visibility ? `${visibility} ` : ""}</tspan>
      <tspan style={{ textDecoration: method.isStatic ? "underline" : "none" }}>
        {signature}
      </tspan>
    </text>
  );
};
