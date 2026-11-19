"use client";
import { featureChips, type AudioFeatures } from "@/lib/audio";
import { Skeleton } from "./ui";

/**
 * 곡 카드의 소리 특성 칩. 데이터가 없거나 실패하면 아무것도 표시하지 않는다 (크레딧 기능은 그대로).
 */
export function AudioChips({ features, loading }: { features?: AudioFeatures | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 flex gap-1.5" aria-label="소리 특성 불러오는 중">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-md" />
        ))}
      </div>
    );
  }
  if (!features) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="소리 특성">
      {featureChips(features).map((c) => (
        <li
          key={c.label}
          className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-xs leading-tight"
        >
          <span className="text-slate-500">{c.label}</span>{" "}
          <span className="font-medium text-slate-100">{c.value}</span>
        </li>
      ))}
    </ul>
  );
}
