import { ChevronDown, GraduationCap } from "lucide-react";
import { Avatar } from "@/components/list-row";
import { fmt, type Formatters } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { detectableChange, DISPERSION, MIN_SALES, MIN_WEEKS } from "@/lib/stats";

const SAMPLE_SIZES = [30, 100, 300, 1000];

// A short course in reading sales figures. The table comes from the same rule
// MATO Insights uses to judge a change, so what it teaches is what the app does.
// Closed it is one quiet row; open it reads like a page of notes.
export function StatsGuide({ m, f }: { m: Messages; f: Formatters }) {
  const lessons = [
    { title: m.guide.noiseTitle, body: fmt(m.guide.noiseBody, { factor: DISPERSION }) },
    { title: m.guide.waitTitle, body: fmt(m.guide.waitBody, { weeks: MIN_WEEKS }) },
    { title: m.guide.likeTitle, body: m.guide.likeBody },
    { title: m.guide.soldOutTitle, body: m.guide.soldOutBody },
    { title: m.guide.unitsTitle, body: m.guide.unitsBody },
  ];

  return (
    <details className="group surface-card overflow-hidden">
      <summary className="hover-surface flex min-h-16 cursor-pointer list-none items-center gap-3.5 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-5 [&::-webkit-details-marker]:hidden">
        <Avatar tone="gold">
          <GraduationCap />
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-[-0.01em]">{m.guide.title}</span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{m.guide.intro}</span>
        </span>
        <span className="text-[13px] font-medium text-muted-foreground group-open:hidden">{m.guide.open}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="grid gap-8 px-5 pb-6 pt-3 sm:px-6 sm:pb-7 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{m.guide.sampleTitle}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {fmt(m.guide.sampleBody, { min: MIN_SALES })}
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[13px] text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">{m.guide.tableSales}</th>
                <th className="pb-2 text-right font-medium">{m.guide.tableChange}</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_SIZES.map((n) => (
                <tr key={n} className="border-b last:border-0">
                  <td className="tabular py-2.5">{f.number(n)}</td>
                  <td className="tabular py-2.5 text-right font-semibold">±{f.percent(detectableChange(n))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[13px] text-muted-foreground">{m.guide.tableNote}</p>
        </div>

        <ul className="flex flex-col gap-5">
          {lessons.map((lesson) => (
            <li key={lesson.title}>
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{lesson.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lesson.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
