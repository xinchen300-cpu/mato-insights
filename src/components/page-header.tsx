import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The top of every page: a title that carries the page, one quiet line under
 * it, and the page's own actions on the right. No band, no box.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  backHref,
  backLabel,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        )}
        {eyebrow && <p className="mb-1.5 text-sm text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A white, softly rounded card. The default home for a section that needs one. */
export function Panel({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card p-5 sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>}
            {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** A section that sits straight on the page: a title, then the content, no card. */
export function Section({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid size-12 place-items-center rounded-full bg-surface text-muted-foreground">{icon}</div>}
      <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
