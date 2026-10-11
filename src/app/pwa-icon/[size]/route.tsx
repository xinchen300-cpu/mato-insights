import { ImageResponse } from "next/og";

const SIZES = ["180", "192", "512"];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

// PNG app icons for the web app manifest and iOS home screen: the [v] mark on
// Vendly's off-white, inside the central safe zone so "maskable" crops on
// Android never cut it. The letter is drawn as a shape: the image renderer has no Inter, and a stand-in
// font made the v thin and too large.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<rect width="120" height="120" fill="#F4F1EA"/>
<g transform="translate(60 62) scale(0.8) translate(-60 -45)" fill="none" stroke="#A6752C" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M34,20 L20,20 L20,70 L34,70"/><path d="M86,20 L100,20 L100,70 L86,70"/>
</g>
<g transform="translate(60 62) scale(0.8) translate(-60 -45)">
<polygon points="48.2,36.5 54,36.5 60,54.5 66,36.5 71.8,36.5 63.1,61 56.9,61" fill="#2A2520"/>
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
