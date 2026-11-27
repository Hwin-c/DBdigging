"use client";
import clsx from "clsx";
import { ExternalLink, Loader2, Pause, Play } from "lucide-react";
import type { AudioFeatures } from "@/lib/audio";
import {
  PERFORMER_ROLE,
  reasonText,
  simLevel,
  soundDiff,
  type CardPerson,
  type DeckCard,
  type SoundMode,
  type Via,
} from "@/lib/deck";
import { similarity } from "@/lib/audio";
import { Cover } from "./Cover";
import { SWIPE, dragIntent, useSwipe, type DragState, type SwipeDir } from "./useSwipe";

const HINT: Record<SwipeDir, string> = { left: "넘기기", right: "담기" };

/**
 * LP 한 장: 커버(슬리브) 뒤에 레코드가 숨어 있다가, 재생하면 오른쪽으로 빠져나와 돈다.
 */
function Sleeve({
  card,
  playing,
  drag,
}: {
  card: DeckCard;
  playing: boolean;
  drag: DragState;
}) {
  const intent = dragIntent(drag);
  return (
    <div className="relative mx-auto aspect-square w-[62%] max-w-[340px] md:w-[78%]">
      {/* 레코드 */}
      <div
        aria-hidden
        className={clsx(
          "vinyl absolute inset-[3%] rounded-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out",
          playing ? "translate-x-[30%]" : "translate-x-[7%]",
        )}
      >
        <div className={clsx("vinyl-spin absolute inset-0 rounded-full", playing && "is-spinning")}>
          <div className="absolute inset-[33%] overflow-hidden rounded-full ring-[3px] ring-black">
            <Cover
              releaseGroupId={card.releaseGroupId}
              isrc={card.isrc}
              fallback={card.cover ?? card.preview?.cover}
              title={card.title}
              artist={card.artist}
              className="h-full w-full"
            />
          </div>
          <div className="absolute left-1/2 top-1/2 h-[3%] w-[3%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F2F2F2]" />
        </div>
      </div>
      {/* 슬리브 */}
      <Cover
        releaseGroupId={card.releaseGroupId}
        isrc={card.isrc}
        fallback={card.cover ?? card.preview?.cover}
        title={card.title}
        artist={card.artist}
        size={500}
        className="sleeve absolute inset-0 rounded-[3px]"
      />
      {intent && (
        <div
          className={clsx(
            "pointer-events-none absolute inset-x-0 top-[38%] mx-auto w-max rounded-full px-4 py-2 text-[15px] font-semibold",
            intent === "right" ? "bg-black text-white" : "bg-white text-black ring-1 ring-black",
          )}
        >
          {HINT[intent]}
        </div>
      )}
    </div>
  );
}

/** 이유 문장. 인물 이름은 눌러서 집중할 수 있는 버튼 */
function Reason({
  v,
  isOrigin,
  focused,
  onFocus,
}: {
  v: Via;
  isOrigin?: boolean;
  focused: boolean;
  onFocus: (id: string) => void;
}) {
  const text = reasonText(v, isOrigin);
  const prefix = v.fromTitle && !isOrigin ? `${v.fromTitle}에서 만난 ` : "";
  const i = text.indexOf(v.name, prefix.length);
  const name = (
    <button
      type="button"
      onClick={() => onFocus(v.personId)}
      aria-pressed={focused}
      title={focused ? `${v.name} 집중 해제` : `${v.name}에게 집중`}
      className={clsx(
        "rounded-full font-semibold underline decoration-[#C4C4C8] underline-offset-[3px] hover:decoration-black",
        focused && "bg-black px-1.5 text-white no-underline",
      )}
    >
      {v.name}
    </button>
  );
  return (
    <span className="inline-block rounded-full border border-[#E5E5E5] px-3 py-1.5 text-[13px] leading-[1.6] text-black">
      {i >= 0 ? (
        <>
          {text.slice(0, i)}
          {name}
          {text.slice(i + v.name.length)}
        </>
      ) : (
        text
      )}
    </span>
  );
}

