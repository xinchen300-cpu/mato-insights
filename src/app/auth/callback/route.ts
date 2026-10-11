import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only a path on this site: "//evil.com" or "@evil.com" would send a fresh
  // session somewhere else.
  const next = samePath(searchParams.get("next") ?? "/", origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

function samePath(asked: string, origin: string): string {
  try {
    const target = new URL(asked, origin);
    return target.origin === origin && asked.startsWith("/") ? `${target.pathname}${target.search}` : "/";
  } catch {
    return "/";
  }
}
