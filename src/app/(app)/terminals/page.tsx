import Link from "next/link";
import { notFound } from "next/navigation";
import { Nfc } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";
import { getBilling, paymentsEnabled } from "@/lib/billing";
import { denyFiller, isOperator, requireOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPayterTerminals } from "@/lib/sync";
import { TerminalPicker, type TerminalRow } from "./terminal-picker";

export async function generateMetadata() {
  const { m } = await getI18n();
  return { title: m.terminals.title };
}

export default async function TerminalsPage() {
  await denyFiller();
  const { m, f } = await getI18n();
  const orgId = await requireOrgId();
  // Which terminals exist on the Payter login, and what the operator calls
  // them, is not a shop's to see: the list carries every machine.
  if (!(await isOperator())) notFound();
  const admin = createAdminClient();
  const billing = await getBilling(orgId);

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

  // Payter did not answer: nothing on this page can be told from an empty list then.
  if (terminals === null) {
    return (
      <div className="max-w-3xl">
        <PageHeader title={m.terminals.title} backHref="/settings" backLabel={m.settings.title} />
        <EmptyState
          icon={<Nfc className="size-5" />}
          title={m.terminals.unreachable}
          hint={m.settings.payterUnreachable}
          action={
            <Link href="/terminals" className={buttonVariants()}>
              {m.errors.retry}
            </Link>
          }
        />
      </div>
    );
  }

  const onPayter = new Set(terminals.map((t) => t.serial));
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
  // A machine still linked here but gone from the Payter account keeps
  // counting towards the package; it has to be on the list to be unticked.
  for (const mc of machines ?? []) {
    if (mc.excluded || !mc.payter_serial_number || onPayter.has(mc.payter_serial_number)) continue;
    rows.push({
      serial: mc.payter_serial_number as string,
      model: null,
      lastSeenLabel: null,
      name: mc.name !== mc.payter_serial_number ? (mc.name as string) : "",
      mine: true,
      hasSales: withSales.has(mc.payter_serial_number),
      orphan: true,
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={m.terminals.title}
        subtitle={m.terminals.subtitle}
        backHref="/settings"
        backLabel={m.settings.title}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Nfc className="size-5" />}
          title={m.terminals.empty}
          hint={m.terminals.emptyHint}
          action={
            <Link href="/settings" className={buttonVariants()}>
              {m.settings.title}
            </Link>
          }
        />
      ) : (
        <TerminalPicker
          rows={rows}
          planId={billing.isVendor ? null : (billing.plan?.id ?? null)}
          paymentsEnabled={paymentsEnabled()}
        />
      )}
    </div>
  );
}
