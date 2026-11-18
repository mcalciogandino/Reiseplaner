import type { SupabaseClient } from "@supabase/supabase-js";

export type VariantInfo = { id: string; name: string; isRoot: boolean; variant_name: string | null };

export const ROOT_LABEL = "Hauptplan";

export function variantLabel(v: { variant_name: string | null; isRoot: boolean }): string {
  return v.variant_name?.trim() || (v.isRoot ? ROOT_LABEL : "Variante");
}

/** Hauptplan und alle Varianten einer Reise, Hauptplan zuerst, dann nach Anlage. */
export async function loadFamily(supabase: SupabaseClient, tripId: string): Promise<VariantInfo[]> {
  const { data: me } = await supabase.from("trips").select("id, variant_of").eq("id", tripId).maybeSingle();
  if (!me) return [];
  const rootId = (me.variant_of as string | null) ?? (me.id as string);
  const { data } = await supabase
    .from("trips")
    .select("id, name, variant_of, variant_name, created_at")
    .or(`id.eq.${rootId},variant_of.eq.${rootId}`)
    .order("created_at", { ascending: true });
  const list = (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    isRoot: t.variant_of === null,
    variant_name: (t.variant_name as string | null) ?? null,
  }));
  return list.sort((a, b) => Number(b.isRoot) - Number(a.isRoot));
}
