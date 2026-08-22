import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-label-sm uppercase whitespace-nowrap border',
  {
    variants: {
      variant: {
        neutral:
          'bg-transparent text-on-surface-variant border-outline-variant',
        critical: 'bg-error/10 text-error border-error/20',
        warning: 'bg-warning/15 text-warning border-warning/25',
        success: 'bg-success/10 text-success border-success/25',
        outline: 'bg-surface text-on-surface-variant border-outline-variant/40',
        solid: 'bg-primary text-on-primary border-transparent',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
