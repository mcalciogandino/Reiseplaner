import { TIMEZONES } from "./destinations";

/** Prüft, ob die Zeichenkette eine gültige IANA-Zeitzone ist (z. B. "Europe/Zurich"). */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("de-CH", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Anzeigename: bekannte Zonen mit Beschreibung, sonst der IANA-Name. */
export function zoneLabel(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.label ?? tz.replace(/_/g, " ");
}

/** Auswahlliste: die bekannten Zonen plus ggf. die aktuell gesetzte, abgeleitete Zone. */
export function zoneOptions(current: string): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [...TIMEZONES];
  if (current && !list.some((t) => t.value === current)) {
    list.unshift({ value: current, label: zoneLabel(current) });
  }
  return list;
}
