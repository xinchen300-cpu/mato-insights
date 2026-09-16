import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

function formatEuro(value: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value);
}

export function StatCard({
  label,
  value,
  previousValue,
  format = "number",
}: {
  label: string;
  value: number;
  previousValue?: number;
  format?: "euro" | "number";
}) {
  const display = format === "euro" ? formatEuro(value) : value.toLocaleString("nl-BE");

  let delta: number | null = null;
  if (previousValue !== undefined && previousValue > 0) {
    delta = ((value - previousValue) / previousValue) * 100;
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <p className="text-2xl font-semibold tracking-tight">{display}</p>
          {delta !== null && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-sm font-medium",
                delta >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {delta >= 0 ? (
                <ArrowUpIcon className="size-3.5" />
              ) : (
                <ArrowDownIcon className="size-3.5" />
              )}
              {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
