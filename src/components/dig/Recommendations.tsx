"use client";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioFeatures } from "@/lib/audio";
import type { RecordingDetail } from "@/lib/mb/api";
import {
  BATCH,
  RecCollector,
  pickPeople,
  reasonText,
  scoreAndRank,
  type RecProgress,
} from "@/lib/recommend";
import { PreviewButton } from "./PreviewButton";
import { Card, SectionTitle, Skeleton } from "./ui";

export function Recommendations({
  detail: d,
  base,
  baseSettled,
  onOpen,
}: {
  detail: RecordingDetail;
  /** 지금 곡의 소리 특성 (없으면 크레딧 순) */
  base: AudioFeatures | null | undefined;
  baseSettled: boolean;
  onOpen: (id: string) => void;
}) {
  const [prog, setProg] = useState<RecProgress | null>(null);
  const collector = useRef<RecCollector | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setProg(null);
    const c = new RecCollector(d, setProg, ctl.signal);
    collector.current = c;
    void c.more().catch(() => undefined);
    return () => {
      ctl.abort();
      if (collector.current === c) collector.current = null;
    };
  }, [d]);

  const ranked = useMemo(() => scoreAndRank(prog?.items ?? [], base), [prog, base]);

  if (pickPeople(d.credits).length === 0) return null;

  const collecting = !prog?.finished;
  const noBase = baseSettled && !base;

  return (
    <Card>
      <SectionTitle
        aside={
          prog ? (
            collecting ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                후보 수집 중 {prog.items.length}/{prog.target}
              </span>
            ) : (
              `${ranked.length}곡`
            )
          ) : undefined
        }
      >
        같은 사람이 만든, 소리가 비슷한 곡
      </SectionTitle>

      {(prog?.audioUnavailable || noBase) && (
        <p className="mb-2 text-xs text-slate-500">
          {prog?.audioUnavailable
            ? "소리 데이터를 불러오지 못해 크레딧 순으로 보여 줍니다."
            : "이 곡의 소리 데이터가 없어 크레딧 순으로 보여 줍니다."}
        </p>
      )}

      {ranked.length === 0 && collecting && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}
      {ranked.length === 0 && !collecting && (
        <p className="text-sm text-slate-400">추천할 다른 곡을 찾지 못했습니다.</p>
      )}

      <ol className="-mx-2 divide-y divide-slate-800/70">
        {ranked.map((r) => (
          <li key={r.id} className="px-2 py-2.5">
            <button type="button" onClick={() => onOpen(r.id)} className="block w-full text-left">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 break-words text-[15px] text-slate-100 hover:underline">{r.title}</span>
                {r.similarity != null ? (
                  <span className="shrink-0 font-mono text-xs text-emerald-300">{r.similarity.toFixed(2)}</span>
                ) : r.features === undefined && !prog?.audioUnavailable ? (
                  <Skeleton className="h-3 w-8" />
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-500">소리 데이터 없음</span>
                )}
              </div>
              <div className="text-xs text-slate-400">{r.artist}</div>
              <div className="mt-1 text-xs text-cyan-200/80">{reasonText(r).join(" · ")}</div>
            </button>
            <div className="mt-1.5">
              <PreviewButton pkey={`rec:${r.id}`} isrc={r.isrc} title={r.title} artist={r.artist} size="sm" />
            </div>
          </li>
        ))}
      </ol>

      {prog && !collecting && !prog.exhausted && ranked.length > 0 && (
        <button
          type="button"
          onClick={() => void collector.current?.more().catch(() => undefined)}
          className="mt-3 w-full rounded-lg border border-slate-700 py-2 text-sm text-slate-300 hover:border-slate-500"
        >
          {BATCH}곡 더 보기
        </button>
      )}
    </Card>
  );
}
