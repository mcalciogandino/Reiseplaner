export type Destination = {
  id: string;
  name: string;
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
};

export const DESTINATION_COLUMNS =
  "id, name, description, arrival_date, departure_date, sort_order, timezone, lodging_name, lodging_address, lodging_checkin, lodging_booking_ref, notes, lat, lng, place_label";

export const TIMEZONES = [
  { value: "America/Vancouver", label: "Pacific (Vancouver, Whistler)" },
  { value: "America/Edmonton", label: "Mountain (Jasper, Banff, Calgary)" },
  { value: "America/Winnipeg", label: "Central (Winnipeg)" },
  { value: "America/Toronto", label: "Eastern (Toronto, Montréal)" },
  { value: "America/Halifax", label: "Atlantic (Halifax)" },
  { value: "America/St_Johns", label: "Neufundland (St. John's)" },
  { value: "Europe/Zurich", label: "Schweiz" },
] as const;
