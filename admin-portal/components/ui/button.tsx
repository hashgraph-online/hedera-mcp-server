import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow-lg hover:shadow-xl",
  {
    variants: {
      variant: {
        default: "hedera-gradient text-white hover:brightness-110 focus:ring-2 focus:ring-hedera-purple/50",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-2 border-hedera-purple/20 bg-transparent hover:bg-hedera-purple/5 hover:border-hedera-purple/40 text-hedera-purple dark:text-hedera-purple",
        secondary:
          "hedera-gradient-green text-white hover:brightness-110",
        ghost: "hover:bg-hedera-purple/10 hover:text-hedera-purple dark:hover:bg-hedera-purple/20 dark:hover:text-hedera-purple shadow-none",
        link: "text-hedera-purple underline-offset-4 hover:underline shadow-none",
        hedera: "hedera-gradient text-white hover:brightness-110 hover:scale-105 transform",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
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