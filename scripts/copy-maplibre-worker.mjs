// Kopiert den Web-Worker von MapLibre nach public/maplibre/. Turbopack bündelt
// den Worker sonst nicht ("Worker failed to load"); die Karte lädt ihn von dort.
import { copyFileSync, mkdirSync } from "node:fs";

const src = new URL("../node_modules/maplibre-gl/dist/", import.meta.url);
const dest = new URL("../public/maplibre/", import.meta.url);
mkdirSync(dest, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs"]) {
  copyFileSync(new URL(f, src), new URL(f, dest));
}
