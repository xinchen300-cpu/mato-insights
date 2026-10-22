"use client";

import dynamic from "next/dynamic";

/**
 * The charts come after the page (22-10-2026, Xin: "the mobile version is slow"): recharts is the heaviest script in
 * the app, and on a phone parsing it held up every tap on Statistieken. The figures and lists are there and usable
 * first; the chart fills its own space a moment later, so nothing jumps.
 */
function placeholder(height: number) {
  function ChartPlaceholder() {
    return <div className="skeleton w-full" style={{ height }} aria-hidden="true" />;
  }
  return ChartPlaceholder;
}

export const RevenueChart = dynamic(() => import("./revenue-chart").then((mod) => mod.RevenueChart), {
  ssr: false,
  loading: placeholder(240),
});

export const HourChart = dynamic(() => import("./hour-chart").then((mod) => mod.HourChart), {
  ssr: false,
  loading: placeholder(200),
});

export const MonthChart = dynamic(() => import("./month-chart").then((mod) => mod.MonthChart), {
  ssr: false,
  loading: placeholder(200),
});
