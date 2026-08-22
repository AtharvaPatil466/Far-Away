import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-mono text-label-md uppercase transition-[color,background-color,border-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_.material-symbols-outlined]:text-[18px]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary hover:bg-primary-fixed-dim',
        accent:
          'bg-primary text-on-primary hover:bg-primary-fixed-dim',
        destructive: 'border border-error bg-error-container text-error hover:bg-error/10',
        outline:
          'border border-outline-variant/60 bg-surface text-on-surface hover:bg-surface-container-high',
        secondary:
          'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
        ghost: 'text-on-surface-variant hover:bg-surface-container-high',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
