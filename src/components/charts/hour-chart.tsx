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
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          interval={1}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: "var(--surface)" }}
          formatter={(value) => [f.euro(Number(value)), ""]}
          labelFormatter={(label) => `${String(label)}:00`}
          separator=""
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            fontSize: 13,
            color: "var(--foreground)",
          }}
        />
        <Bar dataKey="revenue" fill="var(--chart-1)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
