"use client";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import {
  getArtistCredits,
  normalizeTitle,
  resolveWorkToRecording,
  type PersonDetail,
  type PersonItem,
} from "@/lib/mb/api";
import { Card, ErrorBox, RoleChip, SectionTitle, Skeleton } from "./ui";

const PAGE = 30;
const FILTERS = ["전체", "작곡", "작사", "편곡", "프로듀서"] as const;
type Filter = (typeof FILTERS)[number];

function matches(it: PersonItem, f: Filter): boolean {
  if (f === "전체") return true;
  if (f === "작곡" || f === "작사") return it.roles.includes(f) || it.roles.includes("작사·작곡");
  return it.roles.includes(f);
}

export function PersonPanel({
  personId,
  currentTitle,
  onLoaded,
  onPickRecording,
  onClose,
}: {
  personId: string;
  currentTitle?: string;
  onLoaded?: (p: PersonDetail) => void;
  onPickRecording: (recordingId: string) => void;
  onClose: () => void;
}) {
  const st = useAsync(
    () =>
      getArtistCredits(personId).then((p) => {
        onLoaded?.(p);
        return p;
      }),
    [personId],
  );
  const [filter, setFilter] = useState<Filter>("전체");
  const [text, setText] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = st.data?.items ?? [];
    const t = text.trim().toLowerCase();
    return all.filter((it) => matches(it, filter) && (!t || it.title.toLowerCase().includes(t)));
  }, [st.data, filter, text]);

  const current = currentTitle ? normalizeTitle(currentTitle) : "";

  const pick = async (it: PersonItem) => {
    setResolveError(null);
    if (it.kind === "recording") {
      onPickRecording(it.id);
      return;
    }
    setResolving(it.id);
    try {
      const rec = await resolveWorkToRecording(it.id);
      if (rec) onPickRecording(rec.id);
      else setResolveError(`"${it.title}"의 녹음 정보가 MusicBrainz에 없습니다.`);
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setResolving(null);
    }
  };

  return (
    <Card className="border-cyan-900/60">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {st.data ? (
            <>
              <h2 className="text-lg font-bold text-white">{st.data.artist.name}</h2>
              <p className="text-xs text-slate-500">
                {[st.data.artist.disambiguation, st.data.artist.country].filter(Boolean).join(" · ")}
                {st.data.artist.disambiguation || st.data.artist.country ? " · " : ""}
                참여곡 {st.data.items.length}곡
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="인물 패널 닫기"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {st.error && <ErrorBox error={st.error} onRetry={st.reload} />}

      {st.loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      )}

      {st.data && (
        <>
          <div className="mb-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="역할 필터">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => {
                  setFilter(f);
                  setShown(PAGE);
                }}
                className={clsx(
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs",
                  filter === f
                    ? "border-cyan-700 bg-cyan-950/50 text-cyan-100"
                    : "border-slate-700 text-slate-400 hover:border-slate-500",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setShown(PAGE);
            }}
            placeholder="곡 제목으로 찾기"
            aria-label="참여곡 제목으로 찾기"
            className="mb-2 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none"
          />
          {resolveError && <p className="mb-2 text-xs text-rose-300">{resolveError}</p>}
          <SectionTitle aside={`${items.length}곡`}>다른 곡</SectionTitle>
          <ul className="-mx-2 divide-y divide-slate-800/70">
            {items.slice(0, shown).map((it) => {
              const isCurrent = current && normalizeTitle(it.title) === current;
              return (
                <li key={`${it.kind}:${it.id}`}>
                  <button
                    type="button"
                    disabled={resolving != null}
                    onClick={() => pick(it)}
                    className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-800/50 disabled:opacity-70"
                  >
                    <span className="min-w-0 flex-1 break-words text-sm text-slate-100">
                      {it.title}
                      {it.disambiguation && (
                        <span className="ml-1.5 text-xs text-slate-500">({it.disambiguation})</span>
                      )}
                      {isCurrent && <span className="ml-1.5 text-xs text-cyan-400">지금 곡</span>}
                    </span>
                    <span className="flex max-w-[55%] flex-wrap items-center justify-end gap-1 pt-0.5">
                      {resolving === it.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                      {it.roles.slice(0, 3).map((r) => (
                        <RoleChip key={r} label={r} />
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {items.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-2 w-full rounded-md border border-slate-700 py-2 text-xs text-slate-300 hover:border-slate-500"
            >
              더 보기 ({items.length - shown}곡 남음)
            </button>
          )}
        </>
      )}
    </Card>
  );
}
