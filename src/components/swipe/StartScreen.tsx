"use client";
import clsx from "clsx";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { searchRecordings } from "@/lib/mb/api";
import { Cover } from "./Cover";
import { EXAMPLES, type ExampleSong } from "./examples";

/**
 * 흩어져 떠 있는 커버 자리 (화면 비율 %). 가운데 제목·검색 영역은 비워 둔다.
 * size: 커버 한 변(px), rot: 기울기(deg)
 */
const SPOTS = [
  { left: 9, top: 13, size: 92, rot: -6 },
  { left: 46, top: 7, size: 74, rot: 4 },
  { left: 82, top: 12, size: 104, rot: 7 },
  { left: 22, top: 30, size: 66, rot: 5 },
  { left: 72, top: 30, size: 58, rot: -4 },
  { left: 13, top: 58, size: 80, rot: 3 },
  { left: 85, top: 52, size: 70, rot: -7 },
  { left: 30, top: 74, size: 62, rot: -3 },
  { left: 62, top: 76, size: 88, rot: 5 },
];

/** 모바일: 위·아래 띠에만 */
const SPOTS_MOBILE = [
  { left: 8, top: 5, size: 64, rot: -6 },
  { left: 40, top: 2, size: 52, rot: 4 },
  { left: 74, top: 6, size: 70, rot: 6 },
  { left: 14, top: 84, size: 56, rot: 5 },
  { left: 50, top: 87, size: 66, rot: -5 },
  { left: 80, top: 82, size: 50, rot: -3 },
];

export interface FloatingSong {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
  releaseGroupId?: string;
}

function FloatingCovers({
  songs,
  spots,
  className,
  onPick,
}: {
  songs: FloatingSong[];
  spots: typeof SPOTS;
  className: string;
  onPick: (s: FloatingSong) => void;
}) {
  return (
    <div className={clsx("pointer-events-none absolute inset-0", className)}>
      {spots.map((spot, i) => {
        const s = songs[i % songs.length];
        if (!s) return null;
        return (
          <button
            key={`${s.id}-${i}`}
            type="button"
            onClick={() => onPick(s)}
            aria-label={`${s.title} ${s.artist}로 시작`}
            title={`${s.title} · ${s.artist}`}
            className="float-cover pointer-events-auto absolute -translate-x-1/2 rounded-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
            style={
              {
                left: `${spot.left}%`,
                top: `${spot.top}%`,
                width: spot.size,
                height: spot.size,
                "--float-rot": `${spot.rot}deg`,
                "--float-dur": `${7 + (i % 4) * 1.3}s`,
                "--float-delay": `${-i * 1.1}s`,
              } as React.CSSProperties
            }
          >
            <Cover
              // 시작 화면은 빠른 Deezer 커버(ISRC)를 먼저, 없으면 Cover Art Archive
              releaseGroupId={s.releaseGroupId}
              preferDeezer
              isrc={s.isrc}
              title={s.title}
              artist={s.artist}
              quiet
              className="sleeve h-full w-full rounded-[3px]"
            />
          </button>
        );
      })}
    </div>
  );
}

export function StartScreen({
  floating,
  onStart,
}: {
  /** 떠 있는 커버: 예시 곡 + 디깅 노트에 담은 곡 */
  floating: FloatingSong[];
  onStart: (song: { id: string; title: string; artist: string }) => void;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const search = useAsync(query ? () => searchRecordings(query) : null, [query]);
  const showing = !!query;

  const submit = (q: string) => {
    const v = q.trim();
    if (!v) return;
    if (v === query) search.reload();
    else setQuery(v);
  };

  return (
    <div className="relative">
      <section className={clsx("relative flex flex-col items-center px-4", showing ? "pt-16" : "min-h-[86svh] justify-center")}>
        {!showing && (
          <>
            <FloatingCovers songs={floating} spots={SPOTS} className="hidden md:block" onPick={onStart} />
            <FloatingCovers songs={floating} spots={SPOTS_MOBILE} className="md:hidden" onPick={onStart} />
          </>
        )}

        <h1 className="relative text-center text-[34px] font-bold leading-[1.08] tracking-[-0.04em] md:text-[56px]">
          <span className="block text-[#B4B4B8]">좋아하는 곡 하나로</span>
          <span className="block text-black">만든 사람을 따라 파고들기</span>
        </h1>

        <form
          className="relative mt-8 flex w-full max-w-[460px] items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <label htmlFor="q" className="sr-only">
            곡 제목과 가수
          </label>
          <input
            id="q"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="곡 제목과 가수 (예: 밤편지 아이유)"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 rounded-full bg-[#F2F2F2] px-5 text-[15px] text-black outline-none placeholder:text-[#9A9A9E] focus:ring-2 focus:ring-black"
          />
          <button
            type="submit"
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-black px-5 text-[15px] font-semibold text-white"
          >
            {search.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            찾기
          </button>
        </form>

        {!showing && (
          <div className="relative mt-5 flex max-w-[520px] flex-wrap justify-center gap-2">
            {EXAMPLES.map((e: ExampleSong) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onStart(e)}
                className="flex min-h-[44px] items-center gap-2 rounded-full border border-[#E5E5E5] bg-white py-1.5 pl-1.5 pr-4 text-[14px] text-black hover:border-black"
              >
                <Cover
                  releaseGroupId={e.releaseGroupId}
                  preferDeezer
                  quiet
                  isrc={e.isrc}
                  title={e.title}
                  artist={e.artist}
                  className="h-8 w-8 rounded-full"
                />
                {e.title}
              </button>
            ))}
          </div>
        )}
      </section>

      {showing && (
        <section className="mx-auto mt-8 w-full max-w-[460px] px-4">
          {search.loading && <p className="text-[14px] text-[#6E6E73]">MusicBrainz에서 찾는 중</p>}
          {search.error && (
            <p className="text-[14px] text-black">
              {search.error.message}{" "}
              <button type="button" onClick={search.reload} className="underline underline-offset-2">
                다시 찾기
              </button>
            </p>
          )}
          {search.data && search.data.length === 0 && (
            <p className="text-[14px] text-[#6E6E73]">
              맞는 곡이 없어요. 제목과 가수를 함께 적어 보세요.
            </p>
          )}
          {search.data && search.data.length > 0 && (
            <>
              <h2 className="mb-2 text-[13px] text-[#6E6E73]">시작할 곡을 고르세요</h2>
              <ul className="divide-y divide-[#EFEFEF]">
                {search.data.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => onStart({ id: h.id, title: h.title, artist: h.artist })}
                      className="block min-h-[56px] w-full py-3 text-left hover:bg-[#FAFAFA]"
                    >
                      <span className="block text-[16px] font-semibold tracking-[-0.01em] text-black">{h.title}</span>
                      <span className="block text-[13px] text-[#6E6E73]">
                        {h.artist}
                        {h.firstReleaseDate ? `, ${h.firstReleaseDate.slice(0, 4)}` : ""}
                        {h.releaseTitle && h.releaseTitle !== h.title ? `, ${h.releaseTitle}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setText("");
            }}
            className="mt-4 min-h-[44px] text-[14px] text-[#6E6E73] underline underline-offset-2 hover:text-black"
          >
            처음 화면으로
          </button>
        </section>
      )}
    </div>
  );
}
