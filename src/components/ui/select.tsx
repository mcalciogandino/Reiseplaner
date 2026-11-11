import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Auswahlfeld im Stil der Eingabefelder, mit eigenem Pfeil statt dem Browser-Standard. */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "min-h-11 w-full appearance-none rounded-lg border border-neutral-300 bg-background py-0 pl-3 pr-10 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-neutral-500"
      />
    </div>
  );
}
