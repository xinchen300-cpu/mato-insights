"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";

/** Money for the operator, pieces for whoever fills: a filler's hours come without revenue. People: visitors a day (22-10-2026). */
export type HourPoint = { hour: number; revenue?: number; units?: number; people?: number };

/**
 * Hours run left to right, the way a day reads. In money for the operator, in
 * pieces for whoever fills: their screens carry no amounts.
 */
export function HourChart({
  data,
  height = 200,
  measure = "revenue",
}: {
  data: HourPoint[];
  height?: number;
  measure?: "revenue" | "units" | "people";
}) {
  const { m, f } = useI18n();
  const full = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: String(hour).padStart(2, "0"),
    value: data.find((d) => d.hour === hour)?.[measure] ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={full} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis
          dataKey="label"
          interval={1}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: "var(--surface)", radius: 6 }}
          formatter={(value) => [
            measure === "units"
              ? plural(Number(value), m.common.unitsOne, m.common.unitsOther)
              : measure === "people"
                ? fmt(m.visitors.perDayValue, { n: f.number(Math.round(Number(value) * 10) / 10) })
                : f.euro(Number(value)),
            "",
          ]}
          labelFormatter={(label) => `${String(label)}:00`}
          separator=""
          contentStyle={{
            background: "var(--card)",
            border: "none",
            borderRadius: 12,
            boxShadow: "var(--shadow-pop)",
            padding: "8px 12px",
            fontSize: 13,
            color: "var(--foreground)",
          }}
          labelStyle={{ color: "var(--muted-foreground)", marginBottom: 2 }}
          itemStyle={{ color: "var(--foreground)", fontWeight: 600 }}
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[5, 5, 2, 2]} maxBarSize={18} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
