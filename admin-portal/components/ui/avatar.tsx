"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

interface AvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  size?: 'sm' | 'md' | 'lg';
  hasRing?: boolean;
}

function Avatar({
  className,
  size = 'md',
  hasRing = false,
  ...props
}: AvatarProps) {
  const sizeClasses = {
    sm: 'size-8',
    md: 'size-8 sm:size-10',
    lg: 'size-10 sm:size-12'
  };

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        sizeClasses[size],
        hasRing && "ring-2 ring-white dark:ring-gray-900 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

interface AvatarFallbackProps extends React.ComponentProps<typeof AvatarPrimitive.Fallback> {
  gradient?: 'system' | 'assistant' | 'user' | 'none';
}

function AvatarFallback({
  className,
  gradient = 'none',
  ...props
}: AvatarFallbackProps) {
  const gradientClasses = {
    system: 'bg-gradient-to-br from-hedera-purple via-hedera-blue to-hedera-purple text-white',
    assistant: 'bg-gradient-to-br from-hedera-blue to-hedera-green text-white',
    user: 'bg-gradient-to-br from-gray-600 to-gray-800 dark:from-gray-700 dark:to-gray-900 text-white',
    none: 'bg-muted'
  };

  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full font-bold",
        gradientClasses[gradient],
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
