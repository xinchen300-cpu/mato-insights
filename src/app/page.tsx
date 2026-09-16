import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { getDashboardData } from "@/lib/dashboard/queries";
import { buildInsights } from "@/lib/dashboard/insights";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TriangleAlertIcon, TrendingUpIcon, InfoIcon } from "lucide-react";

function formatEuro(value: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value);
}

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

  const data = orgId ? await getDashboardData(orgId, 30) : null;
  const insights = data ? buildInsights(data.daily, data.byMachine, data.lastSales) : [];

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

      <main className="mx-auto max-w-6xl px-6 py-8 flex flex-col gap-6">
        {!data ? (
          <Card>
            <CardHeader>
              <CardTitle>No organization yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Sign up to create one.
            </CardContent>
          </Card>
        ) : data.currentTotals.tx_count === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No sales yet</CardTitle>
              <CardDescription>
                Connect Payter in Settings — no box needed, just your MyPayter login.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/settings" className={buttonVariants({ size: "sm" })}>
                Go to Settings
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Revenue (30 days)"
                value={Number(data.currentTotals.revenue)}
                previousValue={Number(data.previousTotals.revenue)}
                format="euro"
              />
              <StatCard
                label="Transactions (30 days)"
                value={Number(data.currentTotals.tx_count)}
                previousValue={Number(data.previousTotals.tx_count)}
              />
              <StatCard label="Active machines" value={data.byMachine.length} />
            </div>

            {insights.length > 0 && (
              <div className="flex flex-col gap-2">
                {insights.map((insight, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg border bg-background px-4 py-3 text-sm"
                  >
                    {insight.tone === "warning" ? (
                      <TriangleAlertIcon className="size-4 shrink-0 text-negative" />
                    ) : insight.tone === "positive" ? (
                      <TrendingUpIcon className="size-4 shrink-0 text-positive" />
                    ) : (
                      <InfoIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span>{insight.text}</span>
                  </div>
                ))}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue, last 30 days</CardTitle>
              </CardHeader>
              <CardContent>
                <RevenueChart data={data.daily} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenue by machine</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byMachine.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Machine</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byMachine.slice(0, 10).map((m) => (
                          <TableRow key={m.machine_id}>
                            <TableCell className="font-medium">
                              {m.machine_name ?? "Unknown"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {m.location_name ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatEuro(Number(m.revenue))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Best sellers</CardTitle>
                  <CardDescription>By Payter selection code</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.byItem.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byItem.slice(0, 10).map((item) => (
                          <TableRow key={item.item_ref}>
                            <TableCell className="font-medium">
                              {data.itemLabels.get(item.item_ref) ?? (
                                <Badge variant="outline">#{item.item_ref}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{item.tx_count}</TableCell>
                            <TableCell className="text-right">
                              {formatEuro(Number(item.revenue))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
