import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card p-5", className)}>{children}</section>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line/15 px-4 py-6 text-center text-[13px] text-text-faint">
      {children}
    </div>
  );
}
