"use client";

import { Button } from "@/components/ui/button";

export function DeleteForm({
  action,
  label,
  confirmText,
  tone = "danger",
}: {
  action: () => Promise<void>;
  label: string;
  confirmText: string;
  tone?: "danger" | "neutral";
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="outline" className={tone === "danger" ? "border-red-700 text-red-700" : undefined}>
        {label}
      </Button>
    </form>
  );
}
