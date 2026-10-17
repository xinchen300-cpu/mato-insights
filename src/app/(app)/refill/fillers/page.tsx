import { redirect } from "next/navigation";
import { Timer } from "lucide-react";
import { PersonPhoto } from "@/components/filler/person-photo";
import { ListRow, RowList } from "@/components/list-row";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RefillTabs } from "@/components/refill/refill-tabs";
import { duration, fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getFillerOverview, getOpenRounds } from "@/lib/data";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { mediaUrl } from "@/lib/media";
import type { FillerTimes } from "@/lib/refill-flow";

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

  return (
    <>
      <PageHeader title={m.refill.title} subtitle={t.subtitle} actions={<RefillTabs active="fillers" m={m} />} />

      {/* The people, one row each: who they are, whether they are out now, and how long a machine takes them.
          The times per machine and per drive stand on the Route tab. */}
      {people.length === 0 ? (
        <EmptyState icon={<Timer className="size-5" />} title={t.emptyTitle} hint={t.emptyHint} />
      ) : (
        <RowList>
          {people.map((person) => {
            const busy = busyOf(person.name);
            const staff = staffOf.get(key(person.name));
            return (
              <li key={key(person.name)}>
                <ListRow
                  leading={<PersonPhoto userId={staff?.userId ?? null} name={person.name ?? "?"} url={mediaUrl(staff?.photoPath)} className="size-12" />}
                  title={
                    <>
                      {person.name ?? t.unknown}
                      {person.name && overview.me && key(person.name) === key(overview.me) && (
                        <span className="ml-2 text-[13px] font-medium text-muted-foreground">{m.team.you}</span>
                      )}
                    </>
                  }
                  subtitle={
                    busy ? (
                      <span className="font-semibold text-positive">{busy.at ? fmt(t.busyAt, { machine: busy.at }) : t.busyNow}</span>
                    ) : person.rounds === 0 ? (
                      t.noRounds
                    ) : (
                      [plural(person.rounds, t.roundsOne, t.rounds), fmt(t.lastRound, { date: f.dayMonth(person.lastAt) })].join(" · ")
                    )
                  }
                  value={person.atMachine.count ? took(person.atMachine.minutes) : undefined}
                  valueSub={person.atMachine.count ? <span className="text-muted-foreground">{t.perMachineShort}</span> : undefined}
                />
              </li>
            );
          })}
        </RowList>
      )}
    </>
  );
}
