"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { MapData } from "@/lib/map";

// Kartenstil: OpenFreeMap ohne Konto. Per NEXT_PUBLIC_MAP_STYLE_URL austauschbar (z. B. MapTiler).
const STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

export function TripMap({ data }: { data: MapData }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      // Worker liegt als statische Datei in public/ (siehe scripts/copy-maplibre-worker.mjs).
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      if (cancelled || !container.current) return;

      const map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: data.points.length ? [data.points[0].lng, data.points[0].lat] : [-120, 50],
        zoom: 3,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => setError(true));

      map.on("load", () => {
        map.addSource("legs", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: data.lines.map((l) => ({
              type: "Feature" as const,
              properties: { kind: l.kind },
              geometry: { type: "LineString" as const, coordinates: l.coords },
            })),
          },
        });
        const base = { type: "line" as const, source: "legs", layout: { "line-cap": "round" as const, "line-join": "round" as const } };
        map.addLayer({ ...base, id: "legs-route", filter: ["==", ["get", "kind"], "route"],
          paint: { "line-color": "#525252", "line-width": 3, "line-dasharray": [2, 2] } });
        map.addLayer({ ...base, id: "legs-flight", filter: ["==", ["get", "kind"], "flight"],
          paint: { "line-color": "#1d4ed8", "line-width": 2 } });
        map.addLayer({ ...base, id: "legs-drive", filter: ["==", ["get", "kind"], "drive"],
          paint: { "line-color": "#b91c1c", "line-width": 4.5 } });
      });

      for (const p of data.points) {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = String(p.number);
        el.setAttribute("aria-label", `${p.number}. ${p.name}`);
        el.style.cssText =
          "width:32px;height:32px;border-radius:16px;border:2px solid #fff;background:#b91c1c;color:#fff;" +
          "font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4)";

        // Popup aus Textknoten, nie aus HTML-Text.
        const box = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = `${p.number}. ${p.name}`;
        box.appendChild(name);
        if (p.detail) {
          const d = document.createElement("div");
          d.textContent = p.detail;
          box.appendChild(d);
        }
        box.style.cssText = "color:#171717;font:14px system-ui,sans-serif;line-height:20px";

        new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setDOMContent(box))
          .addTo(map);
      }

      if (data.bounds) {
        map.fitBounds(data.bounds, { padding: 56, maxZoom: 9, duration: 0 });
      }
      cleanup = () => map.remove();
    })().catch(() => setError(true));

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [data]);

  return (
    <div className="relative h-[70vh] min-h-96 w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div ref={container} className="h-full w-full" role="region" aria-label="Karte der Reise" />
      {error && (
        <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-white p-3 text-sm text-red-700 shadow">
          Die Karte konnte nicht vollständig geladen werden. Prüfe die Internetverbindung.
        </p>
      )}
    </div>
  );
}
