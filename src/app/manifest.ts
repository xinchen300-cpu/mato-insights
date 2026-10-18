import type { MetadataRoute } from "next";
import { nl } from "@/i18n/messages/nl";

// Fetched by the phone without a session or a language cookie, so in Dutch:
// the language of the people who install it now. A filler opening it at "/"
// lands on Bijvullen, as always.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Vendly · Vending Data Solutions",
    short_name: "Vendly",
    description: "Statistics Won't Lie",
    lang: "nl-BE",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The page's own grey, so opening the app does not flash another colour.
    background_color: "#f6f6f7",
    theme_color: "#f6f6f7",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Holding the icon down on Android goes straight to the refill work.
    shortcuts: [
      { name: nl.refill.title, url: "/refill", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
      { name: nl.nav.fillList, url: "/refill/list", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
