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

// Same height, rounding and focus ring as the Input next to it.
const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:text-sm";
const hintClass = "text-[13px] leading-snug text-muted-foreground";

export function MachineDetailsForm({
  machine,
  businesses,
  operator,
  rentsToBusinesses,
}: {
  machine: Machine;
  businesses: Business[];
  /** A shop renames its machine; everything else on it is the operator's. */
  operator: boolean;
  /** An automatenshop says which business a machine is for; a zaak's machines are simply its own. */
  rentsToBusinesses: boolean;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(machine.name);
  const [type, setType] = useState<MachineType | "">(machine.type ?? "");
  const [businessId, setBusinessId] = useState(machine.business_id ?? "");
  const [sharedBusinessId, setSharedBusinessId] = useState(machine.shared_business_id ?? "");
  const [dataSince, setDataSince] = useState(machine.data_since ?? "");
  const [km, setKm] = useState(machine.km_round_trip === null ? "" : String(machine.km_round_trip));
  const [byHand, setByHand] = useState(machine.refill_manual);
  const [newBusiness, setNewBusiness] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  // A second business makes the machine shared, and needs a first, different one.
  const shared = Boolean(sharedBusinessId);
  const sharedIncomplete = shared && (!businessId || businessId === sharedBusinessId);

  function save() {
    setStatus("idle");
    startTransition(async () => {
      try {
        await updateMachineDetails(machine.id, {
          name,
          type: type || null,
          // A zaak sends nothing about businesses, so nothing stored is wiped.
          ...(rentsToBusinesses
            ? {
                businessId: businessId && businessId !== NEW_BUSINESS ? businessId : null,
                newBusinessName: businessId === NEW_BUSINESS ? newBusiness : undefined,
                sharedBusinessId: sharedBusinessId || null,
              }
            : {}),
          dataSince: dataSince || null,
          kmRoundTrip: km.trim() === "" ? null : Number(km.replace(",", ".")),
          refillManual: byHand,
        });
        setStatus("saved");
        if (businessId === NEW_BUSINESS) setBusinessId("");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  const saveRow = (
    <div className="flex flex-col gap-3 border-t pt-5 sm:col-span-2 sm:flex-row sm:items-center">
      <Button onClick={save} disabled={isPending || !name.trim() || sharedIncomplete} className="w-full sm:w-auto">
        {isPending ? m.common.saving : m.common.save}
      </Button>
      {status === "saved" && <span className="text-sm font-medium text-positive">{m.common.saved}</span>}
      {status === "error" && <span className="text-sm font-medium text-negative">{m.common.error}</span>}
    </div>
  );

  if (!operator) {
    return (
      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="machine-name">{m.machines.name}</Label>
          <Input id="machine-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {saveRow}
      </div>
    );
  }

  return (
    <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
      {rentsToBusinesses && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="machine-business">{m.machines.business}</Label>
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
          <div className="grid gap-2">
            <Label htmlFor="machine-shared-business">{m.machines.businessSecond}</Label>
            <select
              id="machine-shared-business"
              value={sharedBusinessId}
              onChange={(e) => setSharedBusinessId(e.target.value)}
              className={selectClass}
            >
              <option value="">{m.machines.noSecondBusiness}</option>
              {businesses
                .filter((b) => b.id !== businessId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
            <p className={hintClass}>{m.machines.secondBusinessHint}</p>
          </div>
          {businessId === NEW_BUSINESS && (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="new-business">{m.machines.newBusinessName}</Label>
              <Input id="new-business" value={newBusiness} onChange={(e) => setNewBusiness(e.target.value)} autoFocus />
            </div>
          )}
          {shared && <p className={cn(hintClass, "-mt-2 sm:col-span-2")}>{m.machines.sharedSlotsHint}</p>}
        </>
      )}

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
        <p className={hintClass}>{m.machines.dataSinceHint}</p>
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
        <p className={hintClass}>{m.machines.kmRoundTripHint}</p>
      </div>
      {/* Filled by hand, outside Vendly (Xin, 19-10-2026): out of the refill work, still in the sales. */}
      <button
        type="button"
        role="switch"
        aria-checked={byHand}
        onClick={() => setByHand((on) => !on)}
        className="flex min-h-14 w-full items-center gap-3 py-2 text-left sm:col-span-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{m.machines.refillManual}</span>
          <span className={cn("block", hintClass)}>{m.machines.refillManualHint}</span>
        </span>
        <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200", byHand ? "bg-positive" : "bg-border")}>
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform duration-200",
              byHand ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </span>
      </button>
      {saveRow}
    </div>
  );
}
