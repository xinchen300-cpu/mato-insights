import { PackageCheck } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { mediaUrl } from "@/lib/media";
import { ShareList } from "./share-list";

export type BoxItem = { productId: string; name: string; photoPath: string | null; take: number; slots: string[] };
export type Box = { machineId: string; name: string; items: BoxItem[]; take: number };

/** Everything to take, one line per item over all the boxes, most first (Xin, 21-10-2026: "a list of what to take"). */
export function allTogether(boxes: Box[]) {
  const items = new Map<string, BoxItem & { machines: string[] }>();
  for (const box of boxes) {
    for (const item of box.items) {
      const row = items.get(item.productId) ?? { ...item, take: 0, slots: [], machines: [] };
      row.take += item.take;
      row.machines.push(box.name);
      items.set(item.productId, row);
    }
  }
  return [...items.values()].sort((a, b) => b.take - a.take || a.name.localeCompare(b.name));
}

/**
 * The vullijst as it is shown: everything together first, then a numbered box
 * per machine, the full ones after. Only what to pack: a round starts on
 * Bijvullen, never from here (Xin, 19-10-2026).
 */
export function FillListView({ m, boxes, full }: { m: Messages; boxes: Box[]; full: string[] }) {
  const total = boxes.reduce((sum, box) => sum + box.take, 0);
  const pieces = (n: number) => (n === 1 ? m.fillList.pieceOne : fmt(m.fillList.pieces, { n }));
  const together = allTogether(boxes);
  // The same list as a message, to send to whoever packs the van.
  const text = [
    m.fillList.title,
    "",
    `${m.fillList.together} (${pieces(total)})`,
    ...together.map((item) => `${item.take} × ${item.name}`),
    ...boxes.flatMap((box, index) => [
      "",
      `${index + 1}. ${box.name} (${pieces(box.take)})`,
      ...box.items.map((item) => `${item.take} × ${item.name} · ${fmt(m.fillList.slots, { slots: item.slots.join(" · ") })}`),
    ]),
  ].join("\n");

  return (
    <>
      <PageHeader title={m.fillList.title} subtitle={m.fillList.subtitle} />
      {boxes.length === 0 ? (
        <EmptyState title={m.fillList.empty} hint={m.fillList.emptyHint} icon={<PackageCheck className="size-5" />} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="tabular text-[15px] font-semibold">
              {boxes.length === 1
                ? fmt(m.fillList.totalOne, { n: total })
                : fmt(m.fillList.total, { n: total, machines: boxes.length })}
            </p>
            <ShareList text={text} label={m.fillList.share} copied={m.fillList.copied} />
          </div>
          {boxes.length > 1 && (
            <Section title={m.fillList.together} hint={m.fillList.togetherHint}>
              <ul className="surface-card flex flex-col px-3 py-1">
                {together.map((item) => (
                  <li key={item.productId} className="flex min-h-[60px] items-center gap-3 border-b border-border/60 py-2 last:border-0">
                    <Photo path={item.photoPath} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[16px] font-semibold">{item.name}</span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {fmt(m.fillList.forMachines, { machines: item.machines.join(" · ") })}
                      </span>
                    </span>
                    <span className="tabular w-12 shrink-0 text-right text-[22px] font-bold tracking-[-0.02em]">{item.take}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {boxes.length > 1 && <h2 className="-mb-2 px-1 pt-2 text-[20px] font-semibold tracking-[-0.02em]">{m.fillList.perMachine}</h2>}
          {boxes.map((box, index) => (
            <section key={box.machineId} className="flex flex-col gap-2">
              <div className="flex items-center gap-3 px-1">
                <span
                  className="tabular grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-[16px] font-bold text-background"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h2 className="min-w-0 flex-1 truncate text-[18px] font-bold tracking-[-0.02em]">
                  <span className="sr-only">{fmt(m.fillList.box, { n: index + 1 })}: </span>
                  {box.name}
                </h2>
                <span className="tabular shrink-0 text-[15px] font-semibold text-muted-foreground">{pieces(box.take)}</span>
              </div>
              <ul className="surface-card flex flex-col px-3 py-1">
                {box.items.map((item) => (
                  <li key={item.productId} className="flex min-h-[60px] items-center gap-3 border-b border-border/60 py-2 last:border-0">
                    <Photo path={item.photoPath} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[16px] font-semibold">{item.name}</span>
                      <span className="tabular truncate text-[13px] text-muted-foreground">
                        {fmt(m.fillList.slots, { slots: item.slots.join(" · ") })}
                      </span>
                    </span>
                    <span className="tabular w-12 shrink-0 text-right text-[22px] font-bold tracking-[-0.02em]">{item.take}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {full.length > 0 && (
            <Section title={m.fillList.full} hint={m.fillList.fullHint}>
              <p className="px-1 text-[15px] text-muted-foreground">{full.join(" · ")}</p>
            </Section>
          )}
        </div>
      )}
    </>
  );
}


function Photo({ path }: { path: string | null }) {
  const src = mediaUrl(path);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg bg-surface object-cover" />;
}
