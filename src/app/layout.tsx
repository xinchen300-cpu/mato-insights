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

/** The test site (VENDLY_ENV=test) says so on every page and in every tab, so it is never taken for the live one. */
const TEST = process.env.VENDLY_ENV === "test";

// In the reader's language: this is what a shared link (an invitation in WhatsApp) shows.
export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return {
    title: TEST ? { default: "Vendly test", template: "%s · Vendly test" } : { default: "Vendly", template: "%s · Vendly" },
    description: `${m.brand.subtitle}. ${m.brand.tagline}.`,
    applicationName: "Vendly",
    appleWebApp: { capable: true, title: "Vendly", statusBarStyle: "default" },
    icons: { apple: "/pwa-icon/180" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f6f7",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { m } = await getI18n();

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
        <I18nProvider locale={locale}>{children}</I18nProvider>
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
