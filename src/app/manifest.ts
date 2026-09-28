import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vendly — Vending Data Solutions",
    short_name: "Vendly",
    description: "Statistics Won't Lie",
    start_url: "/",
    display: "standalone",
    background_color: "#ede6d8",
    theme_color: "#ede6d8",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
