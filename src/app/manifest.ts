import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MATO Insights",
    short_name: "MATO Insights",
    description: "Statistics Won't Lie",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f1",
    theme_color: "#faf7f1",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
