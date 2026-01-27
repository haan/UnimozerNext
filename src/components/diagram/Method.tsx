import { TEXT_PADDING, UML_FONT_SIZE } from "./constants";

export type UmlMethodProps = {
  name: string;
  y: number;
};

export const UmlMethod = ({ name, y }: UmlMethodProps) => (
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
    {name}
  </text>
);
