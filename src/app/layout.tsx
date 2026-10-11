import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// The face of the MATO logo, used for the wordmark only.
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["400", "700"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: { default: "Vendly", template: "%s · Vendly" },
  description: "Vending Data Solutions. Statistics Won't Lie.",
  applicationName: "Vendly",
  appleWebApp: { capable: true, title: "Vendly", statusBarStyle: "default" },
  icons: { apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f7",
};

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
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
