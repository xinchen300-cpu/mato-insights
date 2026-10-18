import type { NextConfig } from "next";

// Headers every response carries. Vendly is never shown inside another site
// (no clickjacking), the browser does not guess content types, other sites only
// learn the origin a visitor came from, and browser features the app never
// uses are switched off. Clipboard and the share sheet stay on: copying a link
// and sharing a report use them.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
