export type PlaceKind = "city" | "village" | "camping" | "national_park" | "attraction" | "other";

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  city: "Stadt",
  village: "Dorf",
  camping: "Campingplatz",
  national_park: "Nationalpark",
  attraction: "Ausflugsziel",
  other: "Sonstiges",
};
export const PLACE_KINDS = Object.keys(PLACE_KIND_LABELS) as PlaceKind[];

export type Destination = {
  id: string;
  name: string;
  kind: PlaceKind;
  description: string | null;
  arrival_date: string | null; // YYYY-MM-DD
  departure_date: string | null;
  sort_order: number;
  timezone: string | null;
  lodging_name: string | null;
  lodging_address: string | null;
  lodging_checkin: string | null; // HH:MM:SS
  lodging_booking_ref: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  place_label: string | null;
  addr_street: string | null;
  addr_house_number: string | null;
  addr_postcode: string | null;
  addr_city: string | null;
  addr_region: string | null;
  addr_country: string | null;
};

export const DESTINATION_COLUMNS =
  "id, name, kind, description, arrival_date, departure_date, sort_order, timezone, lodging_name, lodging_address, lodging_checkin, lodging_booking_ref, notes, lat, lng, place_label, addr_street, addr_house_number, addr_postcode, addr_city, addr_region, addr_country";

export const TIMEZONES = [
  { value: "America/Vancouver", label: "Pacific (Vancouver, Whistler)" },
  { value: "America/Edmonton", label: "Mountain (Jasper, Banff, Calgary)" },
  { value: "America/Winnipeg", label: "Central (Winnipeg)" },
  { value: "America/Toronto", label: "Eastern (Toronto, Montréal)" },
  { value: "America/Halifax", label: "Atlantic (Halifax)" },
  { value: "America/St_Johns", label: "Neufundland (St. John's)" },
  { value: "Europe/Zurich", label: "Schweiz" },
] as const;
