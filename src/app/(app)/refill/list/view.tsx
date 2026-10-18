import Link from "next/link";
import { ChevronRight, PackageCheck } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { mediaUrl } from "@/lib/media";
import { StartRound } from "./start-round";

export type BoxItem = { productId: string; name: string; photoPath: string | null; take: number; slots: string[] };
export type Box = { machineId: string; name: string; items: BoxItem[]; take: number };

/** The vullijst as it is shown: a numbered box per machine, the full ones after, and the button at the thumb. */
export function FillListView({ m, boxes, full, openId }: { m: Messages; boxes: Box[]; full: string[]; openId: string | null }) {
  const total = boxes.reduce((sum, box) => sum + box.take, 0);
  const pieces = (n: number) => (n === 1 ? m.fillList.pieceOne : fmt(m.fillList.pieces, { n }));

  return (
    <>
      <PageHeader title={m.fillList.title} subtitle={m.fillList.subtitle} />
      {boxes.length === 0 ? (
        <EmptyState title={m.fillList.empty} hint={m.fillList.emptyHint} icon={<PackageCheck className="size-5" />} />
      ) : (
        <div className="flex flex-col gap-6 pb-28 lg:pb-0">
          <p className="tabular px-1 text-[15px] font-semibold">
            {boxes.length === 1
              ? fmt(m.fillList.totalOne, { n: total })
              : fmt(m.fillList.total, { n: total, machines: boxes.length })}
          </p>
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

      {/* At the thumb, above the tab bar: go on with the round, or start one with this list. */}
      {(openId || boxes.length > 0) && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-6 lg:bottom-4">
          {openId ? (
            <Link
              href={`/vullen/${openId}`}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-[17px] font-semibold text-background shadow-[var(--shadow-pop)] active:scale-[0.99]"
            >
              {m.fillList.continue}
              <ChevronRight className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <StartRound machineIds={boxes.map((box) => box.machineId)} />
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
