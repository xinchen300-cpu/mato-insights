"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import type { ExpiryAlert, SlowMover } from "@/lib/types";
import { pullExpired } from "./actions";

export function ExpiryList({ alerts, slowMovers }: { alerts: ExpiryAlert[]; slowMovers: SlowMover[] }) {
  const { m, f } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function pull(alert: ExpiryAlert) {
    const key = `${alert.machine_id}:${alert.selection_number}`;
    setBusy(key);
    startTransition(async () => {
      try {
        await pullExpired(alert.machine_id, alert.selection_number, alert.qty_expired);
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {alerts.length > 0 && (
        <Panel title={m.expiry.toPull} hint={m.expiry.toPullHint}>
          <ul className="flex flex-col divide-y">
            {alerts.map((alert) => {
              const key = `${alert.machine_id}:${alert.selection_number}`;
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold">
                      {alert.qty_expired > 0 && <TriangleAlert className="size-4 shrink-0 text-negative" />}
                      {alert.product_name ?? fmt(m.expiry.selection, { number: alert.selection_number })}
                    </span>
                    <Link
                      href={`/machines/${alert.machine_id}`}
                      className="block truncate text-sm text-muted-foreground hover:text-foreground"
                    >
                      {alert.machine_name} · {fmt(m.expiry.selection, { number: alert.selection_number })}
                      {alert.business_name && alert.business_name !== alert.machine_name && ` · ${alert.business_name}`}
                    </Link>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="text-right text-sm">
                      {alert.qty_expired > 0 ? (
                        <span className="block font-semibold text-negative">
                          {fmt(m.expiry.expiredCount, { count: alert.qty_expired })}
                        </span>
                      ) : (
                        <span className="block font-semibold text-warning">
                          {fmt(m.expiry.expiringCount, { count: alert.qty_expiring_24h })}
                        </span>
                      )}
                      {alert.next_expires_at && (
                        <span className="block text-xs text-muted-foreground">{f.date(alert.next_expires_at)}</span>
                      )}
                    </span>
                    {alert.qty_expired > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pull(alert)}
                        disabled={isPending && busy === key}
                      >
                        <Trash2 />
                        {m.expiry.pull}
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {slowMovers.length > 0 && (
        <Panel title={m.expiry.alwaysExpires} hint={m.expiry.alwaysExpiresHint}>
          <ul className="flex flex-col divide-y">
            {slowMovers.map((slot) => (
              <li
                key={`${slot.machine_id}:${slot.selection_number}`}
                className="flex flex-wrap items-baseline justify-between gap-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{slot.product_name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {slot.machine_name} · {fmt(m.expiry.selection, { number: slot.selection_number })}
                  </span>
                </span>
                <span className="text-right text-sm text-muted-foreground">
                  {slot.days_to_sell_full === null
                    ? fmt(m.expiry.sellsNothing, { days: slot.shelf_life_days ?? 0 })
                    : fmt(m.expiry.daysToSellFull, {
                        days: f.number(Math.round(slot.days_to_sell_full)),
                        shelf: slot.shelf_life_days ?? 0,
                        capacity: slot.capacity,
                      })}
                  <span className="block text-xs">
                    {plural(slot.capacity, m.expiry.capacityOne, m.expiry.capacityOther)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
