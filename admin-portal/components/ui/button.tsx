import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-hedera-purple text-white rounded-full uppercase hover:opacity-90 px-6 py-2 font-medium text-sm",
        destructive:
          "bg-red text-white rounded-full hover:opacity-90",
        outline:
          "border border-primary bg-transparent rounded-md hover:bg-tertiary",
        secondary:
          "bg-tertiary text-primary rounded-md hover:bg-muted",
        ghost: "rounded-md hover:bg-tertiary",
        link: "text-hedera-blue underline-offset-4 hover:opacity-80",
        send: "bg-hedera-purple text-white rounded-xl hover:bg-hedera-purple/90 shadow-md hover:shadow-lg transition-all duration-200",
      },
      size: {
        default: "h-9 px-5 text-sm",
        sm: "h-8 px-4 text-xs",
        lg: "h-10 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * A versatile button component with multiple style variants and sizes
 * @param {ButtonProps} props - Button component props
 * @param {string} props.className - Additional CSS classes to apply
 * @param {string} props.variant - Visual style variant (default, destructive, outline, secondary, ghost, link, primary, network)
 * @param {string} props.size - Size variant (default, sm, lg, icon)
 * @param {boolean} props.asChild - Whether to render as a child slot component
 * @param {React.Ref<HTMLButtonElement>} ref - Forward ref to the button element
 * @returns {JSX.Element} Styled button component
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };