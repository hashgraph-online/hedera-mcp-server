import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-tertiary text-secondary",
        success:
          "hashscan-badge-success",
        error:
          "bg-red-900/20 text-red-400",
        warning:
          "bg-tertiary text-secondary",
        info:
          "bg-tertiary text-secondary",
        outline: "border border-primary text-primary",
        connected: "border-hedera-green text-hedera-green bg-hedera-green/5 backdrop-blur-sm font-bold px-3 py-1",
        disconnected: "border-red-500 text-red-500 bg-red-500/5 backdrop-blur-sm font-bold px-3 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }