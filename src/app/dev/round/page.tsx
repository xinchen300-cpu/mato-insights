import { notFound } from "next/navigation";
import { SCENARIOS, type Scenario } from "../preview-data";
import { RoundPreview } from "./round-preview";

/**
 * The filler's round on made-up data, for seeing every step while designing
 * it: /dev/round?s=pick, run, back, done or first. Nothing is read from or written
 * to a database. Only on a developer's own machine: production says not found.
 */
export default async function RoundPreviewPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s } = await searchParams;
  const scenario = SCENARIOS.includes(s as Scenario) ? (s as Scenario) : "run";
  return <RoundPreview key={scenario} scenario={scenario} />;
}
