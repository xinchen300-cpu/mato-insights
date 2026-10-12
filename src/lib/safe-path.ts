/**
 * Where to go after signing in, kept on this site: "//evil.com", "/\evil.com"
 * or "@evil.com" would otherwise hand a fresh session to somebody else's page.
 * Anything that does not resolve to a path here becomes the home page.
 */
export function samePath(asked: string | null | undefined, origin: string): string {
  if (!asked || !asked.startsWith("/")) return "/";
  try {
    const target = new URL(asked, origin);
    return target.origin === origin ? `${target.pathname}${target.search}` : "/";
  } catch {
    return "/";
  }
}
