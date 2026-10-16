import { ImageResponse } from "next/og";

const SIZES = ["180", "192", "512"];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

// PNG app icons for the web app manifest and iOS home screen: the [m] mark of
// MATO Insights on its off-white, inside the central safe zone so "maskable" crops on
// Android never cut it. The letter is drawn as a shape: the image renderer has no Inter, and a stand-in
// font made the letter thin and too large. The m is Inter SemiBold, outlined.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<rect width="120" height="120" fill="#F4F1EA"/>
<g transform="translate(60 62) scale(0.8) translate(-60 -45)" fill="none" stroke="#A6752C" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M34,20 L20,20 L20,70 L34,70"/><path d="M86,20 L100,20 L100,70 L86,70"/>
</g>
<g transform="translate(60 62) scale(0.8) translate(-60 -45)">
<path d="M43.16 61H48.74V46.28C48.74 43.08 50.76 41.36 53.21 41.36C55.57 41.36 57.27 42.95 57.27 45.4V61H62.73V45.92C62.73 43.23 64.38 41.36 67.09 41.36C69.39 41.36 71.24 42.7 71.24 45.66V61H76.84V44.8C76.84 39.47 73.54 36.59 69.22 36.59C65.84 36.59 62.84 38.36 61.55 41.81C60.52 38.4 58.47 36.59 55.38 36.59C52.52 36.59 49.82 38.14 48.57 41.56L48.4 36.98H43.16Z" fill="#2A2520"/>
</g>
</svg>`;
const ICON = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  if (!SIZES.includes(raw)) return new Response("Not found", { status: 404 });

  const size = Number(raw);
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ICON} width={size} height={size} alt="" />,
    { width: size, height: size },
  );
}
