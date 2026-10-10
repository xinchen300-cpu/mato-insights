"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n/client";

export type MonthPoint = { key: string; label: string; revenue: number; running: boolean };

/** Revenue per month for one year. The month still running is drawn lighter: it is not done yet. */
export function MonthChart({ data, height = 200 }: { data: MonthPoint[]; height?: number }) {
  const { f } = useI18n();

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
          interval={0}
        />
        <YAxis
          tickFormatter={(v) => f.euroRound(Number(v))}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          formatter={(value) => [f.euro(Number(value)), ""]}
          separator=""
          cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
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
        <Bar dataKey="revenue" radius={[6, 6, 2, 2]} maxBarSize={36} animationDuration={500}>
          {data.map((point) => (
            <Cell key={point.key} fill="var(--chart-1)" fillOpacity={point.running ? 0.35 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
