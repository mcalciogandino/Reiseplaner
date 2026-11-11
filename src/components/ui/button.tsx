import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-red-700 text-white hover:bg-red-800",
        outline:
          "border border-neutral-300 bg-transparent hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800",
        ghost: "hover:bg-neutral-100 dark:hover:bg-neutral-800",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant }), className)} {...props} />
  );
}
