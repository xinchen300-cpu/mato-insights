import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, organizations(name)")
    .single();

  const orgName = (membership?.organizations as unknown as { name: string } | null)?.name;

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div>
          <p className="text-sm font-semibold">Vendly</p>
          <p className="text-xs text-muted-foreground">{orgName ?? "Your organization"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Link href="/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Settings
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Foundation is live</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Auth, your organization, and the database are wired up. The Payter
              connection and the real dashboard come next.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
