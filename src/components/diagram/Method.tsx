import type { UmlMethod } from "../../models/uml";
import { TEXT_PADDING, UML_FONT_SIZE } from "./constants";

export type UmlMethodProps = {
  method: UmlMethod;
  y: number;
};

export const UmlMethod = ({ method, y }: UmlMethodProps) => {
  const visibility = method.visibility ?? "";
  const signature = method.signature ?? "";
  return (
    <text
      x={TEXT_PADDING}
      y={y}
      dominantBaseline="text-before-edge"
      style={{
        fill: "hsl(var(--foreground))",
        fontSize: UML_FONT_SIZE,
        fontFamily: "var(--uml-font)",
        fontStyle: method.isAbstract ? "italic" : "normal",
        pointerEvents: "none"
      }}
    >
      <tspan>{visibility ? `${visibility} ` : ""}</tspan>
      <tspan style={{ textDecoration: method.isStatic ? "underline" : "none" }}>
        {signature}
      </tspan>
    </text>
  );
};
