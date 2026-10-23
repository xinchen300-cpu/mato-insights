import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid, Mail, MapPin, Nfc, Package } from "lucide-react";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { MachinePhoto } from "@/components/machine/machine-photo";
import { PageHeader, Section } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getMachineAbout } from "@/lib/data";
import { MODEL_FEATURES, MODEL_SHEETS, asMachineModel } from "@/lib/machine-models";
import { denyFiller, hasPersonalSettings, isOperator } from "@/lib/org";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.machineModels.section };
}

/**
 * One machine of Profiel → Mijn automaten (24-10-2026, Xin: "say what kind of automaat they have and also they can click
 * on it to see key features", with the folder of the MATO B1): what model it is and what that model can do, as the
 * folder tells it, and what this machine is like now. A machine whose model is not known says so, and where to set it.
 */
export default async function MachineModelPage({ params }: { params: Promise<{ id: string }> }) {
  await denyFiller();
  const { id } = await params;
  const { m, f } = await getI18n();
  if (!(await hasPersonalSettings())) notFound();
  const [about, operator] = await Promise.all([getMachineAbout(id).catch(() => null), isOperator()]);
  if (!about) notFound();
  const { machine, layout } = about;
  const model = asMachineModel(machine.model);
  const t = m.machineModels;

  // What this machine is like now: where it stands, how it is laid out, its terminal.
  const facts = (
    <>
      {machine.address && (
        <li>
          <ListRow leading={<Avatar><MapPin /></Avatar>} title={machine.address} subtitle={t.address} />
        </li>
      )}
      {layout && (
        <li>
          <ListRow
            leading={<Avatar><LayoutGrid /></Avatar>}
            title={fmt(t.layoutValue, { slots: f.number(layout.slots), rows: f.number(layout.rows) })}
            subtitle={t.layout}
          />
        </li>
      )}
      {layout && layout.fits > 0 && (
        <li>
          <ListRow leading={<Avatar><Package /></Avatar>} title={fmt(t.fitsValue, { count: f.number(layout.fits) })} subtitle={t.fits} />
        </li>
      )}
      {machine.terminal_model && (
        <li>
          <ListRow leading={<Avatar><Nfc /></Avatar>} title={machine.terminal_model} subtitle={t.terminal} />
        </li>
      )}
    </>
  );
  const hasFacts = Boolean(machine.address || layout || machine.terminal_model);

  if (!model) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          backHref="/profile"
          backLabel={t.back}
          title={machine.name}
          subtitle={machine.type ? m.machines.types[machine.type] : t.notSet}
        />
        <div className="flex flex-col gap-8">
          <div className="surface-card overflow-hidden sm:grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <MachinePhoto path={machine.photo_path} />
            <div className="flex flex-col justify-center gap-2 p-5">
              <p className="text-[17px] font-semibold tracking-[-0.01em]">{t.unknownTitle}</p>
              <p className="text-[14px] leading-relaxed text-muted-foreground">{operator ? t.unknownBody : t.unknownBodyShop}</p>
              {operator && (
                <Link href={`/machines/${machine.id}`} className={buttonVariants({ variant: "secondary", className: "mt-2 self-start" })}>
                  {t.toSettings}
                </Link>
              )}
            </div>
          </div>
          {hasFacts && (
            <Section title={t.yourMachine}>
              <RowList>{facts}</RowList>
            </Section>
          )}
        </div>
      </div>
    );
  }

  const sheet = MODEL_SHEETS[model];
  const words = t[model];
  const spec = words.specs;
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: t.dimensions,
      rows: [
        [t.height, fmt(t.cm, { n: f.number(sheet.heightCm) })],
        [t.width, fmt(t.cm, { n: f.number(sheet.widthCm) })],
        [t.depth, fmt(t.cm, { n: f.number(sheet.depthCm) })],
        [t.weight, fmt(t.kg, { n: f.number(sheet.weightKg) })],
      ],
    },
    {
      title: t.technique,
      rows: [
        [spec.dispensing, spec.dispensingValue],
        [spec.temperature, fmt(spec.temperatureValue, { min: sheet.tempMin, max: sheet.tempMax })],
        [spec.conformity, spec.conformityValue],
        [spec.power, spec.powerValue],
      ],
    },
    {
      title: t.specCapacity,
      rows: [
        [spec.breadLayout, fmt(spec.breadValue, { n: f.number(sheet.breadBags) })],
        [spec.mealLayout, fmt(spec.mealValue, { n: f.number(sheet.mealTrays) })],
        [spec.lanes, spec.lanesValue],
        [spec.shelves, spec.shelvesValue],
      ],
    },
    {
      title: t.operating,
      rows: [
        [spec.payment, spec.paymentValue],
        [spec.terminal, spec.terminalValue],
        [spec.screen, spec.screenValue],
        [spec.telemetry, spec.telemetryValue],
      ],
    },
  ];

  return (
    <div className="max-w-4xl">
      <PageHeader backHref="/profile" backLabel={t.back} title={machine.name} subtitle={`${sheet.name} · ${words.kind}`} />
      <div className="flex flex-col gap-9 sm:gap-10">
        {/* The machine itself, as on the folder's cover. */}
        <div className="surface-card overflow-hidden sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="grid place-items-center bg-[linear-gradient(160deg,var(--photo-from),var(--photo-to))] px-6 py-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sheet.image}
              alt={sheet.name}
              width={560}
              height={762}
              className="h-64 w-auto drop-shadow-[0_18px_24px_rgb(0_0_0/0.22)] sm:h-80"
            />
          </div>
          <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
            <h2 className="text-[34px] font-bold leading-none tracking-[-0.03em] sm:text-[44px]">{sheet.name}</h2>
            <p className="text-[18px] text-muted-foreground">{words.kind}</p>
            <div className="my-1 h-px bg-border" />
            <p className="max-w-[48ch] text-[15px] leading-relaxed">{words.intro}</p>
          </div>
        </div>

        {hasFacts && (
          <Section title={t.yourMachine}>
            <RowList>{facts}</RowList>
          </Section>
        )}

        <Section title={t.keyFeatures}>
          <div className="grid gap-4 sm:grid-cols-2">
            {MODEL_FEATURES.map((key) => (
              <article key={key} className="surface-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sheet.features[key]} alt={words.features[key].title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <div className="flex flex-col gap-1.5 p-5">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-gold-ink">{words.features[key].eyebrow}</p>
                  <h3 className="text-[18px] font-semibold tracking-[-0.015em]">{words.features[key].title}</h3>
                  <p className="text-[14px] leading-relaxed text-muted-foreground">{words.features[key].body}</p>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section title={t.capacity}>
          <div className="surface-card overflow-hidden sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheet.capacityImage} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-full" />
            <div className="flex flex-col gap-5 p-6">
              <p className="text-[15px] leading-relaxed">{words.capacityBody}</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  [sheet.rows, t.rows, t.rowsHint],
                  [sheet.slotsPerRow, t.slotsPerRow, t.slotsPerRowHint],
                ].map(([count, label, hint]) => (
                  <div key={String(label)} className="border-t-2 border-gold-ink/60 pt-2">
                    <p className="tabular text-[34px] font-semibold leading-tight tracking-[-0.02em]">{count}</p>
                    <p className="text-[14px] font-semibold">{label}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
              <ul className="flex flex-col">
                {words.capacityPoints.map((point) => (
                  <li key={point} className="flex gap-3 border-t py-2.5 text-[14px] leading-snug">
                    <span className="mt-[0.6em] h-0.5 w-3 shrink-0 bg-gold-ink" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section title={t.specs}>
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.title} className="surface-card px-5 py-4">
                <p className="pb-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-gold-ink">{group.title}</p>
                <dl>
                  {group.rows.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 border-t py-2.5 text-[14px]">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Section>

        <div className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <Avatar>
            <Mail />
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-[-0.01em]">{t.questions}</p>
            <p className="mt-0.5 text-[13.5px] leading-snug text-muted-foreground">{t.questionsBody}</p>
          </div>
          <a href="mailto:info@matoautomaat.be" className={buttonVariants({ variant: "secondary", className: "self-start sm:self-center" })}>
            info@matoautomaat.be
          </a>
        </div>
      </div>
    </div>
  );
}
