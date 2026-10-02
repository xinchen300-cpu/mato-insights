import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";
import { requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPayterTerminals } from "@/lib/sync";
import { TerminalPicker, type TerminalRow } from "./terminal-picker";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.terminals.title };
}

export default async function TerminalsPage() {
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  const admin = createAdminClient();

  const [terminals, { data: machines }, { data: sold }] = await Promise.all([
    listPayterTerminals(orgId),
    admin.from("machines").select("name, payter_serial_number, excluded").eq("org_id", orgId),
    admin.from("machines").select("payter_serial_number, transactions(count)").eq("org_id", orgId),
  ]);

  const known = new Map((machines ?? []).map((mc) => [mc.payter_serial_number, mc]));
  const withSales = new Set(
    (sold ?? [])
      .filter((mc) => {
        const counted = mc.transactions as unknown as { count: number }[] | null;
        return (counted?.[0]?.count ?? 0) > 0;
      })
      .map((mc) => mc.payter_serial_number),
  );

  const rows: TerminalRow[] = terminals.map((t) => {
    const machine = known.get(t.serial);
    return {
      serial: t.serial,
      model: t.model,
      lastSeenLabel: t.last_connected ? f.relative(t.last_connected) : null,
      // A name equal to the serial is the placeholder the sync left behind.
      name: machine && machine.name !== t.serial ? machine.name : "",
      mine: machine ? !machine.excluded : false,
      hasSales: withSales.has(t.serial),
    };
  });

  return (
    <>
      <PageHeader
        title={m.terminals.title}
        subtitle={m.terminals.subtitle}
        backHref="/settings"
        backLabel={m.settings.title}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={m.terminals.empty}
          hint={m.terminals.emptyHint}
          action={
            <Link href="/settings" className={buttonVariants()}>
              {m.settings.title}
            </Link>
          }
        />
      ) : (
        <TerminalPicker rows={rows} />
      )}
    </>
  );
}
