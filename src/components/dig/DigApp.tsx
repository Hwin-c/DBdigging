"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getFeatures } from "@/lib/audio";
import { findIsrcFallback, getRecording, searchRecordings } from "@/lib/mb/api";
import { player } from "@/lib/preview";
import { AudioChips } from "./AudioChips";
import { DigPath, type PathStep } from "./DigPath";
import { PersonPanel } from "./PersonPanel";
import { Recommendations } from "./Recommendations";
import { SearchBar } from "./SearchBar";
import { SearchResults } from "./SearchResults";
import { SongCard, SongCardSkeleton } from "./SongCard";
import { SourceFooter } from "./SourceFooter";
import { ErrorBox } from "./ui";
import { YouTubeBlock } from "./YouTubeBlock";

const PATH_KEY = "dig:path";
const EXAMPLES = ["Flutter Hearts2Hearts", "Supernova aespa", "밤편지 아이유", "Get Lucky Daft Punk"];

function loadPath(): PathStep[] {
  try {
    const raw = sessionStorage.getItem(PATH_KEY);
    return raw ? (JSON.parse(raw) as PathStep[]) : [];
  } catch {
    return [];
  }
}

function savePath(p: PathStep[]) {
  try {
    sessionStorage.setItem(PATH_KEY, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}

export function DigApp() {
  const router = useRouter();
  const params = useSearchParams();
  const rec = params.get("rec");
  const person = params.get("person");

  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [path, setPath] = useState<PathStep[]>([]);
  const [personNames, setPersonNames] = useState<Record<string, string>>({});

  useEffect(() => setPath(loadPath()), []);

  const go = useCallback(
    (next: { rec?: string | null; person?: string | null }, scrollTop = true) => {
      const sp = new URLSearchParams();
      if (next.rec) sp.set("rec", next.rec);
      if (next.person) sp.set("person", next.person);
      const qs = sp.toString();
      router.push(qs ? `/?${qs}` : "/", { scroll: false });
      if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router],
  );

  const search = useAsync(query ? () => searchRecordings(query) : null, [query]);
  // 병합된 MBID는 다른 id로 응답될 수 있으므로 요청한 id로 짝을 맞춘다
  const detail = useAsync(rec ? () => getRecording(rec).then((r) => ({ req: rec, r })) : null, [rec]);
  const d = detail.data && detail.data.req === rec ? detail.data.r : undefined;
  const fallback = useAsync(d && d.isrcs.length === 0 ? () => findIsrcFallback(d) : null, [d?.id]);

  const isrc = d?.isrcs[0] ?? fallback.data?.isrc;
  const isrcNote = !d?.isrcs[0] && fallback.data ? "같은 곡의 다른 녹음" : undefined;

  // 소리 특성: 실패하면 칩만 숨기고 크레딧 기능은 유지
  const features = useAsync(isrc ? () => getFeatures(isrc) : null, [isrc]);
  const featLoading = features.loading || (!!d && d.isrcs.length === 0 && fallback.loading);
  const base = features.error ? null : features.data;

  // 곡이 바뀌면 재생 중인 미리듣기 정지
  useEffect(() => {
    player.stop();
  }, [rec]);

  // 디깅 경로 기록: URL(rec, person)이 바뀔 때마다 경로에 반영. 이미 있던 단계면 그 단계까지 되돌린다
  useEffect(() => {
    if (!rec || !d) return;
    const song: PathStep = { kind: "song", id: rec, label: d.title };
    setPath((prev) => {
      const si = prev.findIndex((s) => s.kind === "song" && s.id === rec);
      const base = si >= 0 ? prev.slice(0, si + 1) : [...prev, song];
      let next = base;
      if (person) {
        const name = personNames[person];
        if (!name) return prev;
        next = [...base, { kind: "person", id: person, label: name, rec }];
      }
      savePath(next);
      return next;
    });
  }, [rec, person, d, personNames]);

  const onSearch = (q: string) => {
    setShowResults(true);
    if (q === query) search.reload();
    else setQuery(q);
  };

  const onPickSearch = (id: string) => {
    setShowResults(false);
    setPath([]);
    savePath([]);
    go({ rec: id });
  };

  const onPerson = (id: string, name: string) => {
    setPersonNames((m) => ({ ...m, [id]: name }));
    if (person === id) go({ rec }, false);
    else go({ rec, person: id }, false);
  };

  const onJump = (i: number) => {
    const step = path[i];
    if (!step) return;
    if (step.kind === "song") go({ rec: step.id });
    else go({ rec: step.rec, person: step.id }, false);
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-5">
      <header className="mb-4">
        <button
          type="button"
          onClick={() => {
            setShowResults(false);
            go({});
          }}
          className="text-left"
        >
          <span className="text-lg font-bold tracking-tight text-white">디비디깅</span>
          <span className="ml-2 text-xs text-slate-500">크레딧과 소리로 음악 디깅</span>
        </button>
      </header>

      <div className="space-y-4">
        <SearchBar value={query} loading={search.loading} onSearch={onSearch} />

        <DigPath steps={path} onJump={onJump} />

        {showResults && query && (
          <SearchResults
            query={query}
            hits={search.data}
            loading={search.loading}
            error={search.error}
            onRetry={search.reload}
            onPick={onPickSearch}
          />
        )}

        {!rec && !showResults && (
          <section className="rounded-xl border border-slate-800 p-4 text-sm text-slate-300">
            <p>
              곡을 고르면 그 곡을 만든 사람(작곡·작사·편곡·프로듀서)이 보이고, 그 사람이 만든 다른 곡으로 계속
              따라갈 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onSearch(e)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                >
                  {e}
                </button>
              ))}
            </div>
          </section>
        )}

        {rec && detail.loading && <SongCardSkeleton />}
        {rec && detail.error && <ErrorBox error={detail.error} onRetry={detail.reload} />}
        {d && (
          <SongCard
            detail={d}
            isrc={isrc}
            isrcNote={isrcNote}
            activePerson={person}
            onPerson={onPerson}
            audioSlot={<AudioChips features={base} loading={featLoading} />}
            videoSlot={
              <YouTubeBlock
                urls={d.youtube}
                title={d.title}
                artist={d.artists[0]?.name ?? d.artist}
                onPlay={() => player.stop()}
              />
            }
          />
        )}

        {d && person && (
          <PersonPanel
            key={person}
            personId={person}
            currentTitle={d.title}
            onLoaded={(p) => setPersonNames((m) => (m[p.artist.id] ? m : { ...m, [p.artist.id]: p.artist.name }))}
            onPickRecording={(id) => go({ rec: id })}
            onClose={() => go({ rec }, false)}
          />
        )}

        {d && (
          <Recommendations
            detail={d}
            base={base}
            baseSettled={!featLoading}
            onOpen={(id) => go({ rec: id })}
          />
        )}
      </div>

      <SourceFooter />
    </main>
  );
}
