"use client";

import { Button } from "@/components/ui/button";

export function DeleteForm({
  action,
  label,
  confirmText,
}: {
  action: () => Promise<void>;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="outline" className="border-red-700 text-red-700">
        {label}
      </Button>
    </form>
  );
}
