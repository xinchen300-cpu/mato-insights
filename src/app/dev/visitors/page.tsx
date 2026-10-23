import { notFound } from "next/navigation";
import { CameraChecks, CameraVisits } from "@/components/visitors/camera-visits";
import { getI18n } from "@/i18n/server";
import type { VisitorCamera } from "@/lib/data";
import type { CameraVisitors, VisitorsReport } from "@/lib/visitors";

/**
 * Bezoekers on made-up figures: /dev/visitors. The same blocks as the page, so
 * what breaks there breaks here too. Nothing is read from or written to a
 * database. Only on a developer's own machine.
 */
export default async function VisitorsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { m, f } = await getI18n();
  const { report, cameras } = sample();
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
      {report.cameras.map((camera) => (
        <CameraVisits
          key={camera.camera_id}
          camera={camera}
          info={cameras.find((c) => c.cameraId === camera.camera_id)!}
          report={report}
          period="month"
          orgName="Mato Vending"
          i18n={{ m, f }}
        />
      ))}
      <CameraChecks cameras={[...cameras, { ...cameras[1], cameraId: "off", name: "Ingang", model: "G5 Dome", detects: ["vehicle"] }]} report={report} i18n={{ m, f }} />
    </main>
  );
}

/** Four weeks at two cameras: busy in the evening, quiet at night, one camera that sees most sales and one that misses many. */
function sample(): { report: VisitorsReport; cameras: VisitorCamera[] } {
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 86_400_000);
  start.setUTCHours(22, 0, 0, 0);
  const shape = [2, 1, 0, 0, 0, 1, 2, 3, 4, 5, 5, 7, 11, 6, 6, 7, 11, 16, 20, 15, 14, 9, 5, 3];
  const camera = (id: string, scale: number, sales: CameraVisitors["sales"]): CameraVisitors => {
    const byHour = shape.map((n, hour) => ({ hour, visits: Math.round(n * scale * 28) }));
    const visits = byHour.reduce((sum, h) => sum + h.visits, 0);
    const byDay = Array.from({ length: 28 }, (_, i) => {
      const day = new Date(start.getTime() + (i + 1) * 86_400_000).toISOString().slice(0, 10);
      const weekday = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
      return { day, visits: Math.round((visits / 28) * (weekday >= 5 ? 1.25 : 0.9) * (0.85 + ((i * 7) % 5) / 15)) };
    });
    const byWeekday = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      visits: byDay.filter((d) => ((new Date(`${d.day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 === weekday).reduce((sum, d) => sum + d.visits, 0),
    }));
    return {
      camera_id: id,
      visits,
      prev_visits: Math.round(visits * 0.78),
      refilling: 11,
      first_event: new Date(end.getTime() - 60 * 86_400_000).toISOString(),
      last_event: new Date(end.getTime() - 7 * 60_000).toISOString(),
      events_24h: Math.round(visits / 28),
      lines: Math.round(visits * 1.6),
      prev_lines: Math.round(visits * 1.4),
      loiters: 9,
      by_day: byDay,
      by_hour: byHour,
      by_weekday: byWeekday,
      duration: { n: Math.round(visits * 0.9), p25: 18, p50: 41, p75: 83 },
      sales,
    };
  };
  const brood = camera("brood", 1, { total: 410, seen: 392, bought: 318, attributed: 410 });
  const dikse = camera("diksmuide", 0.55, { total: 212, seen: 160, bought: 120, attributed: 150 });
  const cameras: VisitorCamera[] = [
    { consoleId: "c1", cameraId: "brood", name: "Automaat brood & drank", model: "G5 Bullet", detects: ["person", "vehicle"], online: true, machines: [{ id: "m1", name: "Brood" }] },
    { consoleId: "c1", cameraId: "diksmuide", name: "Diksmuide", model: "G5 Dome", detects: ["person"], online: true, machines: [{ id: "m2", name: "Diksmuide Chens Garden" }] },
  ];
  return {
    report: {
      cur_start: start.toISOString(),
      cur_end: end.toISOString(),
      prev_start: new Date(start.getTime() - (end.getTime() - start.getTime())).toISOString(),
      timezone: "Europe/Brussels",
      demo: false,
      cameras: [brood, dikse],
    },
    cameras,
  };
}
