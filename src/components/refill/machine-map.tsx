"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { MachineMapData, MapPlace } from "@/lib/machine-map";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The emptiest machine decides a pin's colour: that is the one to go to. */
function emptiest(place: MapPlace) {
  const counted = place.machines.filter((mc) => mc.fill);
  return counted.length ? counted.reduce((a, b) => (a.fill!.percent <= b.fill!.percent ? a : b)).fill : null;
}

/**
 * Every machine pinned on a map (Xin, 21-10-2026), on OpenStreetMap: a pin per address with how full it is in the
 * fill colours, the depot as a square, a tap for the machine and the way there. Leaflet loads in the browser only.
 */
export function MachineMap({ data }: { data: MachineMapData }) {
  const { m } = useI18n();
  const t = m.machineMap;
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      // The mouse wheel keeps scrolling the page; zooming is the + and −, or two fingers.
      map = L.map(box.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      const points: [number, number][] = [];
      for (const place of data.places) {
        const fill = emptiest(place);
        const label = fill ? `${fill.percent}%` : "?";
        const band = fill?.band ?? "none";
        const icon = L.divIcon({
          className: "map-pin-wrap",
          html: `<span class="map-pin map-pin-${band}">${label}${place.machines.length > 1 ? `<small>×${place.machines.length}</small>` : ""}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          popupAnchor: [0, -34],
        });
        const rows = place.machines
          .map((mc) => {
            const state = mc.fill ? fmt(t.full, { percent: mc.fill.percent }) : m.overview.stockUnknown;
            return `<a class="map-popup-row" href="/refill/machines/${encodeURIComponent(mc.id)}"><strong>${escape(mc.name)}</strong><span>${escape(state)} · ${escape(t.open)} →</span></a>`;
          })
          .join("");
        const waze = `https://waze.com/ul?q=${encodeURIComponent(place.address)}&navigate=yes`;
        L.marker([place.lat, place.lon], { icon, title: place.machines.map((mc) => mc.name).join(", ") })
          .bindPopup(`<div class="map-popup">${rows}<p>${escape(place.address)}</p><a class="map-popup-nav" href="${waze}" target="_blank" rel="noreferrer">${escape(t.navigate)}</a></div>`)
          .addTo(map);
        points.push([place.lat, place.lon]);
      }
      if (data.depot) {
        const icon = L.divIcon({ className: "map-pin-wrap", html: `<span class="map-depot" title="${escape(t.depot)}">D</span>`, iconSize: [0, 0], iconAnchor: [0, 0] });
        L.marker([data.depot.lat, data.depot.lon], { icon, title: t.depot })
          .bindPopup(`<div class="map-popup"><strong>${escape(t.depot)}</strong><p>${escape(data.depot.address)}</p></div>`)
          .addTo(map);
        points.push([data.depot.lat, data.depot.lon]);
      }
      if (points.length === 1) map.setView(points[0], 14);
      else map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 14 });
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, m, t]);

  return (
    <div className="flex flex-col gap-2">
      <div className="surface-card relative overflow-hidden p-0">
        <div ref={box} className="machine-map h-[340px] w-full sm:h-[420px]" role="region" aria-label={t.title} />
        {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{t.loading}</p>}
      </div>
      {data.unplaced.length > 0 && (
        <p className="px-1 text-[13px] text-muted-foreground">{fmt(t.noAddress, { names: data.unplaced.join(", ") })}</p>
      )}
    </div>
  );
}
