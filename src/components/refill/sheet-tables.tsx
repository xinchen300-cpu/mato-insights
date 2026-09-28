import type { Messages } from "@/i18n/messages";
import { mediaUrl } from "@/lib/media";
import { combineByProduct, groupByMachine } from "@/lib/refill";
import type { RefillLine } from "@/lib/types";

// Read-only refill sheet, used by the operator view and the printable A4 page.
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
  const cell = "border-b px-2 py-2 text-left";

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-xl">{m.refill.combined}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{m.refill.combinedHint}</p>
        <table className="w-full border-collapse bg-card text-sm">
          <tbody>
            {combined.map((row) => (
              <tr key={row.productId}>
                {printable && <td className={`${cell} w-8`}>{box}</td>}
                <td className={cell}>
                  <span className="flex items-center gap-2">
                    {!printable && row.photoPath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(row.photoPath)!} alt="" className="size-7 object-contain" />
                    )}
                    {row.name}
                  </span>
                </td>
                <td className={`${cell} tabular w-20 text-right font-heading text-base font-semibold`}>
                  {row.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl">{m.refill.perMachine}</h2>
        {machines.map((machine) => (
          <div key={machine.machineId} className="break-inside-avoid">
            <h3 className="mb-2 text-base">{machine.name}</h3>
            <table className="w-full border-collapse bg-card text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {printable && <th className={`${cell} w-8`} />}
                  <th className={`${cell} w-14 font-semibold`}>{m.refill.slot}</th>
                  <th className={`${cell} font-semibold`}>{m.refill.product}</th>
                  <th className={`${cell} w-20 text-right font-semibold`}>{m.refill.inMachine}</th>
                  <th className={`${cell} w-16 text-right font-semibold`}>{m.refill.fits}</th>
                  <th className={`${cell} w-16 text-right font-semibold`}>{m.refill.toAdd}</th>
                </tr>
              </thead>
              <tbody>
                {machine.lines.map((line) => (
                  <tr key={line.selection_number}>
                    {printable && <td className={cell}>{box}</td>}
                    <td className={`${cell} font-mono font-bold`}>{line.selection_number}</td>
                    <td className={cell}>{line.product_name}</td>
                    <td className={`${cell} tabular text-right`}>{line.stock}</td>
                    <td className={`${cell} tabular text-right`}>{line.capacity}</td>
                    <td className={`${cell} tabular text-right font-heading text-base font-semibold`}>
                      {line.to_add}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
