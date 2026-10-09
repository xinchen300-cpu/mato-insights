"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useI18n } from "@/i18n/client";

export type HourPoint = { hour: number; revenue: number };

// Hours run left to right, the way a day reads.
export function HourChart({ data, height = 200 }: { data: HourPoint[]; height?: number }) {
  const { f } = useI18n();
  const full = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: String(hour).padStart(2, "0"),
    revenue: data.find((d) => d.hour === hour)?.revenue ?? 0,
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
          formatter={(value) => [f.euro(Number(value)), ""]}
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
        <Bar dataKey="revenue" fill="var(--chart-1)" radius={[5, 5, 2, 2]} maxBarSize={18} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
