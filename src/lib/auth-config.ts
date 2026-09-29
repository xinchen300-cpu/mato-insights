// Login is required in production unless it is switched off on purpose. The
// flag used to default to "off", which meant a redeploy that lost the variable
// would quietly put the whole fleet's sales on the open web. Locally it stays
// off by default, so the app can be worked on without an account.
export const REQUIRE_LOGIN =
  process.env.VENDLY_REQUIRE_LOGIN === "true" ||
  (process.env.NODE_ENV === "production" && process.env.VENDLY_REQUIRE_LOGIN !== "false");

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth/", "/r/", "/b/", "/pwa-icon/"];
// The service worker is fetched by the browser without the session, so a
// redirect to the login page would stop it registering at all.
const PUBLIC_FILES = ["/manifest.webmanifest", "/icon.svg", "/sw.js"];

export function isPublicPath(pathname: string) {
  return PUBLIC_FILES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
