declare module "react-color" {
  import type { ComponentType } from "react";

  export type ColorResult = {
    hex: string;
  };

  export const ChromePicker: ComponentType<{
    color?: string;
    disableAlpha?: boolean;
    onChange?: (color: ColorResult) => void;
  }>;
}
