import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...values: Parameters<typeof clsx>): string => twMerge(clsx(...values))
const variants = cva(
  'button inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'button-primary',
        secondary: 'button-secondary',
        ghost: 'button-ghost',
        destructive: 'button-destructive',
      },
      size: { default: 'h-9 px-3', sm: 'h-8 px-2.5', icon: 'h-8 w-8 shrink-0 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(variants({ variant, size, className }))} {...props} />
}
