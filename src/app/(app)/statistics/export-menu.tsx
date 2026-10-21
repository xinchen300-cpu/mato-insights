"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

function lastDayOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(Date.UTC(year, m, 0)).getUTCDate())}`;
}

/** Every month from the first sale up to this one, newest first. */
function monthsSince(first: string, today: string): string[] {
  let [year, month] = today.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  while (`${year}-${pad(month)}` >= first.slice(0, 7) && months.length < 60) {
    months.push(`${year}-${pad(month)}`);
    month -= 1;
    if (month === 0) [year, month] = [year - 1, 12];
  }
  return months;
}

type Choice = "shown" | "month" | "year" | "own";

/**
 * Statistics → Exporteren (Xin, 21-10-2026: "export per date, or per month, whats been sold so its easy to give to
 * accounting"): the period shown above, a month, a year or two dates of your own, as PDF, Excel or CSV. The page's
 * other filters (a business, a machine, a product) stay as they are and are named.
 */
export function ExportMenu({
  shown,
  shownLabel,
  keep,
  keepLabel,
  firstDay,
  today,
}: {
  /** The page's own period, as it stands in the address. */
  shown: { period: string; from: string | null; to: string | null };
  shownLabel: string;
  /** business / machine / product, as in the address. */
  keep: string;
  /** Those filters by name, or null without any. */
  keepLabel: string | null;
  /** The first day anything sold in this selection, or today. */
  firstDay: string;
  today: string;
}) {
  const { m, f } = useI18n();
  const t = m.salesExport;
  const [open, setOpen] = useState(false);
  const months = monthsSince(firstDay, today);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  const [choice, setChoice] = useState<Choice>("shown");
  const [month, setMonth] = useState(months[0]);
  const [year, setYear] = useState(years[0]);
  const [from, setFrom] = useState(shown.from ?? `${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(shown.to ?? today);

  const range: Record<string, string> | null =
    choice === "shown"
      ? Object.fromEntries(Object.entries(shown).filter(([, v]) => v) as [string, string][])
      : choice === "month"
        ? { period: "custom", from: `${month}-01`, to: lastDayOf(month) }
        : choice === "year"
          ? { period: "custom", from: `${year}-01-01`, to: `${year}-12-31` }
          : from && to && from <= to
            ? { period: "custom", from, to }
            : null;
  const href = (format: "pdf" | "excel" | "csv") => {
    const params = new URLSearchParams(keep);
    for (const [key, value] of Object.entries(range ?? {})) params.set(key, value);
    return `/statistics/${format}?${params}`;
  };

  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  // 16px on phones so iOS does not zoom into the field on focus.
  const field =
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  const option = (value: Choice, label: string, body?: React.ReactNode) => (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-xl border px-3.5 py-3 transition-colors",
        choice === value ? "border-foreground/40 bg-muted/60" : "hover:bg-hover/40",
      )}
    >
      <span className="flex items-center gap-2.5 text-[14.5px] font-medium">
        <input type="radio" name="export-period" className="size-4 accent-foreground" checked={choice === value} onChange={() => setChoice(value)} />
        {label}
      </span>
      {body && choice === value && <span className="pl-6.5">{body}</span>}
    </label>
  );
  const formats = [
    { key: "pdf" as const, label: "PDF", hint: t.pdfHint, icon: <FileText /> },
    { key: "excel" as const, label: "Excel", hint: t.excelHint, icon: <FileSpreadsheet /> },
    { key: "csv" as const, label: "CSV", hint: t.csvHint, icon: <Sheet /> },
  ];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download />
        {t.button}
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="grid-cols-1 gap-4 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{t.hint}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              {option("shown", `${t.asShown} · ${shownLabel}`)}
              {option(
                "month",
                t.month,
                <select className={field} value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t.month}>
                  {months.map((value) => (
                    <option key={value} value={value}>
                      {capitalize(f.monthLongYear(value))}
                    </option>
                  ))}
                </select>,
              )}
              {option(
                "year",
                t.year,
                <select className={field} value={year} onChange={(e) => setYear(e.target.value)} aria-label={t.year}>
                  {years.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>,
              )}
              {option(
                "own",
                t.own,
                <span className="grid grid-cols-2 gap-2">
                  <span className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                    {t.from}
                    <input type="date" className={field} value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
                  </span>
                  <span className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                    {t.to}
                    <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
                  </span>
                  {!range && <span className="col-span-2 text-[13px] text-destructive">{t.invalidRange}</span>}
                </span>,
              )}
            </div>

            {keepLabel && <p className="text-[13px] text-muted-foreground">{fmt(t.filterNote, { filter: keepLabel })}</p>}

            <div className="grid grid-cols-3 gap-2">
              {formats.map((format) =>
                range ? (
                  <a
                    key={format.key}
                    href={href(format.key)}
                    download
                    onClick={() => setTimeout(() => setOpen(false), 300)}
                    className="flex flex-col items-center gap-1 rounded-xl border bg-card px-2 py-3 text-center transition-colors hover:bg-hover/40 [&_svg]:size-5"
                  >
                    {format.icon}
                    <span className="text-[14.5px] font-semibold">{format.label}</span>
                    <span className="text-[11.5px] leading-tight text-muted-foreground">{format.hint}</span>
                  </a>
                ) : (
                  <span key={format.key} aria-disabled className="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center opacity-40 [&_svg]:size-5">
                    {format.icon}
                    <span className="text-[14.5px] font-semibold">{format.label}</span>
                    <span className="text-[11.5px] leading-tight text-muted-foreground">{format.hint}</span>
                  </span>
                ),
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
