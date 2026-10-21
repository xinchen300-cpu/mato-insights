import { after } from "next/server";
import { geoKey, knownPoints, lookUpMissing, type Point } from "@/lib/geo";
import type { FillBand } from "@/lib/stock";

export type MapMachine = { id: string; name: string; fill: { percent: number; band: FillBand } | null; onRound: boolean };
/** One pin: the machines at one address (two machines can stand side by side). */
export type MapPlace = { key: string; lat: number; lon: number; address: string; machines: MapMachine[] };
export type MachineMapData = {
  places: MapPlace[];
  depot: { lat: number; lon: number; address: string } | null;
  /** Machines without an address, or one the map could not find: named under the map. */
  unplaced: string[];
};

/**
 * The machines on Bijvullen as pins (Xin, 21-10-2026): each at its address, with how full it is. Addresses not
 * looked up yet are looked up after the page has gone out, so they are on the map from the next visit.
 */
export async function machineMap(
  machines: (MapMachine & { address: string | null })[],
  depotAddress: string | null,
): Promise<MachineMapData> {
  const addresses = [...machines.map((mc) => mc.address), depotAddress].filter((a): a is string => Boolean(a?.trim()));
  const known = await knownPoints(addresses).catch(() => new Map<string, Point | null>());
  if (addresses.some((address) => !known.has(geoKey(address)))) after(() => lookUpMissing(addresses, known));

  const places = new Map<string, MapPlace>();
  const unplaced: string[] = [];
  for (const { address, ...machine } of machines) {
    const point = address ? known.get(geoKey(address)) : null;
    if (!address || !point) {
      unplaced.push(machine.name);
      continue;
    }
    const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    const place: MapPlace = places.get(key) ?? { key, lat: point.lat, lon: point.lon, address, machines: [] };
    place.machines.push(machine);
    places.set(key, place);
  }
  const depotPoint = depotAddress ? known.get(geoKey(depotAddress)) : null;
  return {
    places: [...places.values()],
    depot: depotAddress && depotPoint ? { ...depotPoint, address: depotAddress } : null,
    unplaced,
  };
}
