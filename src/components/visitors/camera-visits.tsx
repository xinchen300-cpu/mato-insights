import { CircleCheck, TriangleAlert } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { HourChart, VisitsChart } from "@/components/charts/lazy";
import { KpiHero, MiniStat } from "@/components/kpi";
import { Panel, Section } from "@/components/page-header";
import { fmt } from "@/i18n/format";
import type { getI18n } from "@/i18n/server";
import type { VisitorCamera } from "@/lib/data";
import { withoutOrgName } from "@/lib/overview";
import {
  buying,
  cameraCheck,
  hourProfile,
  middleStay,
  visitDays,
  visitsVerdict,
  weekdayProfile,
  type CameraVisitors,
  type VisitorPeriod,
  type VisitorsReport,
} from "@/lib/visitors";

// The Bezoekers blocks (22-10-2026), shared by the page and its made-up preview at /dev/visitors.

type I18n = Pick<Awaited<ReturnType<typeof getI18n>>, "m" | "f">;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const clock = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

/** "45 s" or "1 min 20 s". */
function stayText(seconds: number, m: I18n["m"]) {
  const whole = Math.round(seconds);
  return whole < 60 ? fmt(m.visitors.seconds, { s: whole }) : fmt(m.visitors.minutes, { m: Math.floor(whole / 60), s: whole % 60 });
}

export function CameraVisits({
  camera,
  info,
  report,
  period,
  orgName,
  i18n: { m, f },
}: {
  camera: CameraVisitors;
  info: VisitorCamera;
  report: VisitorsReport;
  period: VisitorPeriod;
  orgName: string | null;
  i18n: I18n;
}) {
  const days = visitDays(camera, report);
  const hours = hourProfile(camera, report);
  const week = weekdayProfile(camera, report);
  const buy = buying(camera);
  const stay = middleStay(camera);
  const hourPoints = hours.perDay.map((h) => ({ hour: h.hour, people: h.visits }));
  const hourLine =
    [
      hours.busiest !== null ? fmt(m.visitors.busiestHour, { from: clock(hours.busiest), to: clock(hours.busiest + 1) }) : null,
      hours.quietest !== null ? fmt(m.visitors.quietestHour, { from: clock(hours.quietest), to: clock(hours.quietest + 1) }) : null,
    ]
      .filter(Boolean)
      .join(" ") || m.visitors.noStandout;
  const boughtDetail =
    buy.state === "ok"
      ? fmt(m.visitors.boughtRange, { low: f.percent(buy.low), high: f.percent(buy.high) })
      : buy.state === "missed"
        ? fmt(m.visitors.missed, { share: f.percent(buy.seen) })
        : buy.state === "tooFew"
          ? m.visitors.tooFew
          : m.visitors.noSales;
  const facts = [
    camera.lines > 0 ? `${m.visitors.lines}: ${f.number(camera.lines)}` : null,
    camera.loiters > 0 ? `${m.visitors.loiters}: ${f.number(camera.loiters)}` : null,
    camera.refilling > 0 ? `${m.visitors.refilling}: ${f.number(camera.refilling)}` : null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <Section
      title={[info.name, info.model].filter(Boolean).join(" · ")}
      hint={fmt(m.visitors.looksAt, { machines: info.machines.map((mc) => withoutOrgName(mc.name, orgName)).join(", ") })}
    >
      <section className="surface-card px-5 pb-4 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
        <KpiHero
          label={m.visitors.visits}
          value={f.number(camera.visits)}
          compare={{
            current: camera.visits,
            previous: camera.prev_visits,
            label: m.visitors.compare[period],
            verdict: visitsVerdict(camera, report),
            notes: {
              tooFew: m.stats.tooFewToCompare,
              noise: m.stats.withinNoise,
              same: m.stats.aboutSame,
              new: camera.first_event ? fmt(m.stats.newSince, { date: f.dayMonth(camera.first_event) }) : undefined,
            },
          }}
          f={f}
        />
        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <MiniStat label={m.visitors.perDay} value={f.number(oneDecimal(camera.visits / Math.max(days.length, 1)))} f={f} />
          <MiniStat
            label={m.visitors.stayed}
            value={stay ? stayText(stay.p50, m) : "–"}
            detail={stay ? fmt(m.visitors.stayedHint, { low: stayText(stay.p25, m), high: stayText(stay.p75, m) }) : m.visitors.tooFew}
            f={f}
          />
          <MiniStat label={m.visitors.bought} value={buy.state === "ok" ? f.percent(buy.share) : "–"} detail={boughtDetail} f={f} />
          <MiniStat
            label={m.visitors.perBuyer}
            value={buy.state === "ok" ? f.number(oneDecimal(buy.perBuyer)) : "–"}
            detail={buy.state === "ok" ? `${m.visitors.lookedOnly}: ${f.number(buy.lookedOnly)}` : undefined}
            f={f}
          />
        </div>
        <div className="-mx-2 mt-7 sm:-mx-3">
          {period === "today" ? (
            <HourChart data={hourPoints} measure="people" />
          ) : (
            <VisitsChart data={days.map((d) => ({ key: d.day, label: f.dayMonth(`${d.day}T12:00:00Z`), visits: d.visits }))} />
          )}
        </div>
        {facts.length > 0 && <p className="mt-4 text-[13.5px] text-muted-foreground">{facts.join(" · ")}</p>}
      </section>

      {period !== "today" && (
        <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
          <Panel title={m.visitors.perHour} hint={`${m.visitors.perHourHint} ${hourLine}`}>
            <HourChart data={hourPoints} measure="people" />
          </Panel>
          <Panel title={m.visitors.perWeekday} hint={week.enough ? m.visitors.perWeekdayHint : m.visitors.perWeekdayTooShort}>
            <BarList
              items={week.days.map((w) => ({
                key: String(w.weekday),
                label: m.weekdaysShort[w.weekday - 1],
                value: w.avgRevenue,
                display: f.number(oneDecimal(w.avgRevenue)),
              }))}
              highlightKey={week.busiest !== null ? String(week.busiest) : null}
            />
          </Panel>
        </div>
      )}
    </Section>
  );
}

/** Whether each camera is set to see people, and saw any lately: Protect's silent failure, said out loud. */
export function CameraChecks({ cameras, report, i18n: { m, f } }: { cameras: VisitorCamera[]; report: VisitorsReport | null; i18n: I18n }) {
  return (
    <Panel title={m.visitors.check} hint={m.visitors.checkHint}>
      <ul className="flex flex-col divide-y divide-border">
        {cameras.map((info) => {
          const camera = report?.cameras.find((c) => c.camera_id === info.cameraId);
          const check = cameraCheck(info.detects, camera);
          const text =
            check === "detectionOff"
              ? m.visitors.checkOff
              : check === "nothingToday"
                ? m.visitors.checkNothing
                : fmt(m.visitors.checkFine, { n: f.number(camera?.events_24h ?? 0) });
          return (
            <li key={info.cameraId} className="flex items-start gap-3 py-3">
              {check === "fine" ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{[info.name, info.model].filter(Boolean).join(" · ")}</p>
                <p className="text-[13.5px] text-muted-foreground">
                  {text}
                  {camera?.last_event ? ` · ${fmt(m.visitors.lastSeen, { time: f.dateTime(camera.last_event) })}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
