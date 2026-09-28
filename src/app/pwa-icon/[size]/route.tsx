import { ImageResponse } from "next/og";

const SIZES = ["180", "192", "512"];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

// PNG app icons for the web app manifest and iOS home screen. The mark sits
// inside the central safe zone so "maskable" crops on Android never cut it.
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  if (!SIZES.includes(raw)) return new Response("Not found", { status: 404 });

  const size = Number(raw);
  const u = (size * 0.56) / 28; // one unit of the 32×32 mark, scaled to ~56% of the icon

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "#ede6d8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", width: 24 * u, height: 28 * u, background: "#1c1812", display: "flex" }}>
          <div style={{ position: "absolute", left: 5 * u, top: 15 * u, width: 4 * u, height: 8 * u, background: "#a6752c" }} />
          <div style={{ position: "absolute", left: 10.5 * u, top: 10 * u, width: 4 * u, height: 13 * u, background: "#a6752c" }} />
          <div style={{ position: "absolute", left: 16 * u, top: 5 * u, width: 4 * u, height: 18 * u, background: "#ede6d8" }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
