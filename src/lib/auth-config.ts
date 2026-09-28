// Login is built but stays optional while Xin is still testing (explicit
// request). Set VENDLY_REQUIRE_LOGIN=true once the operator account exists.
export const REQUIRE_LOGIN = process.env.VENDLY_REQUIRE_LOGIN === "true";

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth/", "/r/", "/b/", "/pwa-icon/"];
const PUBLIC_FILES = ["/manifest.webmanifest", "/icon.svg"];

export function isPublicPath(pathname: string) {
  return PUBLIC_FILES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
