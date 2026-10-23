import { getI18n } from "@/i18n/server";

// The page the service worker shows when a page is opened without any
// connection. It is kept on the phone, so it is one plain file: no scripts or
// styles from the app that might not be there, and nothing of anyone's data.
// It is shown at the address that was asked for, so trying again (or the
// signal coming back) simply opens that page once more.

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET() {
  const { locale, m } = await getI18n();
  const t = m.offline;
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f0f11" media="(prefers-color-scheme: dark)">
<title>${escape(t.title)} · MATO Info</title>
<style>
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; min-height: 100svh; display: flex; align-items: center; justify-content: center; background: #f6f6f7; color: #0e0e10;
         font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: -0.011em; }
  main { max-width: 22rem; padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom)); text-align: center; }
  svg { width: 4.5rem; height: auto; }
  h1 { margin: 1.5rem 0 0.5rem; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
  p { margin: 0 0 0.75rem; font-size: 16px; line-height: 1.45; color: #6b6b74; }
  a { display: flex; align-items: center; justify-content: center; height: 3.5rem; margin-top: 1.5rem; border-radius: 1rem;
      background: #0e0e10; color: #fff; font-size: 17px; font-weight: 600; text-decoration: none; touch-action: manipulation; }
  a:active { transform: scale(0.99); }
  .ink { stroke: #2A2520; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f0f11; color: #ededf0; }
    p { color: #a1a1aa; }
    a { background: #ededf0; color: #0e0e10; }
    .ink { stroke: #ece8e3; }
  }
</style>
</head>
<body>
<main>
  <svg viewBox="14 15 92 60" aria-hidden="true">
    <path d="M34,20 L20,20 L20,70 L34,70" fill="none" stroke="#A6752C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M86,20 L100,20 L100,70 L86,70" fill="none" stroke="#A6752C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M45 37.3 V61 M45 46 C45 41.5 48 39.3 52.5 39.3 C57 39.3 60 41.5 60 46 V61 M60 46 C60 41.5 63 39.3 67.5 39.3 C72 39.3 75 41.5 75 46 V61" fill="none" class="ink" stroke-width="5.6"/>
  </svg>
  <h1>${escape(t.title)}</h1>
  <p>${escape(t.body)}</p>
  <p>${escape(t.kept)}</p>
  <a href="">${escape(t.retry)}</a>
</main>
<script>addEventListener("online", function () { location.reload(); });</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
