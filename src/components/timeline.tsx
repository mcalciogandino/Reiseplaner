import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  BedDouble, Building2, Car, CircleDot, House, KeyRound, Landmark, MapPin, Plane,
  Plus, Route, Ship, Tent, TreePine, TrainFront, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  PLACE_KIND_LABELS, TIMEZONES, type Destination, type PlaceKind,
} from "@/lib/destinations";
import { transferMapsUrl } from "@/lib/map";
import { insertContext, type TimelineNode } from "@/lib/timeline";
import {
  durationMinutes, formatDuration, formatLocal, KIND_LABELS, type Transfer, type TransferKind,
} from "@/lib/transfers";
import { formatDate } from "@/lib/trips";
import { moveDestination } from "@/app/trips/[tripId]/destinations/actions";

const TRANSFER_ICONS: Record<TransferKind, LucideIcon> = {
  flight: Plane, drive: Car, ferry: Ship, car_pickup: KeyRound, car_return: KeyRound,
  train: TrainFront, other: Route,
};
const PLACE_ICONS: Record<PlaceKind, LucideIcon> = {
  city: Building2, village: House, camping: Tent, national_park: TreePine,
  attraction: Landmark, other: MapPin,
};

/**
 * Zeitleiste: links Ort, Verschiebung, Ort, Verschiebung … in zeitlicher Reihenfolge,
 * rechts die Symbolleiste mit einem «+» zwischen je zwei Symbolen zum Einfügen.
 */
export function Timeline({
  tripId,
  nodes,
  destinations,
}: {
  tripId: string;
  nodes: TimelineNode[];
  destinations: Destination[];
}) {
  const stopName = new Map(destinations.map((d) => [d.id, d.name]));
  const firstIndex = new Map(destinations.map((d, i) => [d.id, i]));

  return (
    <ol aria-label="Zeitleiste" className="flex flex-col">
      {nodes.map((node, i) => (
        <li key={node.key} className="contents">
          <AddRow tripId={tripId} nodes={nodes} index={i} />
          <Row
            icon={iconFor(node)}
            small={node.type === "free"}
            extra={node.type === "place" && node.destination.lodging_name ? BedDouble : null}
          >
            {node.type === "place" && (
              <PlaceCard
                tripId={tripId}
                d={node.destination}
                canMove={!node.dated}
                first={firstIndex.get(node.destination.id) === 0}
                last={firstIndex.get(node.destination.id) === destinations.length - 1}
              />
            )}
            {node.type === "transfer" && (
              <TransferCard tripId={tripId} t={node.transfer} stopName={stopName} destinations={destinations} />
            )}
            {node.type === "free" && (
              <p className="flex min-h-8 items-center gap-2 px-1 text-sm text-neutral-600 dark:text-neutral-400">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                {node.label}
              </p>
            )}
          </Row>
        </li>
      ))}
      <li className="contents">
        <AddRow tripId={tripId} nodes={nodes} index={nodes.length} />
      </li>
    </ol>
  );
}

function iconFor(node: TimelineNode): LucideIcon {
  if (node.type === "place") return PLACE_ICONS[node.destination.kind] ?? MapPin;
  if (node.type === "transfer") return TRANSFER_ICONS[node.transfer.kind] ?? Route;
  return CircleDot;
}

const railLine =
  "relative flex justify-center before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-neutral-300 dark:before:bg-neutral-700";

