"use client";

import { MapPin, Plus, Route } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const item =
  "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800";

/** «+» in der Symbolleiste: kleines Menü, das sich bei Klick daneben, mit Escape oder nach der Wahl schliesst. */
export function AddMenu({ placeHref, transferHref }: { placeHref: string; transferHref: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative z-10 flex min-h-8 items-center">
      <button
        type="button"
        aria-label="Hier einfügen"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-6 items-center justify-center rounded-full border border-neutral-400 bg-background text-neutral-600 hover:border-red-700 hover:text-red-700"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <div className="absolute right-9 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-neutral-300 bg-background p-1 shadow-lg dark:border-neutral-700">
          <Link href={placeHref} className={item} onClick={() => setOpen(false)}>
            <MapPin aria-hidden="true" className="size-4" /> Ort einfügen
          </Link>
          <Link href={transferHref} className={item} onClick={() => setOpen(false)}>
            <Route aria-hidden="true" className="size-4" /> Verschiebung einfügen
          </Link>
        </div>
      )}
    </div>
  );
}
