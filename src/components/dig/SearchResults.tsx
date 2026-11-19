"use client";
import type { SearchHit } from "@/lib/mb/api";
import { Card, ErrorBox, SectionTitle, Skeleton } from "./ui";

export function SearchResults({
  query,
  hits,
  loading,
  error,
  onRetry,
  onPick,
}: {
  query: string;
  hits: SearchHit[] | undefined;
  loading: boolean;
  error?: Error;
  onRetry: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <Card>
      <SectionTitle aside={hits && !loading ? `${hits.length}건` : undefined}>
        &ldquo;{query}&rdquo; 검색 결과
      </SectionTitle>
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      {hits && !loading && hits.length === 0 && (
        <p className="text-sm text-slate-400">결과가 없습니다. 제목과 가수를 함께 입력해 보세요.</p>
      )}
      {hits && !loading && hits.length > 0 && (
        <ul className="-mx-2 divide-y divide-slate-800/70">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPick(h.id)}
                className="w-full rounded-md px-2 py-2.5 text-left hover:bg-slate-800/50"
              >
                <div className="text-[15px] text-slate-100">
                  {h.title}
                  {h.disambiguation && (
                    <span className="ml-1.5 text-xs text-slate-500">({h.disambiguation})</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {h.artist}
                  {h.firstReleaseDate && ` · ${h.firstReleaseDate.slice(0, 4)}`}
                  {h.releaseTitle && ` · ${h.releaseTitle}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
