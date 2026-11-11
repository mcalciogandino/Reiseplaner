/** Alle Ortsarten mit Gruppe (für die Auswahlliste) – Reihenfolge = Reihenfolge in der Liste. */
export const PLACE_KIND_DEFS = [
  // Orte
  { value: "city", label: "Stadt", group: "Orte" },
  { value: "village", label: "Dorf", group: "Orte" },
  // Unterkunft
  { value: "hotel", label: "Hotel", group: "Unterkunft" },
  { value: "motel", label: "Motel", group: "Unterkunft" },
  { value: "hostel", label: "Hostel", group: "Unterkunft" },
  { value: "lodge", label: "Lodge / Berghütte", group: "Unterkunft" },
  { value: "bnb", label: "Bed & Breakfast", group: "Unterkunft" },
  { value: "vacation_rental", label: "Ferienwohnung / Ferienhaus", group: "Unterkunft" },
  { value: "camping", label: "Campingplatz", group: "Unterkunft" },
  // Natur
  { value: "national_park", label: "Nationalpark", group: "Natur" },
  { value: "provincial_park", label: "Provinzpark / Naturpark", group: "Natur" },
  { value: "lake", label: "See", group: "Natur" },
  { value: "beach", label: "Strand", group: "Natur" },
  { value: "mountain", label: "Berg / Gipfel", group: "Natur" },
  { value: "glacier", label: "Gletscher", group: "Natur" },
  { value: "waterfall", label: "Wasserfall", group: "Natur" },
  { value: "viewpoint", label: "Aussichtspunkt", group: "Natur" },
  { value: "hiking", label: "Wanderung / Trail", group: "Natur" },
  { value: "scenic_drive", label: "Panoramastrasse", group: "Natur" },
  // Verkehr
  { value: "airport", label: "Flughafen", group: "Verkehr" },
  { value: "train_station", label: "Bahnhof", group: "Verkehr" },
  { value: "bus_station", label: "Busbahnhof", group: "Verkehr" },
  { value: "ferry_terminal", label: "Fährhafen", group: "Verkehr" },
  { value: "car_rental", label: "Mietwagenstation", group: "Verkehr" },
  { value: "gas_station", label: "Tankstelle / Ladestation", group: "Verkehr" },
  { value: "parking", label: "Parkplatz", group: "Verkehr" },
  { value: "border", label: "Grenzübergang", group: "Verkehr" },
  // Ausflüge und Sehenswürdigkeiten
  { value: "attraction", label: "Ausflugsziel", group: "Ausflüge" },
  { value: "sight", label: "Sehenswürdigkeit", group: "Ausflüge" },
  { value: "museum", label: "Museum", group: "Ausflüge" },
  { value: "activity", label: "Aktivität / Tour", group: "Ausflüge" },
  { value: "wildlife", label: "Tierbeobachtung / Zoo", group: "Ausflüge" },
  { value: "ski_resort", label: "Skigebiet", group: "Ausflüge" },
  { value: "winery", label: "Weingut / Brauerei", group: "Ausflüge" },
  // Essen und Einkaufen
  { value: "restaurant", label: "Restaurant", group: "Essen und Einkaufen" },
  { value: "cafe", label: "Café / Bäckerei", group: "Essen und Einkaufen" },
  { value: "market", label: "Markt", group: "Essen und Einkaufen" },
  { value: "shopping", label: "Einkaufen", group: "Essen und Einkaufen" },
  // Sonstiges
  { value: "other", label: "Sonstiges", group: "Sonstiges" },
] as const;

export type PlaceKind = (typeof PLACE_KIND_DEFS)[number]["value"];

export const PLACE_KIND_LABELS = Object.fromEntries(
  PLACE_KIND_DEFS.map((d) => [d.value, d.label]),
) as Record<PlaceKind, string>;
export const PLACE_KINDS = PLACE_KIND_DEFS.map((d) => d.value) as PlaceKind[];

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
  { value: "America/Los_Angeles", label: "USA Pacific (Los Angeles, Seattle)" },
  { value: "America/Denver", label: "USA Mountain (Denver)" },
  { value: "America/Chicago", label: "USA Central (Chicago)" },
  { value: "America/New_York", label: "USA Eastern (New York)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "Europe/London", label: "Grossbritannien (London)" },
  { value: "Europe/Paris", label: "Frankreich (Paris)" },
  { value: "Europe/Berlin", label: "Deutschland (Berlin)" },
  { value: "Europe/Rome", label: "Italien (Rom)" },
  { value: "Europe/Madrid", label: "Spanien (Madrid)" },
  { value: "Atlantic/Reykjavik", label: "Island (Reykjavik)" },
] as const;
