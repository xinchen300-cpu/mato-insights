import { VendlyWordmark } from "@/components/brand/vendly-mark";
import { ProductionListView } from "@/components/production/production-list";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { fillerLocales } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { getProductionByToken } from "@/lib/data";
import { writeByLink } from "./actions";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.kitchen.title, robots: { index: false, follow: false } };
}

// The kitchen's view (Xin, 19-10-2026): no login, just the producer's link.
// It reads Dutch or French, like the people on the road.
export default async function ProducerListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { m } = await getI18n();
  const list = await getProductionByToken(token);

  return (
    <div className="mx-auto min-h-svh max-w-2xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <header className="mb-6 flex h-10 items-center justify-between gap-3">
        <VendlyWordmark />
        <LanguageToggle only={fillerLocales} />
      </header>
      {!list ? (
        <p className="surface-card px-6 py-12 text-center text-[15px] text-muted-foreground">{m.kitchen.notFound}</p>
      ) : (
        <>
          <h1 className="mb-1 px-1 text-[28px] font-semibold leading-tight tracking-[-0.03em]">{m.kitchen.title}</h1>
          <p className="mb-6 px-1 text-[15px] text-muted-foreground">{list.producerName}</p>
          <ProductionListView list={list} write={writeByLink.bind(null, token)} />
        </>
      )}
    </div>
  );
}
