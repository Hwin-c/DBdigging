"use client";
import clsx from "clsx";
import { ExternalLink, Pause, Play } from "lucide-react";
import type { AudioFeatures } from "@/lib/audio";
import { reasonText, simLevel, soundDiff, type DeckCard, type Via } from "@/lib/deck";
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
              fallback={card.preview?.cover}
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
        fallback={card.preview?.cover}
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
function Reason({ v, focused, onFocus }: { v: Via; focused: boolean; onFocus: (id: string) => void }) {
  const text = reasonText(v);
  const i = text.indexOf(v.name);
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
  status,
  onSwipe,
  onTap,
  focusId,
  onFocus,
}: {
  card: DeckCard;
  /** 시작 곡 소리 특성 */
  base: AudioFeatures | null | undefined;
  status: "idle" | "loading" | "playing" | "paused";
  onSwipe: (dir: SwipeDir) => void;
  onTap: () => void;
  focusId: string | null;
  /** 인물 이름을 누르면 그 사람에게 집중 */
  onFocus: (personId: string) => void;
}) {
  const { drag, handlers } = useSwipe({ onSwipe, onTap });
  const playing = status === "playing";
  const level = base && card.features ? simLevel(base, card.features) : null;
  const diffs = base && card.features ? soundDiff(base, card.features) : [];
  const noPreview = card.preview === null;
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${card.title} ${card.artist}`)}`;

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
            aria-label={playing ? "정지" : "30초 미리듣기"}
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:bg-[#D4D4D4]"
            disabled={noPreview}
          >
            {playing ? <Pause className="h-[18px] w-[18px]" /> : <Play className="ml-0.5 h-[18px] w-[18px]" />}
          </button>
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {card.contrast && (
            <li className="rounded-full bg-black px-3 py-1.5 text-[13px] text-white">같은 사람, 다른 분위기</li>
          )}
          {card.via.map((v) => (
            <li key={v.personId}>
              <Reason v={v} focused={focusId === v.personId} onFocus={onFocus} />
            </li>
          ))}
        </ul>

        {level && (
          <p className="mt-3 text-[14px] leading-relaxed text-[#6E6E73]">
            {!card.contrast && <span className="font-semibold text-black">{level}</span>}
            {!card.contrast && diffs.length > 0 && <span>, </span>}
            {diffs.length > 0 ? `시작 곡보다 ${diffs.join(", ")} 곡` : card.contrast ? "" : " 분위기"}
          </p>
        )}

        {noPreview && (
          <p className="mt-3 text-[13px] text-[#6E6E73]">
            미리듣기 없음.{" "}
            <a href={yt} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-black">
              YouTube에서 듣기
            </a>
          </p>
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
