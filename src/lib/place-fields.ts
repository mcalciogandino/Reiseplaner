import { z } from "zod";
import { isValidCoord, roundCoord } from "@/lib/geocode";
import { TIMEZONES } from "@/lib/destinations";

/** Wert im Auswahlfeld «Reiseort», der «Neuer Ort anlegen …» bedeutet. */
export const NEW_PLACE = "__new__";

const text = (max: number) =>
  z.string().trim().max(max, `Maximal ${max} Zeichen.`).transform((v) => v || null);

/** Standort + strukturierte Adresse (Formularwerte als Text → Zahlen/null). */
export const locationSchema = z
  .object({
    lat: z.string().trim(),
    lng: z.string().trim(),
    place_label: text(200),
    addr_street: text(150),
    addr_house_number: text(20),
    addr_postcode: text(20),
    addr_city: text(100),
    addr_region: text(100),
    addr_country: text(100),
  })
  .refine((d) => (d.lat === "") === (d.lng === ""), {
    message: "Der Standort ist unvollständig. Bitte neu suchen.",
    path: ["lat"],
  })
  .refine((d) => d.lat === "" || isValidCoord(Number(d.lat), Number(d.lng)), {
    message: "Der Standort liegt ausserhalb des gültigen Bereichs.",
    path: ["lat"],
  })
  .transform((d) => ({
    ...d,
    lat: d.lat === "" ? null : roundCoord(Number(d.lat)),
    lng: d.lng === "" ? null : roundCoord(Number(d.lng)),
    place_label: d.lat === "" ? null : d.place_label,
  }));

const zones = TIMEZONES.map((t) => t.value) as string[];

/** Grunddaten eines Ortes, der direkt im Verschiebungsformular angelegt wird. */
export const newPlaceBaseSchema = z.object({
  name: z.string().trim().min(1, "Bitte den Namen des neuen Ortes eingeben.").max(100),
  timezone: z
    .string()
    .refine((v) => v === "" || zones.includes(v), "Bitte eine gültige Zeitzone wählen.")
    .transform((v) => v || null),
  lodging_name: text(150),
});

export const NEW_PLACE_KEYS = [
  "name", "timezone", "lodging_name",
  "lat", "lng", "place_label",
  "addr_street", "addr_house_number", "addr_postcode", "addr_city", "addr_region", "addr_country",
] as const;
