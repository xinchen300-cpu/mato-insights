"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n/client";

export type VisitPoint = { key: string; label: string; visits: number };

/**
 * Visitors day by day (22-10-2026): a bar per day, an empty day as an empty
 * place, so a camera that saw nobody is never skipped over.
 */
export function VisitsChart({ data, height = 200 }: { data: VisitPoint[]; height?: number }) {
  const { m, f } = useI18n();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={(v) => f.number(Number(v))}
          tickLine={false}
          axisLine={false}
          width={40}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--surface)", radius: 6 }}
          formatter={(value) => [f.number(Number(value)), m.visitors.visits]}
          separator=" "
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
        <Bar dataKey="visits" fill="var(--chart-1)" radius={[5, 5, 2, 2]} maxBarSize={22} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
