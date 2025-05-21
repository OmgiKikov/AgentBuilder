import * as React from "react"
import { Switch as HeroSwitch } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface SwitchProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  isDisabled?: boolean;
  isSelected?: boolean;
  onValueChange?: (isSelected: boolean) => void;
  children?: React.ReactNode;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, size = "md", color = "primary", ...props }, ref) => {
    return (
      <HeroSwitch
        ref={ref}
        size={size}
        color={color}
        className={className}
        {...props}
      />
    );
  }
);

Switch.displayName = "Switch";

export { Switch } 