export function SwipeCard({
  card,
  base,
  baseTitle,
  mode,
  status,
  onSwipe,
  onTap,
  focusId,
  onFocus,
  onDig,
  onSinger,
}: {
  card: DeckCard;
  /** 시작 곡 소리 특성 */
  base: AudioFeatures | null | undefined;
  /** 시작 곡 제목 (소리 문장에서 "Flutter보다"처럼 쓴다) */
  baseTitle?: string;
  /** 선택한 소리 방향 */
  mode: SoundMode;
  status: "idle" | "loading" | "playing" | "paused" | "blocked";
  onSwipe: (dir: SwipeDir) => void;
  onTap: () => void;
  focusId: string | null;
  /** 인물 이름을 누르면 그 사람에게 집중 */
  onFocus: (personId: string) => void;
  /** '이 곡을 만든 사람'을 누르면 그 사람으로 파기 */
  onDig: (p: CardPerson) => void;
  /** 가수를 누르면 가수 축(그 가수가 부른 다른 곡) */
  onSinger: () => void;
}) {
  const { drag, handlers } = useSwipe({ onSwipe, onTap });
  const playing = status === "playing";
  const loadingPreview = status === "loading";
  const blocked = status === "blocked";
  const level = !card.isOrigin && base && card.features ? simLevel(base, card.features) : null;
  const diffs = !card.isOrigin && base && card.features ? soundDiff(base, card.features) : [];
  const noPreview = card.preview === null;
  // 선택한 방향과 관련된 값 하나를 시작 곡과 막대로 비교 (숫자는 보이지 않는다)
  const f = card.features;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const bar =
    !card.isOrigin && base && f && (mode === "energetic" || mode === "calm")
      ? {
          label: "에너지",
          rows: [
            { name: baseTitle ?? "시작 곡", v: clamp(base.energy), strong: false },
            { name: "이 곡", v: clamp(f.energy), strong: true },
          ],
        }
      : !card.isOrigin && base && f && mode === "new"
        ? { label: "분위기 차이", rows: [{ name: "이 곡", v: clamp((1 - similarity(base, f)) / 0.5), strong: true }] }
        : null;
  // 이 곡을 만든 사람: 색인 카드는 작품 조각의 크레딧(이름을 받는 동안은 데려온 사람), API 카드는 지금 가진 정보
  const makers: CardPerson[] =
    card.credits ??
    card.via
      .filter((v) => v.role !== PERFORMER_ROLE)
      .map((v) => ({ personId: v.personId, name: v.name, disambiguation: v.disambiguation, role: v.role, roles: [v.role] }));
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${card.title} ${card.artist}`)}`;
  // Spotify는 API 없이 검색 주소만 연다 (개발 모드 제한, 키를 브라우저에 둘 수 없음)
  const spotify = `https://open.spotify.com/search/${encodeURIComponent(`${card.title} ${card.artist}`)}`;

  return (
    <article
      aria-label={`${card.title}, ${card.artist}`}
      className="relative"
      style={{
        transform: `translate3d(${drag.x}px, ${Math.min(drag.y, 40)}px, 0) rotate(${drag.x * SWIPE.ROTATE}deg)`,
        transition: drag.active ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {/* 스와이프는 커버 영역에서 좌우만: pan-y로 세로 스크롤은 브라우저가 처리 */}
      <div {...handlers} className="cursor-grab touch-pan-y select-none active:cursor-grabbing">
        <Sleeve card={card} playing={playing} drag={drag} />
      </div>

      <div className="mx-auto mt-5 w-full max-w-[340px] md:mt-7 md:w-[78%]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[26px] font-bold leading-[1.15] tracking-[-0.03em] text-black">
              {card.title}
            </h2>
            <p className="mt-1 truncate text-[15px] text-[#6E6E73]">{card.artist}</p>
          </div>
          <button
            type="button"
            onClick={onTap}
            aria-label={playing ? "정지" : loadingPreview ? "불러오는 중" : blocked ? "탭해서 재생" : "30초 미리듣기"}
            aria-busy={loadingPreview}
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:bg-[#D4D4D4]"
            disabled={noPreview}
          >
            {playing ? (
              <Pause className="h-[18px] w-[18px]" />
            ) : loadingPreview ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" />
            ) : (
              <Play className="ml-0.5 h-[18px] w-[18px]" />
            )}
          </button>
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {card.isOrigin && (
            <li className="rounded-full bg-black px-3 py-1.5 text-[13px] text-white">시작 곡</li>
          )}
          {card.contrast && (
            <li className="rounded-full bg-black px-3 py-1.5 text-[13px] text-white">같은 사람, 다른 분위기</li>
          )}
          {card.via.map((v) => (
            <li key={v.personId}>
              <Reason v={v} isOrigin={card.isOrigin} focused={focusId === v.personId} onFocus={onFocus} />
            </li>
          ))}
        </ul>

        <section aria-label="이 곡을 만든 사람" className="mt-4">
          <h3 className="text-[12px] text-[#9A9A9E]">이 곡을 만든 사람</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {makers.map((p) => (
              <li key={p.personId}>
                <button
                  type="button"
                  onClick={() => onDig(p)}
                  aria-pressed={focusId === p.personId}
                  title={focusId === p.personId ? `${p.name} 집중 해제` : `${p.name}으로 파기`}
                  className={clsx(
                    "min-h-[32px] rounded-full border px-3 text-[13px]",
                    focusId === p.personId ? "border-black bg-black text-white" : "border-[#E5E5E5] text-black hover:border-black",
                  )}
                >
                  {p.name} <span className={focusId === p.personId ? "text-[#D4D4D4]" : "text-[#9A9A9E]"}>{p.role}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={onSinger}
                aria-pressed={focusId === card.primaryArtist}
                title={`${card.artist}가 부른 다른 곡 파기`}
                className={clsx(
                  "min-h-[32px] rounded-full border px-3 text-[13px]",
                  focusId === card.primaryArtist ? "border-black bg-black text-white" : "border-[#E5E5E5] text-black hover:border-black",
                )}
              >
                {card.artist} <span className={focusId === card.primaryArtist ? "text-[#D4D4D4]" : "text-[#9A9A9E]"}>가수</span>
              </button>
            </li>
          </ul>
        </section>

        {level && (
          <p className="mt-3 text-[14px] leading-relaxed text-[#6E6E73]">
            {!card.contrast && <span className="font-semibold text-black">{level}</span>}
            {!card.contrast && diffs.length > 0 && <span>, </span>}
            {diffs.length > 0 ? `${baseTitle ?? "시작 곡"}보다 ${diffs.join(", ")} 곡` : card.contrast ? "" : " 분위기"}
          </p>
        )}

        {bar && (
          <div className="mt-3" aria-label={`${bar.label}: 시작 곡과 비교`}>
            <p className="text-[12px] text-[#9A9A9E]">{bar.label}</p>
            <div className="mt-1 space-y-1">
              {bar.rows.map((r) => (
                <div key={r.name} className="flex items-center gap-2">
                  <span className="w-[56px] shrink-0 truncate text-[11px] text-[#6E6E73]">{r.name}</span>
                  <div className="h-1 flex-1 rounded-full bg-[#EFEFEF]">
                    <div className={clsx("h-1 rounded-full", r.strong ? "bg-black" : "bg-[#B4B4B8]")} style={{ width: `${Math.round(r.v * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(loadingPreview || blocked) && (
          <p role="status" className={blocked ? "mt-3 text-[13px] font-semibold text-black" : "mt-3 text-[13px] text-[#6E6E73]"}>
            {blocked ? "탭해서 재생" : "미리듣기 불러오는 중"}
          </p>
        )}

        {noPreview && (
          <div className="mt-3">
            <p className="text-[13px] text-[#6E6E73]">미리듣기 없음</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { href: yt, label: "YouTube에서 찾기" },
                { href: spotify, label: "Spotify에서 찾기" },
              ].map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#D4D4D4] px-4 text-[13px] text-black hover:border-black"
                >
                  {l.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#6E6E73]">
          {card.preview?.link && (
            <a
              href={card.preview.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-black"
            >
              {card.preview.source === "deezer" ? "Deezer" : "Apple Music"} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {!noPreview && (
            <a href={yt} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-black">
              YouTube <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href={`https://musicbrainz.org/recording/${card.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-black"
          >
            MusicBrainz <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
