import { redirect } from "next/navigation";
import { Timer, Truck } from "lucide-react";
import { MiniStat } from "@/components/kpi";
import { PersonPhoto } from "@/components/filler/person-photo";
import { Avatar, ListRow, RowList } from "@/components/list-row";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { duration, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getFillerOverview, getOpenRounds } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { mediaUrl } from "@/lib/media";
import type { Average, FillerTimes } from "@/lib/refill-flow";
import { MachineIcon } from "@/components/machine/machine-icon";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.fillers.title };
}

/**
 * The people who fill, and how long it takes: per filler, per machine and per
 * drive. Averages with how often they were measured, no colours and no
 * ranking: a long round is not a slow filler.
 */
export default async function FillersPage() {
  await denyFiller();
  // Who was quick is the operator's to see.
  if (!(await isOperator())) redirect("/refill");
  const { m, f } = await getI18n();
  const t = m.fillers;
  const orgId = await requireOrgId();
  const [overview, live] = await Promise.all([getFillerOverview(orgId), getOpenRounds(orgId)]);

  const took = (minutes: number) => duration(Math.max(1, minutes), m.refill.runTime, m.refill.runTimeHours);
  const measured = (average: Average) => fmt(t.measured, { count: average.count });

  // Everyone who filled, and the team's fillers who have not yet: one card each.
  const key = (name: string | null) => name?.toLocaleLowerCase() ?? "";
  const done = new Set(overview.fillers.map((person) => key(person.name)));
  const people: (FillerTimes & { email: string | null })[] = [
    ...overview.fillers.map((person) => ({
      ...person,
      email: overview.team.find((member) => key(member.name) === key(person.name))?.email ?? null,
    })),
    ...overview.team
      .filter((member) => !done.has(key(member.name)))
      .map((member) => ({
        name: member.name,
        email: member.email,
        rounds: 0,
        lastAt: "",
        round: { minutes: 0, count: 0 },
        machinesPerRound: 0,
        atMachine: { minutes: 0, count: 0 },
      })),
  ];

  // Who is out on a round right now, under the name the round got.
  const staffOf = new Map(overview.staff.map((person) => [key(person.name), person]));
  const busyOf = (name: string | null) => {
    const round = live.find((open) => open.readyAt && key(open.filledBy) === key(name));
    return round ? { at: round.machines.find((machine) => !machine.done)?.name ?? null } : null;
  };

  const name = (id: string) => (id === "start" ? t.start : id === "end" ? t.end : (overview.machineNames[id] ?? null));
  const machines = Object.entries(overview.machines)
    .filter(([id]) => overview.machineNames[id])
    .map(([id, average]) => ({ id, name: overview.machineNames[id], average }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Leaving first, then machine to machine, the way back last.
  const order = (id: string) => (id === "start" ? 0 : id === "end" ? 2 : 1);
  const legs = Object.entries(overview.legs)
    .map(([leg, average]) => {
      const [from, to] = leg.split("→");
      return { leg, from, to, fromName: name(from), toName: name(to), average };
    })
    .filter((leg) => leg.fromName && leg.toName)
    .sort(
      (a, b) =>
        order(a.from) - order(b.from) ||
        order(a.to) - order(b.to) ||
        a.fromName!.localeCompare(b.fromName!) ||
        a.toName!.localeCompare(b.toName!),
    );

  return (
    <>
      <PageHeader title={m.refill.title} subtitle={t.subtitle} actions={<RefillTabs active="fillers" m={m} />} />

      <div className="flex flex-col gap-10">
        {people.length > 0 && (
          <Section title={t.peopleTitle} hint={t.peopleHint}>
            <div className="grid gap-3 lg:grid-cols-2">
              {people.map((person) => (
                <article key={key(person.name)} className="surface-card flex flex-col gap-5 p-5 sm:p-6">
                  <div className="flex items-center gap-3.5">
                    <PersonPhoto
                      userId={staffOf.get(key(person.name))?.userId ?? null}
                      name={person.name ?? "?"}
                      url={mediaUrl(staffOf.get(key(person.name))?.photoPath)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">
                        {person.name ?? t.unknown}
                        {person.name && overview.me && key(person.name) === key(overview.me) && (
                          <span className="ml-2 text-[13px] font-medium text-muted-foreground">{m.team.you}</span>
                        )}
                      </p>
                      <p className="truncate text-[13.5px] text-muted-foreground">
                        {person.rounds === 0
                          ? t.noRounds
                          : [plural(person.rounds, t.roundsOne, t.rounds), fmt(t.lastRound, { date: f.dayMonth(person.lastAt) })].join(" · ")}
                      </p>
                      {(() => {
                        const busy = busyOf(person.name);
                        return busy ? (
                          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-positive">
                            <span className="size-2 rounded-full bg-positive" aria-hidden="true" />
                            {busy.at ? fmt(t.busyAt, { machine: busy.at }) : t.busyNow}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {person.rounds > 0 && (
                    <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                      {/* How many machines a round had, next to its time: a long
                          round is not a slow filler. */}
                      <MiniStat
                        label={t.wholeRound}
                        value={person.round.count ? took(person.round.minutes) : m.fillers.notMeasured}
                        detail={
                          person.round.count
                            ? fmt(t.roundDetail, {
                                machines: f.number(Math.round(person.machinesPerRound * 10) / 10),
                                count: person.round.count,
                              })
                            : undefined
                        }
                        f={f}
                      />
                      <MiniStat
                        label={t.perMachine}
                        value={person.atMachine.count ? took(person.atMachine.minutes) : m.fillers.notMeasured}
                        detail={person.atMachine.count ? measured(person.atMachine) : undefined}
                        f={f}
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </Section>
        )}

        {machines.length === 0 && legs.length === 0 ? (
          <EmptyState icon={<Timer className="size-5" />} title={t.emptyTitle} hint={t.emptyHint} />
        ) : (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
            <Section title={t.machinesTitle} hint={t.machinesHint}>
              <RowList>
                {machines.map((machine) => (
                  <li key={machine.id}>
                    <ListRow
                      leading={<Avatar><MachineIcon /></Avatar>}
                      title={machine.name}
                      value={took(machine.average.minutes)}
                      valueSub={<span className="tabular text-muted-foreground">{measured(machine.average)}</span>}
                    />
                  </li>
                ))}
              </RowList>
            </Section>
            <Section title={t.legsTitle} hint={t.legsHint}>
              <RowList>
                {legs.map((leg) => (
                  <li key={leg.leg}>
                    <ListRow
                      leading={
                        <Avatar>
                          <Truck />
                        </Avatar>
                      }
                      title={`${leg.fromName} → ${leg.toName}`}
                      value={took(leg.average.minutes)}
                      valueSub={<span className="tabular text-muted-foreground">{measured(leg.average)}</span>}
                    />
                  </li>
                ))}
              </RowList>
            </Section>
          </div>
        )}
      </div>
    </>
  );
}
