import * as React from "react"

import { cn } from "@/lib/utils"

interface TextareaProps extends React.ComponentProps<"textarea"> {
  variant?: 'default' | 'chat';
}

function Textarea({ className, variant = 'default', ...props }: TextareaProps) {
  const variantClasses = {
    default: "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    chat: "flex-1 min-h-[50px] sm:min-h-[60px] max-h-[100px] sm:max-h-[120px] resize-none border border-gray-200 dark:border-gray-600 focus:border-hedera-purple dark:focus:border-hedera-purple focus:ring-2 focus:ring-hedera-purple/20 text-sm bg-white dark:bg-gray-800 rounded-xl transition-all duration-200 placeholder:text-gray-500 dark:placeholder:text-gray-400 w-full px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
  };

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
