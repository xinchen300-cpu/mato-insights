"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Hourglass, Trash2, TriangleAlert } from "lucide-react";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import type { ExpiryAlert, SlowMover } from "@/lib/types";
import { cn } from "@/lib/utils";
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
    <div className="flex flex-col gap-10">
      {alerts.length > 0 && (
        <Section title={m.expiry.toPull} hint={m.expiry.toPullHint}>
          <RowList>
            {alerts.map((alert) => {
              const key = `${alert.machine_id}:${alert.selection_number}`;
              const expired = alert.qty_expired > 0;
              // Like a payment: what it is on the left, how many on the right,
              // and on a phone the one action under it, with room for a thumb.
              return (
                <li key={key} className="flex flex-col gap-2.5 rounded-xl px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3.5">
                    <Avatar tone={expired ? "negative" : "warning"}>
                      {expired ? <TriangleAlert /> : <CalendarClock />}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                        {alert.product_name ?? fmt(m.expiry.selection, { number: alert.selection_number })}
                      </p>
                      <Link
                        href={`/machines/${alert.machine_id}`}
                        className="mt-0.5 block truncate text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {alert.machine_name} · {fmt(m.expiry.selection, { number: alert.selection_number })}
                        {alert.business_name && alert.business_name !== alert.machine_name && ` · ${alert.business_name}`}
                      </Link>
                    </div>
                    <div className="shrink-0 text-right">
                      {/* A status the size of a word: a dot and the count, red only when it is really over. */}
                      <p
                        className={cn(
                          "inline-flex items-center gap-1.5 text-[14px] font-semibold",
                          expired ? "text-negative" : "text-foreground",
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", expired ? "bg-negative" : "bg-warning")} />
                        {expired
                          ? fmt(m.expiry.expiredCount, { count: alert.qty_expired })
                          : fmt(m.expiry.expiringCount, { count: alert.qty_expiring_24h })}
                      </p>
                      {alert.next_expires_at && (
                        <p className="mt-0.5 text-[13px] text-muted-foreground">{f.date(alert.next_expires_at)}</p>
                      )}
                    </div>
                  </div>
                  {expired && (
                    <div className="pl-[54px] sm:shrink-0 sm:pl-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pull(alert)}
                        disabled={isPending && busy === key}
                        className="h-10 sm:h-8"
                      >
                        <Trash2 />
                        {m.expiry.pull}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </RowList>
        </Section>
      )}

      {slowMovers.length > 0 && (
        <Section title={m.expiry.alwaysExpires} hint={m.expiry.alwaysExpiresHint}>
          <RowList>
            {slowMovers.map((slot) => (
              <li key={`${slot.machine_id}:${slot.selection_number}`}>
                <ListRow
                  leading={
                    <Avatar>
                      <Hourglass />
                    </Avatar>
                  }
                  title={slot.product_name}
                  subtitle={
                    <>
                      <span className="block truncate">
                        {slot.machine_name} · {fmt(m.expiry.selection, { number: slot.selection_number })}
                      </span>
                      <span className="mt-1 block whitespace-normal text-[13.5px] leading-snug text-foreground">
                        {slot.days_to_sell_full === null
                          ? fmt(m.expiry.sellsNothing, { days: slot.shelf_life_days ?? 0 })
                          : fmt(m.expiry.daysToSellFull, {
                              days: f.number(Math.round(slot.days_to_sell_full)),
                              shelf: slot.shelf_life_days ?? 0,
                              capacity: slot.capacity,
                            })}
                      </span>
                    </>
                  }
                  valueSub={
                    <span className="text-muted-foreground">
                      {plural(slot.capacity, m.expiry.capacityOne, m.expiry.capacityOther)}
                    </span>
                  }
                />
              </li>
            ))}
          </RowList>
        </Section>
      )}
    </div>
  );
}
