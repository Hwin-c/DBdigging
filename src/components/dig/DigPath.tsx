"use client";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

export interface PathStep {
  kind: "song" | "person";
  id: string;
  label: string;
  /** person 단계가 열렸던 곡 */
  rec?: string;
}

export function DigPath({ steps, onJump }: { steps: PathStep[]; onJump: (index: number) => void }) {
  const ref = useRef<HTMLElement>(null);
  // 새 단계가 추가되면 마지막 단계가 보이도록 끝으로 스크롤
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [steps.length]);
  if (steps.length === 0) return null;
  return (
    <nav ref={ref} aria-label="디깅 경로" className="-mx-4 overflow-x-auto px-4">
      <ol className="flex w-max items-center gap-1 text-xs">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={`${s.kind}:${s.id}:${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" />}
              <button
                type="button"
                disabled={last}
                aria-current={last ? "step" : undefined}
                onClick={() => onJump(i)}
                className={clsx(
                  "max-w-[11rem] truncate rounded-full border px-2.5 py-1",
                  last
                    ? "border-cyan-700 bg-cyan-950/50 text-cyan-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-500",
                )}
                title={s.label}
              >
                {s.kind === "person" && <span className="text-slate-500">인물 </span>}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
