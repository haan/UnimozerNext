import type { UmlMethod as UmlMethodModel } from "../../models/uml";
import { TEXT_PADDING } from "./constants";
import { formatMethodSignature } from "./methodSignature";

export type UmlMethodProps = {
  method: UmlMethodModel;
  baselineY: number;
  fontSize: number;
  showParameterNames?: boolean;
  onSelect?: () => void;
};

export const UmlMethod = ({
  method,
  baselineY,
  fontSize,
  showParameterNames = true,
  onSelect
}: UmlMethodProps) => {
  const visibility = method.visibility ?? "";
  const signature = formatMethodSignature(method, showParameterNames);
  return (
    <text
      x={TEXT_PADDING}
      y={baselineY}
      onPointerDown={(event) => {
        if (!onSelect) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      style={{
        fill: "hsl(var(--foreground))",
        fontSize,
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
