"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ComboOption = {
  value: string;
  label: string;
  /** Überschrift in der Liste; aufeinanderfolgende Optionen mit gleicher Gruppe stehen zusammen. */
  group?: string;
  /** Bleibt auch bei einer Suche sichtbar (z. B. «Neuer Ort anlegen …»). */
  pinned?: boolean;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Auswahlfeld zum Tippen wie bei der Google-Suche: Beim Tippen wird die Liste gefiltert,
 * die Einträge lassen sich anklicken oder mit Pfeiltasten und Enter wählen.
 * Der gewählte Wert geht als verstecktes Feld `name` mit dem Formular.
 */
export function Combobox({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Tippen oder auswählen …",
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => o.pinned || norm(o.label).includes(q) || norm(o.group ?? "").includes(q));
  }, [options, query]);

  const shown = open ? query : (selected?.label ?? "");

  function choose(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault(); // Enter wählt nur; das Formular wird nicht abgeschickt
        const o = filtered[active];
        if (o) choose(o);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={selected ? undefined : placeholder}
        value={shown}
        onFocus={(e) => {
          setOpen(true);
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          e.target.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-lg border border-neutral-300 bg-background py-0 pl-3 pr-10 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700"
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-neutral-500"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-300 bg-background p-1 shadow-lg dark:border-neutral-700"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-neutral-500">Nichts gefunden.</li>
          )}
          {filtered.map((o, i) => {
            const showGroup = o.group && o.group !== filtered[i - 1]?.group;
            return (
              <li key={o.value} role="presentation">
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {o.group}
                  </p>
                )}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  // mousedown statt click, damit das Feld den Fokus nicht vor der Wahl verliert
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-3 text-sm",
                    i === active && "bg-neutral-100 dark:bg-neutral-800",
                  )}
                >
                  <span>{o.label}</span>
                  {o.value === value && <Check aria-hidden="true" className="size-4 text-red-700" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
