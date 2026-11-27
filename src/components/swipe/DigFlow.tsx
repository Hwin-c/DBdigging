"use client";
import clsx from "clsx";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DeckSnapshot } from "@/lib/deck";

/** "따라가는 사람" 펼쳤을 때 보일 최대 인원 */
const PEOPLE_SHOWN = 8;
/** 접힌 한 줄에 이름으로 보일 인원 (나머지는 "외 N명") */
const PEOPLE_LINE = 3;
/** 비중 점 지름 (px): 최소 + 비중당 증가, 최대 */
const DOT = { MIN: 6, PER_WEIGHT: 4, MAX: 22 } as const;

function dotSize(weight: number) {
  return Math.min(DOT.MAX, DOT.MIN + DOT.PER_WEIGHT * weight);
}

/**
 * 디깅 흐름: 경로(곡과 사람이 번갈아) + 지금 파는 사람들(비중 순, 점 크기) + 집중 표시.
 */
export function DigFlow({ snap, onFocus }: { snap: DeckSnapshot; onFocus: (id: string | null) => void }) {
  const pathRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = pathRef.current?.parentElement;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [snap.path.length]);

  const origin = snap.origin;
  const focused = snap.people.find((p) => p.id === snap.focusId);
  const people = snap.people.slice(0, PEOPLE_SHOWN);
  const [open, setOpen] = useState(false);
  const lineNames = snap.people.slice(0, PEOPLE_LINE).map((p) => p.name);
  const rest = Math.max(0, snap.people.length - PEOPLE_LINE);

  return (
    <div>
      {/* 디깅 경로: Flutter → Kenzie → Supernova → Dem Jointz */}
      {snap.path.length > 0 && (
        <nav aria-label="디깅 경로" className="-mx-4 overflow-x-auto px-4">
          <ol ref={pathRef} className="flex w-max items-center gap-1 py-1 text-[14px]">
            {snap.path.map((s, i) => (
              <li key={`${s.kind}-${s.id}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden className="px-0.5 text-[#C4C4C8]">
                    →
                  </span>
                )}
                {s.kind === "song" ? (
                  <span
                    className={clsx(
                      "max-w-[160px] truncate font-semibold tracking-[-0.01em]",
                      i === snap.path.length - 1 ? "text-black" : "text-[#6E6E73]",
                    )}
                  >
                    {s.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onFocus(s.id)}
                    className="max-w-[140px] truncate rounded-full px-1 text-[#6E6E73] underline decoration-[#D4D4D4] underline-offset-[3px] hover:text-black"
                  >
                    {s.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {origin && (
        <p className="mt-0.5 text-[12px] text-[#9A9A9E]">
          시작 곡 {origin.title}, {origin.artist}
          {origin.isrcBorrowed && origin.features ? " (소리는 다른 녹음 기준)" : ""}
        </p>
      )}

      {/* 따라가는 사람: 접으면 한 줄(비중 상위 3명 + 외 N명), 누르면 펼침 */}
      {people.length > 0 && (
        <section aria-label="따라가는 사람" className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex min-h-[32px] min-w-0 items-center gap-1.5 text-left text-[13px] text-[#6E6E73] hover:text-black"
            >
              <span className="shrink-0">따라가는 사람</span>
              <span className="truncate font-semibold text-black">
                {lineNames.join(", ")}
                {rest > 0 ? ` 외 ${rest}명` : ""}
              </span>
              <ChevronDown aria-hidden className={clsx("h-3.5 w-3.5 shrink-0 motion-safe:transition-transform", open && "rotate-180")} />
            </button>
            {focused && (
              <button
                type="button"
                onClick={() => onFocus(null)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-black px-3 text-[13px] text-white"
              >
                {focused.name} 집중 중 <X className="h-3.5 w-3.5" aria-label="집중 해제" />
              </button>
            )}
          </div>
          {/* 펼치면 비중 순 전체 목록. 모바일은 한 줄 가로 스크롤, 넓은 화면은 줄바꿈 */}
          <ul
            className={clsx(
              "-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0",
              !open && "hidden",
            )}
          >
            {people.map((p) => {
              const on = p.id === snap.focusId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onFocus(p.id)}
                    aria-pressed={on}
                    title={`${p.name} 비중 ${p.weight.toFixed(1)}${p.fromTitle ? `, ${p.fromTitle}에서 합류` : ""}`}
                    className={clsx(
                      "flex min-h-[36px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px]",
                      on ? "border-black bg-black text-white" : "border-[#E5E5E5] text-black hover:border-black",
                      snap.focusId && !on && "opacity-50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={clsx("shrink-0 rounded-full motion-safe:transition-all", on ? "bg-white" : "bg-black")}
                      style={{ width: dotSize(p.weight), height: dotSize(p.weight) }}
                    />
                    {p.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
