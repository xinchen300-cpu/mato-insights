import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getI18n, getLocale } from "@/i18n/server";
import { getOrgBrand } from "@/lib/org";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// The face of the MATO logo, used for the wordmark only.
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["400", "700"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700"],
});

/** The test site (VENDLY_ENV=test) says so on every page and in every tab, so it is never taken for the live one. */
const TEST = process.env.VENDLY_ENV === "test";

// In the reader's language: this is what a shared link (an invitation in WhatsApp) shows.
export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  // MATO Info, or the organisation's own name for it (the demo account: "MATO").
  const name = TEST ? `${m.brand.name} test` : m.brand.name;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `${m.brand.subtitle}. ${m.brand.tagline}.`,
    applicationName: m.brand.name,
    appleWebApp: { capable: true, title: m.brand.name, statusBarStyle: "default" },
    icons: { apple: "/pwa-icon/180" },
  };
}

export const viewport: Viewport = {
  // The bar around the app on a phone, light or dark like the app; the script below follows a choice made in the app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
  // Edge to edge on a phone: the bars at the bottom pad themselves above the home bar (safe-area-inset).
  viewportFit: "cover",
};

// Two things for Vendly as an app on the phone. Android offers to install it
// only once, early, before the page has started: keep that offer for the
// install card on Bijvullen. And the service worker, which keeps Vendly's own
// files on the phone; only in a real build, where those files never change.
// Light or dark before the first paint, so a dark phone never sees a white flash: the person's own choice
// (ThemeToggle, "mato:theme"), else the phone's setting, which is followed when it changes (at sunset).
const THEME_SCRIPT =
  "try{var r=document.documentElement,q=matchMedia('(prefers-color-scheme: dark)'),s=function(){var t=null;try{t=localStorage.getItem('mato:theme')}catch(e){}" +
  "var d=t==='dark'||(t!=='light'&&q.matches);r.classList.toggle('dark',d);" +
  "document.querySelectorAll('meta[name=\"theme-color\"]').forEach(function(m){m.setAttribute('content',d?'#0f0f11':'#f6f6f7')})};" +
  "s();q.addEventListener('change',s)}catch(e){}";

const APP_SCRIPT = [
  "addEventListener('beforeinstallprompt',function(e){window.__vendlyInstall=e;dispatchEvent(new Event('vendly:installable'))});",
  "addEventListener('appinstalled',function(){window.__vendlyInstall=null;dispatchEvent(new Event('vendly:installable'))});",
  process.env.NODE_ENV === "production"
    ? "if('serviceWorker'in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});"
    : "",
].join("");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, { m }, brand] = await Promise.all([getLocale(), getI18n(), getOrgBrand()]);

  return (
    <html
      suppressHydrationWarning
      lang={locale}
      className={`${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Restores the "hide figures" switch before first paint, so they never flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('vendly:hide-numbers')==='1')document.documentElement.setAttribute('data-hide-numbers','')}catch(e){}",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: APP_SCRIPT }} />
        <I18nProvider locale={locale} brand={brand}>
          {children}
        </I18nProvider>
        {TEST && (
          // A stripe along the top and a label in the middle, both above everything and
          // never in the way of a tap.
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center" aria-hidden="true">
            <div className="h-1 w-full bg-warning" />
            <span className="rounded-b-md bg-warning px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#2a2520]">
              {m.common.testVersion}
            </span>
          </div>
        )}
      </body>
    </html>
  );
}
