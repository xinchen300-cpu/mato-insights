import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { connectPayter } from "./actions";
import { SyncNowButton } from "./sync-now-button";

export default async function SettingsPage() {
  const orgId = await getCurrentOrgId();
  const admin = createAdminClient();

  const { data: credentials } = orgId
    ? await admin
        .from("payter_credentials")
        .select("last_synced_at, last_watermark")
        .eq("org_id", orgId)
        .maybeSingle()
    : { data: null };

  const { data: syncLogs } = orgId
    ? await admin
        .from("sync_logs")
        .select("started_at, finished_at, status, transactions_synced, error")
        .eq("org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const isConnected = Boolean(credentials);

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex items-center gap-4 border-b bg-background px-6 py-4">
        <Link href="/" className="text-sm font-semibold">
          Vendly
        </Link>
        <span className="text-sm text-muted-foreground">Settings</span>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Payter connection</CardTitle>
              {isConnected ? (
                <Badge variant="secondary">Connected</Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
            <CardDescription>
              No box needed — just your MyPayter login. We pull transactions straight
              from Payter&apos;s API.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!orgId ? (
              <p className="text-sm text-muted-foreground">
                No organization exists yet — sign up once to create one.
              </p>
            ) : isConnected ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Last synced:{" "}
                  {credentials?.last_synced_at
                    ? new Date(credentials.last_synced_at).toLocaleString()
                    : "never yet"}
                </p>
                <SyncNowButton />
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer">Reconnect / change credentials</summary>
                  <form action={connectPayter} className="mt-3 flex flex-col gap-3">
                    <ConnectFields />
                    <Button type="submit" size="sm" className="w-fit">
                      Save
                    </Button>
                  </form>
                </details>
              </div>
            ) : (
              <form action={connectPayter} className="flex flex-col gap-3">
                <ConnectFields />
                <Button type="submit" className="w-fit">
                  Connect
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent syncs</CardTitle>
          </CardHeader>
          <CardContent>
            {!syncLogs || syncLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No syncs yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {syncLogs.map((log, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{new Date(log.started_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">
                      {log.status === "success"
                        ? `${log.transactions_synced} transactions`
                        : log.status === "error"
                          ? `error: ${log.error}`
                          : "running..."}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ConnectFields() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">MyPayter username</Label>
        <Input id="username" name="username" required autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">MyPayter password</Label>
        <Input id="password" name="password" type="password" required autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="domain">Domain</Label>
        <Input id="domain" name="domain" required autoComplete="off" />
      </div>
    </>
  );
}
