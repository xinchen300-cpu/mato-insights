import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachines, getMachineStock, getRefillSheets, getShortages } from "@/lib/data";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillLevel, needsAttention } from "@/lib/stock";
import { MachinePicker } from "./machine-picker";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.refill.title };
}

export default async function RefillPage() {
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const [machines, stock, sheets, shortages, { data: org }] = await Promise.all([
    getMachines(orgId),
    getMachineStock(orgId),
    getRefillSheets(orgId),
    getShortages(orgId),
    createAdminClient().from("organizations").select("cost_per_hour, cost_per_km").eq("id", orgId).maybeSingle(),
  ]);

  const perHour = Number(org?.cost_per_hour ?? 25);
  const perKm = Number(org?.cost_per_km ?? 0.42);

  // Measured, not guessed: how long a visit to this machine took on earlier
  // runs. A run over several machines is split evenly across them.
  const measured = new Map<string, { minutes: number; runs: number }>();
  for (const sheet of sheets) {
    if (!sheet.started_at || !sheet.completed_at || sheet.machine_ids.length === 0) continue;
    const total = (new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000;
    if (total <= 0 || total > 480) continue;
    const share = total / sheet.machine_ids.length;
    for (const id of sheet.machine_ids) {
      const entry = measured.get(id) ?? { minutes: 0, runs: 0 };
      entry.minutes += share;
      entry.runs += 1;
      measured.set(id, entry);
    }
  }

  // How often a product came up short, and how many pieces in total.
  const shortByProduct = new Map<string, { name: string; times: number; units: number }>();
  for (const s of shortages) {
    const key = s.product_id ?? "?";
    const entry = shortByProduct.get(key) ?? { name: s.product_name ?? "—", times: 0, units: 0 };
    entry.times += 1;
    entry.units += s.qty;
    shortByProduct.set(key, entry);
  }
  const shortList = [...shortByProduct.values()].sort((a, b) => b.units - a.units);

  const perMachine = new Map<string, { low: number; toAdd: number; value: number }>();
  for (const s of stock) {
    if (!s.product_id) continue;
    const entry = perMachine.get(s.machine_id) ?? { low: 0, toAdd: 0, value: 0 };
    if (needsAttention(fillLevel(s.stock, s.capacity))) entry.low += 1;
    const missing = s.capacity - (s.stock ?? 0);
    entry.toAdd += missing;
    entry.value += missing * (s.price ?? 0);
    perMachine.set(s.machine_id, entry);
  }

  const pickable = machines
    .filter((mc) => perMachine.has(mc.id))
    .map((mc) => {
      const p = perMachine.get(mc.id)!;
      const time = measured.get(mc.id);
      // Only a number we can stand behind: measured time and a distance the
      // operator filled in. Without either, no amount is shown.
      const cost =
        mc.km_round_trip !== null || time
          ? (mc.km_round_trip ?? 0) * perKm + (time ? (time.minutes / time.runs / 60) * perHour : 0)
          : null;
      return {
        id: mc.id,
        name: mc.name,
        low: p.low > 0,
        hint:
          cost !== null && p.value > 0
            ? fmt(m.refill.worthHint, {
                items: p.toAdd,
                value: f.euro(p.value),
                cost: f.euro(cost),
              })
            : p.low > 0
              ? fmt(m.overview.slotsLow, { count: p.low })
              : fmt(m.refill.items, { count: p.toAdd }),
      };
    });

  const machineName = new Map(machines.map((mc) => [mc.id, mc.name]));

  return (
    <>
      <PageHeader title={m.refill.title} subtitle={m.refill.subtitle} />

      <div className="flex flex-col gap-8">
        {pickable.length === 0 ? (
          <EmptyState
            title={m.machines.noLayout}
            hint={m.machines.noLayoutHint}
            action={
              <Link href="/machines" className={buttonVariants()}>
                {m.nav.machines}
              </Link>
            }
          />
        ) : (
          <MachinePicker machines={pickable} />
        )}

        <Panel title={m.refill.recent}>
          {sheets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.refill.recentEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {sheets.map((sheet) => {
                const total = sheet.lines.reduce((sum, l) => sum + l.to_add, 0);
                // The clock runs from the moment the filler opened the sheet.
                const minutes =
                  sheet.started_at && sheet.completed_at
                    ? Math.max(
                        1,
                        Math.round(
                          (new Date(sheet.completed_at).getTime() - new Date(sheet.started_at).getTime()) / 60000,
                        ),
                      )
                    : null;
                return (
                  <li key={sheet.id}>
                    <Link href={`/refill/${sheet.id}`} className="flex items-center justify-between gap-4 py-3">
                      <span className="min-w-0">
                        <span className="block font-semibold">{f.dateTime(sheet.created_at)}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {[
                            sheet.machine_ids.map((id) => machineName.get(id)).filter(Boolean).join(", "),
                            sheet.filled_by,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                        {minutes !== null && <span className="tabular">{fmt(m.refill.runTime, { minutes })}</span>}
                        {sheet.km !== null && <span className="tabular">{fmt(m.refill.runKm, { km: sheet.km })}</span>}
                        <span className="tabular">{fmt(m.refill.items, { count: total })}</span>
                        {sheet.completed_at ? (
                          <CircleCheck className="size-4 text-positive" />
                        ) : (
                          sheet.started_at && <span className="text-xs font-semibold text-warning">{m.refill.runOpen}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={m.refill.shortagesTitle} hint={m.refill.shortagesHint}>
          {shortList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.refill.shortagesEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {shortList.map((row) => (
                <li key={row.name} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="min-w-0 truncate font-semibold">{row.name}</span>
                  <span className="tabular shrink-0 text-sm text-muted-foreground">
                    {fmt(m.refill.shortagesTimes, { count: row.times, units: row.units })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
