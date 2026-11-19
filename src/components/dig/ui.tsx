import clsx from "clsx";
import type { ReactNode } from "react";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded bg-slate-800/80", className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-slate-800 bg-[#121824] p-4", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-200">{children}</h2>
      {aside != null && <div className="shrink-0 text-xs text-slate-500">{aside}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-3 text-sm text-rose-200">
      <p>{error.message || "불러오지 못했습니다."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-rose-800 px-3 py-1 text-xs hover:bg-rose-900/40"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

const CORE = ["작곡", "작사", "작사·작곡", "편곡", "프로듀서"];

export function RoleChip({ label }: { label: string }) {
  return (
    <span
      className={clsx(
        "inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] leading-none",
        CORE.includes(label) ? "bg-cyan-950/70 text-cyan-200" : "bg-slate-800 text-slate-400",
      )}
    >
      {label}
    </span>
  );
}
