"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AutoPrint({ label }: { label: string }) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Printer />
      {label}
    </Button>
  );
}
