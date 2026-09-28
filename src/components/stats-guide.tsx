import { GraduationCap } from "lucide-react";
import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { detectableChange, DISPERSION, MIN_SALES, MIN_WEEKS } from "@/lib/stats";

const SAMPLE_SIZES = [30, 100, 300, 1000];

// A short course in reading sales figures. The table comes from the same rule
// Vendly uses to judge a change, so what it teaches is what the app does.
export function StatsGuide({ m, f }: { m: Messages; f: Formatters }) {
  const lessons = [
    { title: m.guide.noiseTitle, body: fmt(m.guide.noiseBody, { factor: DISPERSION }) },
    { title: m.guide.waitTitle, body: fmt(m.guide.waitBody, { weeks: MIN_WEEKS }) },
    { title: m.guide.likeTitle, body: m.guide.likeBody },
    { title: m.guide.soldOutTitle, body: m.guide.soldOutBody },
    { title: m.guide.unitsTitle, body: m.guide.unitsBody },
  ];

  return (
    <details className="group border bg-card p-5 shadow-[0_8px_22px_rgb(28_24_18/0.06)] sm:p-6">
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <GraduationCap className="size-5 shrink-0 text-accent-foreground" />
        <span className="flex-1">
          <span className="block font-heading text-lg font-semibold">{m.guide.title}</span>
          <span className="block text-sm text-muted-foreground">{m.guide.intro}</span>
        </span>
        <span className="text-sm font-semibold text-accent-foreground group-open:hidden">{m.guide.open}</span>
      </summary>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h3 className="text-base">{m.guide.sampleTitle}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{fmt(m.guide.sampleBody, { min: MIN_SALES })}</p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-semibold">{m.guide.tableSales}</th>
                <th className="py-2 text-right font-semibold">{m.guide.tableChange}</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_SIZES.map((n) => (
                <tr key={n} className="border-b last:border-0">
                  <td className="tabular py-2">{f.number(n)}</td>
                  <td className="tabular py-2 text-right font-semibold">±{f.percent(detectableChange(n))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">{m.guide.tableNote}</p>
        </div>

        <ul className="flex flex-col gap-4">
          {lessons.map((lesson) => (
            <li key={lesson.title}>
              <h3 className="text-base">{lesson.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{lesson.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
