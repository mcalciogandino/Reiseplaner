"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Tippt man «1430», wird daraus «14:30»; nur Ziffern, höchstens vier. */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

const TIME_PATTERN = "([01]\\d|2[0-3]):[0-5]\\d";

/** Uhrzeit im 24-Stunden-Format (der Browser-eigene Zeitwähler zeigt je nach Sprache AM/PM). */
export function TimeInput({
  id,
  name,
  value,
  onChange,
  required,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <Input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      maxLength={5}
      pattern={TIME_PATTERN}
      title="Uhrzeit im Format HH:MM, z. B. 14:30"
      required={required}
      value={value}
      onChange={(e) => onChange(formatTimeInput(e.target.value))}
    />
  );
}

/** Uhrzeit-Feld mit eigenem Zustand für Formulare ohne übergeordneten State. */
export function TimeField({ id, name, defaultValue }: { id: string; name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  return <TimeInput id={id} name={name} value={value} onChange={setValue} />;
}

/**
 * Datum + Uhrzeit (24 h) als ein Wert "YYYY-MM-DDTHH:MM". Der Wert geht als verstecktes Feld
 * mit dem Formular; min/max begrenzen nur das Datum.
 */
export function DateTimeField({
  id,
  name,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const emit = (d: string, t: string) => onChange(d || t ? `${d}T${t}` : "");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
      <input type="hidden" name={name} value={value} />
      <Input
        id={id}
        type="date"
        aria-label="Datum"
        min={min?.slice(0, 10)}
        max={max?.slice(0, 10)}
        value={date}
        onChange={(e) => emit(e.target.value, time)}
      />
      <TimeInput id={`${id}_time`} value={time} onChange={(t) => emit(date, t)} />
    </div>
  );
}
