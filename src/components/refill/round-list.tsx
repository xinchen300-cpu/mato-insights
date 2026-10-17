import Link from "next/link";
import { ChevronRight, CircleCheck, ClipboardList } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { RoundFigures } from "@/components/refill/round-figures";
import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { itemReport, roundFigures, type RoundFigures as Figures } from "@/lib/refill-flow";
import type { RefillSheet } from "@/lib/types";

/** A closed step-by-step round has its own figures; an old one filled through a link only its plan. */
export function figuresOf(sheet: RefillSheet): Figures | null {
  return sheet.flow_version === 2 && sheet.completed_at
    ? roundFigures(itemReport(sheet.lines, sheet.box ?? {}, sheet.stops ?? {}, sheet.returns ?? [], []))
    : null;
}

/**
 * Rounds as cards, newest first: the number, when, where and who, and what it
 * came to (along, filled, Too Good To Go, thrown away). A tap opens the round.
 */
export function RoundList({ sheets, names, m, f }: { sheets: RefillSheet[]; names: Map<string, string>; m: Messages; f: Formatters }) {
  return (
    <ul className="stagger flex flex-col gap-3">
      {sheets.map((sheet) => {
        const figures = figuresOf(sheet);
        const open = !sheet.completed_at && Boolean(sheet.started_at);
        const planned = sheet.lines.reduce((sum, line) => sum + line.to_add, 0);
        return (
          <li key={sheet.id}>
            <Link
              href={`/refill/${sheet.id}`}
              className="surface-card hover-surface flex flex-col gap-3 p-4 transition-transform duration-150 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <Avatar tone={sheet.completed_at ? "positive" : open ? "warning" : "neutral"}>
                  {sheet.completed_at ? <CircleCheck /> : <ClipboardList />}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-semibold tracking-[-0.01em]">
                    {sheet.number ? fmt(m.refill.roundNumber, { n: sheet.number }) : f.dateTime(sheet.created_at)}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {[
                      sheet.number ? f.dateTime(sheet.created_at) : null,
                      sheet.machine_ids.map((id) => names.get(id)).filter(Boolean).join(", "),
                      sheet.filled_by,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              </div>
              {figures ? (
                <RoundFigures figures={figures} m={m} size="small" />
              ) : (
                <p className="tabular text-[13.5px] text-muted-foreground">
                  {[fmt(m.refill.items, { count: planned }), open ? m.refill.runOpen : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
