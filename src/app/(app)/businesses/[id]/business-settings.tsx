"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Trash2 } from "lucide-react";
import { ImagePicker } from "@/components/image-picker";
import { Avatar, RowList} from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { mediaUrl } from "@/lib/media";
import { fmt } from "@/i18n/format";
import type { Business, Machine } from "@/lib/types";
import { deleteBusiness, saveBusiness, setMachineDataSince } from "../actions";
import { MachineIcon } from "@/components/machine/machine-icon";

const hintClass = "text-[13px] leading-snug text-muted-foreground";

export function BusinessSettings({ business, canDelete }: { business: Business; canDelete: boolean }) {
  const { m } = useI18n();
  const router = useRouter();
  const [logo, setLogo] = useState<{ file: File | null; removed: boolean }>({ file: null, removed: false });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    if (logo.file) formData.set("logo", logo.file);
    if (logo.removed) formData.set("removeLogo", "1");
    setStatus("idle");
    startTransition(async () => {
      try {
        await saveBusiness(formData);
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        await deleteBusiness(business.id);
        router.push("/businesses");
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <form action={submit} className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <input type="hidden" name="id" value={business.id} />

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="name">{m.businesses.name}</Label>
        <Input id="name" name="name" defaultValue={business.name} required />
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="startedOn">{m.businesses.startedOn}</Label>
        <Input
          id="startedOn"
          name="startedOn"
          type="date"
          defaultValue={business.started_on ?? ""}
          className="w-fit"
        />
        <p className={hintClass}>{m.businesses.startedOnHint}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contactName">{m.businesses.contact}</Label>
        <Input id="contactName" name="contactName" defaultValue={business.contact_name ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">{m.businesses.phone}</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={business.phone ?? ""} />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="email">{m.businesses.email}</Label>
        <Input id="email" name="email" type="email" defaultValue={business.email ?? ""} />
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="notes">{m.businesses.notes}</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={business.notes ?? ""}
          className="w-full min-w-0 resize-y rounded-xl border border-input bg-card px-3.5 py-2.5 text-base transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:text-sm"
        />
        <p className={hintClass}>{m.businesses.notesHint}</p>
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label>{m.businesses.logo}</Label>
        <ImagePicker
          initialUrl={mediaUrl(business.logo_path)}
          onChange={setLogo}
          chooseLabel={m.businesses.chooseLogo}
          changeLabel={m.businesses.changeLogo}
          removeLabel={m.products.removePhoto}
          square={false}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? m.common.saving : m.common.save}
        </Button>
        {status === "saved" && <span className="text-[13.5px] font-medium text-positive">{m.common.saved}</span>}
        {status === "error" && <span className="text-[13.5px] font-medium text-negative">{m.common.error}</span>}
        {canDelete && (
          <Button type="button" variant="destructive" onClick={remove} disabled={isPending} className="ml-auto">
            <Trash2 />
            {m.common.delete}
          </Button>
        )}
      </div>
      {!canDelete && <p className={`${hintClass} sm:col-span-2`}>{m.businesses.deleteHint}</p>}
    </form>
  );
}

export function MachineStarts({ machines, business }: { machines: Machine[]; business: Business }) {
  const { m, f } = useI18n();

  if (machines.length === 0) {
    return <p className="surface-card px-5 py-4 text-[14px] text-muted-foreground">{m.businesses.noMachines}</p>;
  }

  return (
    <RowList>
      {machines.map((machine) =>
        // A shared machine's terminal date would hit both businesses, so there
        // the business' own start date decides what counts as its sales.
        machine.shared_business_id ? (
          <SharedMachineRow key={machine.id} machine={machine} business={business} m={m} f={f} />
        ) : (
          <MachineStartRow key={machine.id} machine={machine} label={m.machines.dataSince} />
        ),
      )}
    </RowList>
  );
}

/** Two layouts in one row: side by side on a wide screen, the setting under the name on a phone. */
const rowClass = "flex flex-col gap-2.5 rounded-xl px-3 py-3 sm:flex-row sm:items-center sm:gap-4";
/** Lines the second part up under the name, past the token, on a phone. */
const underName = "pl-[54px] sm:pl-0";

function MachineLink({ machine }: { machine: Machine }) {
  const { m } = useI18n();
  return (
    <Link
      href={`/machines/${machine.id}`}
      className="hover-surface -mx-2 -my-1.5 flex min-w-0 flex-1 items-center gap-3.5 rounded-xl px-2 py-1.5"
    >
      <Avatar><MachineIcon /></Avatar>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[15px] font-semibold tracking-[-0.01em]">
          <span className="truncate">{machine.name}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
        </span>
        {machine.payter_serial_number && (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            {m.machines.terminal} {machine.payter_serial_number}
          </span>
        )}
      </span>
    </Link>
  );
}

function SharedMachineRow({
  machine,
  business,
  m,
  f,
}: {
  machine: Machine;
  business: Business;
  m: ReturnType<typeof useI18n>["m"];
  f: ReturnType<typeof useI18n>["f"];
}) {
  return (
    <li className={rowClass}>
      <MachineLink machine={machine} />
      <span className={`${underName} shrink-0 text-[13px] text-muted-foreground sm:text-right`}>
        {business.started_on
          ? fmt(m.businesses.salesFromBusiness, { date: f.date(business.started_on) })
          : m.businesses.salesFromNotSet}
      </span>
    </li>
  );
}

function MachineStartRow({ machine, label }: { machine: Machine; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState(machine.data_since ?? "");
  const [isPending, startTransition] = useTransition();

  // The date saves on change: one field, no reason to make it a two-step form.
  function save(next: string) {
    setValue(next);
    startTransition(async () => {
      await setMachineDataSince(machine.id, next || null);
      router.refresh();
    });
  }

  return (
    <li className={rowClass}>
      <MachineLink machine={machine} />
      <div className={`${underName} flex shrink-0 items-center justify-between gap-3 sm:justify-end`}>
        <Label htmlFor={`start-${machine.id}`} className="text-[13px] text-muted-foreground">
          {label}
        </Label>
        <Input
          id={`start-${machine.id}`}
          type="date"
          value={value}
          disabled={isPending}
          onChange={(e) => save(e.target.value)}
          className="w-fit"
        />
      </div>
    </li>
  );
}
