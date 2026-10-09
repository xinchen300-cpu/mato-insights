import { Avatar, ListRow, RowList, initial } from "@/components/list-row";
import type { Messages } from "@/i18n/messages";
import { mediaUrl } from "@/lib/media";
import { combineByProduct, groupByMachine } from "@/lib/refill";
import type { RefillLine } from "@/lib/types";
import { cn } from "@/lib/utils";

// Read-only refill sheet, used by the operator view and the printable A4 page.
// Paper keeps every column, tick boxes and plain hairlines; the screen gets
// rows on a white card, and a phone folds the two reference columns into a
// grey line under the product so the number to add stays readable.
export function SheetTables({
  lines,
  m,
  printable = false,
}: {
  lines: RefillLine[];
  m: Messages;
  printable?: boolean;
}) {
  const combined = combineByProduct(lines);
  const machines = groupByMachine(lines);
  const box = <span className="inline-block size-4 border-[1.5px] border-foreground align-middle" />;

  const cell = printable ? "border-b px-2 py-2 text-left" : "border-b border-border px-3 py-3 text-left align-middle";
  const head = printable ? `${cell} font-semibold` : "border-b border-border px-3 pb-2.5 pt-2 text-left font-medium";
  const onWide = printable ? "" : "hidden sm:table-cell";
  const sectionTitle = printable ? "text-xl" : "px-1 text-[20px] font-semibold tracking-[-0.02em]";

  return (
    <div className={cn("flex flex-col", printable ? "gap-8" : "gap-10")}>
      <section>
        <h2 className={sectionTitle}>{m.refill.combined}</h2>
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
                    <th className={cn(head, "w-20 text-right", onWide)}>{m.refill.inMachine}</th>
                    <th className={cn(head, "w-16 text-right", onWide)}>{m.refill.fits}</th>
                    <th className={cn(head, "w-16 text-right")}>{m.refill.toAdd}</th>
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
                            {m.refill.inMachine} <span className="tabular">{line.stock}</span> · {m.refill.fits}{" "}
                            <span className="tabular">{line.capacity}</span>
                          </span>
                        )}
                      </td>
                      <td className={cn(cell, "tabular text-right", onWide, !printable && "text-muted-foreground")}>
                        {line.stock}
                      </td>
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
                        {line.to_add}
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
