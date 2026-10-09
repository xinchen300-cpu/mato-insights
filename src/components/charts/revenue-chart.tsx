"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n/client";

export type ChartPoint = { key: string; label: string; revenue: number };

export function RevenueChart({ data, height = 240 }: { data: ChartPoint[]; height?: number }) {
  const { f } = useI18n();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v) => f.euroRound(Number(v))}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          formatter={(value) => [f.euro(Number(value)), ""]}
          separator=""
          cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.12, strokeWidth: 1 }}
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
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="url(#revenueFill)"
          activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
