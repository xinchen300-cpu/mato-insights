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
  const u = (size * 0.6) / 30; // one unit of the 32x32 mark, at ~60% of the icon

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "#faf7f1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* the column that breaks out sets the height, so the mark stays centred */}
        <div style={{ position: "relative", width: 24 * u, height: 28 * u, display: "flex" }}>
          <div style={{ position: "absolute", left: 0, top: 4 * u, width: 24 * u, height: 24 * u, background: "#1c1812" }} />
          <div style={{ position: "absolute", left: 4.5 * u, top: 16 * u, width: 4 * u, height: 8 * u, background: "#a97a1f" }} />
          <div style={{ position: "absolute", left: 10 * u, top: 11 * u, width: 4 * u, height: 13 * u, background: "#b98a2e" }} />
          <div style={{ position: "absolute", left: 15.5 * u, top: 0, width: 4 * u, height: 24 * u, background: "#c99a3d" }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
