import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

import { cn } from "../../lib/utils";

type ToasterProps = ComponentProps<typeof Sonner>;

export const Toaster = ({ className, toastOptions, ...props }: ToasterProps) => (
  <Sonner
    position="top-center"
    className={cn("toaster group", className)}
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        description: "group-[.toast]:text-muted-foreground",
        actionButton:
          "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton:
          "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
      },
      ...toastOptions
    }}
    {...props}
  />
);
