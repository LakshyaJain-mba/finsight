import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-gray-800 text-gray-100',
        indigo: 'border-transparent bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30',
        green: 'border-transparent bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
        amber: 'border-transparent bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
        orange: 'border-transparent bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
        red: 'border-transparent bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
        gray: 'border-transparent bg-gray-700/40 text-gray-300 ring-1 ring-gray-600/40',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
