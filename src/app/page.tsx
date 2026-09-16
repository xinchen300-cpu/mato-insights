import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orgId = await getCurrentOrgId();
  let orgName: string | null = null;
  if (orgId) {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    orgName = org?.name ?? null;
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div>
          <p className="text-sm font-semibold">Vendly</p>
          <p className="text-xs text-muted-foreground">{orgName ?? "No organization yet"}</p>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-sm text-muted-foreground">{user.email}</span>}
          <Link href="/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Settings
          </Link>
          {user ? (
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Foundation is live</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              The database is wired up. Connect Payter in Settings, then the real
              dashboard comes next.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
