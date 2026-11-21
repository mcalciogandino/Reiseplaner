import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/activities";
import { CATEGORY_LABELS, summarize } from "@/lib/budget";
import { loadBudgetLines } from "@/lib/budget-load";
import { fetchRates } from "@/lib/fx";
import { activityStats, driveStats, lodgingStats, overview, reviewStats, type StatDestination, type StatDrive } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/transfers";
import { formatDate } from "@/lib/trips";
import { VariantBar } from "../variants/variant-bar";
import { BarList, Empty, Legend, Section, Tiles } from "./stats-view";

export const maxDuration = 120;

type Params = Promise<{ tripId: string }>;

export default function StatisticsPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

const nf = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const km = (n: number) => `${nf.format(n)} km`;
const day = (iso: string) => formatDate(iso).slice(0, 6); // 05.07.

async function Content({ params }: { params: Params }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("name, start_date, end_date, total_budget, base_currency")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) notFound();

  const rows = <T,>(res: { data: unknown[] | null }) => (res.data ?? []) as T[];
  const [dests, legs, cars, acts, lodgingOpts, entries, checks, plans, budget] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, name, kind, arrival_date, departure_date, addr_region, booked, lodging_name, reviewed")
      .eq("trip_id", tripId),
    supabase
      .from("transfers")
      .select("depart_at, depart_tz, distance_km, route_distance_m, duration_min, route_duration_s, reviewed")
      .eq("trip_id", tripId)
      .eq("kind", "drive")
      .eq("is_option", false),
    supabase.from("vehicles").select("reviewed").eq("trip_id", tripId),
    supabase.from("activities").select("status, priority, destination_id, reviewed").eq("trip_id", tripId),
    supabase.from("lodging_options").select("reviewed").eq("trip_id", tripId),
    supabase.from("budget_entries").select("reviewed").eq("trip_id", tripId),
    supabase.from("checklist_items").select("reviewed").eq("trip_id", tripId),
    supabase.from("day_plans").select("id").eq("trip_id", tripId),
    loadBudgetLines(supabase, tripId),
  ]);
  // Alle Verschiebungen (nicht nur Autofahrten) für die Prüf-Quote.
  const [{ data: allLegs }, items] = await Promise.all([
    supabase.from("transfers").select("reviewed").eq("trip_id", tripId).eq("is_option", false),
    rows<{ id: string }>(plans).length
      ? supabase.from("day_plan_items").select("reviewed").in("day_plan_id", rows<{ id: string }>(plans).map((p) => p.id))
      : Promise.resolve({ data: [] as { reviewed: boolean }[] }),
  ]);

  const destRows = rows<StatDestination & { reviewed: boolean }>(dests);
  const ov = overview(trip, destRows);
  const drives = driveStats(rows<StatDrive>(legs), destRows);
  const lodging = lodgingStats(destRows);
  const placeNames = new Map(destRows.filter((d) => d.id && d.name).map((d) => [d.id as string, d.name as string]));
  const activities = activityStats(rows(acts), placeNames);
  const review = reviewStats([
    { label: "Reiseorte", rows: destRows },
    { label: "Verschiebungen", rows: (allLegs ?? []) as { reviewed: boolean }[] },
    { label: "Fahrzeuge", rows: rows(cars) },
    { label: "Unterkunftsoptionen", rows: rows(lodgingOpts) },
    { label: "Bucket List", rows: rows(acts) },
    { label: "Tagesplan", rows: items.data ?? [] },
    { label: "Budgetposten", rows: rows(entries) },
    { label: "Checkliste", rows: rows(checks) },
  ]);

  const base = (trip.base_currency as string) || "CHF";
  const { rates, failed } = await fetchRates(budget.lines.map((l) => l.currency), base);
  const summary = summarize(budget.lines, base, rates);
  const totalBudget = trip.total_budget === null ? null : Number(trip.total_budget);
  const money = (n: number) => `${nf.format(n)} ${base}`;
  const rest = totalBudget !== null ? totalBudget - summary.expected : null;

  return (
    <>
      <VariantBar tripId={tripId} suffix="/statistiken" />
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Statistiken · {trip.name}</h1>

      <Section id="ueberblick" title="Reiseüberblick">
        <Tiles
          items={[
            { label: "Dauer", value: `${ov.days} Tage`, hint: `${ov.nights} Nächte` },
            { label: "Orte", value: String(ov.places), hint: `davon ${ov.overnightPlaces} mit Übernachtung` },
            { label: "Provinzen / Regionen", value: String(ov.regions.length), hint: ov.regions.join(", ") || "noch keine Angabe" },
          ]}
        />
      </Section>

      <Section id="fahrt" title="Fahrt">
        {drives.count === 0 ? (
          <Empty>Noch keine Autofahrten erfasst.</Empty>
        ) : (
          <>
            <Tiles
              items={[
                { label: "Gefahren", value: km(drives.totalKm), hint: `${drives.count} Fahrten` },
                { label: "Fahrzeit", value: drives.totalMinutes > 0 ? `ca. ${formatDuration(drives.totalMinutes)}` : "–" },
                { label: "Ø pro Fahrtag", value: drives.avgKmPerDriveDay !== null ? km(drives.avgKmPerDriveDay) : "–" },
                {
                  label: "Längste Etappe",
                  value: drives.longest ? km(drives.longest.km) : "–",
                  hint: drives.longest ? day(drives.longest.date) : undefined,
                },
                {
                  label: "Kürzeste Etappe",
                  value: drives.shortest ? km(drives.shortest.km) : "–",
                  hint: drives.shortest ? day(drives.shortest.date) : undefined,
                },
                { label: "Fahrtage / Ruhetage", value: `${drives.driveDays} / ${drives.restDays}`, hint: "Ruhetag: mitten in einem Aufenthalt von 2+ Nächten, ohne Fahrt" },
              ]}
            />
            {drives.undated > 0 && (
              <Empty>
                {drives.undated} {drives.undated === 1 ? "Fahrt hat" : "Fahrten haben"} keine Abfahrtszeit: in den Summen enthalten, aber keinem Fahrtag zugeordnet.
              </Empty>
            )}
          </>
        )}
      </Section>

      <Section id="unterkunft" title="Unterkunft">
        {lodging.nightsByKind.length === 0 ? (
          <Empty>Noch keine Übernachtungen erfasst (Ankunft und Abreise der Orte fehlen).</Empty>
        ) : (
          <>
            <BarList
              label="Nächte je Unterkunftsart"
              rows={lodging.nightsByKind.map((k) => ({
                label: k.label,
                value: k.nights,
                text: `${k.nights} ${k.nights === 1 ? "Nacht" : "Nächte"}`,
              }))}
            />
            <Tiles
              items={[
                { label: "Nächte gesamt", value: String(lodging.totalNights) },
                { label: "Gebucht", value: String(lodging.booked) },
                { label: "Noch offen", value: String(lodging.open) },
              ]}
            />
          </>
        )}
      </Section>

      <Section id="budget" title={`Budget in ${base}`}>
        {summary.byCategory.length === 0 ? (
          <Empty>Noch keine Preise oder Posten erfasst.</Empty>
        ) : (
          <>
            <Tiles
              items={[
                { label: "Gesamtbudget", value: totalBudget !== null ? money(totalBudget) : "nicht gesetzt" },
                { label: "Soll", value: money(summary.planned) },
                { label: "Ist", value: money(summary.actual) },
                { label: "Voraussichtlich", value: money(summary.expected), hint: "Ist, sonst Soll je Posten" },
                ...(rest !== null ? [{ label: rest < 0 ? "Über Budget" : "Rest", value: money(Math.abs(rest)) }] : []),
              ]}
            />
            <Legend items={[{ series: 1, label: "Soll" }, { series: 2, label: "Ist" }]} />
            <BarList
              label="Soll und Ist je Kategorie"
              max={Math.max(1, ...summary.byCategory.flatMap((c) => [c.planned, c.actual]))}
              rows={summary.byCategory.flatMap((c) => [
                { label: `${CATEGORY_LABELS[c.category]} · Soll`, value: c.planned, text: money(c.planned), series: 1 as const },
                { label: `${CATEGORY_LABELS[c.category]} · Ist`, value: c.actual, text: money(c.actual), series: 2 as const },
              ])}
            />
          </>
        )}
        {(summary.missing.length > 0 || failed.length > 0) && (
          <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
            Kein Kurs für {[...new Set([...summary.missing, ...failed])].join(", ")}: diese Posten sind nicht eingerechnet.
          </p>
        )}
        {budget.error && <p role="alert" className="text-xs text-red-700">Das Budget konnte nicht vollständig geladen werden.</p>}
      </Section>

      <Section id="aktivitaeten" title="Aktivitäten">
        {activities.total === 0 ? (
          <Empty>Die Bucket List ist noch leer.</Empty>
        ) : (
          <>
            <Tiles items={activities.byStatus.map((s) => ({ label: STATUS_LABELS[s.status], value: String(s.count) }))} />
            <BarList
              label="Aktivitäten nach Wichtigkeit"
              max={activities.total}
              rows={activities.byPriority.map((p) => ({ label: PRIORITY_LABELS[p.priority], value: p.count, text: String(p.count) }))}
            />
            {activities.topPlaces.length > 0 && (
              <BarList
                label="Orte mit den meisten Aktivitäten"
                rows={activities.topPlaces.map((p) => ({ label: p.name, value: p.count, text: String(p.count) }))}
              />
            )}
            <p className="text-xs text-neutral-500">Aktivitäten haben keine Kategorie; ausgewertet werden Wichtigkeit und Ort.</p>
          </>
        )}
      </Section>

      <Section id="fortschritt" title="Fortschritt der Prüfung">
        {review.share === null ? (
          <Empty>Noch keine Einträge.</Empty>
        ) : (
          <>
            <p className="text-sm">
              <span className="text-lg font-semibold">{Math.round(review.share * 100)} % geprüft</span>
              {" · "}
              {review.open === 0 ? "alles kontrolliert" : `${review.open} ${review.open === 1 ? "Eintrag" : "Einträge"} noch zu kontrollieren`}
            </p>
            <div
              role="progressbar"
              aria-label="Geprüfte Einträge"
              aria-valuemin={0}
              aria-valuemax={review.reviewed + review.open}
              aria-valuenow={review.reviewed}
              className="h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
            >
              <div className="h-full bg-green-600" style={{ width: `${Math.round(review.share * 100)}%` }} />
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {review.rows.map((r) => (
                <li key={r.label} className="flex items-baseline justify-between gap-3">
                  <span>{r.label}</span>
                  <span className="tabular-nums text-neutral-600 dark:text-neutral-400">
                    {r.reviewed} geprüft{r.open > 0 && <strong className="font-semibold text-amber-800 dark:text-amber-300"> · {r.open} offen</strong>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}
