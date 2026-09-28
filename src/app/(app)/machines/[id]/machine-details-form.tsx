"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { MACHINE_TYPES, type Business, type Machine, type MachineType } from "@/lib/types";
import { updateMachineDetails } from "../actions";

const NEW_BUSINESS = "__new__";

const selectClass =
  "h-10 w-full border border-input bg-card px-3 text-base outline-none focus-visible:border-ring md:text-sm";

export function MachineDetailsForm({ machine, businesses }: { machine: Machine; businesses: Business[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [shared, setShared] = useState(Boolean(machine.shared_business_id));
  const [name, setName] = useState(machine.name);
  const [type, setType] = useState<MachineType | "">(machine.type ?? "");
  const [businessId, setBusinessId] = useState(machine.business_id ?? "");
  const [sharedBusinessId, setSharedBusinessId] = useState(machine.shared_business_id ?? "");
  const [dataSince, setDataSince] = useState(machine.data_since ?? "");
  const [km, setKm] = useState(machine.km_round_trip === null ? "" : String(machine.km_round_trip));
  const [newBusiness, setNewBusiness] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  // A shared machine needs two different businesses before it can be saved.
  const sharedIncomplete = shared && (!businessId || !sharedBusinessId || businessId === sharedBusinessId);

  function save() {
    setStatus("idle");
    startTransition(async () => {
      try {
        await updateMachineDetails(machine.id, {
          name,
          type: type || null,
          businessId: businessId && businessId !== NEW_BUSINESS ? businessId : null,
          newBusinessName: businessId === NEW_BUSINESS ? newBusiness : undefined,
          sharedBusinessId: shared && sharedBusinessId ? sharedBusinessId : null,
          dataSince: dataSince || null,
          kmRoundTrip: km.trim() === "" ? null : Number(km.replace(",", ".")),
        });
        setStatus("saved");
        if (businessId === NEW_BUSINESS) setBusinessId("");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-2 text-sm font-semibold">{m.machines.ownership}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[false, true].map((option) => (
            <label
              key={String(option)}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 border p-3 transition-colors",
                shared === option ? "border-foreground bg-surface" : "hover:border-foreground/40",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input
                  type="radio"
                  name="ownership"
                  checked={shared === option}
                  onChange={() => setShared(option)}
                  className="accent-[var(--primary)]"
                />
                {option ? m.machines.ownershipShared : m.machines.ownershipFull}
              </span>
              <span className="pl-5 text-xs text-muted-foreground">
                {option ? m.machines.ownershipSharedHint : m.machines.ownershipFullHint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="machine-business">{shared ? m.machines.businessFirst : m.machines.business}</Label>
        <select
          id="machine-business"
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className={selectClass}
        >
          <option value="">{m.machines.noBusiness}</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value={NEW_BUSINESS}>{m.machines.newBusiness}</option>
        </select>
      </div>
      {shared ? (
        <div className="grid gap-2">
          <Label htmlFor="machine-shared-business">{m.machines.businessSecond}</Label>
          <select
            id="machine-shared-business"
            value={sharedBusinessId}
            onChange={(e) => setSharedBusinessId(e.target.value)}
            className={selectClass}
          >
            <option value="">{m.machines.noBusiness}</option>
            {businesses
              .filter((b) => b.id !== businessId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}
      {businessId === NEW_BUSINESS && (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="new-business">{m.machines.newBusinessName}</Label>
          <Input id="new-business" value={newBusiness} onChange={(e) => setNewBusiness(e.target.value)} autoFocus />
        </div>
      )}
      {shared && <p className="text-xs text-muted-foreground sm:col-span-2">{m.machines.sharedSlotsHint}</p>}

      <div className="grid gap-2">
        <Label htmlFor="machine-name">{m.machines.name}</Label>
        <Input id="machine-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="machine-type">{m.machines.type}</Label>
        <select
          id="machine-type"
          value={type}
          onChange={(e) => setType(e.target.value as MachineType | "")}
          className={selectClass}
        >
          <option value="">{m.machines.typeNotSet}</option>
          {MACHINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {m.machines.types[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="machine-data-since">{m.machines.dataSince}</Label>
        <Input
          id="machine-data-since"
          type="date"
          value={dataSince}
          onChange={(e) => setDataSince(e.target.value)}
          className="w-fit"
        />
        <p className="text-xs text-muted-foreground">{m.machines.dataSinceHint}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="machine-km">{m.machines.kmRoundTrip}</Label>
        <Input
          id="machine-km"
          value={km}
          onChange={(e) => setKm(e.target.value.replace(/[^0-9.,]/g, ""))}
          inputMode="decimal"
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">{m.machines.kmRoundTripHint}</p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button onClick={save} disabled={isPending || !name.trim() || sharedIncomplete}>
          {isPending ? m.common.saving : m.common.save}
        </Button>
        {status === "saved" && <span className="text-sm text-positive">{m.common.saved}</span>}
        {status === "error" && <span className="text-sm text-negative">{m.common.error}</span>}
      </div>
    </div>
  );
}
