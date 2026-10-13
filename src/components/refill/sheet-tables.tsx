import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import type { Messages } from "@/i18n/messages";
import { mediaUrl } from "@/lib/media";
import { combineByProduct, groupByMachine } from "@/lib/refill";
import type { RefillLine } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What really happened on a finished round, instead of what was planned. */
export type SheetActual = {
  /** Per product: out of the fridge. */
  taken: Record<string, number>;
  /** Per "machine:selection": into the slot. */
  filled: Record<string, number>;
  /** Machines that were skipped. */
  skipped: string[];
};

// Read-only refill sheet, used by the operator view and the printable A4 page.
// Paper keeps every column, tick boxes and plain hairlines; the screen gets
// rows on a white card, and a phone folds the two reference columns into a
// grey line under the product so the number to add stays readable. A finished
// round shows what was taken and filled, not what was planned.
export function SheetTables({
  lines,
  m,
  printable = false,
  actual,
}: {
  lines: RefillLine[];
  m: Messages;
  printable?: boolean;
  actual?: SheetActual;
}) {
  const combined = combineByProduct(lines).map((row) =>
    actual ? { ...row, quantity: actual.taken[row.productId] ?? 0 } : row,
  );
  const machines = groupByMachine(lines);
  const valueOf = (line: RefillLine) =>
    actual ? (actual.filled[`${line.machine_id}:${line.selection_number}`] ?? 0) : line.to_add;
  const box = <span className="inline-block size-4 border-[1.5px] border-foreground align-middle" />;

  const cell = printable ? "border-b px-2 py-2 text-left" : "border-b border-border px-3 py-3 text-left align-middle";
  const head = printable ? `${cell} font-semibold` : "border-b border-border px-3 pb-2.5 pt-2 text-left font-medium";
  const onWide = printable ? "" : "hidden sm:table-cell";
  const sectionTitle = printable ? "text-xl" : "px-1 text-[20px] font-semibold tracking-[-0.02em]";

  return (
    <div className={cn("flex flex-col", printable ? "gap-8" : "gap-10")}>
      <section>
        <h2 className={sectionTitle}>{actual ? m.refill.combinedDone : m.refill.combined}</h2>
        <p className={cn("mb-3 text-sm text-muted-foreground", !printable && "mt-0.5 px-1")}>{m.refill.combinedHint}</p>
        {printable ? (
          <table className="w-full border-collapse bg-card text-sm">
            <tbody>
              {combined.map((row) => (
                <tr key={row.productId}>
                  <td className={`${cell} w-8`}>{box}</td>
                  <td className={cell}>
                    <span className="flex items-center gap-2">{row.name}</span>
                  </td>
                  <td className={`${cell} tabular w-20 text-right font-heading text-base font-semibold`}>
                    {row.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <RowList className="print:shadow-none">
            {combined.map((row) => (
              <li key={row.productId}>
                <ListRow
                  leading={
                    row.photoPath ? (
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(row.photoPath)!} alt="" className="size-7 object-contain" />
                      </span>
                    ) : (
                      <Avatar>{initial(row.name)}</Avatar>
                    )
                  }
                  title={row.name}
                  value={<span className="text-[17px]">{row.quantity}</span>}
                />
              </li>
            ))}
          </RowList>
        )}
      </section>

      <section className={cn("flex flex-col", printable ? "gap-6" : "gap-8")}>
        <h2 className={sectionTitle}>{m.refill.perMachine}</h2>
        {machines.map((machine) => (
          <div key={machine.machineId} className="break-inside-avoid">
            <h3 className={printable ? "mb-2 text-base" : "mb-3 px-1 text-[17px] font-semibold tracking-[-0.015em]"}>
              {machine.name}
              {actual?.skipped.includes(machine.machineId) && (
                <span className="font-medium text-warning"> · {m.refill.stopSkipped}</span>
              )}
            </h3>
            <div className={printable ? undefined : "surface-card px-2 py-1 print:shadow-none"}>
              <table
                className={cn(
                  "w-full border-collapse",
                  printable ? "bg-card text-sm" : "text-[15px] [&_tbody_tr:last-child>td]:border-b-0",
                )}
              >
                <thead>
                  <tr className={printable ? "text-xs text-muted-foreground" : "text-[13px] text-muted-foreground"}>
                    {printable && <th className={`${cell} w-8`} />}
                    <th className={cn(head, printable ? "w-14" : "w-16")}>{m.refill.slot}</th>
                    <th className={head}>{m.refill.product}</th>
                    {!actual && <th className={cn(head, "w-20 text-right", onWide)}>{m.refill.inMachine}</th>}
                    <th className={cn(head, "w-24 text-right", onWide)}>{m.refill.fits}</th>
                    <th className={cn(head, "w-24 text-right")}>{actual ? m.refill.filledCol : m.refill.toAdd}</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.lines.map((line) => (
                    <tr key={line.selection_number}>
                      {printable && <td className={cell}>{box}</td>}
                      {printable ? (
                        <td className={`${cell} font-mono font-bold`}>{line.selection_number}</td>
                      ) : (
                        <td className={cell}>
                          <span className="inline-grid h-7 min-w-9 place-items-center rounded-lg bg-surface px-1.5 font-mono text-[13px] font-semibold">
                            {line.selection_number}
                          </span>
                        </td>
                      )}
                      <td className={cell}>
                        {line.product_name}
                        {!printable && (
                          <span className="mt-0.5 block text-[13px] text-muted-foreground sm:hidden">
                            {!actual && (
                              <>
                                {m.refill.inMachine} <span className="tabular">{line.stock}</span> ·{" "}
                              </>
                            )}
                            {m.refill.fits} <span className="tabular">{line.capacity}</span>
                          </span>
                        )}
                      </td>
                      {!actual && (
                        <td className={cn(cell, "tabular text-right", onWide, !printable && "text-muted-foreground")}>
                          {line.stock}
                        </td>
                      )}
                      <td className={cn(cell, "tabular text-right", onWide, !printable && "text-muted-foreground")}>
                        {line.capacity}
                      </td>
                      <td
                        className={cn(
                          cell,
                          "tabular text-right",
                          printable ? "font-heading text-base font-semibold" : "text-[17px] font-semibold",
                        )}
                      >
                        {valueOf(line)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
