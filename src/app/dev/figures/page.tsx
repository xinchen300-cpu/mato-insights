import { notFound } from "next/navigation";
import { FiguresPreview } from "./figures-preview";

/**
 * A filler's figures page and home cards on made-up rounds, for designing them:
 * /dev/figures (a filler with history) or /dev/figures?s=new (no rounds yet).
 * Nothing is read from a database. Production says not found.
 */
export default async function FiguresPreviewPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s } = await searchParams;
  return <FiguresPreview fresh={s === "new"} />;
}