function Row({
  icon: Icon,
  small,
  extra: Extra,
  children,
}: {
  icon: LucideIcon;
  small: boolean;
  extra: LucideIcon | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_3.5rem]">
      <div className="min-w-0 py-1">{children}</div>
      <div className={railLine}>
        <div className="relative flex flex-col items-center gap-1 pt-2">
          <span
            aria-hidden="true"
            className={
              small
                ? "flex size-7 items-center justify-center rounded-full border border-neutral-300 bg-background text-neutral-500 dark:border-neutral-700"
                : "flex size-9 items-center justify-center rounded-full bg-red-700 text-white"
            }
          >
            <Icon className={small ? "size-3.5" : "size-5"} />
          </span>
          {Extra && (
            <span
              title="Unterkunft"
              className="flex size-7 items-center justify-center rounded-full border border-neutral-300 bg-background text-neutral-600 dark:border-neutral-700"
            >
              <Extra aria-label="Unterkunft" className="size-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** «+» zwischen zwei Symbolen: Menü mit Ort oder Verschiebung an dieser Stelle einfügen. */
function AddRow({ tripId, nodes, index }: { tripId: string; nodes: TimelineNode[]; index: number }) {
  const ctx = insertContext(nodes, index);
  const transferParams = new URLSearchParams();
  if (ctx.from) transferParams.set("from", ctx.from);
  if (ctx.to) transferParams.set("to", ctx.to);
  const transferHref = `/trips/${tripId}/transfers/new${transferParams.size ? `?${transferParams}` : ""}`;
  const placeHref = `/trips/${tripId}/destinations/new?pos=${ctx.position}`;
  const item =
    "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="grid grid-cols-[1fr_3.5rem]">
      <div />
      <div className={railLine}>
        <details className="group relative z-10 flex min-h-8 items-center">
          <summary
            aria-label="Hier einfügen"
            className="flex size-6 cursor-pointer list-none items-center justify-center rounded-full border border-neutral-400 bg-background text-neutral-600 hover:border-red-700 hover:text-red-700 [&::-webkit-details-marker]:hidden"
          >
            <Plus aria-hidden="true" className="size-4" />
          </summary>
          <div className="absolute right-9 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-neutral-300 bg-background p-1 shadow-lg dark:border-neutral-700">
            <Link href={placeHref} className={item}>
              <MapPin aria-hidden="true" className="size-4" /> Ort einfügen
            </Link>
            <Link href={transferHref} className={item}>
              <Route aria-hidden="true" className="size-4" /> Verschiebung einfügen
            </Link>
          </div>
        </details>
      </div>
    </div>
  );
}

function PlaceCard({
  tripId, d, canMove, first, last,
}: { tripId: string; d: Destination; canMove: boolean; first: boolean; last: boolean }) {
  const tz = TIMEZONES.find((t) => t.value === d.timezone)?.label;
  const n =
    d.arrival_date && d.departure_date
      ? differenceInCalendarDays(parseISO(d.departure_date), parseISO(d.arrival_date))
      : null;
  const address = [
    [d.addr_street, d.addr_house_number].filter(Boolean).join(" "),
    [d.addr_postcode, d.addr_city].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  return (
    <Card className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-neutral-500">{PLACE_KIND_LABELS[d.kind] ?? "Ort"}</p>
        <Link href={`/trips/${tripId}/destinations/${d.id}`} className="font-semibold underline-offset-2 hover:underline">
          {d.name}
        </Link>
        <div className="mt-1 space-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
          {d.arrival_date || d.departure_date ? (
            <p>
              {d.arrival_date ? formatDate(d.arrival_date) : "?"} – {d.departure_date ? formatDate(d.departure_date) : "?"}
              {n !== null && ` · ${n === 1 ? "1 Nacht" : `${n} Nächte`}`}
            </p>
          ) : (
            <p>Daten noch offen</p>
          )}
          {address && <p>{address}</p>}
          {d.lodging_name && (
            <p>
              Unterkunft: {d.lodging_name}
              {d.lodging_checkin && ` (Check-in ab ${d.lodging_checkin.slice(0, 5)})`}
            </p>
          )}
          {tz && <p>{tz}</p>}
        </div>
      </div>
      {canMove && (
        <div className="flex shrink-0 gap-1">
          <MoveButton tripId={tripId} destId={d.id} direction="up" disabled={first} />
          <MoveButton tripId={tripId} destId={d.id} direction="down" disabled={last} />
        </div>
      )}
    </Card>
  );
}

function MoveButton({
  tripId, destId, direction, disabled,
}: { tripId: string; destId: string; direction: "up" | "down"; disabled: boolean }) {
  return (
    <form action={moveDestination.bind(null, tripId, destId, direction)}>
      <button
        type="submit"
        disabled={disabled}
        aria-label={direction === "up" ? "Nach oben" : "Nach unten"}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-300 hover:bg-neutral-100 disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

function TransferCard({
  tripId, t, stopName, destinations,
}: { tripId: string; t: Transfer; stopName: Map<string, string>; destinations: Destination[] }) {
  const from = (t.from_destination_id && stopName.get(t.from_destination_id)) || t.from_place;
  const to = (t.to_destination_id && stopName.get(t.to_destination_id)) || t.to_place;
  const route = [from, to].filter(Boolean).join(" → ");
  const minutes = durationMinutes(t);
  const facts = [
    t.carrier,
    t.flight_number,
    minutes !== null && minutes >= 0 ? formatDuration(minutes) : null,
    t.distance_km !== null ? `${t.distance_km} km` : null,
    t.booking_ref ? `Buchung ${t.booking_ref}` : null,
  ].filter(Boolean);
  const mapsUrl = transferMapsUrl(t, destinations);

  return (
    <>
      <Link href={`/trips/${tripId}/transfers/${t.id}`} className="block">
        <Card className="transition-colors hover:border-red-700">
          <h3 className="font-semibold">
            {KIND_LABELS[t.kind]}
            {route && <span className="font-normal"> · {route}</span>}
          </h3>
          <div className="mt-1 space-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            {t.depart_at && t.depart_tz ? (
              <p>Abfahrt {formatLocal(t.depart_at, t.depart_tz)} (Ortszeit)</p>
            ) : (
              <p>Abfahrt noch offen</p>
            )}
            {t.arrive_at && t.arrive_tz && <p>Ankunft {formatLocal(t.arrive_at, t.arrive_tz)} (Ortszeit)</p>}
            {facts.length > 0 && <p>{facts.join(" · ")}</p>}
          </div>
        </Card>
      </Link>
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex min-h-11 items-center px-1 text-sm underline"
        >
          In Google Maps öffnen ↗
        </a>
      )}
    </>
  );
}
