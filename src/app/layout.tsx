import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getI18n, getLocale } from "@/i18n/server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// The face of the MATO logo, used for the wordmark only.
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["400", "700"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700"],
});

// In the reader's language: this is what a shared link (an invitation in WhatsApp) shows.
export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return {
    title: { default: "Vendly", template: "%s · Vendly" },
    description: `${m.brand.subtitle}. ${m.brand.tagline}.`,
    applicationName: "Vendly",
    appleWebApp: { capable: true, title: "Vendly", statusBarStyle: "default" },
    icons: { apple: "/pwa-icon/180" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f6f7",
  // Edge to edge on a phone: the bars at the bottom pad themselves above the home bar (safe-area-inset).
  viewportFit: "cover",
};

// Two things for Vendly as an app on the phone. Android offers to install it
// only once, early, before the page has started: keep that offer for the
// install card on Bijvullen. And the service worker, which keeps Vendly's own
// files on the phone; only in a real build, where those files never change.
const APP_SCRIPT = [
  "addEventListener('beforeinstallprompt',function(e){window.__vendlyInstall=e;dispatchEvent(new Event('vendly:installable'))});",
  "addEventListener('appinstalled',function(){window.__vendlyInstall=null;dispatchEvent(new Event('vendly:installable'))});",
  process.env.NODE_ENV === "production"
    ? "if('serviceWorker'in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});"
    : "",
].join("");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html
      suppressHydrationWarning
      lang={locale}
      className={`${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Restores the "hide figures" switch before first paint, so they never flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('vendly:hide-numbers')==='1')document.documentElement.setAttribute('data-hide-numbers','')}catch(e){}",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: APP_SCRIPT }} />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
